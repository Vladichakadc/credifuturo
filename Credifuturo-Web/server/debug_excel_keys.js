const XLSX = require('xlsx');
const path = require('path');
const DataImportService = require('./services/DataImportService');

(async () => {
    const filePath = 'C:\\Credifuturo\\1-orders_table_ahorro_mensual.xlsx';
    console.log(`Reading ${filePath}`);
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length > 0) {
        const row = data[0];
        const normalized = DataImportService.normalizeRow(row);
        console.log('--- Original Keys ---');
        console.log(Object.keys(row));
        console.log('--- Normalized Keys ---');
        console.log(Object.keys(normalized));
        console.log('--- Sample Values ---');
        console.log('id_ahorro:', normalized['id_ahorro']);
        console.log('id ahorro:', normalized['id ahorro']);
    } else {
        console.log('No data found');
    }
})();
