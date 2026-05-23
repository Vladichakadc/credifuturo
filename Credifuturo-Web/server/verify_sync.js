const axios = require('axios');

const API_URL = 'http://localhost:3000/api/admin';

(async () => {
    console.log('--- Verifying Sync Endpoints ---');
    try {
        const start = Date.now();

        console.log('1. Fetching Clients...');
        const clients = await axios.get(`${API_URL}/clients`);
        console.log(`✅ Clients: ${clients.data.length} records`);

        console.log('2. Fetching Savings...');
        const savings = await axios.get(`${API_URL}/savings`);
        console.log(`✅ Savings: ${savings.data.length} records`);

        console.log('3. Fetching Loans...');
        const loans = await axios.get(`${API_URL}/loans`);
        console.log(`✅ Loans (Requests): ${loans.data.length} records`);

        console.log('4. Fetching Payments...');
        const payments = await axios.get(`${API_URL}/payments`);
        console.log(`✅ Payments: ${payments.data.length} records`);

        const duration = Date.now() - start;
        console.log(`--- Sync Verification Completed in ${duration}ms ---`);

        if (clients.data.length > 0 && savings.data.length > 0) {
            console.log('✅ Data consistency check passed (Non-empty tables)');
        } else {
            console.warn('⚠️ Warning: Some tables are empty. Is this expected?');
        }

    } catch (error) {
        console.error('❌ Sync Failed:', error.message);
        if (error.response) console.error(error.response.data);
    }
})();
