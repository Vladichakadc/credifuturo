const Saving = require('./models/Saving');
const { Op } = require('sequelize');

async function check() {
    try {
        const currentYear = 2026;
        console.log(`Checking penalties for year ${currentYear}...`);
        
        const count = await Saving.count({ where: { year: currentYear } });
        console.log(`Total records for year ${currentYear}: ${count}`);
        
        const sums = await Saving.findAll({
            where: { year: currentYear },
            attributes: [
                [require('sequelize').fn('SUM', require('sequelize').col('diasPenalizacion')), 'totalDays'],
                [require('sequelize').fn('SUM', require('sequelize').col('valorAPenalizar')), 'totalValue']
            ],
            raw: true
        });
        
        console.log('Sums for year:', sums[0]);

        const totalSums = await Saving.findAll({
            attributes: [
                [require('sequelize').fn('SUM', require('sequelize').col('diasPenalizacion')), 'totalDays'],
                [require('sequelize').fn('SUM', require('sequelize').col('valorAPenalizar')), 'totalValue']
            ],
            raw: true
        });
        console.log('Total sums (all time):', totalSums[0]);

        const sample = await Saving.findAll({
            where: {
                [Op.or]: [
                    { diasPenalizacion: { [Op.gt]: 0 } },
                    { valorAPenalizar: { [Op.gt]: 0 } }
                ]
            },
            limit: 5,
            raw: true
        });
        console.log('Sample records with penalties:', sample.map(s => ({ id: s.id, year: s.year, anio: s.anioAbonado, days: s.diasPenalizacion, val: s.valorAPenalizar })));

    } catch (e) {
        console.error(e);
    }
}

check();
