const DataImportService = require('./services/DataImportService');
const path = require('path');
const fs = require('fs');

async function testImportRobustness() {
    console.log('--- Starting Robustness Test for Payments Import ---');
    // Path correction: Server runs in C:\Credifuturo\Credifuturo-Web\server
    // Excel is in C:\Credifuturo\1-orders_table_estado_prestamos.xlsx
    // So we need to go up TWO levels from __dirname (server) -> Credifuturo-Web -> Credifuturo
    const dataDir = path.join(__dirname, '..', '..');
    const excelPath = path.join(dataDir, '1-orders_table_estado_prestamos.xlsx');

    console.log(`Looking for Excel at: ${excelPath}`);

    if (!fs.existsSync(excelPath)) {
        console.error('CRITICAL: Excel file not found!');
        return;
    }

    try {
        console.log(`File found. Attempting import...`);
        // Simulate what the server does
        const result = await DataImportService.importPayments(excelPath);
        console.log('Import Finished. Result:', JSON.stringify(result, null, 2));

    } catch (err) {
        console.error('CRASH DETECTED IN IMPORT SERVICE:', err);
    }
}

testImportRobustness();
