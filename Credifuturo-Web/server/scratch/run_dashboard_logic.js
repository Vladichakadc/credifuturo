const express = require('express');
const { Client, Saving, Soporte, Loan, DisbursedLoan, LoanPayment } = require('../models');
const { Op } = require('sequelize');

(async () => {
    try {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-12
        const statusTrimmed = 'Activo';
        const clientWhere = {};
        clientWhere.estatus = { [Op.like]: `%${statusTrimmed}%` };
        const effectiveClientWhere = clientWhere;

        // 1. Total Savings
        const totalSavingsResult = await Saving.sum('amount', {
            where: { type: { [Op.ne]: 'Aporte Inicial' } },
            include: [{ model: Client, where: effectiveClientWhere, required: true }]
        }) || 0;

        // 2. Total Initial Contributions
        const totalInitialContributions = await Saving.sum('amount', {
            where: { type: 'Aporte Inicial' },
            include: [{ model: Client, where: effectiveClientWhere, required: true }]
        }) || 0;

        // 3. Total Prestamos (Yearly)
        const prestamosEsteAno = await DisbursedLoan.findAll({
            where: { anioDesembolso: currentYear },
            include: [{ model: Client, where: clientWhere, required: true }]
        });
        const totalPrestamos = prestamosEsteAno.reduce((sum, l) => sum + parseFloat(l.valorPrestado || 0), 0);

        // 4. Total Cuotas Pagadas
        const rawPagoRows = await LoanPayment.findAll({
            where: { estado: 'Pago', estadoPrestamo: 'Pendiente' },
            include: [{ model: Client, where: clientWhere, required: true, attributes: [] }],
            attributes: ['id', 'clientId', 'idVm', 'mesPago', 'valorCuotaVariable']
        });
        const seenKeys = new Set();
        let totalCuotasPagadas = 0;
        for (const p of rawPagoRows) {
            const key = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            totalCuotasPagadas += parseFloat(p.valorCuotaVariable || 0);
        }

        const stats = {
            totalSavings: Math.round(totalSavingsResult),
            totalInitialContributions: Math.round(totalInitialContributions),
            totalAhorradoGeneral: Math.round(totalSavingsResult + totalInitialContributions),
            totalPrestamos: Math.round(totalPrestamos),
            totalCuotasPagadas: Math.round(totalCuotasPagadas)
        };

        console.log('--- DASHBOARD GLOBALS (Socios Activos) ---');
        console.log(stats);
        
        const calcSaldo = (stats.totalAhorradoGeneral - stats.totalPrestamos) + stats.totalCuotasPagadas;
        console.log('Calculated Saldo (Formula User):', calcSaldo);
        console.log('User Expected:                 ', 18896330);
        console.log('Diff:                          ', calcSaldo - 18896330);
        
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
})();
