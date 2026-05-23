// Script de diagnóstico para verificar el estado actual de IDs
const { sequelize } = require('./config/database');
const DisbursedLoan = require('./models/DisbursedLoan');

async function diagnosticarIDs() {
    try {
        console.log('🔍 DIAGNÓSTICO DE IDs EN DisbursedLoans\n');

        // Obtener todos los registros
        const loans = await DisbursedLoan.findAll({
            attributes: ['id', 'idVm', 'orderId', 'socio', 'fechaPrestamo'],
            order: [['id', 'DESC']],
            limit: 25
        });

        console.log(`📊 Total de registros encontrados: ${loans.length}\n`);

        console.log('=== ÚLTIMOS 25 REGISTROS ===');
        loans.forEach(loan => {
            console.log(`DB ID: ${loan.id} | idVm: ${loan.idVm || 'NULL'} | orderId: ${loan.orderId || 'NULL'} | Socio: ${loan.socio}`);
        });

        // Analizar formato SOL{N}
        console.log('\n=== ANÁLISIS DE FORMATO SOL{N} ===');
        const solPattern = /^SOL(\d+)$/;

        const conIdVm = loans.filter(l => l.idVm && solPattern.test(l.idVm));
        const conOrderId = loans.filter(l => l.orderId && solPattern.test(l.orderId));

        console.log(`✅ Registros con idVm válido (SOL{N}): ${conIdVm.length}`);
        if (conIdVm.length > 0) {
            const nums = conIdVm.map(l => parseInt(l.idVm.match(solPattern)[1]));
            console.log(`   Máximo: SOL${Math.max(...nums)}`);
        }

        console.log(`✅ Registros con orderId válido (SOL{N}): ${conOrderId.length}`);
        if (conOrderId.length > 0) {
            const nums = conOrderId.map(l => parseInt(l.orderId.match(solPattern)[1]));
            console.log(`   Máximo: SOL${Math.max(...nums)}`);
        }

        // Detectar inconsistencias
        console.log('\n=== INCONSISTENCIAS DETECTADAS ===');
        const sinIdVm = loans.filter(l => !l.idVm);
        const sinOrderId = loans.filter(l => !l.orderId);
        console.log(`⚠️  Registros SIN idVm: ${sinIdVm.length}`);
        console.log(`⚠️  Registros SIN orderId: ${sinOrderId.length}`);

        // Calcular próximo ID correcto
        console.log('\n=== CÁLCULO DEL PRÓXIMO ID ===');
        const allValidIds = loans
            .map(l => l.idVm || l.orderId)
            .filter(id => id && solPattern.test(id))
            .map(id => parseInt(id.match(solPattern)[1]))
            .filter(n => !isNaN(n));

        if (allValidIds.length === 0) {
            console.log('🆕 Base de datos vacía o sin IDs válidos -> Próximo ID: SOL1');
        } else {
            const maxId = Math.max(...allValidIds);
            const nextId = maxId + 1;
            console.log(`📌 Máximo ID encontrado: SOL${maxId}`);
            console.log(`✅ PRÓXIMO ID CORRECTO: SOL${nextId}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

diagnosticarIDs();
