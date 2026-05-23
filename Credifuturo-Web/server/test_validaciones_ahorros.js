const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/admin';

// Colores para consola
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCase(nombre, descripcion, testFn) {
    console.log(`\n${colors.cyan}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}📋 CASO: ${nombre}${colors.reset}`);
    console.log(`${colors.yellow}   ${descripcion}${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);

    try {
        await testFn();
        console.log(`${colors.green}✅ CASO EXITOSO${colors.reset}`);
        return true;
    } catch (error) {
        console.log(`${colors.red}❌ CASO FALLIDO${colors.reset}`);
        console.log(`${colors.red}Error: ${error.message}${colors.reset}`);
        if (error.response) {
            console.log(`${colors.red}Detalle: ${JSON.stringify(error.response.data, null, 2)}${colors.reset}`);
        }
        return false;
    }
}

async function runTests() {
    console.log(`\n${colors.green}╔═══════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.green}║  PRUEBAS DE VALIDACIONES AUTOMÁTICAS - AHORROS   ║${colors.reset}`);
    console.log(`${colors.green}╚═══════════════════════════════════════════════════╝${colors.reset}\n`);

    let passedTests = 0;
    let totalTests = 0;

    // Obtener clientes
    const clientsRes = await axios.get(`${BASE_URL}/clients`);
    const client = clientsRes.data[0];
    if (!client) {
        console.log(`${colors.red}❌ No hay clientes en la base de datos${colors.reset}`);
        return;
    }
    console.log(`${colors.cyan}👤 Cliente de prueba: ${client.name} (ID: ${client.id})${colors.reset}\n`);

    // ===== CASO 1: Fecha día 10 =====
    totalTests++;
    const case1 = await testCase(
        "CASO 1",
        "Fecha día 10, Monto 50000 → Penalización 0, Ahorrado 50000",
        async () => {
            const data = {
                clientId: client.id,
                amount: 50000,
                date: '2026-02-10',  // Día 10
                type: 'Mensual',
                penalizacion: 1000,
                status: 'Abono',
                banco: 'Bancolombia',
                numeroTransaccion: 'TEST001',
                origen: 'Cuenta Ahorros',
                year: 2026,
                month: 'Febrero',
                monthInt: 2,
                mesAbonado: 'Febrero',
                anioAbonado: 2026,
                itemQuantity: 1
            };

            const res = await axios.post(`${BASE_URL}/savings`, data);
            const saving = res.data;

            console.log(`   📊 Resultado:`);
            console.log(`      - Id_VM: ${saving.externalId}`);
            console.log(`      - Días Penalizados: ${saving.diasPenalizacion}`);
            console.log(`      - Valor a Penalizar: $${parseFloat(saving.valorAPenalizar).toLocaleString('es-CO')}`);
            console.log(`      - Valor Ahorrado: $${parseFloat(saving.valorAhorrado).toLocaleString('es-CO')}`);
            console.log(`   ${saving._calculado?.mensaje || ''}`);

            if (saving.diasPenalizacion !== 0) throw new Error('Días penalizados debería ser 0');
            if (parseFloat(saving.valorAPenalizar) !== 0) throw new Error('Valor a penalizar debería ser 0');
            if (parseFloat(saving.valorAhorrado) !== 50000) throw new Error('Valor ahorrado debería ser 50000');
        }
    );
    if (case1) passedTests++;

    await delay(1500);  // Mayor delay para evitar concurrencia

    // ===== CASO 2: Fecha día 11 =====
    totalTests++;
    const case2 = await testCase(
        "CASO 2",
        "Fecha día 11, Penalización 1000, Monto 50000 → Días 1, Penaliza 1000, Ahorrado 49000",
        async () => {
            const data = {
                clientId: client.id,
                amount: 50000,
                date: '2026-02-11',  // Día 11
                type: 'Mensual',
                penalizacion: 1000,
                status: 'Abono',
                banco: 'Bancolombia',
                numeroTransaccion: 'TEST002',
                origen: 'Cuenta Ahorros',
                year: 2026,
                month: 'Febrero',
                monthInt: 2,
                mesAbonado: 'Febrero',
                anioAbonado: 2026,
                itemQuantity: 1
            };

            const res = await axios.post(`${BASE_URL}/savings`, data);
            const saving = res.data;

            console.log(`   📊 Resultado:`);
            console.log(`      - Id_VM: ${saving.externalId}`);
            console.log(`      - Días Penalizados: ${saving.diasPenalizacion}`);
            console.log(`      - Valor a Penalizar: $${parseFloat(saving.valorAPenalizar).toLocaleString('es-CO')}`);
            console.log(`      - Valor Ahorrado: $${parseFloat(saving.valorAhorrado).toLocaleString('es-CO')}`);
            console.log(`   ${saving._calculado?.mensaje || ''}`);

            if (saving.diasPenalizacion !== 1) throw new Error(`Días penalizados debería ser 1, es ${saving.diasPenalizacion}`);
            if (parseFloat(saving.valorAPenalizar) !== 1000) throw new Error('Valor a penalizar debería ser 1000');
            if (parseFloat(saving.valorAhorrado) !== 49000) throw new Error(`Valor ahorrado debería ser 49000, es ${saving.valorAhorrado}`);
        }
    );
    if (case2) passedTests++;

    await delay(1500);  // Mayor delay para evitar concurrencia

    // ===== CASO 3: Fecha día 15 =====
    totalTests++;
    const case3 = await testCase(
        "CASO 3",
        "Fecha día 15, Penalización 1000, Monto 50000 → Días 5, Penaliza 5000, Ahorrado 45000",
        async () => {
            const data = {
                clientId: client.id,
                amount: 50000,
                date: '2026-02-15',  // Día 15
                type: 'Mensual',
                penalizacion: 1000,
                status: 'Abono',
                banco: 'Bancolombia',
                numeroTransaccion: 'TEST003',
                origen: 'Cuenta Ahorros',
                year: 2026,
                month: 'Febrero',
                monthInt: 2,
                mesAbonado: 'Febrero',
                anioAbonado: 2026,
                itemQuantity: 1
            };

            const res = await axios.post(`${BASE_URL}/savings`, data);
            const saving = res.data;

            console.log(`   📊 Resultado:`);
            console.log(`      - Id_VM: ${saving.externalId}`);
            console.log(`      - Días Penalizados: ${saving.diasPenalizacion}`);
            console.log(`      - Valor a Penalizar: $${parseFloat(saving.valorAPenalizar).toLocaleString('es-CO')}`);
            console.log(`      - Valor Ahorrado: $${parseFloat(saving.valorAhorrado).toLocaleString('es-CO')}`);
            console.log(`   ${saving._calculado?.mensaje || ''}`);

            if (saving.diasPenalizacion !== 5) throw new Error(`Días penalizados debería ser 5, es ${saving.diasPenalizacion}`);
            if (parseFloat(saving.valorAPenalizar) !== 5000) throw new Error('Valor a penalizar debería ser 5000');
            if (parseFloat(saving.valorAhorrado) !== 45000) throw new Error(`Valor ahorrado debería ser 45000, es ${saving.valorAhorrado}`);
        }
    );
    if (case3) passedTests++;

    await delay(1500);  // Mayor delay para evitar concurrencia

    // ===== CASO 4: Monto insuficiente =====
    totalTests++;
    const case4 = await testCase(
        "CASO 4",
        "Fecha día 20, Monto 5000 → Validar rechazo (penalización > monto)",
        async () => {
            const data = {
                clientId: client.id,
                amount: 5000,
                date: '2026-02-20',  // Día 20 = 10 días de penalización = $10,000
                type: 'Mensual',
                penalizacion: 1000,
                status: 'Abono',
                banco: 'Bancolombia',
                numeroTransaccion: 'TEST004',
                origen: 'Cuenta Ahorros',
                year: 2026,
                month: 'Febrero',
                monthInt: 2,
                mesAbonado: 'Febrero',
                anioAbonado: 2026,
                itemQuantity: 1
            };

            try {
                await axios.post(`${BASE_URL}/savings`, data);
                throw new Error('Debería haber rechazado el registro');
            } catch (error) {
                if (error.response && error.response.status === 400) {
                    console.log(`   ${colors.green}✓ Correctamente rechazado por el backend${colors.reset}`);
                    console.log(`   ${colors.yellow}Error recibido: ${error.response.data.error}${colors.reset}`);
                    const detalles = error.response.data.detalles;
                    if (detalles) {
                        console.log(`   📊 Detalles:`);
                        console.log(`      - Día: ${detalles.diaRegistro}`);
                        console.log(`      - Días Penalización: ${detalles.diasPenalizacion}`);
                        console.log(`      - Valor a Penalizar: $${detalles.valorAPenalizar.toLocaleString('es-CO')}`);
                    }
                } else {
                    throw error;
                }
            }
        }
    );
    if (case4) passedTests++;

    await delay(1500);  // Mayor delay para evitar concurrencia

    // ===== CASO 5: ID_VM Consecutivo =====
    totalTests++;
    const case5 = await testCase(
        "CASO 5",
        "Verificar que Id_VM es consecutivo (último + 1)",
        async () => {
            // Obtener último Id_VM
            const savingsRes = await axios.get(`${BASE_URL}/savings`);
            const savings = savingsRes.data;
            const ids = savings.map(s => parseInt(s.externalId)).filter(id => !isNaN(id));
            const lastId = ids.length > 0 ? Math.max(...ids) : 0;

            console.log(`   📊 Último Id_VM en BD: ${lastId}`);

            // Crear nuevo registro
            const data = {
                clientId: client.id,
                amount: 25000,
                date: '2026-02-08',
                type: 'Mensual',
                penalizacion: 1000,
                status: 'Abono',
                banco: 'Bancolombia',
                numeroTransaccion: 'TEST005',
                origen: 'Cuenta Ahorros',
                year: 2026,
                month: 'Febrero',
                monthInt: 2,
                mesAbonado: 'Febrero',
                anioAbonado: 2026,
                itemQuantity: 1
            };

            const res = await axios.post(`${BASE_URL}/savings`, data);
            const newId = parseInt(res.data.externalId);

            console.log(`   📊 Nuevo Id_VM asignado: ${newId}`);
            console.log(`   📊 Esperado: ${lastId + 1}`);

            if (newId !== lastId + 1) {
                throw new Error(`Id_VM no es consecutivo. Esperado: ${lastId + 1}, Recibido: ${newId}`);
            }
        }
    );
    if (case5) passedTests++;

    // ===== RESUMEN =====
    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}╔═══════════════════════╗${colors.reset}`);
    console.log(`${colors.green}║  RESUMEN DE PRUEBAS   ║${colors.reset}`);
    console.log(`${colors.green}╚═══════════════════════╝${colors.reset}`);
    console.log(`Total Casos: ${totalTests}`);
    console.log(`${colors.green}✓ Exitosos: ${passedTests}${colors.reset}`);
    console.log(`${colors.red}✗ Fallidos: ${totalTests - passedTests}${colors.reset}`);
    console.log(`Porcentaje: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

    if (passedTests === totalTests) {
        console.log(`${colors.green}🎉 ¡TODAS LAS PRUEBAS PASARON!${colors.reset}\n`);
    } else {
        console.log(`${colors.red}❌ Algunas pruebas fallaron${colors.reset}\n`);
    }
}

runTests().catch(err => {
    console.error(`${colors.red}Error fatal:${colors.reset}`, err);
    process.exit(1);
});
