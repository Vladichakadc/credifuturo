const { Sequelize } = require('sequelize');

const s = new Sequelize({
    dialect: 'sqlite',
    storage: 'C:/Credifuturo/Credifuturo-Web/database.sqlite',
    logging: false
});

async function run() {
    try {
        await s.authenticate();
        // Ver estado actual
        const [before] = await s.query(
            "SELECT id, id_ep, item_quantity, cuotas_prestamo, mes_pago, fecha_pago_max FROM LoanPayments WHERE id_ep IN ('P59','P122') ORDER BY id_ep"
        );
        console.log('\n📊 ANTES:');
        console.table(before);

        // Corregir P59: cuotas_prestamo = 1
        await s.query("UPDATE LoanPayments SET cuotas_prestamo = 1 WHERE id_ep = 'P59'");
        console.log('\n✏️  P59 actualizado: cuotas_prestamo = 1');

        // Verificar
        const [after] = await s.query(
            "SELECT id, id_ep, item_quantity, cuotas_prestamo, mes_pago, fecha_pago_max FROM LoanPayments WHERE id_ep IN ('P59','P122') ORDER BY id_ep"
        );
        console.log('\n✅ DESPUÉS:');
        console.table(after);
    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await s.close();
    }
}

run();
