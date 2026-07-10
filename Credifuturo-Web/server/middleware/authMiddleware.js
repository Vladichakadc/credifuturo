const jwt = require('jsonwebtoken');
const { touch } = require('../services/sessionActivity');

const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, role, name, customerId, cedula, email, mustChangePassword }
        touch(decoded.id);
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
};

// Acepta uno o varios roles: requireRole('admin') o requireRole('user', 'admin').
// Compatible con todos los usos existentes de un solo rol.
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}` });
        }
        next();
    };
};

// A07 (Authentication Failures): si el token marca mustChangePassword=true,
// el usuario solo puede llamar al endpoint de cambio de contraseña.
const requireFreshPassword = (req, res, next) => {
    if (req.user?.mustChangePassword) {
        return res.status(403).json({
            error: 'Debe cambiar su contraseña antes de continuar.',
            code: 'PASSWORD_CHANGE_REQUIRED'
        });
    }
    next();
};

module.exports = {
    verifyToken,
    requireRole,
    requireFreshPassword
};
