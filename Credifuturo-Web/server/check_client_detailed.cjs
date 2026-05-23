const { Saving } = require('./models');

async function checkClientDetailed() {
    try {
        const clientId = 82; // Jose Antonio
        const savings = await Saving.findAll({
            where: { clientId },
            order: [['date', 'DESC']]
        });
        
        console.log(`--- All Records for Client ${clientId} ---`);
        savings.forEach(s => {
            console.log(`ID: ${s.externalId}, Date: ${s.date}, MonthAb: ${s.mesAbonado}, YearAb: ${s.anioAbonado}, YearPago: ${s.year}, Type: ${s.type}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkClientDetailed();
