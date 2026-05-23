const XLSX = require('xlsx');

function normalizeRow(row) {
    const normalized = {};
    for (const key in row) {
        const cleanKey = key.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        normalized[cleanKey] = row[key];
    }
    return normalized;
}

function parseExcelDate(excelDate) {
    if (!excelDate) return null;
    if (typeof excelDate === 'number') {
        return new Date(Math.round((excelDate - 25569) * 864e5));
    }
    const d = new Date(excelDate);
    return isNaN(d.getTime()) ? null : d;
}

const filePath = 'C:/Credifuturo/Tabla_Clientes.xlsx';
const wb = XLSX.readFile(filePath);
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

console.log('Testing specific rows...');
data.forEach(rawRow => {
    const row = normalizeRow(rawRow);
    const id = row['customer_id'];
    if (id == 11 || id == 19) {
        console.log(`ID ${id}: raw['Fecha de baja'] = ${rawRow['Fecha de baja']}, normalized['fecha de baja'] = ${row['fecha de baja']}, parsed = ${parseExcelDate(row['fecha de baja'])}`);
    }
});
