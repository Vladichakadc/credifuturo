const { Saving, Client } = require('./models');
const { Op, Sequelize } = require('sequelize');

async function checkBreakdown() {
    try {
        const activeBreakdown = await Saving.findAll({
            attributes: [
                'type',
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalAmount'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            include: [{
                model: Client,
                where: { estatus: { [Op.like]: '%Activo%' } },
                required: true
            }],
            group: ['type'],
            raw: true
        });

        console.log('--- Active Clients Savings Breakdown ---');
        let sum = 0;
        activeBreakdown.forEach(t => {
            const amount = parseFloat(t.totalAmount || 0);
            sum += amount;
            console.log(`Type: ${t.type || 'N/A'}, Count: ${t.count}, Total Amount: $${amount.toLocaleString('es-CO')}`);
        });
        console.log(`Total Active: $${sum.toLocaleString('es-CO')}`);

    } catch (e) {
        console.error(e);
    }
}

checkBreakdown();
