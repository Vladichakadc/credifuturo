const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const Client = require('../models/Client');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/authMiddleware');
const { validatePassword } = require('../services/passwordPolicy');
const { logSecurityEvent, getClientIp } = require('../services/securityLogger');
const { recordLoginFailure, recordLoginSuccess } = require('../services/bruteForceDetector');
const { sendResetRequestNotification } = require('../services/EmailService');

// A07 (Identification and Authentication Failures): protección anti fuerza bruta
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Intente de nuevo en 15 minutos.' }
});

const resetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas solicitudes de recuperación. Intente más tarde.' }
});

// A02 (Cryptographic Failures): sin fallback hardcodeado.
// Falla al arrancar si la env var no está configurada.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET no está definido en variables de entorno.');
}

// Login
router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    const ip = getClientIp(req);
    try {
        const user = await Client.findOne({ where: { email } });
        if (!user) {
            logSecurityEvent('LOGIN_FAIL_USER_NOT_FOUND', { email, ip });
            recordLoginFailure({ email, ip, reason: 'USER_NOT_FOUND' });
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        if (user.estatus === 'Desactivado') {
            logSecurityEvent('LOGIN_FAIL_DEACTIVATED', { userId: user.id, email, ip });
            recordLoginFailure({ email, ip, reason: 'DEACTIVATED' });
            return res.status(403).json({ message: 'Usuario desactivado. No tiene acceso al sistema.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            logSecurityEvent('LOGIN_FAIL_BAD_PASSWORD', { userId: user.id, email, ip });
            recordLoginFailure({ email, ip, reason: 'BAD_PASSWORD' });
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const role = user.role;
        const mustChangePassword = !!user.mustChangePassword;
        logSecurityEvent('LOGIN_SUCCESS', { userId: user.id, email, role, ip, mustChangePassword });
        recordLoginSuccess({ email, ip });

        const token = jwt.sign(
            { id: user.id, role, name: user.name, customerId: user.customerId, email: user.email, mustChangePassword },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        res.json({
            token,
            role,
            mustChangePassword,
            user: {
                id: user.id,
                customerId: user.customerId,
                name: user.name,
                surname1: user.surname1,
                surname2: user.surname2,
                cedula: user.cedula,
                email: user.email,
                role,
                mustChangePassword
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor: ' + err.message });
    }
});

// Cambiar contraseña (socio autenticado)
router.put('/change-password', verifyToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Debe enviar currentPassword y newPassword.' });
        }
        const policyError = validatePassword(newPassword);
        if (policyError) {
            return res.status(400).json({ message: policyError });
        }

        const user = await Client.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            logSecurityEvent('PASSWORD_CHANGE_FAIL_BAD_CURRENT', { userId: user.id, ip: getClientIp(req) });
            return res.status(400).json({ message: 'La contraseña actual es incorrecta.' });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await user.update({ password: hashed, mustChangePassword: false });
        logSecurityEvent('PASSWORD_CHANGED', { userId: user.id, ip: getClientIp(req) });

        // Emit new token with mustChangePassword = false
        const newToken = jwt.sign(
            { id: user.id, role: user.role, name: user.name, customerId: user.customerId, email: user.email, mustChangePassword: false },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        res.json({ ok: true, message: 'Contraseña actualizada correctamente.', token: newToken });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor: ' + err.message });
    }
});

// Solicitud de recuperación de contraseña (sin autenticación)
router.post('/request-reset', resetLimiter, async (req, res) => {
    const { cedula, email } = req.body;
    try {
        if (!cedula && !email) {
            return res.status(400).json({ message: 'Ingrese cédula o correo electrónico.' });
        }

        const where = {};
        if (cedula) where.cedula = cedula.trim();
        else if (email) where.email = email.trim().toLowerCase();

        const user = await Client.findOne({ where });
        logSecurityEvent('PASSWORD_RESET_REQUESTED', {
            ip: getClientIp(req),
            matched: !!user,
            userId: user?.id || null
        });
        if (!user) {
            // Respuesta genérica por seguridad
            return res.json({ ok: true, message: 'Si el dato coincide con un socio registrado, el administrador recibirá la solicitud.' });
        }

        // Evitar solicitudes duplicadas pendientes
        const { Op } = require('sequelize');
        const existing = await PasswordResetRequest.findOne({
            where: { clientId: user.id, status: 'pending' }
        });
        if (!existing) {
            await PasswordResetRequest.create({
                clientId: user.id,
                cedula: user.cedula,
                nombre: `${user.name} ${user.surname1 || ''}`.trim(),
                email: user.email || null,
                status: 'pending'
            });
        }
        // Notificar siempre, exista o no una solicitud pendiente (resetLimiter evita abuso)
        sendResetRequestNotification(user).catch(err =>
            console.error('[EmailService] Error enviando notificación de reset:', err.message)
        );

        res.json({ ok: true, message: 'Solicitud registrada. El administrador restablecerá su acceso pronto.' });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor: ' + err.message });
    }
});

module.exports = router;
