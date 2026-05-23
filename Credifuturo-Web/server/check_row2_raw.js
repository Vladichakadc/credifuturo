const XLSX = require('xlsx');
const filePath = 'C:/Credifuturo/Tabla_Clientes.xlsx';
const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

if (rows.length > 1) {
    console.log('Header:');
    console.log(rows[0]);
    console.log('\nRow 2 (Data):');
    console.log(rows[1]);
} else {
    console.log('Not enough rows');
}
