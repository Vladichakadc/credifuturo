const { Client, Saving, LoanPayment } = require('./models');
const sequelize = require('./config/database');
const { Op } = require('sequelize');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ DB Connected');

        const c = await Client.count();
        const s = await Saving.count();
        const p = await LoanPayment.count();

        // Check for idAhorro presence
        const sWithId = await Saving.findOne({
            where: {
                idAhorro: { [Op.ne]: null },
                idAhorro: { [Op.ne]: '' }
            }
        });

        console.log(`📊 Clients: ${c}`);
        console.log(`📊 Savings: ${s}`);
        console.log(`📊 Payments: ${p}`);
        console.log(`🔍 Sample Id_Ahorro: ${sWithId ? sWithId.idAhorro : 'None found (might be empty in Excel or not mapped)'}`);

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        process.exit(0);
    }
})();
