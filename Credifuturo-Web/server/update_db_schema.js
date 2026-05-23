const sequelize = require('./config/database');
const Saving = require('./models/Saving');

async function updateDatabase() {
    try {
        console.log('🔄 Actualizando estructura de la base de datos...');

        // Alter table to add missing columns
        await sequelize.sync({ alter: true });

        console.log('✅ Base de datos actualizada correctamente');
        console.log('Nuevos campos agregados a Saving:');
        console.log('  - valorAPenalizar (DECIMAL)');
        console.log('  - mesAbonado (STRING)');
        console.log('  - anioAbonado (INTEGER)');
        console.log('  - observaciones (TEXT)');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error actualizando la base de datos:', error);
        process.exit(1);
    }
}

updateDatabase();
