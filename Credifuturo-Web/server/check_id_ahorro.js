const Saving = require('./models/Saving');
const { Op } = require('sequelize');

async function checkIdAhorro() {
    try {
        const withData = await Saving.count({
            where: {
                idAhorro: {
                    [Op.and]: [
                        { [Op.not]: null },
                        { [Op.ne]: '' }
                    ]
                }
            }
        });
        const total = await Saving.count();
        console.log(`DATA_STATUS: ${withData} records have idAhorro out of ${total} total.`);
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

checkIdAhorro();
