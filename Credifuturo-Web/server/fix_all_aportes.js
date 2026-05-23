const { Saving } = require('./models');

async function fixData() {
    try {
        // Fix valorAhorrado for all 'Aporte Inicial' records to match 'amount'
        const aportes = await Saving.findAll({ where: { type: 'Aporte Inicial' } });
        console.log(`Fixing ${aportes.length} Aporte Inicial records...`);
        
        for (const s of aportes) {
            if (s.valorAhorrado !== s.amount) {
                console.log(`Updating ${s.externalId}: valorAhorrado ${s.valorAhorrado} -> ${s.amount}`);
                await s.update({ valorAhorrado: s.amount, valorAPenalizar: 0, diasPenalizacion: 0 });
            }
        }
        
        console.log("Data fix complete.");
    } catch (err) {
        console.error(err);
    }
}

fixData();
