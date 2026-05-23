const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const files = [
    'C:/Credifuturo/Tabla_Clientes.xlsx',
    'C:/Credifuturo/1-orders_table_ahorro_mensual.xlsx',
    'C:/Credifuturo/1-orders_table_aportes_iniciales.xlsx',
    'C:/Credifuturo/1-orders_table_prestamos_desembolsados.xlsx',
    'C:/Credifuturo/1-orders_table_estado_prestamos.xlsx'
];

const results = {};

files.forEach(file => {
    try {
        if (fs.existsSync(file)) {
            const workbook = XLSX.readFile(file);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Get data as JSON (header is row 0)
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const headers = jsonData[0];

            // Get first row of actual data if available
            const sample = jsonData.length > 1 ? jsonData[1] : null;

            results[path.basename(file)] = {
                headers: headers,
                sample: sample
            };
        } else {
            results[path.basename(file)] = { error: 'File not found' };
        }
    } catch (err) {
        results[path.basename(file)] = { error: err.message };
    }
});

fs.writeFileSync('C:/Credifuturo/Credifuturo-Web/server/headers.json', JSON.stringify(results, null, 2));
console.log('Headers written to C:/Credifuturo/Credifuturo-Web/server/headers.json');
