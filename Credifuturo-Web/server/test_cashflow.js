const { Client, Saving, DisbursedLoan, LoanPayment } = require('./models');

async function test() {
    const { Op } = require('sequelize');

    // ALL INFLOWS
    const totalSavingsResult = await Saving.sum('amount', {
        where: { type: { [Op.ne]: 'Aporte Inicial' } }
    }) || 0;

    const totalInitialContributions = await Saving.sum('amount', {
        where: { type: 'Aporte Inicial' }
    }) || 0;

    const rawPagoRows = await LoanPayment.findAll({
        where: { estado: 'Pago' }
    });
    
    let totalCuotasPagadas = 0;
    const seenKeys = new Set();
    for (const p of rawPagoRows) {
        const key = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        totalCuotasPagadas += parseFloat(p.valorCuotaVariable || 0);
    }
    
    // ALL OUTFLOWS
    const totalAllLoans = await DisbursedLoan.sum('valorPrestado') || 0;

    console.log(JSON.stringify({
        totalSavingsResult,
        totalInitialContributions,
        totalCuotasPagadas,
        totalInflows: totalSavingsResult + totalInitialContributions + totalCuotasPagadas,
        totalOutflows: totalAllLoans,
        netCash: (totalSavingsResult + totalInitialContributions + totalCuotasPagadas) - totalAllLoans
    }, null, 2));
}

test().catch(console.error).finally(() => process.exit(0));
