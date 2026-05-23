const axios = require('axios');

async function testPayments() {
    console.log('🧪 Iniciando prueba de módulo PAYMENTS (Estado Préstamos)...\n');
    const API_URL = 'http://localhost:3000/api/admin/payments';
    const CLIENTS_URL = 'http://localhost:3000/api/admin/clients';

    try {
        // 1. Obtener un cliente existente
        console.log('1. Buscando cliente para prueba...');
        const clientsRes = await axios.get(CLIENTS_URL);
        if (clientsRes.data.length === 0) {
            console.error('❌ No hay clientes para probar relationship.');
            return;
        }
        const testClient = clientsRes.data[0];
        console.log(`✅ Cliente encontrado: ID ${testClient.id} - ${testClient.name}`);

        // 2. Crear un Payment (POST)
        console.log('\n2. Creando pago de prueba (POST)...');
        const newPayment = {
            clientId: testClient.id,
            saldoInicial: 5000000,
            cuotasPrestamo: 12,
            interesMensual: 0.015,
            fechaPagoMax: '2026-03-30',
            valorCuotaPago: 450000,
            estado: 'Pago',
            idVm: 'SOL-TEST-1'
        };

        const createRes = await axios.post(API_URL, newPayment);
        const createdId = createRes.data.id;
        const createdExternalId = createRes.data.externalId;

        console.log(`✅ Pago creado exitosamente. ID: ${createdId}, ExternalID: ${createdExternalId}`);
        console.log(`   - Intereses Amortizados (Auto): ${createRes.data.valorInteresesAmortizados}`);

        // 3. Listar Payments (GET)
        console.log('\n3. Listando pagos (GET)...');
        const listRes = await axios.get(API_URL);
        const found = listRes.data.find(p => p.id === createdId);

        if (found) {
            console.log(`✅ Pago encontrado en lista. Estado: ${found.estado}`);
        } else {
            console.error('❌ El pago creado no aparece en el listado.');
        }

        // 4. Modificar Payment (PUT)
        console.log('\n4. Modificando pago (PUT)...');
        const updateData = { estado: 'Mora', observaciones: 'Pago tardío detectado' };
        await axios.put(`${API_URL}/${createdId}`, updateData);

        // Verificar cambio
        const verifyRes = await axios.get(API_URL);
        const updated = verifyRes.data.find(p => p.id === createdId);
        if (updated.estado === 'Mora') {
            console.log('✅ Pago actualizado correctamente a "Mora".');
        } else {
            console.error('❌ La actualización falló.');
        }

        // 5. Eliminar Payment (DELETE)
        console.log('\n5. Eliminando pago (DELETE)...');
        await axios.delete(`${API_URL}/${createdId}`);

        // Verificar eliminación
        const finalRes = await axios.get(API_URL);
        const deleted = finalRes.data.find(p => p.id === createdId);
        if (!deleted) {
            console.log('✅ Pago eliminado correctamente.');
        } else {
            console.error('❌ El pago sigue existiendo tras eliminar.');
        }

        console.log('\n✨ PRUEBAS BACKEND COMPLETADAS CON ÉXITO ✨');

    } catch (err) {
        console.error('❌ Error en prueba:', err.response?.data || err.message);
    }
}

testPayments();
