const XLSX = require('xlsx');

// Leer archivo de clientes
const wb = XLSX.readFile('C:/Credifuturo/Tabla_Clientes.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws);

console.log('Muestra de primeros 3 registros:');
console.log(JSON.stringify(rows.slice(0, 3), null, 2));

console.log('\n=== ESTADOS únicos en datos ===');
const estados = new Set();
rows.forEach(row => {
    if (row['Estado']) estados.add(row['Estado']);
});
console.log(Array.from(estados));
