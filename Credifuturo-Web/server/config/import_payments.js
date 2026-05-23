const { LoanPayment, sequelize } = require('../models');
const ImportService = require('../services/DataImportService');
const path = require('path');

(async () => {
    try {
        console.log('--- Iniciando Importación de Pagos ---');

        // 1. Verificar conexión
        await sequelize.authenticate();
        console.log('✅ Conexión a DB exitosa.');

        // 2. Limpiar tabla (Opcional, para evitar duplicados si la lógica no es idéntica)
        // const deleted = await LoanPayment.destroy({ where: {}, truncate: false });
        // console.log(`🗑️ Eliminados ${deleted} registros previos.`);

        // 3. Importar
        const excelPath = path.join('C:', 'Credifuturo', '1-orders_table_estado_prestamos.xlsx');
        console.log(`📂 Leyendo archivo desde: ${excelPath}`);

        const result = await ImportService.importPayments(excelPath);

        console.log('--- Resultado Final ---');
        console.log(`✅ Importados: ${result.imported}`);
        if (result.errors > 0) console.log(`⚠️ Errores/Saltados: ${result.errors}`);
        if (result.criticalError) console.error(`❌ Error Crítico: ${result.criticalError}`);

    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        await sequelize.close();
    }
})();
