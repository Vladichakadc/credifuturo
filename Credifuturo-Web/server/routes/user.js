const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Saving = require('../models/Saving');
const Loan = require('../models/Loan');
const { verifyToken } = require('../middleware/authMiddleware');

// A01 (Broken Access Control): exige token y bloquea IDOR
// — un socio solo puede consultar su propio registro; un admin puede consultar a cualquiera.
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const requestedId = parseInt(req.params.id, 10);
        if (Number.isNaN(requestedId)) {
            return res.status(400).json({ error: 'ID inválido.' });
        }

        if (req.user.role !== 'admin' && req.user.id !== requestedId) {
            return res.status(403).json({ error: 'No autorizado.' });
        }

        const client = await Client.findByPk(requestedId, {
            attributes: { exclude: ['password'] }
        });
        if (!client) return res.status(404).json({ message: 'Client not found' });

        const savings = await Saving.findAll({ where: { clientId: requestedId } });
        const loans = await Loan.findAll({ where: { clientId: requestedId } });
        const totalSavings = savings.reduce((acc, c) => acc + parseFloat(c.amount || 0), 0);

        res.json({ client, savings, totalSavings, loans });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
