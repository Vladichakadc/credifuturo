const axios = require('axios');

async function verifyStats() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/dashboard-stats');
        const stats = res.data;
        
        console.log('--- Dashboard Stats Verification ---');
        console.log(`Total Socios:      ${stats.clientsCount}`);
        console.log(`Capital Ahorrado:  $${stats.totalSavings.toLocaleString('es-CO')}`);
        console.log(`Total Ahorrado:    $${stats.totalAhorradoGeneral.toLocaleString('es-CO')}`);
        
        const expectedCapital = 20952314;
        const expectedTotal = 33452314;
        
        if (stats.totalSavings === expectedCapital) {
            console.log('✅ Capital Ahorrado matches "Abonos Mensuales" of active clients.');
        } else {
            console.log(`❌ DISCREPANCY in Capital Ahorrado: Expected ${expectedCapital}, got ${stats.totalSavings}`);
        }
        
        if (stats.totalAhorradoGeneral === expectedTotal) {
            console.log('✅ Total Ahorrado matches expected "Abonos + Aportes" of active clients.');
        } else {
            console.log(`❌ DISCREPANCY in Total Ahorrado: Expected ${expectedTotal}, got ${stats.totalAhorradoGeneral}`);
        }

    } catch (e) {
        console.error('Error verifying stats:', e.message);
    }
}

verifyStats();
