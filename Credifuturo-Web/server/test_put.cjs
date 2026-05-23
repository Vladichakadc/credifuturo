const axios = require('axios');
const api = axios.create({ baseURL: 'http://localhost:3000' });

async function test() {
    try {
        console.log('--- Testing PUT request ---');
        // Sending a dummy update to an existing record (e.g. id=513 which we know exists and has estado=Pago)
        const res = await api.put('/admin/payments/513', {
            estado: 'Pago',
            // provide minimum required fields just in case
            externalId: 'P75',
            clientId: 1, // dummy
            mesDesembolso: 'null',
        });

        console.log('✅ Request succeeded');
        console.log('Status:', res.status);
        console.log('Data typeof:', typeof res.data);
        console.log('Data keys:', Object.keys(res.data));
    } catch (err) {
        console.error('❌ Request failed:', err.message);
        if (err.response) {
            console.error('  Status:', err.response.status);
            console.error('  Data:', err.response.data);
        }
    }
}

test();
