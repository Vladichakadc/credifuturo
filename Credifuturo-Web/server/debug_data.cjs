const { Client, Saving } = require('./models');

async function debugData() {
    try {
        const client = await Client.findOne({ where: { customerId: '15' } });
        if (!client) {
            console.log('Client with customerId 15 not found.');
            return;
        }
        
        console.log(`--- Client Found: ${client.name} (Technical ID: ${client.id}, CustomerID: ${client.customerId}) ---`);
        
        const savings = await Saving.findAll({
            where: { clientId: client.id },
            order: [['date', 'DESC']]
        });
        
        console.log(`--- Savings for ${client.name} ---`);
        savings.forEach(s => {
            console.log(`ID: ${s.externalId}, Date: ${s.date}, MonthAb: ${s.mesAbonado}, YearAb: ${s.anioAbonado}, Type: ${s.type}, Penalty: ${s.valorAPenalizar}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

debugData();
