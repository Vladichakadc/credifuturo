const XLSX = require('xlsx');
const path = require('path');

const filePath = 'C:/Credifuturo/Tabla_Clientes.xlsx';
const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('Detected Headers (raw):');
if (data.length > 0) {
    console.log(Object.keys(data[0]));
}

function normalizeKey(key) {
    return key.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

console.log('\nNormalized Headers:');
if (data.length > 0) {
    console.log(Object.keys(data[0]).map(normalizeKey));
}

console.log('\nSample Row Data (first 3 with fechaBaja check):');
data.slice(0, 3).forEach((row, i) => {
    const norm = {};
    for (const k in row) norm[normalizeKey(k)] = row[k];
    console.log(`Row ${i + 1}: ID=${norm['customer_id']}, Fecha de baja raw=${row['Fecha de baja'] || row['Fecha de baja ']}, Normalized=${norm['fecha de baja']}`);
});
