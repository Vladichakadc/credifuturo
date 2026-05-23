const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const files = [
    { name: 'Mensual', path: 'C:/Credifuturo/1-orders_table_ahorro_mensual.xlsx' },
    { name: 'Aporte Inicial', path: 'C:/Credifuturo/1-orders_table_aportes_iniciales.xlsx' }
];

files.forEach(f => {
    if (!fs.existsSync(f.path)) {
        console.error('Archivo no encontrado:', f.path);
        return;
    }

    const wb = XLSX.readFile(f.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    function normalizeRow(row) {
        const normalized = {};
        for (const key in row) {
            const cleanKey = key.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            normalized[cleanKey] = row[key];
        }
        return normalized;
    }

    console.log(`\n=== ANALIZANDO: ${f.name} ===`);
    if (data.length > 0) {
        console.log('--- ENCABEZADOS DETECTADOS (Original) ---');
        console.log(Object.keys(data[0]));

        console.log('\n--- LLAVES NORMALIZADAS ---');
        const normalized = normalizeRow(data[0]);
        console.log(Object.keys(normalized));

        console.log('\n--- MUESTRA DE DATOS NORMALIZADOS ---');
        console.log(JSON.stringify(normalized, null, 2));
    } else {
        console.log('El archivo está vacío.');
    }
});
