const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function addColumn(table, definition, label) {
    try {
        await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${definition};`, { type: QueryTypes.RAW });
        console.log(`✅ ${label} agregada.`);
    } catch (err) {
        if (err.message.includes('duplicate column name')) {
            console.log(`ℹ️ ${label} ya existe.`);
        } else {
            console.error(`❌ Error agregando ${label}:`, err.message);
        }
    }
}

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database.');

        await addColumn('LoanRequests', 'banco VARCHAR(255)', 'LoanRequests.banco');
        await addColumn('LoanRequests', 'cuentaAhorros VARCHAR(255)', 'LoanRequests.cuentaAhorros');
        await addColumn('LoanRequests', 'disbursedLoanId INTEGER', 'LoanRequests.disbursedLoanId');

        // El 4to valor del enum status ('disbursed') NO requiere ALTER: en SQLite la columna
        // es TEXT sin CHECK constraint (Sequelize no emite CHECK de enum para sqlite).
        // La tabla Notifications tampoco requiere ALTER: es nueva, sequelize.sync() la crea sola.

        console.log('Done.');
    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        await sequelize.close();
    }
}

migrate();
