const axios = require('axios');

async function testEndpoints() {
    const endpoints = [
        'http://localhost:3000/api/admin/clients',
        'http://localhost:3000/api/admin/savings',
        'http://localhost:3000/api/admin/loans',
        'http://localhost:3000/api/admin/disbursed-loans',
        'http://localhost:3000/api/admin/payments'
    ];

    console.log('Testing Endpoints...');

    for (const url of endpoints) {
        try {
            console.log(`Fetching ${url}...`);
            const res = await axios.get(url, { timeout: 5000 });
            console.log(`✅ ${url}: Status ${res.status}, Type: ${typeof res.data}, IsArray: ${Array.isArray(res.data)}, Length: ${Array.isArray(res.data) ? res.data.length : 'N/A'}`);
        } catch (err) {
            console.error(`❌ ${url} FAILED:`, err.message);
            if (err.response) {
                console.error('   Status:', err.response.status);
                console.error('   Data:', JSON.stringify(err.response.data).substring(0, 200));
            }
        }
    }
}

testEndpoints();
