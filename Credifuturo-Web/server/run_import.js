const ImportService = require('./services/DataImportService');
const sequelize = require('./config/database');
const path = require('path');

async function run() {
    try {
        console.log('--- Iniciando Conexión a Base de Datos ---');
        await sequelize.authenticate();
        console.log('Conexión establecida correctamente.');

        // Sincronizar modelos (sin borrar datos)
        await sequelize.sync();
        console.log('Modelos sincronizados.');

        const dataDir = 'C:/Credifuturo';
        console.log(`\n--- Iniciando Importación desde: ${dataDir} ---`);

        const results = await ImportService.importAll(dataDir);

        console.log('\n--- Resultado de la Importación ---');
        console.log('Clientes:', results.clients.imported || 0);
        console.log('Ahorros:', results.savings.imported || 0);
        console.log('Préstamos Desembolsados:', results.disbursed.imported || 0);
        console.log('Pagos de Préstamos:', results.payments.imported || 0);

        if (results.clients.error) console.error('Error Clientes:', results.clients.error);
        if (results.disbursed.error) console.error('Error Desembolsados:', results.disbursed.error);
        if (results.payments.error) console.error('Error Pagos:', results.payments.error);

        console.log('\n¡Proceso completado con éxito!');
        process.exit(0);
    } catch (error) {
        console.error('\nFATAL: Error durante la importación:', error);
        process.exit(1);
    }
}

run();
