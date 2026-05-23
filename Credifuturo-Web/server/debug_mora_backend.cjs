const { Client, Saving } = require('./models');
const { Op } = require('sequelize');

async function debugMoraBackend() {
    try {
        const today = new Date('2026-03-14');
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const now = today;

        const clientsToEvaluate = await Client.findAll({ 
            where: { estatus: { [Op.like]: '%Activo%' } } 
        });

        const activeClientIds = clientsToEvaluate.map(c => c.id);
        const savingsThisYear = await Saving.findAll({
            where: {
                clientId: { [Op.in]: activeClientIds },
                anioAbonado: currentYear,
                type: { [Op.ne]: 'Aporte Inicial' }
            }
        });

        const savingSet = new Set();
        savingsThisYear.forEach(s => {
            if (s.mesAbonado) savingSet.add(`${s.clientId}-${s.mesAbonado}`);
        });

        console.log(`--- Debugging Cartera en Mora (Total Clients: ${clientsToEvaluate.length}) ---`);
        
        let totalVal = 0;
        let count = 0;

        for (const client of clientsToEvaluate) {
            const hasMonthlyRecord = Array.from(savingSet).some(key => key.startsWith(`${client.id}-`));
            
            if (hasMonthlyRecord) {
                // console.log(`Client ${client.id} (${client.name}): Skipped (Has records)`);
                continue;
            }

            const mesesPendientes = [];
            for (let mes = 1; mes <= currentMonth; mes++) {
                if (!savingSet.has(`${client.id}-${mes}`)) {
                    mesesPendientes.push(mes);
                }
            }

            if (mesesPendientes.length === 0) continue;

            const primerMesSinAhorro = mesesPendientes[0];
            const dia10PrimerMes = new Date(currentYear, primerMesSinAhorro - 1, 10);

            if (now <= dia10PrimerMes) continue;

            const diffMs = now.getTime() - dia10PrimerMes.getTime();
            const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            const pen = diffDays * 1000;

            if (pen > 0) {
                console.log(`MORA Client ${client.id} (${client.name}, ID_C: ${client.customerId}): ${diffDays} days = $${pen}`);
                totalVal += pen;
                count++;
            }
        }
        
        console.log(`Total Mora: $${totalVal}, Count: ${count}`);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

debugMoraBackend();
