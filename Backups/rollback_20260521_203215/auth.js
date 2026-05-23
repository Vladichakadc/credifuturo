const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'credifuturo_secret_key_change_me'; // In prod use .env

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

        const token = jwt.sign(
            { id: user.id, role: role, name: user.name, customerId: user.customerId, email: user.email }, 
            JWT_SECRET, 
            { expiresIn: '8h' }
        );
        res.json({ token, role: role, user: { id: user.id, customerId: user.customerId, name: user.name, surname1: user.surname1, surname2: user.surname2, cedula: user.cedula, email: user.email, role: role } });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor: ' + err.message });
    }
});

module.exports = router;
