const { Saving, Soporte, Client } = require('./models');

async function checkSoportes() {
    try {
        const supportCount = await Soporte.count();
        console.log(`Total Soportes: ${supportCount}`);

        const soportes = await Soporte.findAll({
            limit: 5,
            include: [{ model: Saving, include: [Client] }]
        });

        soportes.forEach(s => {
            console.log(`Soporte ID: ${s.id}, Name: ${s.originalName}`);
            if (s.Saving) {
                console.log(`  Linked to Saving ID: ${s.Saving.id}, ExternalID: ${s.Saving.externalId}`);
                if (s.Saving.Client) {
                    console.log(`    Client: ${s.Saving.Client.name}`);
                }
            } else {
                console.log(`  NOT Linked to any Saving`);
                console.log(`  savingId in Soporte: ${s.savingId}, paymentId in Soporte: ${s.paymentId}`);
            }
        });

        // Check specifically for Savings with Soporte
        const savingsWithSoporte = await Saving.findAll({
            include: [{ model: Soporte, required: true }],
            limit: 5
        });
        console.log(`Savings with Soporte found: ${savingsWithSoporte.length}`);
        savingsWithSoporte.forEach(sav => {
            console.log(`Saving ID: ${sav.id}, ExternalID: ${sav.externalId}, Soporte Name: ${sav.Soporte.originalName}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkSoportes();
