const sequelize = require('../config/database');
const LoanPayment = require('../models/LoanPayment');
const Client = require('../models/Client');

async function check() {
    await sequelize.authenticate();
    const records = await LoanPayment.findAll({
        where: { valorCuotaPago: { [require('sequelize').Op.gt]: 0 } },
        order: [['updatedAt', 'DESC']],
        limit: 10,
        include: [{ model: Client, attributes: ['name', 'surname1'] }]
    });

    console.log("Top 10 recent payments (by updatedAt):");
    records.forEach(r => {
        console.log(`- ID: ${r.id}, Client: ${r.Client.name} ${r.Client.surname1}, Mes: ${r.mesPago}, Pago: ${r.valorCuotaPago}, UpdatedAt: ${r.updatedAt}`);
    });

    const byId = await LoanPayment.findAll({
        where: { valorCuotaPago: { [require('sequelize').Op.gt]: 0 } },
        order: [['id', 'DESC']],
        limit: 10,
        include: [{ model: Client, attributes: ['name', 'surname1'] }]
    });

    console.log("\nTop 10 recent payments (by id):");
    byId.forEach(r => {
        console.log(`- ID: ${r.id}, Client: ${r.Client.name} ${r.Client.surname1}, Mes: ${r.mesPago}, Pago: ${r.valorCuotaPago}, UpdatedAt: ${r.updatedAt}`);
    });
    process.exit(0);
}
check();
