const { LoanPayment, Client } = require('../models');
const { Op } = require('sequelize');

(async () => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const clientWhere = {};
    const rows = await LoanPayment.findAll({
      where: {
        estado: 'Pendiente',
        fechaPagoMax: { [Op.between]: [`${currentYear}-01-01`, `${currentYear}-12-31`] }
      },
      include: [{ model: Client, where: clientWhere, required: false }],
      attributes: ['valorCuotaVariable']
    });
    const total = rows.reduce((sum, r) => sum + parseFloat(r.valorCuotaVariable || 0), 0);
    console.log('Sum of valorCuotaVariable (Pendiente, current year):', total);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
})();
