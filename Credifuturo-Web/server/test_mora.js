const { LoanPayment, Client } = require('./models');
const { Op } = require('sequelize');

async function test() {
    const currentYear = new Date().getFullYear();
    const carteraPayments = await LoanPayment.findAll({
        where: {
            estado: 'Pendiente',
            fechaPagoMax: {
                [Op.between]: [`${currentYear}-01-01`, `${currentYear}-12-31`]
            }
        },
        include: [{
            model: Client,
            where: { estatus: { [Op.like]: '%Activo%' } },
            required: true,
            attributes: []
        }],
        attributes: ['valorCuotaVariable', 'fechaPagoMax']
    });
    
    let carteraActiva = 0;
    let moraCarteraEP = 0;
    const nowLocal = new Date();
    const todayThreshold = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
    
    carteraPayments.forEach(p => {
        const val = parseFloat(p.valorCuotaVariable || 0);
        carteraActiva += val;
        
        let dateStr = String(p.fechaPagoMax);
        if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
        const fechaMax = new Date(dateStr + 'T00:00:00');
        
        if (fechaMax < todayThreshold) {
            moraCarteraEP += val;
        }
    });
    
    console.log('Cartera Activa Total:', Math.round(carteraActiva));
    console.log('En Mora Total:', Math.round(moraCarteraEP));
}

test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
