const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/admin';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

async function testPenalizacion() {
    console.log(`\n${colors.cyan}╔═══════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║  PRUEBAS: Validación Fecha y Penalización        ║${colors.reset}`);
    console.log(`${colors.cyan}╚═══════════════════════════════════════════════════╝${colors.reset}\n`);

    try {
        // Obtener cliente
        const clientsRes = await axios.get(`${BASE_URL}/clients`);
        const client = clientsRes.data[0];

        if (!client) {
            console.log('❌ No hay clientes en la base de datos');
            return false;
        }

        console.log(`👤 Cliente de prueba: ${client.name} (ID: ${client.id})\n`);

        let allPassed = true;

        // ═══════════════════════════════════════════════════
        // CASO A: Día 10 - NO penaliza
        // ═══════════════════════════════════════════════════
        console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.yellow}📋 CASO A: Día 10 - NO debe penalizar${colors.reset}`);
        console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
        console.log('Datos: FechaPago=2026-01-10, Monto=100000, Penalización=1000');
        console.log('Esperado: Días=0, Penalizar=0, Ahorrado=100000\n');

        const casoA = {
            clientId: client.id,
            amount: 100000,
            date: '2026-01-10',
            type: 'Mensual',
            penalizacion: 1000,
            status: 'Abono',
            banco: 'Bancolombia',
            numeroTransaccion: 'TEST_CASO_A',
            origen: 'Prueba',
            year: 2026,
            month: 'Enero',
            monthInt: 1,
            mesAbonado: 'Enero',
            anioAbonado: 2026,
            itemQuantity: 1
        };

        const resA = await axios.post(`${BASE_URL}/savings`, casoA);
        const savingA = resA.data;

        console.log(`Resultado:`);
        console.log(`  ID_VM: ${savingA.externalId}`);
        console.log(`  Días Penalizados: ${savingA.diasPenalizacion} (esperado: 0)`);
        console.log(`  Valor a Penalizar: $${parseFloat(savingA.valorAPenalizar).toLocaleString('es-CO')} (esperado: $0)`);
        console.log(`  Valor Ahorrado: $${parseFloat(savingA.valorAhorrado).toLocaleString('es-CO')} (esperado: $100.000)`);

        if (savingA.diasPenalizacion == 0 &&
            parseFloat(savingA.valorAPenalizar) == 0 &&
            parseFloat(savingA.valorAhorrado) == 100000) {
            console.log(`${colors.green}✅ CASO A: PASÓ${colors.reset}\n`);
        } else {
            console.log(`${colors.red}❌ CASO A: FALLÓ${colors.reset}\n`);
            allPassed = false;
        }

        // ═══════════════════════════════════════════════════
        // CASO B: Día 11 - SÍ penaliza (1 día)
        // ═══════════════════════════════════════════════════
        console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.yellow}📋 CASO B: Día 11 - SÍ debe penalizar (1 día)${colors.reset}`);
        console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
        console.log('Datos: FechaPago=2026-01-11, Monto=100000, Penalización=1000');
        console.log('Esperado: Días=1, Penalizar=1000, Ahorrado=99000\n');

        const casoB = {
            ...casoA,
            date: '2026-01-11',
            numeroTransaccion: 'TEST_CASO_B'
        };

        const resB = await axios.post(`${BASE_URL}/savings`, casoB);
        const savingB = resB.data;

        console.log(`Resultado:`);
        console.log(`  ID_VM: ${savingB.externalId}`);
        console.log(`  Días Penalizados: ${savingB.diasPenalizacion} (esperado: 1)`);
        console.log(`  Valor a Penalizar: $${parseFloat(savingB.valorAPenalizar).toLocaleString('es-CO')} (esperado: $1.000)`);
        console.log(`  Valor Ahorrado: $${parseFloat(savingB.valorAhorrado).toLocaleString('es-CO')} (esperado: $99.000)`);

        if (savingB.diasPenalizacion == 1 &&
            parseFloat(savingB.valorAPenalizar) == 1000 &&
            parseFloat(savingB.valorAhorrado) == 99000) {
            console.log(`${colors.green}✅ CASO B: PASÓ${colors.reset}\n`);
        } else {
            console.log(`${colors.red}❌ CASO B: FALLÓ${colors.reset}\n`);
            allPassed = false;
        }

        // ═══════════════════════════════════════════════════
        // CASO C: Día 20 - Penaliza 10 días
        // ═══════════════════════════════════════════════════
        console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.yellow}📋 CASO C: Día 20 - Penaliza 10 días${colors.reset}`);
        console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
        console.log('Datos: FechaPago=2026-01-20, Monto=100000, Penalización=1000');
        console.log('Esperado: Días=10, Penalizar=10000, Ahorrado=90000\n');

        const casoC = {
            ...casoA,
            date: '2026-01-20',
            numeroTransaccion: 'TEST_CASO_C'
        };

        const resC = await axios.post(`${BASE_URL}/savings`, casoC);
        const savingC = resC.data;

        console.log(`Resultado:`);
        console.log(`  ID_VM: ${savingC.externalId}`);
        console.log(`  Días Penalizados: ${savingC.diasPenalizacion} (esperado: 10)`);
        console.log(`  Valor a Penalizar: $${parseFloat(savingC.valorAPenalizar).toLocaleString('es-CO')} (esperado: $10.000)`);
        console.log(`  Valor Ahorrado: $${parseFloat(savingC.valorAhorrado).toLocaleString('es-CO')} (esperado: $90.000)`);

        if (savingC.diasPenalizacion == 10 &&
            parseFloat(savingC.valorAPenalizar) == 10000 &&
            parseFloat(savingC.valorAhorrado) == 90000) {
            console.log(`${colors.green}✅ CASO C: PASÓ${colors.reset}\n`);
        } else {
            console.log(`${colors.red}❌ CASO C: FALLÓ${colors.reset}\n`);
            allPassed = false;
        }

        // Limpiar registros de prueba
        console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
        console.log('🧹 Limpiando registros de prueba...');
        for (const txn of ['TEST_CASO_A', 'TEST_CASO_B', 'TEST_CASO_C']) {
            const savingsRes = await axios.get(`${BASE_URL}/savings`);
            const testRecord = savingsRes.data.find(s => s.numeroTransaccion === txn);
            if (testRecord) {
                await axios.delete(`${BASE_URL}/savings/${testRecord.id}`);
                console.log(`  ✅ Eliminado: ${txn} (ID_VM: ${testRecord.externalId})`);
            }
        }

        console.log(`\n${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
        if (allPassed) {
            console.log(`${colors.green}🎉 TODAS LAS PRUEBAS PASARON (3/3)${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ ALGUNAS PRUEBAS FALLARON${colors.reset}`);
        }
        console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

        return allPassed;

    } catch (error) {
        console.log(`${colors.red}❌ ERROR EN PRUEBAS:${colors.reset}`);
        console.log(`   ${error.message}`);
        if (error.response) {
            console.log(`   Detalle: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        return false;
    }
}

testPenalizacion().then(success => {
    process.exit(success ? 0 : 1);
});
