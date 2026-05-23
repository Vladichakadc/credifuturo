const axios = require('axios');

const API_URL = 'http://localhost:3000/api/admin/sync-init';

(async () => {
    console.log('--- TESTING SYNC ENDPOINT ---');
    try {
        const res = await axios.post(API_URL);
        console.log('✅ Sync Response Status:', res.status);
        console.log('✅ Sync Response Data:', JSON.stringify(res.data, null, 2));
    } catch (error) {
        console.error('❌ Sync Failed:', error.message);
        if (error.response) console.error('Response:', error.response.data);
    }
})();
