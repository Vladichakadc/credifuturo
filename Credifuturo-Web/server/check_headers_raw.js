const XLSX = require('xlsx');
const filePath = 'C:/Credifuturo/Tabla_Clientes.xlsx';
const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

if (rows.length > 0) {
    console.log('Row 1 (Header candidates):');
    console.log(rows[0]);
} else {
    console.log('Sheet is empty');
}
