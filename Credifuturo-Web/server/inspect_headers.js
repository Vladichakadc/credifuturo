const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const dataDir = 'C:/Credifuturo';
const filePath = path.join(dataDir, '1-orders_table_aportes_iniciales.xlsx');

function normalizeRow(row) {
    const normalized = {};
    for (const key in row) {
        // Replace non-breaking spaces and trim
        const cleanKey = key.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        normalized[cleanKey] = row[key];
    }
    return normalized;
}

if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

if (rows.length > 0) {
    console.log('Original keys:', Object.keys(rows[0]));
    console.log('Normalized keys:', Object.keys(normalizeRow(rows[0])));
} else {
    console.log('File is empty');
}
