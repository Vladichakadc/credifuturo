const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const sequelize = require('./config/database');
const Client = require('./models/Client');
const Saving = require('./models/Saving');

const ImportService = require('./services/DataImportService');

async function fixAportes() {
    try {
        await sequelize.authenticate();
        console.log('✅ Base de datos conectada.');

        const initialPath = 'C:/Credifuturo/1-orders_table_aportes_iniciales.xlsx';
        if (!fs.existsSync(initialPath)) {
            console.error('❌ Archivo no encontrado:', initialPath);
            process.exit(1);
        }

        const wb = XLSX.readFile(initialPath);
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        console.log(`📂 Leídas ${data.length} filas del Excel.`);

        let count = 0;
        let skipped = 0;

        for (const rawRow of data) {
            const row = {};
            for (const key in rawRow) {
                const cleanKey = key.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                row[cleanKey] = rawRow[key];
            }

            const rawId = row['customer_id'];
            if (!rawId) {
                skipped++;
                continue;
            }

            const transId = (row['# transaccion'] || row['#transaccion'] || '').toString();
            const extId = (row['id_vm'] || row['id_ai'] || '').toString();

            // Mappings matching DataImportService fallbacks
            const year = row['año pago'] || row['año'] || row['year'];
            const month = row['mes pago'] || row['mes'] || row['month'];
            const status = row['estado'] || row['status'] || 'Activo';
            const payDate = ImportService.parseExcelDate(row['fecha pago']);

            if (extId) {
                const existing = await Saving.findOne({ where: { externalId: extId } });
                if (existing) {
                    await existing.update({
                        year: year,
                        month: month,
                        monthInt: month ? ImportService.getMonthIntFromName(month.toString()) : null,
                        status: status,
                        date: payDate || existing.date,
                        banco: row['banco'] || row['banco '],
                        numeroTransaccion: transId,
                        origen: row['tipo de ahorro'] || row['desde cuenta de ahorros'] || row['cuenta de ahorros'],
                        itemQuantity: row['item_quantity'] || row['item quantity'] || 1,
                        type: 'Aporte Inicial'
                    });
                    count++;
                } else {
                    skipped++;
                }
            } else {
                skipped++;
            }
        }

        console.log(`✅ Proceso finalizado: ${count} registros actualizados. ${skipped} saltados.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fatal:', err);
        process.exit(1);
    }
}

fixAportes();
