const Client = require('./models/Client');
const DisbursedLoan = require('./models/DisbursedLoan');
const sequelize = require('./config/database');

async function fixOrphansByName() {
    console.log('--- Iniciando Reparación de Préstamos por Nombre ---');
    const t = await sequelize.transaction();

    try {
        const clients = await Client.findAll({ transaction: t });
        const loans = await DisbursedLoan.findAll({
            where: { client_id: null },
            transaction: t
        });

        console.log(`Buscando coincidencias para ${loans.length} préstamos...`);

        let fixedCount = 0;
        for (const loan of loans) {
            const socioName = (loan.socio || '').replace(/\s+/g, ' ').trim().toLowerCase();

            // Buscar cliente que coincida con el nombre completo
            const match = clients.find(c => {
                const fullName = `${c.name || ''} ${c.apellido1 || ''} ${c.apellido2 || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
                return fullName === socioName || fullName.startsWith(socioName) || socioName.startsWith(fullName);
            });

            if (match) {
                await loan.update({ clientId: match.id }, { transaction: t });
                fixedCount++;
            } else {
                console.log(`⚠️ No se encontró coincidencia para: "${loan.socio}" (ID Préstamo: ${loan.id})`);
            }
        }

        console.log(`✅ Se repararon ${fixedCount} préstamos.`);
        await t.commit();
        console.log('--- Proceso Completado ---');
    } catch (error) {
        if (t) await t.rollback();
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixOrphansByName().then(() => process.exit(0));
