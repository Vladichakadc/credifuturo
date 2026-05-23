const ImportService = require('./services/DataImportService');
const path = require('path');

async function runImport() {
    console.log('🔄 Iniciando Importación Manual de Todos los Datos...');
    const dataDir = 'C://Credifuturo'; // Ruta real

    try {
        const result = await ImportService.importAll(dataDir);
        console.log('✅ Importación completada:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('❌ Error fatal en importación:', err);
    }
}

runImport();
