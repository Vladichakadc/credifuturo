const axios = require('axios');
const { Client, Saving } = require('./models');
const { Op } = require('sequelize');

const API_URL = 'http://localhost:3000/api/admin';

(async () => {
    try {
        console.log('--- Verificando CRUD Completo ---');

        // 1. Crear Cliente
        const clientData = {
            cedula: 'TEST999',
            name: 'Test',
            surname1: 'User',
            email: 'test999@credifuturo.com',
            password: '123',
            customerId: '9999'
        };

        // Cleanup first
        await Client.destroy({ where: { cedula: 'TEST999' } });

        console.log('1. Creando Cliente...');
        const resClient = await axios.post(`${API_URL}/clients`, clientData);
        if (resClient.status !== 201) throw new Error('Falló creación cliente API');

        const dbClient = await Client.findOne({ where: { cedula: 'TEST999' } });
        if (!dbClient) throw new Error('Cliente no persistió en DB');
        console.log('✅ Cliente creado y persistido (ID: ' + dbClient.id + ')');

        // 2. Crear Ahorro
        const savingData = {
            clientId: dbClient.id,
            amount: 50000,
            date: '2026-02-18',
            type: 'Mensual',
            month: 'Febrero',
            year: 2026,
            idAhorro: 'LEGACY-001'
        };

        console.log('2. Creando Ahorro...');
        const resSaving = await axios.post(`${API_URL}/savings`, savingData);
        if (resSaving.status !== 201) throw new Error('Falló creación ahorro API');

        const savingId = resSaving.data.id;
        const dbSaving = await Saving.findByPk(savingId);
        if (!dbSaving) throw new Error('Ahorro no persistió en DB');
        if (dbSaving.idAhorro !== 'LEGACY-001') throw new Error('Campo idAhorro no se guardó');
        console.log(`✅ Ahorro creado y persistido (ID: ${savingId}, AM: ${dbSaving.externalId})`);

        // 3. Modificar Ahorro
        console.log('3. Modificando Ahorro...');
        const updateData = {
            ...savingData,
            amount: 60000,
            observaciones: 'Modificado'
        };
        const resUpdate = await axios.put(`${API_URL}/savings/${savingId}`, updateData);
        if (resUpdate.status !== 200) throw new Error('Falló actualización ahorro API');

        const dbSavingUpdated = await Saving.findByPk(savingId);
        if (parseFloat(dbSavingUpdated.amount) !== 60000) throw new Error('Monto no actualizado en DB');
        console.log('✅ Ahorro actualizado correctamente');

        // 4. Eliminar Ahorro
        console.log('4. Eliminando Ahorro...');
        const resDelete = await axios.delete(`${API_URL}/savings/${savingId}`);
        if (resDelete.status !== 200) throw new Error('Falló eliminación ahorro API');

        const dbSavingDeleted = await Saving.findByPk(savingId);
        if (dbSavingDeleted) throw new Error('Ahorro sigue existiendo en DB');
        console.log('✅ Ahorro eliminado correctamente');

        // Cleanup Client
        await dbClient.destroy();
        console.log('--- Verificación Exitosa ---');

    } catch (error) {
        console.error('❌ Error CRUD:', error.message);
        if (error.response) console.error('API Response:', error.response.data);
    }
})();
