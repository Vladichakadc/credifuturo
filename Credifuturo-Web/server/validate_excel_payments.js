const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const EXCEL_PATH = path.join(__dirname, '..', '..', '1-orders_table_estado_prestamos.xlsx');

console.log('--- Validando Excel Estado Préstamos ---');
console.log(`Ruta esperada: ${EXCEL_PATH}`);

if (!fs.existsSync(EXCEL_PATH)) {
    console.error('ERROR CRÍTICO: El archivo Excel NO existe en la ruta especificada.');
    process.exit(1);
}

try {
    const workbook = xlsx.readFile(EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log(`Hoja leída: ${sheetName}`);
    console.log(`Total filas encontradas: ${data.length}`);

    if (data.length > 0) {
        console.log('Encabezados detectados:', Object.keys(data[0]));
        console.log('\nPrimer registro:');
        console.log(JSON.stringify(data[0], null, 2));

        // Validar columnas clave que usa el backend
        const requiredCols = ['Id_EP', 'Customer_id', 'Nombre', 'Apellido', 'Mes Desembolso ', 'Saldo Inicial', 'Estado '];
        const missing = requiredCols.filter(col => !Object.keys(data[0]).includes(col));

        if (missing.length > 0) {
            console.error('\nADVERTENCIA: Faltan columnas esperadas:', missing);
            console.error('Esto causará fallos al importar si el backend depende de ellas.');
        } else {
            console.log('\nColumnas requeridas presentes: OK');
        }
    } else {
        console.warn('ADVERTENCIA: El archivo Excel está vacío o no tiene datos válidos.');
    }

} catch (err) {
    console.error('ERROR AL LEER EXCEL:', err.message);
}
