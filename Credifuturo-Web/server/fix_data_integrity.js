const Client = require('./models/Client');
const LoanPayment = require('./models/LoanPayment');
const DisbursedLoan = require('./models/DisbursedLoan');
const sequelize = require('./config/database');
const { Op } = require('sequelize');

async function fixIntegrity() {
    console.log('--- Iniciando Corrección de Integridad de Datos ---');
    const t = await sequelize.transaction();

    try {
        // 1. Corregir Cliente Administrador (ID 35)
        const adminClient = await Client.findByPk(35, { transaction: t });
        if (adminClient) {
            console.log('Actualizando Cliente Administrador (ID 35)...');
            await adminClient.update({ customerId: 'ADMN-001' }, { transaction: t });
            console.log('✅ Cliente Administrador actualizado.');
        } else {
            console.log('⚠️ No se encontró al cliente con ID 35.');
        }

        // 2. Corregir Préstamo Huérfano (ID 25)
        const orphanLoan = await DisbursedLoan.findByPk(25, { transaction: t });
        if (orphanLoan) {
            console.log('Asociando Préstamo Huérfano (ID 25) al Administrador...');
            await orphanLoan.update({ clientId: 35 }, { transaction: t });
            console.log('✅ Préstamo Huérfano asociado.');
        } else {
            console.log('⚠️ No se encontró el préstamo con ID 25.');
        }

        // 3. Eliminar Duplicados en LoanPayments (id_ep)
        console.log('Buscando duplicados en LoanPayments...');
        const duplicates = await LoanPayment.findAll({
            attributes: ['id_ep', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
            group: ['id_ep'],
            having: sequelize.literal('cnt > 1'),
            transaction: t
        });

        console.log(`Encontrados ${duplicates.length} grupos de IDs duplicados.`);

        let totalDeleted = 0;
        for (const group of duplicates) {
            const idEp = group.getDataValue('id_ep');

            // Buscar todos los registros con este id_ep, ordenados por id ASC
            const records = await LoanPayment.findAll({
                where: { externalId: idEp },
                order: [['id', 'ASC']],
                transaction: t
            });

            // Mantener el primero, eliminar el resto
            if (records.length > 1) {
                const toDelete = records.slice(1).map(r => r.id);
                const deleted = await LoanPayment.destroy({
                    where: { id: toDelete },
                    transaction: t
                });
                totalDeleted += deleted;
            }
        }
        console.log(`✅ Se eliminaron ${totalDeleted} registros duplicados.`);

        await t.commit();
        console.log('--- Proceso Completado Exitosamente ---');
    } catch (error) {
        await t.rollback();
        console.error('❌ Error durante la corrección:', error);
        process.exit(1);
    }
}

fixIntegrity().then(() => process.exit(0));
