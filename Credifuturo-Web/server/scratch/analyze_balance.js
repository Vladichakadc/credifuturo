const { Client, Saving, DisbursedLoan, LoanPayment } = require('../models');
const { Op } = require('sequelize');

(async () => {
    try {
        const now = new Date();
        const currentYear = now.getFullYear();

        // 1. Total Ahorrado (Historical)
        const totalSavings = await Saving.sum('amount', {
            where: { type: { [Op.ne]: 'Aporte Inicial' } }
        }) || 0;
        const totalSavingsNet = await Saving.sum('valorAhorrado', {
            where: { type: { [Op.ne]: 'Aporte Inicial' } }
        }) || 0;
        const totalInitial = await Saving.sum('amount', {
            where: { type: 'Aporte Inicial' }
        }) || 0;
        const totalAhorrado = totalSavings + totalInitial;
        const totalAhorradoNet = totalSavingsNet + totalInitial;

        // 2. Total Valor Prestado (Historical and Yearly)
        const totalPrestadoHist = await DisbursedLoan.sum('valorPrestado') || 0;
        const totalPrestadoYear = await DisbursedLoan.sum('valorPrestado', {
            where: { anioDesembolso: currentYear }
        }) || 0;
        const totalPrestadoVigente = await DisbursedLoan.sum('valorPrestado', {
            where: { estado: { [Op.like]: 'Vigente%' } }
        }) || 0;

        // 3. Total Cuotas Pagadas (Historical)
        const rawPagoRows = await LoanPayment.findAll({
            where: {
                estado: 'Pago',
                estadoPrestamo: 'Pendiente'
            },
            attributes: ['clientId', 'idVm', 'mesPago', 'valorCuotaVariable', 'valorInteresesAmortizados']
        });
        const seenKeys = new Set();
        let totalCuotasPagadas = 0;
        let totalInteresesPagados = 0;
        for (const p of rawPagoRows) {
            const key = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            totalCuotasPagadas += parseFloat(p.valorCuotaVariable || 0);
            totalInteresesPagados += parseFloat(p.valorInteresesAmortizados || 0);
        }
        const totalCapitalPagado = totalCuotasPagadas - totalInteresesPagados;

        console.log('--- DATA ANALYSIS ---');
        console.log('Total Savings (Monthly Gross): ', totalSavings);
        console.log('Total Savings (Monthly Net):   ', totalSavingsNet);
        console.log('Total Initial Contrib:        ', totalInitial);
        console.log('Total Ahorrado (Gross):        ', totalAhorrado);
        console.log('Total Ahorrado (Net):          ', totalAhorradoNet);
        console.log('Total Prestado (Hist):         ', totalPrestadoHist);
        console.log('Total Prestado (Yearly):       ', totalPrestadoYear);
        console.log('Total Prestado (Vigente):      ', totalPrestadoVigente);
        console.log('Total Cuotas Pagadas (Full):   ', totalCuotasPagadas);
        console.log('Total Intereses Pagados:      ', totalInteresesPagados);
        console.log('Total Capital Pagado:        ', totalCapitalPagado);
        console.log('\n--- TRIALS ---');
        console.log('Trial A (Gross Ahorro, Yearly Prest, Full Pagado): ', (totalAhorrado - totalPrestadoYear) + totalCuotasPagadas);
        console.log('Trial D (Gross Ahorro, Vigente Prest, Full Pagado):', (totalAhorrado - totalPrestadoVigente) + totalCuotasPagadas);
        console.log('Expected:          ', 18896330);
        console.log('Diff (Yearly - Exp):', (totalAhorrado - totalPrestadoYear) + totalCuotasPagadas - 18896330);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
})();
