const XLSX = require('xlsx');
try {
    const workbook = XLSX.readFile('C:/Credifuturo/1-orders_table_prestamos_desembolsados.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const args = process.argv.slice(2);
    
    // Get headers
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (json.length > 0) {
        console.log('HEADERS:', JSON.stringify(json[0]));
        if (json.length > 1) console.log('SAMPLE:', JSON.stringify(json[1]));
    } else {
        console.log('EMPTY SHEET');
    }
} catch (err) {
    console.error(err);
}
