const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function inspectTable() {
    try {
        await sequelize.authenticate();
        const results = await sequelize.query("PRAGMA table_info(Clients);", { type: QueryTypes.SELECT });
        console.log('Columns in Clients table:');
        results.forEach(col => {
            console.log(`- ${col.name} (${col.type})`);
        });
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
}

inspectTable();
