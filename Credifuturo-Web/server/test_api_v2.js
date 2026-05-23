const axios = require('axios');

async function testApi() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/savings/list');
        const savings = res.data.data;
        
        const am345 = savings.find(s => s.externalId === 'AM345');
        if (am345) {
            console.log('AM345 Normalized:');
            const clean = { ...am345 };
            delete clean.debugInfo; // Remove noise
            console.log(JSON.stringify(clean, null, 2));
            
            console.log('Debug Info for AM345:');
            console.log('  hasSoporteInRaw:', am345.debugInfo.hasSoporteInRaw);
            console.log('  soporte:', am345.soporte);
        } else {
            console.log('AM345 not found');
        }

    } catch (err) {
        console.error('API Test Error:', err.message);
    }
}

testApi();
