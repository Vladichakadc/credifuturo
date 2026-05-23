const axios = require('axios');
const { Saving } = require('./models');

async function fixIncorrectPenalizations() {
    try {
        console.log('--- Buscando ahorros con posibles penalizaciones incorrectas ---');
        // We'll find all savings with penalizacion='SI' and check if they are actually early payments
        const badSavings = await Saving.findAll({
            where: { penalizacion: 'SI' }
        });

        console.log(`Encontrados ${badSavings.length} ahorros con penalización.`);

        let countFixed = 0;

        for (const saving of badSavings) {
            const fechaPago = saving.date;
            if (!fechaPago) continue;

            const [yearStr, monthStr, dayStr] = fechaPago.split('-');
            const dia = parseInt(dayStr);
            const mes = parseInt(monthStr);
            const anio = parseInt(yearStr);

            const mesAbonadoNum = parseInt(saving.mesAbonado);
            const anioAbonadoReq = parseInt(saving.anioAbonado);

            if (isNaN(mesAbonadoNum) || isNaN(anioAbonadoReq)) continue;

            const isPagoAdelantado = (anioAbonadoReq > anio) || (anioAbonadoReq === anio && mesAbonadoNum > mes);
            
            if (isPagoAdelantado) {
                console.log(`\n➡️ Registro ${saving.externalId} (ID: ${saving.id}) es Pago Adelantado pero tiene penalización.`);
                console.log(`   Fecha Pago: ${fechaPago}, Abonando Mes: ${mesAbonadoNum}, Año: ${anioAbonadoReq}`);
                console.log(`   Penalización Actual: ${saving.valorAPenalizar}`);

                // Simulando un PUT a su endpoint usando axios para aprovechar la nueva lógica
                // Necesitamos el endpoint de la API, asumimos que localhost:3000 funciona
                try {
                    const payload = {
                        clientId: saving.clientId,
                        amount: saving.amount,
                        date: saving.date,
                        month: saving.month,
                        mesAbonado: saving.mesAbonado,
                        anioAbonado: saving.anioAbonado,
                        year: saving.year,
                        monthInt: saving.monthInt,
                        type: saving.type,
                        status: saving.status,
                        itemQuantity: saving.itemQuantity
                    };

                    const putRes = await axios.put(`http://localhost:3000/api/admin/savings/${saving.id}`, payload);
                    
                    if (putRes.data.penalizacion === 'NO') {
                        console.log(`   ✅ Corregido: Penalización removida ($0).`);
                        countFixed++;
                    } else {
                        console.log(`   ❌ Falló corrección: Sigue penalizado.`);
                    }
                } catch (putErr) {
                    console.error(`   ❌ Error al actualizar ${saving.externalId}:`, putErr.message);
                }
            }
        }

        console.log(`\n🎉 Finalizado. Se corrigieron ${countFixed} registros.`);

    } catch (err) {
        console.error('Error general:', err.message);
    } finally {
        process.exit();
    }
}

fixIncorrectPenalizations();
