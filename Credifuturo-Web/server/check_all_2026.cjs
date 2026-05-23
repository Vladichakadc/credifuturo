const { Saving } = require('./models');

async function checkAll2026() {
    try {
        const savings = await Saving.findAll({
            where: { anioAbonado: 2026 },
            order: [['date', 'ASC']]
        });
        
        console.log(`--- All Records for 2026 (Total: ${savings.length}) ---`);
        savings.forEach(s => {
            console.log(`ID: ${s.externalId}, Client: ${s.clientId}, Type: ${s.type}, MonthAb: ${s.mesAbonado}, Date: ${s.date}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkAll2026();
