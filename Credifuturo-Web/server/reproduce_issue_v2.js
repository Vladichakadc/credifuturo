const axios = require('axios');

const API_URL = 'http://localhost:3000/api/admin/clients';

(async () => {
    console.log('--- REPRODUCTION SCRIPT V2 ---');

    // 1. LIST CLIENTS (Full Log)
    try {
        console.log('\n[GET] Fetching clients...');
        const res = await axios.get(API_URL);
        console.log(`Status: ${res.status}`);
        console.log(`Count: ${Array.isArray(res.data) ? res.data.length : 'Not Array'}`);
        if (Array.isArray(res.data) && res.data.length > 0) {
            console.log('Sample Record [0]:', JSON.stringify(res.data[0], null, 2));
        } else {
            console.log('Response Body:', JSON.stringify(res.data, null, 2));
        }
    } catch (error) {
        console.error('[GET] Failed:', error.message);
    }

    // 2. CREATE CLIENT (Duplicate Cedula Test)
    // First create a base one
    const randomId = Math.floor(Math.random() * 100000);
    const payload = {
        cedula: `DUP-${randomId}`,
        name: 'Duplicate',
        surname1: 'Test',
        email: '',
        password: '123',
        estatus: 'Activo'
    };

    try {
        console.log('\n[POST] Creating Base Client...');
        await axios.post(API_URL, payload);
        console.log('✅ Base Client Created.');

        console.log('[POST] Attempting Duplicate Cedula...');
        await axios.post(API_URL, payload); // Should fail
        console.log('❌ Duplicate Created! (Should have failed)');
    } catch (error) {
        if (error.response) {
            console.log('✅ Expected Error Captured:');
            console.log('Status:', error.response.status);
            console.log('Body:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('❌ Network Error:', error.message);
        }
    }

    // 3. CREATE CLIENT (Invalid Date Test)
    const invalidDatePayload = {
        cedula: `DATE-${randomId}`,
        name: 'Date',
        surname1: 'Test',
        fechaIngreso: '19/02/2026', // DD/MM/YYYY format (Backend expects YYYY-MM-DD or Date object)
        email: '',
        password: '123',
        estatus: 'Activo'
    };

    try {
        console.log('\n[POST] Attempting Invalid Date Format...');
        await axios.post(API_URL, invalidDatePayload);
        console.log('✅ Invalid Date Client Created (Backend might have handled it or stored it wrong).');
    } catch (error) {
        if (error.response) {
            console.log('✅ Date Error Captured:');
            console.log('Status:', error.response.status);
            console.log('Body:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('❌ Network Error:', error.message);
        }
    }

})();
