const db = require('./models');
async function check() {
    try {
        const s = await db.Saving.findAll({
            limit: 10,
            order: [['id', 'DESC']],
            include: [{ model: db.Client, attributes: ['name', 'surname1'] }]
        });
        const p = await db.LoanPayment.findAll({
            limit: 10,
            order: [['id', 'DESC']],
            include: [{ model: db.Client, attributes: ['name', 'surname1'] }]
        });

        console.log('--- LATEST SAVINGS ---');
        s.forEach(x => {
            console.log(`ID: ${x.id}, Name: ${x.Client?.name} ${x.Client?.surname1 || ''}, Amount: ${x.amount}, Date: ${x.date}, Type: ${x.type}`);
        });

        console.log('\n--- LATEST PAYMENTS ---');
        p.forEach(x => {
            console.log(`ID: ${x.id}, Name: ${x.Client?.name} ${x.Client?.surname1 || ''}, Amount: ${x.valorCuotaPago}, MesPago: ${x.mesPago}, Estado: ${x.estado}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
