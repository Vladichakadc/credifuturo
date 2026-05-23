const { Saving, Soporte, Client } = require('./models');

async function findSavingsWithSoporte() {
    try {
        const savings = await Saving.findAll({
            include: [
                { model: Soporte, required: true },
                { model: Client }
            ],
            order: [['date', 'DESC']]
        });

        console.log(`Found ${savings.length} savings with support.`);
        savings.forEach(s => {
            const row = s.toJSON();
            console.log(`Saving ID: ${row.id}, ExtID: ${row.externalId}, Date: ${row.date}, Client: ${row.Client ? row.Client.name : 'N/A'}, Soporte: ${row.Soporte ? row.Soporte.originalName : 'N/A'}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

findSavingsWithSoporte();
