const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function fixSchema() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database.');

        // Attempt to add the column manually
        try {
            await sequelize.query('ALTER TABLE Clients ADD COLUMN fechaBaja DATEONLY;', { type: QueryTypes.RAW });
            console.log('Column fechaBaja added successfully.');
        } catch (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column fechaBaja already exists.');
            } else {
                console.error('Error adding column:', err.message);
            }
        }

        console.log('Done.');
    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        await sequelize.close();
    }
}

fixSchema();
