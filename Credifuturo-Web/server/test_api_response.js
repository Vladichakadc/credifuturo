const axios = require('axios');

async function testApi() {
    try {
        const response = await axios.get('http://localhost:3000/api/admin/payments');
        if (response.data.length > 0) {
            console.log('API RESPONSE LENGTH:', response.data.length);
            console.log('FIRST ITEM:', JSON.stringify(response.data[0], null, 2));

            // Check item > 50 (imported)
            if (response.data.length > 50) {
                console.log('IMPORTED ITEM (Index 50):', JSON.stringify(response.data[50], null, 2));
            }
        } else {
            console.log('API RETURNED EMPTY ARRAY');
        }
    } catch (err) {
        console.error('API ERROR:', err.message);
        if (err.response && err.response.data) {
            console.error('Stack:', JSON.stringify(err.response.data, null, 2));
        }
    }
}

testApi();
