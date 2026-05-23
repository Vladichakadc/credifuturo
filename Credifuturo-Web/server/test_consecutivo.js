// Script de prueba para verificar la generación de consecutivo SOL{N}
const axios = require('axios');

async function probarConsecutivo() {
    console.log('🧪 PRUEBA DE CONSECUTIVO SOL{N}\n');

    try {
        // 1. Consultar estado actual
        console.log('1. 📊 Consultando préstamos existentes...');
        const { data: loans } = await axios.get('http://localhost:3000/api/admin/disbursed-loans');

        const solPattern = /^SOL(\d+)$/;
        const validIds = loans
            .map(l => l.idVm || l.orderId)
            .filter(id => id && solPattern.test(id))
            .map(id => parseInt(id.match(solPattern)[1]));

        const maxId = validIds.length > 0 ? Math.max(...validIds) : 0;
        console.log(`   ✅ Máximo ID actual: SOL${maxId}`);
        console.log(`   📌 Esperamos que el siguiente sea: SOL${maxId + 1}\n`);

        // 2. Crear nueva solicitud de préstamo
        console.log('2. ➕ Creando nueva solicitud de préstamo...');

        // Consultar un clientId válido primero
        const { data: clients } = await axios.get('http://localhost:3000/api/admin/clients');
        if (clients.length === 0) {
            console.log('   ❌ No hay clientes en la base de datos');
            return;
        }

        const testClient = clients[0];
        console.log(`   📝 Usando cliente: ${testClient.name} (ID: ${testClient.id})`);

        const newLoan = {
            clientId: testClient.id,
            fechaPrestamo: '2026-02-17',
            estado: 'Pendiente',
            valorPrestado: 1000000,
            cuotas: 12,
            interesMensual: 0.015, // 1.5%
            diasPagoMax: 30,
            itemQuantity: 1,
            banco: 'Banco Prueba',
            numeroTransaccion: 'TEST001',
            cuentaAhorros: '123456',
            observaciones: '🧪 PRÉSTAMO DE PRUEBA - Verificación de consecutivo'
        };

        const { data: createdLoan } = await axios.post(
            'http://localhost:3000/api/admin/disbursed-loans',
            newLoan
        );

        console.log('   ✅ Préstamo creado exitosamente\n');

        // 3. Verificar el ID generado
        console.log('3. ✔️  RESULTADO DE LA PRUEBA:');
        console.log(`   ID generado por el backend: ${createdLoan.idVm}`);
        console.log(`   ID esperado: SOL${maxId + 1}\n`);

        if (createdLoan.idVm === `SOL${maxId + 1}`) {
            console.log('🎉  ✅ ¡PRUEBA EXITOSA! El consecutivo funciona correctamente');
            console.log(`   ${createdLoan.idVm} === SOL${maxId + 1} ✓\n`);
        } else {
            console.log('⚠️   ❌ ERROR: El consecutivo NO es correcto');
            console.log(`   Esperado: SOL${maxId + 1}`);
            console.log(`   Recibido: ${createdLoan.idVm}\n`);
        }

        // 4. Mostrar datos del préstamo creado
        console.log('4. 📄 Datos del préstamo creado:');
        console.log(`   ID_VM: ${createdLoan.idVm}`);
        console.log(`   Cliente: ${createdLoan.socio}`);
        console.log(`   Valor: $${parseFloat(createdLoan.valorPrestado).toLocaleString('es-CO')}`);
        console.log(`   Cuotas: ${createdLoan.cuotas}`);
        console.log(`   Mes: ${createdLoan.mesDesembolso}`);
        console.log(`   Año: ${createdLoan.anioDesembolso}\n`);

        // 5. Prueba de eliminación y recalculo
        console.log('5. 🗑️  Probando eliminación y recalculo...');
        console.log(`   Eliminando préstamo ${createdLoan.idVm}...`);

        await axios.delete(`http://localhost:3000/api/admin/disbursed-loans/${createdLoan.id}`);
        console.log('   ✅ Préstamo eliminado\n');

        // Consultar nuevamente para verificar
        const { data: loansAfterDelete } = await axios.get('http://localhost:3000/api/admin/disbursed-loans');
        const idsAfterDelete = loansAfterDelete
            .map(l => l.idVm || l.orderId)
            .filter(id => id && solPattern.test(id))
            .map(id => parseInt(id.match(solPattern)[1]));

        const maxAfterDelete = idsAfterDelete.length > 0 ? Math.max(...idsAfterDelete) : 0;
        console.log('6. 📊 Estado después de eliminar:');
        console.log(`   Máximo ID actual: SOL${maxAfterDelete}`);
        console.log(`   Próximo ID debería ser: SOL${maxAfterDelete + 1}`);

        if (maxAfterDelete === maxId) {
            console.log('   ✅ El consecutivo NO se reinició (correcto)\n');
        } else {
            console.log(`   ⚠️  El máximo cambió de SOL${maxId} a SOL${maxAfterDelete}\n`);
        }

        console.log('═══════════════════════════════════════');
        console.log('✅ PRUEBA COMPLETADA EXITOSAMENTE');
        console.log('═══════════════════════════════════════\n');

    } catch (error) {
        console.log('\n❌ ERROR EN LA PRUEBA:');
        console.error(error.response?.data || error.message);
        process.exit(1);
    }
}

probarConsecutivo();
