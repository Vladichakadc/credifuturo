const { Saving } = require('./models');
const { Op } = require('sequelize');

async function checkClient() {
    try {
        const clientId = 15; // Jose Antonio Guerrero
        const savings = await Saving.findAll({
            where: { clientId },
            order: [['date', 'DESC']],
            limit: 10
        });
        
        console.log(`--- Recent Savings for Client ${clientId} ---`);
        savings.forEach(s => {
            console.log(`ID: ${s.externalId}, Date: ${s.date}, MonthAbonado: ${s.mesAbonado}, YearAbonado: ${s.anioAbonado}, YearPago: ${s.year}, Type: ${s.type}, Penalty: ${s.valorAPenalizar}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkClient();
