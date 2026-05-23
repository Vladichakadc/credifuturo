/**
 * Script: Cambiar estado 'Vigente' → 'Pendiente' en DisbursedLoans
 * Fecha: 2026-05-14
 * Descripción: Actualiza todos los registros con estado='Vigente' a 'Pendiente'
 */
const sequelize = require('./config/database');
const { DisbursedLoan } = require('./models');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conectado a la base de datos');

        // Contar registros actuales con estado 'Vigente'
        const countBefore = await DisbursedLoan.count({ where: { estado: 'Vigente' } });
        console.log(`📋 Registros con estado 'Vigente': ${countBefore}`);

        if (countBefore === 0) {
            console.log('ℹ️  No hay registros con estado "Vigente". Nada que actualizar.');
            process.exit(0);
        }

        // Actualizar Vigente → Pendiente
        const [updated] = await DisbursedLoan.update(
            { estado: 'Pendiente' },
            { where: { estado: 'Vigente' } }
        );

        console.log(`✅ ${updated} registros actualizados: 'Vigente' → 'Pendiente'`);

        // Verificar
        const countAfter = await DisbursedLoan.count({ where: { estado: 'Vigente' } });
        const countPendiente = await DisbursedLoan.count({ where: { estado: 'Pendiente' } });
        console.log(`📊 Verificación final:`);
        console.log(`   - Estado 'Vigente': ${countAfter}`);
        console.log(`   - Estado 'Pendiente': ${countPendiente}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
})();
