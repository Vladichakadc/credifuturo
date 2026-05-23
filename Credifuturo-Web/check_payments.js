const s = require('./server/config/database');

async function run() {
    await s.authenticate();

    // All records with their estado
    const [allRows] = await s.query(`
        SELECT lp.id, lp.id_ep, lp.estado, lp.estado_prestamo, lp.id_vm, lp.valor_cuota_pago,
               c.customerId, c.name
        FROM LoanPayments lp
        LEFT JOIN Clients c ON c.id = lp.clientId
        ORDER BY lp.id
    `);

    console.log('=== TODOS LOS REGISTROS ===');
    allRows.forEach(r => {
        console.log(`id=${r.id} | id_ep=${r.id_ep} | id_vm=${r.id_vm} | estado=${r.estado} | socio=${r.name}`);
    });

    // Records with 'Pago' status
    const pagoRows = allRows.filter(r => r.estado === 'Pago');
    console.log('\n=== REGISTROS CON estado=Pago ===');
    pagoRows.forEach(r => {
        console.log(`id=${r.id} | id_ep=${r.id_ep} | id_vm=${r.id_vm} | socio=${r.name} | valor_cuota_pago=${r.valor_cuota_pago}`);
    });

    process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
