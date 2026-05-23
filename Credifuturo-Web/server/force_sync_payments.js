const sequelize = require('./config/database');
const LoanPayment = require('./models/LoanPayment');

async function forceSync() {
    console.log('🔄 Recreando tabla LoanPayments (FORCE)...');
    try {
        await LoanPayment.sync({ force: true });
        console.log('✅ Tabla LoanPayments recreada con éxito.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error al sincronizar:', err);
        process.exit(1);
    }
}

forceSync();
