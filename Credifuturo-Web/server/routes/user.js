const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Saving = require('../models/Saving');
const Loan = require('../models/Loan');

// Get My Data
router.get('/:id', async (req, res) => {
    try {
        const clientId = req.params.id;
        const client = await Client.findByPk(clientId, {
            attributes: { exclude: ['password'] }
        });

        if (!client) return res.status(404).json({ message: 'Client not found' });

        const savings = await Saving.findAll({ where: { clientId } });
        const loans = await Loan.findAll({ where: { clientId } });

        const totalSavings = savings.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

        res.json({
            client,
            savings,
            totalSavings,
            loans
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
