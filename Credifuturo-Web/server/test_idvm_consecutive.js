const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/admin';

async function testIDGeneration() {
    console.log('🧪 PRUEBA: Generación ID_VM Consecutivo AI##\n');
    console.log('═══════════════════════════════════════════════════\n');

    try {
        // 1. Obtener estado actual
        console.log('📊 PASO 1: Obteniendo último ID_VM...');
        const savingsRes = await axios.get(`${BASE_URL}/savings`);
        const savings = savingsRes.data;

        // Filtrar IDs AI##
        const aiPattern = /^AI(\d+)$/;
        const aiSavings = savings.filter(s => s.externalId && aiPattern.test(s.externalId));
        const aiNumbers = aiSavings.map(s => parseInt(s.externalId.match(aiPattern)[1]));
        const maxAI = Math.max(...aiNumbers);

        console.log(`   Últimos 3 IDs: ${aiSavings.slice(0, 3).map(s => s.externalId).join(', ')}`);
        console.log(`   Último ID_VM: AI${maxAI}`);
        console.log(`   ✅ Esperamos que el próximo sea: AI${maxAI + 1}\n`);

        // 2. Obtener un cliente para la prueba
        const clientsRes = await axios.get(`${BASE_URL}/clients`);
        const client = clientsRes.data[0];

        if (!client) {
            console.log('❌ No hay clientes en la base de datos');
            return;
        }

        console.log(`👤 PASO 2: Cliente de prueba: ${client.name} (ID: ${client.id})\n`);

        // 3. Crear nuevo registro
        console.log('💾 PASO 3: Creando nuevo registro...');
        const newSaving = {
            clientId: client.id,
            amount: 50000,
            date: '2026-02-08',  // Día 8 - sin penalización
            type: 'Mensual',
            penalizacion: 1000,
            status: 'Abono',
            banco: 'Bancolombia',
            numeroTransaccion: 'TEST_IDVM',
            origen: 'Prueba Consecutivo',
            year: 2026,
            month: 'Febrero',
            monthInt: 2,
            mesAbonado: 'Febrero',
            anioAbonado: 2026,
            itemQuantity: 1
        };

        const createRes = await axios.post(`${BASE_URL}/savings`, newSaving);
        const savedRecord = createRes.data;

        console.log(`   ID_VM generado: ${savedRecord.externalId}`);
        console.log(`   Fecha: ${savedRecord.date}`);
        console.log(`   Monto: $${parseFloat(savedRecord.amount).toLocaleString('es-CO')}`);
        console.log(`   Días Penalizados: ${savedRecord.diasPenalizacion}`);
        console.log(`   Valor Ahorrado: $${parseFloat(savedRecord.valorAhorrado).toLocaleString('es-CO')}\n`);

        // 4. Verificar
        const expectedId = `AI${maxAI + 1}`;
        if (savedRecord.externalId === expectedId) {
            console.log('✅ PRUEBA EXITOSA!');
            console.log(`   ID_VM correcto: ${savedRecord.externalId} (esperado: ${expectedId})`);
            console.log(`   El consecutivo AI## funciona correctamente\n`);
            return true;
        } else {
            console.log('❌ PRUEBA FALLIDA!');
            console.log(`   ID_VM generado: ${savedRecord.externalId}`);
            console.log(`   ID_VM esperado: ${expectedId}\n`);
            return false;
        }

    } catch (error) {
        console.log('❌ ERROR EN PRUEBA:');
        console.log(`   ${error.message}`);
        if (error.response) {
            console.log(`   Detalle: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        return false;
    }
}

async function cleanupTest() {
    console.log('🧹 Limpiando registro de prueba...');
    try {
        const savingsRes = await axios.get(`${BASE_URL}/savings`);
        const testRecord = savingsRes.data.find(s => s.numeroTransaccion === 'TEST_IDVM');

        if (testRecord) {
            await axios.delete(`${BASE_URL}/savings/${testRecord.id}`);
            console.log(`   ✅ Registro de prueba eliminado (ID_VM: ${testRecord.externalId})\n`);
        }
    } catch (error) {
        console.log(`   ⚠️ No se pudo limpiar: ${error.message}\n`);
    }
}

async function run() {
    const success = await testIDGeneration();
    await cleanupTest();

    console.log('═══════════════════════════════════════════════════');
    console.log(success ? '🎉 TODAS LAS PRUEBAS PASARON' : '⚠️ ALGUNAS PRUEBAS FALLARON');
    console.log('═══════════════════════════════════════════════════\n');

    process.exit(success ? 0 : 1);
}

run();
