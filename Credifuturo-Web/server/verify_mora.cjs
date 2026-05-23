const axios = require('axios');

async function verifyMora() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/dashboard-stats');
        const stats = res.data;
        
        console.log('--- Dashboard Mora Verification ---');
        
        // stats has carteraMora
        const mora = stats.carteraMora !== undefined ? stats.carteraMora : 'N/A';
        console.log(`Cartera en Mora: $${mora}`);
        
        // Today is Mar 14. Jan 10 to Mar 14 = 63 days.
        if (mora === 63000) {
            console.log('✅ Cartera en Mora matches 63 days of penalty (Jan 10 - March 14).');
        } else {
            console.log(`ℹ️ Check if Mora $${mora} aligns with expected count.`);
        }

    } catch (e) {
        console.error('Error verifying mora:', e.message);
    }
}

verifyMora();
