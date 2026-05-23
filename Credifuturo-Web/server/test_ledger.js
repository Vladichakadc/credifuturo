const { Client, Saving, DisbursedLoan, LoanPayment } = require('./models');

async function checkRealLedger() {
    // 1. Total Savings & Aportes Iniciales (Cash Inflow from Partners)
    const savings = await Saving.findAll({
        attributes: ['amount', 'type'],
    });

    let totalAhorros = 0;
    let totalAportes = 0;
    for (const s of savings) {
        if (s.type === 'Aporte Inicial') {
            totalAportes += parseFloat(s.amount || 0);
        } else {
            totalAhorros += parseFloat(s.amount || 0);
        }
    }

    // 2. Total Disbursed Loans (Cash Outflow to Partners)
    const loans = await DisbursedLoan.findAll({ attributes: ['valorPrestado'] });
    let totalPrestado = 0;
    for (const l of loans) {
        totalPrestado += parseFloat(l.valorPrestado || 0);
    }

    // 3. Total Payments (Cash Inflow from Partners Repaying Loans with Interest)
    const payments = await LoanPayment.findAll({
        where: { estado: 'Pago' },
        attributes: ['clientId', 'idVm', 'mesPago', 'valorCuotaVariable']
    });

    let totalPagado = 0;
    const seen = new Set();
    for (const p of payments) {
        const key = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        totalPagado += parseFloat(p.valorCuotaVariable || 0);
    }

    const netCash = (totalAhorros + totalAportes + totalPagado) - totalPrestado;

    console.log(`=== TRUE HISTORICAL LEDGER ===`);
    console.log(`Cash In (Ahorros): $${totalAhorros}`);
    console.log(`Cash In (Aportes): $${totalAportes}`);
    console.log(`Cash In (Pagos Préstamos): $${totalPagado}`);
    console.log(`Cash Out (Préstamos Desembolsados): $${totalPrestado}`);
    console.log(`NET CASH AT BANK: $${netCash}`);
}

checkRealLedger().catch(console.error).finally(() => process.exit(0));
