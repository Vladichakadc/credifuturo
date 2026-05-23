const axios = require('axios');

async function testApi() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/savings/list');
        const savings = res.data.data;
        
        const am345 = savings.find(s => s.externalId === 'AM345');
        if (am345) {
            console.log('AM345 Record:');
            console.log(JSON.stringify(am345, null, 2));
        } else {
            console.log('AM345 not found in API response');
            console.log('Available externalIds:', savings.slice(0, 10).map(s => s.externalId));
        }

    } catch (err) {
        console.error('API Test Error:', err.message);
    }
}

testApi();
