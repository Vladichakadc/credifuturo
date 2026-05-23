const { Soporte } = require('./models');

async function checkSoporteForAM345() {
    try {
        const sop = await Soporte.findOne({
            where: { savingId: 1364 }
        });
        if (sop) {
            console.log('Soporte found for Saving 1364:');
            console.log(JSON.stringify({
                id: sop.id,
                savingId: sop.savingId,
                originalName: sop.originalName
            }, null, 2));
        } else {
            console.log('Soporte NOT found for Saving 1364');
            const all = await Soporte.findAll({ limit: 5 });
            console.log('Sample Soportes headers:', all.map(a => ({ id: a.id, sId: a.savingId, pId: a.paymentId })));
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkSoporteForAM345();
