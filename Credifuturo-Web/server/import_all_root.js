const sequelize = require('./config/database');
const ImportService = require('./services/DataImportService');
const path = require('path');

// Import all models to ensure partials are loaded
const Client = require('./models/Client');
const Saving = require('./models/Saving');
const DisbursedLoan = require('./models/DisbursedLoan');
const LoanPayment = require('./models/LoanPayment');

(async () => {
    try {
        console.log('--- Iniciando Importación COMPLETA ---');

        // 1. Verificar conexión y Sincronizar Modelo
        await sequelize.authenticate();
        console.log('✅ Conexión a DB exitosa.');
        await sequelize.sync({ alter: true });
        console.log('✅ Base de datos sincronizada (Schema Updated).');

        // 2. Importar Todo
        const dataDir = 'C:\\Credifuturo';
        console.log(`📂 Leyendo archivos desde: ${dataDir}`);

        const results = await ImportService.importAll(dataDir);

        console.log('--- Resultado Final ---');
        console.log('Clients:', results.clients);
        console.log('Savings:', results.savings);
        console.log('Disbursed Loans:', results.disbursed);
        console.log('Payments:', results.payments);

    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        // process.exit(0); // Force exit
    }
})();
