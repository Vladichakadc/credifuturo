const Saving = require('./models/Saving');
const sequelize = require('./config/database');

async function verifyDeep() {
    try {
        const results = await Saving.findAll({
            limit: 10,
            order: [['id', 'DESC']]
        });

        console.log('--- AUDITORÍA DE DATOS DE AHORROS (10 últimos) ---');
        results.forEach(s => {
            const r = s.toJSON();
            console.log(`ID: ${r.id} | ExtID: ${r.externalId} | MesAb: ${r.mesAbonado} | AnioAb: ${r.anioAbonado} | Pen: ${r.penalizacion} | Obs: "${r.observaciones}"`);
        });

        const nullMes = await Saving.count({ where: { mesAbonado: null } });
        console.log(`\nRegistros con Mes Abonado NULL: ${nullMes}`);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

verifyDeep();
