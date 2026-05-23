const Saving = require('./models/Saving');
const Client = require('./models/Client');
const sequelize = require('./config/database');

async function verifyDB() {
    try {
        const sample = await Saving.findOne({
            order: [['id', 'DESC']],
            include: [Client]
        });

        if (sample) {
            console.log('--- MUESTRA DE DATOS DB (Último Ahorro) ---');
            console.log(JSON.stringify(sample.toJSON(), null, 2));
        } else {
            console.log('No se encontraron registros en la DB.');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

verifyDB();
