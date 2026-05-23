const axios = require('axios');

const API_URL = 'http://localhost:3000/api/admin/clients';

(async () => {
    console.log('--- Verifying Client Creation Fix ---');

    // Generate random cedula to avoid Unique constraint
    const randomId = Math.floor(Math.random() * 100000);

    const newClient = {
        cedula: `TEST-${randomId}`,
        name: 'Test',
        surname1: 'User',
        email: '', // EMPTY STRING - This previously caused the error
        password: '123',
        genero: 'M',
        estatus: 'Activo'
    };

    try {
        console.log('1. Sending Client with email="" ...');
        const res = await axios.post(API_URL, newClient);

        console.log('✅ Client created successfully!');
        console.log('Return Data:', {
            id: res.data.id,
            email: res.data.email // Should be null or empty
        });

        // Cleanup
        console.log('2. Cleaning up (Deleting test client)...');
        await axios.delete(`${API_URL}/${res.data.id}`);
        console.log('✅ Cleanup complete.');

    } catch (error) {
        console.error('❌ Creation Failed:', error.response ? error.response.data : error.message);
    }
})();
