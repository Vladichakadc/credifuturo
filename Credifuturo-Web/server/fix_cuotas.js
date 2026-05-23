const { Sequelize } = require('sequelize');
const LoanPayment = require('./models/LoanPayment'); // Asegúrate de que la ruta sea correcta
const sequelize = require('./config/database'); // Asegúrate de que la ruta sea correcta

async function fixItemQuantity() {
    try {
        console.log('Iniciando corrección de número de cuota (itemQuantity) en LoanPayments...');

        // 1. Obtener todos los pagos ordenados cronológicamente (por ID o fechaPagoMax)
        const allPayments = await LoanPayment.findAll({
            order: [['idVm', 'ASC'], ['id', 'ASC']]
        });

        console.log(`Se encontraron ${allPayments.length} pagos en total.`);

        // 2. Agrupar y actualizar
        const groups = {}; // idVm -> limit
        let updatedCount = 0;

        for (const payment of allPayments) {
            const idVm = payment.idVm;
            if (!idVm) continue;

            if (!groups[idVm]) {
                groups[idVm] = 1;
            }

            const correctItemQuantity = groups[idVm];

            // Si el itemQuantity es distinto ('0', vacío o incorrecto), se actualiza
            if (payment.itemQuantity !== correctItemQuantity.toString() && payment.itemQuantity !== correctItemQuantity) {
                await payment.update({ itemQuantity: correctItemQuantity.toString() });
                updatedCount++;
            }

            groups[idVm]++;
        }

        console.log(`✅ Corrección exitosa. ${updatedCount} registros actualizados.`);
    } catch (error) {
        console.error('❌ Error corrigiendo itemQuantity:', error);
    } finally {
        process.exit();
    }
}

fixItemQuantity();
