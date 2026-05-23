const LoanPayment = require('./models/LoanPayment');
const sequelize = require('./config/database');
const ImportService = require('./services/DataImportService');
const path = require('path');

(async () => {
    try {
        console.log('--- Iniciando Importación de Pagos (Root Script Corrected) ---');

        // 1. Verificar conexión
        await sequelize.authenticate();
        console.log('✅ Conexión a DB exitosa.');

        // 2. Reporte Previo
        const prevCount = await LoanPayment.count();
        console.log(`📊 Cantidad previa de pagos: ${prevCount}`);

        // 3. Importar
        // Hardcoded path to ensure we hit the right file
        const excelPath = 'C:\\Credifuturo\\1-orders_table_estado_prestamos.xlsx';
        console.log(`📂 Leyendo archivo desde: ${excelPath}`);

        const result = await ImportService.importPayments(excelPath);

        console.log('--- Resultado Final ---');
        console.log(`✅ Importados/Procesados: ${result.imported}`);
        if (result.errors > 0) console.log(`⚠️ Errores/Saltados: ${result.errors}`);
        if (result.criticalError) console.error(`❌ Error Crítico: ${result.criticalError}`);

        const newCount = await LoanPayment.count();
        console.log(`📊 Cantidad final de pagos: ${newCount}`);


    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        // await sequelize.close(); // Sometimes keeping it open for a bit helps ensure logs flush, but strictly should close.
        process.exit(0);
    }
})();
