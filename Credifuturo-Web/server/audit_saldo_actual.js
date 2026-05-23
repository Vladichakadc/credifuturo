const { Client, Saving, DisbursedLoan, LoanPayment } = require('./models');

async function check() {
    const { Op } = require('sequelize');
    
    const clientWhere = { estatus: { [Op.like]: '%Activo%' } };
    
    const totalSavingsResult = await Saving.sum('amount', {
        where: { type: { [Op.ne]: 'Aporte Inicial' } },
        include: [{ model: Client, where: clientWhere, required: true }]
    }) || 0;

    const totalInitialContributions = await Saving.sum('amount', {
        where: { type: 'Aporte Inicial' },
        include: [{ model: Client, where: clientWhere, required: true }]
    }) || 0;

    const totalAllLoans = await DisbursedLoan.sum('valorPrestado', {
        include: [{ model: Client, where: clientWhere, required: true }]
    }) || 0;

    const rawAllPagoRows = await LoanPayment.findAll({
        where: { estado: 'Pago' },
        include: [{ model: Client, where: clientWhere, required: true, attributes: [] }],
        attributes: ['id', 'clientId', 'idVm', 'mesPago', 'valorCuotaVariable']
    });

    const seenAllKeys = new Set();
    let totalAllCuotasPagadas = 0;
    for (const p of rawAllPagoRows) {
        const key = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`;
        if (seenAllKeys.has(key)) continue;
        seenAllKeys.add(key);
        totalAllCuotasPagadas += parseFloat(p.valorCuotaVariable || 0);
    }
    totalAllCuotasPagadas = Math.round(totalAllCuotasPagadas);

    const saldoEnBanco = Math.round((totalSavingsResult + totalInitialContributions - totalAllLoans) + totalAllCuotasPagadas + 367099);

    console.log(JSON.stringify({
        totalSavingsResult,
        totalInitialContributions,
        totalAllLoans,
        totalAllCuotasPagadas,
        rentabilidadCajaNU: 367099,
        saldoEnBanco
    }, null, 2));
}

check().catch(console.error).finally(() => process.exit(0));
