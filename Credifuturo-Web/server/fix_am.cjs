const { Saving } = require('./models');

async function fixAM361() {
    try {
        const saving = await Saving.findOne({ where: { externalId: 'AM361' } });
        if (!saving) {
            console.log('AM361 not found.');
            return;
        }
        
        // Correcting to 61 days ($61,000)
        // Jan 10 to Mar 12 = 61 days.
        saving.diasPenalizacion = 61;
        saving.valorAPenalizar = 61000;
        saving.valorAhorrado = parseFloat(saving.amount) - 61000;
        saving.penalizacion = 'SI';
        
        await saving.save();
        console.log('--- AM361 Corrected ---');
        console.log(`New Penalty: $${saving.valorAPenalizar}, Days: ${saving.diasPenalizacion}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

fixAM361();
