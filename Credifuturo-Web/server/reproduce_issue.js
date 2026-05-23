const axios = require('axios');

const API_URL = 'http://localhost:3000/api/admin/clients';

(async () => {
    console.log('--- REPRODUCTION SCRIPT ---');

    // 1. Try to list clients
    try {
        console.log('\n[GET] Fetching clients...');
        const res = await axios.get(API_URL);
        console.log(`Status: ${res.status}`);
        console.log(`Data Type: ${typeof res.data}`);
        console.log(`Is Array: ${Array.isArray(res.data)}`);
        console.log(`Count: ${Array.isArray(res.data) ? res.data.length : 'N/A'}`);
        if (Array.isArray(res.data) && res.data.length > 0) {
            console.log('Sample Client:', JSON.stringify(res.data[0], null, 2));
        }
    } catch (error) {
        console.error('[GET] Failed:', error.message);
    }

    // 2. Try to create a client (simulating frontend payload)
    const randomId = Math.floor(Math.random() * 100000);
    const payload = {
        // Simulating the state from ClientsPage.jsx
        id: '',
        customerId: '', // Frontend sends empty string initially
        cedula: `REP-${randomId}`,
        name: 'Reproduction',
        surname1: 'User',
        surname2: '',
        email: '', // Frontend sends empty string if not filled
        password: '123',
        genero: 'M',
        pais: 'Colombia',
        ciudad: '',
        tipoCliente: 'Final',
        socioFundador: 'SI',
        referido: '',
        cargo: '',
        fechaIngreso: new Date().toISOString().split('T')[0],
        fechaBaja: '',
        estatus: 'Activo'
    };

    try {
        console.log('\n[POST] Creating client...');
        console.log('Payload:', JSON.stringify(payload, null, 2));
        const res = await axios.post(API_URL, payload);
        console.log(`[POST] Success! Status: ${res.status}`);
        console.log('Response:', res.data);
    } catch (error) {
        console.error('[POST] Failed!');
        console.error('Status:', error.response ? error.response.status : 'Unknown');
        console.error('Error Data:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
})();
