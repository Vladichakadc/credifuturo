const DataImportService = require('./services/DataImportService');
const sequelize = require('./config/database');

async function runImport() {
    try {
        console.log('--- Iniciando Re-importación de Ahorros ---');
        const dataDir = 'C:/Credifuturo';
        const result = await DataImportService.importSavings(dataDir);
        console.log('Resultado:', result);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

runImport();
