const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

try {
    const workbook = XLSX.readFile('C:/Credifuturo/1-orders_table_prestamos_desembolsados.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Get headers
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const output = {
        headers: json.length > 0 ? json[0] : [],
        sample: json.length > 1 ? json[1] : []
    };
    
    fs.writeFileSync('G:/Mi unidad/Credifuturo/disbursed_headers.json', JSON.stringify(output, null, 2));
    console.log('Done.');

} catch (err) {
    console.error(err);
}
