const { Saving, Soporte, Client } = require('./models');

async function findSavingsWithSoporte() {
    try {
        const savings = await Saving.findAll({
            include: [{ model: Soporte, required: true }, { model: Client }],
            order: [['date', 'DESC']]
        });

        console.log(`Found ${savings.length} savings with support.`);
        savings.forEach(s => {
            console.log(`Saving ID: ${s.id}, ExtID: ${s.externalId}, Date: ${s.date}, Client: ${s.Client.name}, Soporte: ${s.Soporte.originalName}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

findSavingsWithSoporte();
