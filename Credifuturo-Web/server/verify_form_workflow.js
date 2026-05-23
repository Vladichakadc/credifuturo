const axios = require('axios');

const API_URL = 'http://localhost:3000/api/admin/clients';
const TEST_CEDULA = 'FORM_TEST_123';

(async () => {
    console.log('--- VERIFYING FORM-ONLY WORKFLOW ---');

    try {
        // 1. CLEANUP (Delete if exists)
        try {
            const check = await axios.get(`${API_URL}/cedula/${TEST_CEDULA}`);
            if (check.data) {
                console.log('Existing test user found. Deleting...');
                await axios.delete(`${API_URL}/${check.data.id}`);
            }
        } catch (ignored) { }

        // 2. CREATE (POST)
        console.log('\n[TEST 1] Creating New Socio...');
        const newSocio = {
            cedula: TEST_CEDULA,
            name: 'Form',
            surname1: 'Test',
            fechaIngreso: '2025-01-01',
            estatus: 'Activo'
        };
        const createRes = await axios.post(API_URL, newSocio);
        console.log(`✅ Created. ID: ${createRes.data.id}`);

        // 3. SEARCH (GET BY CEDULA)
        console.log('\n[TEST 2] Searching by Cedula (Load for Edit)...');
        const searchRes = await axios.get(`${API_URL}/cedula/${TEST_CEDULA}`);
        if (searchRes.data.cedula === TEST_CEDULA) {
            console.log('✅ Search Success: Found correct socio.');
        } else {
            console.error('❌ Search Failed: Data mismatch.');
        }

        // 4. UPDATE (PUT)
        console.log('\n[TEST 3] Updating Socio...');
        const updateData = { ...searchRes.data, name: 'Form Updated' };
        await axios.put(`${API_URL}/${updateData.id}`, updateData);
        // Verify update
        const verifyUpdate = await axios.get(`${API_URL}/cedula/${TEST_CEDULA}`);
        if (verifyUpdate.data.name === 'Form Updated') {
            console.log('✅ Update Success: Name changed.');
        } else {
            console.error('❌ Update Failed.');
        }

        // 5. DELETE (DELETE)
        console.log('\n[TEST 4] Deleting Socio...');
        await axios.delete(`${API_URL}/${updateData.id}`);

        // Verify deletion
        try {
            await axios.get(`${API_URL}/cedula/${TEST_CEDULA}`);
            console.error('❌ Delete Failed: Socio still exists.');
        } catch (err) {
            if (err.response && err.response.status === 404) {
                console.log('✅ Delete Success: Socio not found (404) as expected.');
            } else {
                console.error('❌ Delete Verification Error:', err.message);
            }
        }

    } catch (error) {
        console.error('❌ Workflow Test Failed:', error.message);
        if (error.response) console.error('Response:', error.response.data);
    }
})();
