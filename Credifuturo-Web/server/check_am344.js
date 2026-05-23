const axios = require('axios');

async function checkRecords() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/savings/list');
        const savings = res.data.data;
        
        const am343 = savings.find(s => s.externalId === 'AM343');
        const am344 = savings.find(s => s.externalId === 'AM344');

        if (am343) {
            console.log('--- AM343 ---');
            console.log(JSON.stringify(am343, null, 2));
        }
        
        if (am344) {
            console.log('--- AM344 ---');
            console.log(JSON.stringify(am344, null, 2));
        }

    } catch (err) {
        console.error('API Test Error:', err.message);
    }
}

checkRecords();
