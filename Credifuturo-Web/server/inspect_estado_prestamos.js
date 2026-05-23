// Inspeccionar el Excel 1-orders_table_estado_prestamos para extraer columnas
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Buscar el archivo
const dataDir = path.join(__dirname, '..', '..');
const files = fs.readdirSync(dataDir).filter(f => f.includes('estado_prestamos') && f.endsWith('.xlsx'));
console.log('📂 Archivos encontrados:', files);

const filePath = path.join(dataDir, files[0]);
console.log('📄 Leyendo:', filePath);

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

console.log('\n📋 Hoja:', sheetName);

// Obtener rango
const range = XLSX.utils.decode_range(sheet['!ref']);
console.log(`📊 Rango: ${sheet['!ref']} (${range.e.r + 1} filas x ${range.e.c + 1} columnas)\n`);

// Extraer headers (fila 1)
console.log('═══════════════════════════════════════');
console.log('   COLUMNAS DEL EXCEL (orden exacto)');
console.log('═══════════════════════════════════════');

const headers = [];
for (let c = range.s.c; c <= range.e.c; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    const cell = sheet[cellRef];
    const headerName = cell ? cell.v : `Columna_${c + 1}`;
    headers.push(headerName);
    console.log(`  ${c + 1}. "${headerName}" (tipo celda: ${cell ? cell.t : 'vacía'})`);
}

// Extraer primeras 3 filas de datos para analizar tipos
console.log('\n═══════════════════════════════════════');
console.log('   MUESTRA DE DATOS (primeras 3 filas)');
console.log('═══════════════════════════════════════');

const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
for (let r = 1; r <= Math.min(3, data.length - 1); r++) {
    console.log(`\n--- Fila ${r} ---`);
    data[r].forEach((val, i) => {
        const tipo = typeof val;
        const header = headers[i] || `Col${i}`;
        console.log(`  ${header}: ${val} (${tipo})`);
    });
}

// Análisis de tipos
console.log('\n═══════════════════════════════════════');
console.log('   ANÁLISIS DE TIPOS POR COLUMNA');
console.log('═══════════════════════════════════════');

headers.forEach((h, i) => {
    const values = data.slice(1, 10).map(row => row[i]).filter(v => v !== undefined && v !== null && v !== '');
    const types = [...new Set(values.map(v => typeof v))];
    const sample = values.slice(0, 2).join(', ');
    console.log(`  ${i + 1}. "${h}" | Tipos: ${types.join('/')} | Muestra: ${sample}`);
});

console.log('\n✅ Total columnas:', headers.length);
