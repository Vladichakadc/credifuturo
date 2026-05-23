const path = require('path');
const DataImportService = require('./server/services/DataImportService');
const sequelize = require('./server/config/database');

async function syncPayments() {
    const backupFile = 'C:\\Credifuturo\\Backups\\2026-03-07\\1-orders_table_estado_prestamos.xlsx';
    console.log(`Starting targeted sync for payments from: ${backupFile}`);

    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Targeted import using existing service logic
        await DataImportService.importPayments(backupFile);

        console.log('✅ Synchronization of Loan Payments completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Synchronization failed:', err);
        process.exit(1);
    }
}

syncPayments();
