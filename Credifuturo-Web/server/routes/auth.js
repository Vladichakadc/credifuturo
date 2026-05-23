const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET;

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await Client.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        if (user.estatus === 'Desactivado') {
            return res.status(403).json({ message: 'Usuario desactivado. No tiene acceso al sistema.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Credenciales inválidas' });

        // FAILSAFE: Force admin role for the main admin emails
        let role = user.role;
        if (email === 'admin@credifuturo.com' || email === 'cliente1@credifuturo.com') {
            role = 'admin';
        }

        const mustChangePassword = !!user.mustChangePassword;

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
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
        }
        if (!/\d/.test(newPassword)) {
            return res.status(400).json({ message: 'La nueva contraseña debe contener al menos un número.' });
        }

        const user = await Client.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: 'La contraseña actual es incorrecta.' });

        const hashed = await bcrypt.hash(newPassword, 10);
        await user.update({ password: hashed, mustChangePassword: false });

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
router.post('/request-reset', async (req, res) => {
    const { cedula, email } = req.body;
    try {
        if (!cedula && !email) {
            return res.status(400).json({ message: 'Ingrese cédula o correo electrónico.' });
        }

        const where = {};
        if (cedula) where.cedula = cedula.trim();
        else if (email) where.email = email.trim().toLowerCase();

        const user = await Client.findOne({ where });
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

        res.json({ ok: true, message: 'Solicitud registrada. El administrador restablecerá su acceso pronto.' });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor: ' + err.message });
    }
});

module.exports = router;
