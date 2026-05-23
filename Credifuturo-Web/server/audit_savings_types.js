const Saving = require('./models/Saving');
const sequelize = require('./config/database');

async function auditTypes() {
    try {
        const counts = await Saving.findAll({
            attributes: [
                'type',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['type']
        });

        console.log('--- RESUMEN POR TIPO EN DB ---');
        counts.forEach(c => {
            console.log(`${c.type}: ${c.get('count')}`);
        });

        const ai36 = await Saving.findOne({ where: { externalId: 'AI36' } });
        console.log('\n--- DETALLE AI36 ---');
        if (ai36) {
            console.log(JSON.stringify(ai36.toJSON(), null, 2));
        } else {
            console.log('AI36 no encontrado en DB.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

auditTypes();
