const XLSX = require('xlsx');
const path = require('path');

const filePath = 'C:/Credifuturo/1-orders_table_estado_prestamos.xlsx';
const wb = XLSX.readFile(filePath);
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

const p69 = data.find(row => {
    const epId = row['Id_EP'] || row['id_ep'] || row['ID_EP'];
    return epId && epId.toString() === 'P69';
});

console.log(JSON.stringify(p69, null, 2));
