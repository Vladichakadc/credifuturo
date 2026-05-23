const { Saving } = require('./models');

async function debugSavings() {
    try {
        const s343 = await Saving.findOne({ where: { externalId: 'AM343' }});
        const s344 = await Saving.findOne({ where: { externalId: 'AM344' }});

        console.log("AM343:", JSON.stringify({
            externalId: s343.externalId,
            date: s343.date,
            month: s343.month,
            mesAbonado: s343.mesAbonado,
            year: s343.year,
            anioAbonado: s343.anioAbonado,
            penalizacion: s343.penalizacion,
            diasPenalizacion: s343.diasPenalizacion,
            valorAPenalizar: s343.valorAPenalizar
        }, null, 2));

        console.log("AM344:", JSON.stringify({
            externalId: s344.externalId,
            date: s344.date,
            month: s344.month,
            mesAbonado: s344.mesAbonado,
            year: s344.year,
            anioAbonado: s344.anioAbonado,
            penalizacion: s344.penalizacion,
            diasPenalizacion: s344.diasPenalizacion,
            valorAPenalizar: s344.valorAPenalizar
        }, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
debugSavings();
