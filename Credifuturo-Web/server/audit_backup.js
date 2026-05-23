const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Importar modelos
const Client = require('./models/Client');
const Saving = require('./models/Saving');
const DisbursedLoan = require('./models/DisbursedLoan');
const LoanPayment = require('./models/LoanPayment');

const BACKUPS_DIR = 'C:\\Credifuturo\\Backups';

async function auditBackup() {
    try {
        console.log('--- Iniciando Auditoría de Backup ---');
        
        // 1. Obtener conteo de la base de datos
        const [totalClients, totalSavings, aportesIniciales, totalLoans, totalPayments, totalMora] = await Promise.all([
            Client.count(),
            Saving.count(),
            Saving.count({ where: { type: 'Aporte Inicial' } }),
            DisbursedLoan.count(),
            LoanPayment.count(),
            LoanPayment.count({ where: { estado: 'Mora' } })
        ]);

        console.log(`\n[Base de Datos] Registros Totales:`);
        console.log(`- Socios (Client): ${totalClients}`);
        console.log(`- Ahorros (Saving total): ${totalSavings}`);
        console.log(`- Aportes Iniciales (Saving type='Aporte Inicial'): ${aportesIniciales}`);
        console.log(`- Préstamos (DisbursedLoan): ${totalLoans}`);
        console.log(`- Estado de Préstamos (LoanPayment total): ${totalPayments}`);
        console.log(`- Morosidad (LoanPayment estado='Mora'): ${totalMora}`);

        // 2. Encontrar la carpeta de backup más reciente
        if (!fs.existsSync(BACKUPS_DIR)) {
            console.log('\n❌ No se encontró la carpeta de Backups.');
            return;
        }

        const entries = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true });
        const folders = entries
            .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}(_\d{6})?$/.test(e.name))
            .sort((a, b) => b.name.localeCompare(a.name));

        if (folders.length === 0) {
            console.log('\n❌ No se encontraron carpetas de backup válidas.');
            return;
        }

        const latestFolder = folders[0].name;
        const folderPath = path.join(BACKUPS_DIR, latestFolder);
        console.log(`\n[Backup] Analizando última carpeta: ${latestFolder}`);

        // 3. Contar registros en los archivos de Excel
        const filesToAudit = [
            { file: 'Tabla_Clientes.xlsx', dbCount: totalClients, name: 'Socios' },
            { file: '1-orders_table_ahorro_mensual.xlsx', dbCount: totalSavings, name: 'Ahorros' },
            { file: '1-orders_table_aportes_iniciales.xlsx', dbCount: aportesIniciales, name: 'Aportes Iniciales' },
            { file: '1-orders_table_prestamos_desembolsados.xlsx', dbCount: totalLoans, name: 'Préstamos' },
            { file: '1-orders_table_estado_prestamos.xlsx', dbCount: totalPayments, name: 'Estado de Préstamos' },
            { file: 'Reporte_Morosidad.xlsx', dbCount: totalMora, name: 'Morosidad' },
        ];

        let hasDiscrepancies = false;

        for (const item of filesToAudit) {
            const filePath = path.join(folderPath, item.file);
            if (!fs.existsSync(filePath)) {
                console.log(`❌ Archivo faltante: ${item.file}`);
                hasDiscrepancies = true;
                continue;
            }

            const wb = XLSX.readFile(filePath);
            const sheetName = wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            
            // Convertir a JSON (sin header)
            const data = XLSX.utils.sheet_to_json(ws);
            const excelCount = data.length;

            const match = excelCount === item.dbCount;
            if (!match) hasDiscrepancies = true;

            console.log(`${match ? '✅' : '❌'} ${item.name} (${item.file}) -> DB: ${item.dbCount} | Excel: ${excelCount}`);
        }

        console.log('\n--- Resultado de Auditoría ---');
        console.log(hasDiscrepancies 
            ? '⚠️ Se encontraron discrepancias entre la base de datos y el backup.'
            : '✅ El backup coincide EXACTAMENTE con los registros de la base de datos.');

        process.exit(0);
    } catch (error) {
        console.error('Error durante la auditoría:', error);
        process.exit(1);
    }
}

auditBackup();
