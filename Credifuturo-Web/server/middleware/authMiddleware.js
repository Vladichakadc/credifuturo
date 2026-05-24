const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, role, name, customerId, email }
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: `Acceso denegado. Se requiere rol: ${role}` });
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
