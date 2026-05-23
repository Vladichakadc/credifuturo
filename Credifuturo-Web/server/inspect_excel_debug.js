const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const dataDir = 'C:/Credifuturo';
const files = [
    'Tabla_Clientes.xlsx',
    '1-orders_table_ahorro_mensual.xlsx',
    '1-orders_table_aportes_iniciales.xlsx',
    '1-orders_table_prestamos_desembolsados.xlsx',
    '1-orders_table_estado_prestamos.xlsx'
];

files.forEach(file => {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`\n--- Inspecting: ${file} ---`);
        const wb = XLSX.readFile(filePath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        console.log('Total rows:', data.length);
        if (data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
            console.log('First row sample:', JSON.stringify(data[0], null, 2));
        }
    } else {
        console.log(`\n!!! File not found: ${file}`);
    }
});
