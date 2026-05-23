const Client = require('./models/Client');
const LoanPayment = require('./models/LoanPayment');
const DisbursedLoan = require('./models/DisbursedLoan');
const sequelize = require('./config/database');

async function verifyIntegrity() {
    console.log('--- Iniciando Verificación de Integridad ---');

    // 1. Verificar Clientes (customerId)
    const nullCid = await Client.count({ where: { customerId: null } });
    console.log(`Clientes con customerId NULL: ${nullCid}`);

    // 2. Verificar Préstamos Huérfanos
    const orphans = await DisbursedLoan.findAll({
        include: [{
            model: Client,
            required: false
        }],
        where: sequelize.literal('`Client`.id IS NULL')
    });
    console.log(`Préstamos Huérfanos (sin cliente): ${orphans.length}`);

    // 3. Verificar Duplicados en LoanPayments
    const duplicates = await LoanPayment.findAll({
        attributes: ['id_ep', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
        group: ['id_ep'],
        having: sequelize.literal('cnt > 1')
    });
    console.log(`Grupos de IDs duplicados en LoanPayments: ${duplicates.length}`);

    // 4. Totales
    const totalPayments = await LoanPayment.count();
    console.log(`Total de registros en LoanPayments: ${totalPayments}`);

    if (nullCid === 0 && orphans.length === 0 && duplicates.length === 0) {
        console.log('✅ INTEGRIDAD VERIFICADA: Todos los problemas han sido resueltos.');
    } else {
        console.log('❌ INTEGRIDAD FALLIDA: Aún persisten problemas.');
        if (nullCid > 0) console.log('   - Hay clientes con customerId nulo.');
        if (orphans.length > 0) console.log('   - Hay préstamos sin cliente asociado.');
        if (duplicates.length > 0) console.log('   - Hay IDs de pago duplicados.');
    }
}

verifyIntegrity().then(() => process.exit(0));
