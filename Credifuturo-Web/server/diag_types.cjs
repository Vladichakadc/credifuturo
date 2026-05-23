const { Saving } = require('./models');
const { Sequelize } = require('sequelize');

async function checkTypes() {
    try {
        const types = await Saving.findAll({
            attributes: [
                'type',
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalAmount'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: ['type'],
            raw: true
        });

        console.log('--- Saving Types Summary ---');
        types.forEach(t => {
            console.log(`Type: ${t.type || 'N/A'}, Count: ${t.count}, Total Amount: $${parseFloat(t.totalAmount || 0).toLocaleString('es-CO')}`);
        });

    } catch (e) {
        console.error(e);
    }
}

checkTypes();
