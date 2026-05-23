const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', '1-orders_table_estado_prestamos.xlsx');
console.log('Inspeccionando:', filePath);

try {
    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];

    // Leer headers (fila 1)
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (jsonData.length > 0) {
        console.log('HEADERS ORIGINALES:', jsonData[0]);
    }

    // Leer primera fila de datos (fila 2)
    if (jsonData.length > 1) {
        console.log('PRIMERA FILA DE DATOS:', jsonData[1]);
    }

    // Leer como objetos
    const dataObjects = XLSX.utils.sheet_to_json(sheet);
    if (dataObjects.length > 0) {
        console.log('PRIMER OBJETO (keys):', Object.keys(dataObjects[0]));
        console.log('PRIMER OBJETO (values):', dataObjects[0]);
    } else {
        console.log('El archivo parece no tener datos.');
    }

} catch (err) {
    console.error('Error leyendo Excel:', err.message);
}
