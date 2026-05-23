const { Op } = require('sequelize');
const sequelize = require('./config/database');
const LoanPayment = require('./models/LoanPayment');

async function fixItemQuantity() {
    try {
        await sequelize.authenticate();
        console.log('Conectado a la base de datos.\n');

        // 1. Contar estado actual antes de los cambios
        const total = await LoanPayment.count();
        const currentOnes = await LoanPayment.count({ where: { itemQuantity: 1 } });
        const currentZeros = await LoanPayment.count({ where: { itemQuantity: 0 } });
        console.log(`Total registros: ${total}`);
        console.log(`Actuales con itemQuantity=1: ${currentOnes}`);
        console.log(`Actuales con itemQuantity=0: ${currentZeros}`);
        console.log('---');

        // 2. Aplicar la regla: 
        //    itemQuantity = 1 si estadoPrestamo='Cancelado' OR estado='Pago'
        //    itemQuantity = 0 en cualquier otro caso

        const [setTo1] = await LoanPayment.update(
            { itemQuantity: 1 },
            {
                where: {
                    [Op.or]: [
                        { estadoPrestamo: 'Cancelado' },
                        { estado: 'Pago' }
                    ]
                }
            }
        );
        console.log(`Registros actualizados a itemQuantity=1: ${setTo1}`);

        const [setTo0] = await LoanPayment.update(
            { itemQuantity: 0 },
            {
                where: {
                    [Op.and]: [
                        { estadoPrestamo: { [Op.ne]: 'Cancelado' } },
                        { estado: { [Op.ne]: 'Pago' } }
                    ]
                }
            }
        );
        console.log(`Registros actualizados a itemQuantity=0: ${setTo0}`);

        // 3. Verificar resultado final
        const afterOnes = await LoanPayment.count({ where: { itemQuantity: 1 } });
        const afterZeros = await LoanPayment.count({ where: { itemQuantity: 0 } });
        console.log('---');
        console.log('RESULTADO FINAL:');
        console.log(`Registros con itemQuantity=1: ${afterOnes}`);
        console.log(`Registros con itemQuantity=0: ${afterZeros}`);
        console.log(`Total verificado: ${afterOnes + afterZeros} / ${total}`);
        
    } catch (err) {
        console.error('Error:', err);
    }
    process.exit(0);
}

fixItemQuantity();
