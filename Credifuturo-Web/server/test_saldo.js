const { Client, Saving, DisbursedLoan, LoanPayment } = require('./models');

async function test() {
    const { Op } = require('sequelize');
    const currentYear = new Date().getFullYear();

    const totalSavingsResult = await Saving.sum('amount', {
        where: { type: { [Op.ne]: 'Aporte Inicial' } },
        include: [{ model: Client, where: { estatus: { [Op.like]: '%Activo%' } }, required: true }]
    }) || 0;

    const totalInitialContributions = await Saving.sum('amount', {
        where: { type: 'Aporte Inicial' },
        include: [{ model: Client, where: { estatus: { [Op.like]: '%Activo%' } }, required: true }]
    }) || 0;

    const prestamosEsteAno = await DisbursedLoan.findAll({
        where: { anioDesembolso: currentYear },
        include: [{ model: Client, where: { estatus: { [Op.like]: '%Activo%' } }, required: true }]
    });
    const totalPrestamos = prestamosEsteAno.reduce((sum, l) => sum + parseFloat(l.valorPrestado || 0), 0);

    const totalAllLoans = await DisbursedLoan.sum('valorPrestado', {
        include: [{ model: Client, where: { estatus: { [Op.like]: '%Activo%' } }, required: true }]
    }) || 0;

    const rawPagoRows = await LoanPayment.findAll({
        where: { estado: 'Pago', estadoPrestamo: 'Pendiente' },
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
    totalCuotasPagadas = Math.round(totalCuotasPagadas);

    const rentabilidadCajaNU = 367099;

    const saldoEnBancoCurrentCode = Math.round((totalSavingsResult + totalInitialContributions - totalPrestamos) + totalCuotasPagadas + rentabilidadCajaNU);
    const saldoEnBancoCorrectCode = Math.round((totalSavingsResult + totalInitialContributions - totalAllLoans) + totalCuotasPagadas + rentabilidadCajaNU);

    console.log(JSON.stringify({
        totalSavingsResult,
        totalInitialContributions,
        totalPrestamos,
        totalAllLoans,
        totalCuotasPagadas,
        rentabilidadCajaNU,
        saldoEnBancoCurrentCode,
        saldoEnBancoCorrectCode
    }, null, 2));
}

test().catch(console.error).finally(() => process.exit(0));
