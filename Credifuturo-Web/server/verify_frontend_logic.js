const axios = require('axios');

const API_URL = 'http://localhost:3000/api/admin/clients';

(async () => {
    console.log('--- VERIFYING FRONTEND DATA MAPPING ---');

    try {
        console.log(`[GET] Requesting ${API_URL}...`);
        const res = await axios.get(API_URL);

        console.log(`Status: ${res.status}`);

        if (!Array.isArray(res.data)) {
            console.error('❌ ERROR: API did not return an array!');
            console.error('Received Type:', typeof res.data);
            return;
        }

        console.log(`✅ Success: Received Array with ${res.data.length} records.`);

        if (res.data.length > 0) {
            const sample = res.data[0];
            console.log('\n--- SAMPLE RECORD ---');
            console.log(JSON.stringify(sample, null, 2));

            console.log('\n--- CHECKING REQUIRED COLUMNS FOR DATATABLE ---');
            const requiredKeys = ['customerId', 'cedula', 'name', 'ciudad', 'estatus', 'fechaIngreso'];
            const missing = requiredKeys.filter(key => sample[key] === undefined);

            if (missing.length === 0) {
                console.log('✅ All required columns are present.');
            } else {
                console.error('❌ MISSING COLUMNS:', missing.join(', '));
            }
        } else {
            console.warn('⚠️ List is empty. Cannot verify columns.');
        }

    } catch (error) {
        console.error('❌ Request Failed:', error.message);
    }
})();
