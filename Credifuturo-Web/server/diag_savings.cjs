const { Saving, Client } = require('./models');
const { Op } = require('sequelize');

async function checkSavings() {
    try {
        const totalSavings = await Saving.sum('amount', {
            include: [{
                model: Client,
                required: true
            }]
        }) || 0;

        const activeSavings = await Saving.sum('amount', {
            include: [{
                model: Client,
                where: { estatus: { [Op.like]: '%Activo%' } },
                required: true
            }]
        }) || 0;

        const inactiveSavings = await Saving.sum('amount', {
            include: [{
                model: Client,
                where: { estatus: { [Op.like]: '%Desactivado%' } },
                required: true
            }]
        }) || 0;

        console.log(`Total Savings (All): $${totalSavings.toLocaleString('es-CO')}`);
        console.log(`Active Savings:      $${activeSavings.toLocaleString('es-CO')}`);
        console.log(`Inactive Savings:    $${inactiveSavings.toLocaleString('es-CO')}`);
        console.log(`Diff:               $${(totalSavings - activeSavings).toLocaleString('es-CO')}`);

    } catch (e) {
        console.error(e);
    }
}

checkSavings();
