const axios = require('axios');

async function testApi() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/savings/list');
        const savings = res.data.data;
        
        const am345 = savings.find(s => s.externalId === 'AM345');
        if (am345) {
            console.log('AM345 Summary:');
            console.log(`  ID: ${am345.id}`);
            console.log(`  ExternalID: ${am345.externalId}`);
            console.log(`  Amount: ${am345.amount}`);
            console.log(`  Soporte: ${am345.soporte ? am345.soporte.name : 'MISSING'}`);
            console.log(`  Client: ${am345.clientName} ${am345.clientSurname}`);
        } else {
            console.log('AM345 not found');
        }

    } catch (err) {
        console.error('API Test Error:', err.message);
    }
}

testApi();
