const { Saving, Soporte, Client } = require('./models');

async function checkAM345() {
    try {
        const s = await Saving.findOne({
            where: { externalId: 'AM345' },
            include: [Soporte, Client]
        });

        if (s) {
            console.log(JSON.stringify(s.toJSON(), null, 2));
        } else {
            console.log('Record AM345 not found');
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkAM345();
