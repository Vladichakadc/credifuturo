const DataImportService = require('./services/DataImportService');
const LoanPayment = require('./models/LoanPayment');
const path = require('path');

async function testImport() {
    try {
        console.log('--- Iniciando Test de Importación de Pagos ---');
        const dataDir = path.join(__dirname, '..');
        const excelPath = path.join(dataDir, '1-orders_table_estado_prestamos.xlsx');

        console.log(`Leyendo archivo: ${excelPath}`);

        // Ejecutar importación real
        const result = await DataImportService.importPayments(excelPath);

        console.log('\n--- Resultado Importación ---');
        console.log(JSON.stringify(result, null, 2));

        // Verificar DB
        const count = await LoanPayment.count();
        console.log(`\nTotal registros en DB tras import: ${count}`);

        // Buscar registros sospechosos (nulls o duplicados de lógica)
        const badRecords = await LoanPayment.findAll({
            where: {
                externalId: null
            }
        });

        if (badRecords.length > 0) {
            console.error(`\n¡¡ALERTA!! Encontrados ${badRecords.length} registros SIN ID Externo (Corruptos):`);
            console.log(badRecords[0].dataValues);
        } else {
            console.log('No se encontraron registros nulos críticos (externalId).');
        }

    } catch (err) {
        console.error('\nERROR FATAL EN SCRIPT:', err);
    }
}

testImport();
