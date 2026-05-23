const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const sequelize = require('./config/database');
const Client = require('./models/Client');
const Saving = require('./models/Saving');

async function importInitialOnly() {
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
            // Normalizar keys (minúsculas y sin espacios extra)
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

            const customerId = rawId.toString();
            const client = await Client.findOne({ where: { customerId: customerId } });

            if (client) {
                const transId = (row['# transaccion'] || row['#transaccion'] || '').toString();
                const amountVal = row['valor mensual'] || row['valor'] || 0;
                const amount = typeof amountVal === 'number' ? amountVal : parseFloat(amountVal.toString().replace(/[$,\s]/g, '')) || 0;

                const extId = (row['id_vm'] || row['id_ai'] || '').toString();

                // Evitar duplicados por externalId si existe
                if (extId) {
                    const existing = await Saving.findOne({ where: { externalId: extId } });
                    if (existing) {
                        await existing.update({
                            amount: amount,
                            type: 'Aporte Inicial',
                            banco: row['banco'] || row['banco '],
                            numeroTransaccion: transId,
                            externalId: extId,
                            itemQuantity: row['item_quantity'] || row['item quantity'] || 1,
                            observaciones: row['observaciones'] || ''
                        });
                        count++;
                        continue;
                    }
                }

                await Saving.create({
                    clientId: client.id,
                    amount: amount,
                    date: new Date(), // O parsear si existe fecha pago
                    type: 'Aporte Inicial',
                    banco: row['banco'] || row['banco '],
                    numeroTransaccion: transId,
                    externalId: extId,
                    itemQuantity: row['item_quantity'] || row['item quantity'] || 1,
                    observaciones: row['observaciones'] || ''
                });
                count++;
            } else {
                skipped++;
            }
        }

        console.log(`✅ Importación finalizada: ${count} registros creados/actualizados. ${skipped} saltados (socio no encontrado o sin ID).`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fatal:', err);
        process.exit(1);
    }
}

importInitialOnly();
