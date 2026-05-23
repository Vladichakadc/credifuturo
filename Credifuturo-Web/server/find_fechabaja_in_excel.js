const XLSX = require('xlsx');
const filePath = 'C:/Credifuturo/Tabla_Clientes.xlsx';
const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const header = rows[0];
console.log('Searching for Fecha de baja values...');
let foundCount = 0;
for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[14] !== undefined && row[14] !== null && row[14] !== '') {
        console.log(`Row ${i + 1} (ID=${row[0]}): Fecha de baja = ${row[14]}`);
        foundCount++;
    }
}
console.log(`Total rows with Fecha de baja: ${foundCount}`);
