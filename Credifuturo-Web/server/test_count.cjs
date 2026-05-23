const sequelize = require('./config/database');
const LoanPayment = require('./models/LoanPayment');
const Client = require('./models/Client');
const { Op } = require('sequelize');

async function debugCount() {
    try {
        const statusesToInclude = ['Activo', 'Desactivado Parcial', 'Desactivado Total'];
        let clientWhere = {
            estatus: { [Op.in]: statusesToInclude }
        };

        const recaudoCuotasCount = await LoanPayment.count({
            where: {
                estado: 'Pago',
                estadoPrestamo: 'Pendiente'
            },
            include: [{
                model: Client,
                where: Object.keys(clientWhere).length > 0 ? clientWhere : undefined,
                required: Object.keys(clientWhere).length > 0
            }]
        });

        console.log('recaudoCuotasCount with clientWhere:', recaudoCuotasCount);

        const all = await LoanPayment.findAll({
            where: {
                estado: 'Pago',
                estadoPrestamo: 'Pendiente'
            },
            include: [{
                model: Client,
                attributes: ['id', 'name', 'estatus']
            }]
        });
        console.log('Sample matching items:', all.map(r => r.toJSON()));

    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

debugCount();
