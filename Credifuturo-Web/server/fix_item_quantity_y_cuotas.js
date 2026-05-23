/**
 * fix_item_quantity_y_cuotas.js
 * ──────────────────────────────────────────────────────────────────────────
 * CORRECCIÓN: Recalcula item_quantity y cuotas_prestamo de forma secuencial
 * para cada préstamo (id_vm), ordenando los registros por id_ep numéricamente.
 *
 * Regla de negocio:
 *   - cuotasPrestamo = itemQuantity = número secuencial de cuota dentro del
 *     préstamo (1, 2, 3 ... N)
 *   - El número se asigna ordenando los registros de cada id_vm por su id_ep
 *     numérico ascendente (P1 < P2 < P59, etc.)
 *
 * Ejecutar: node fix_item_quantity_y_cuotas.js
 * ──────────────────────────────────────────────────────────────────────────
 */
const sequelize = require('./config/database');

async function fixItemQuantityYCuotas() {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a la base de datos establecida.\n');

        // 1. Obtener todos los registros agrupados por id_vm
        const [rows] = await sequelize.query(`
            SELECT id, id_ep, id_vm, item_quantity, cuotas_prestamo
            FROM LoanPayments
            ORDER BY id_vm ASC,
                     CAST(REPLACE(id_ep, 'P', '') AS UNSIGNED) ASC
        `);

        console.log(`📊 Total registros: ${rows.length}\n`);

        // 2. Agrupar por id_vm y asignar números secuenciales
        const grouped = {};
        for (const row of rows) {
            const key = row.id_vm || '__sin_idvm__';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(row);
        }

        const updates = [];
        for (const [idVm, records] of Object.entries(grouped)) {
            records.forEach((rec, idx) => {
                const newSeq = idx + 1; // secuencial 1-based
                if (rec.item_quantity !== newSeq || rec.cuotas_prestamo !== newSeq) {
                    updates.push({ id: rec.id, id_ep: rec.id_ep, idVm, newSeq, oldItem: rec.item_quantity, oldCuotas: rec.cuotas_prestamo });
                }
            });
        }

        if (updates.length === 0) {
            console.log('✅ Todos los registros ya tienen los valores secuenciales correctos. No hay nada que corregir.');
            process.exit(0);
        }

        console.log(`⚠️  Registros que serán corregidos: ${updates.length}\n`);
        console.table(updates.slice(0, 30).map(u => ({
            id_ep:         u.id_ep,
            id_vm:         u.idVm,
            item_qty_viejo: u.oldItem,
            cuotas_viejo:   u.oldCuotas,
            'Nuevo valor': u.newSeq
        })));
        if (updates.length > 30) console.log(`  ... y ${updates.length - 30} más.\n`);

        // 3. Aplicar los UPDATEs en una transacción
        console.log('\n⚡ Aplicando correcciones...\n');
        const t = await sequelize.transaction();
        try {
            for (const u of updates) {
                await sequelize.query(
                    `UPDATE LoanPayments SET item_quantity = :seq, cuotas_prestamo = :seq WHERE id = :id`,
                    { replacements: { seq: u.newSeq, id: u.id }, transaction: t }
                );
            }
            await t.commit();
            console.log(`✅ ${updates.length} registros corregidos exitosamente.\n`);
        } catch (err) {
            await t.rollback();
            throw err;
        }

        // 4. Verificación final
        const [remaining] = await sequelize.query(`
            SELECT COUNT(*) as total FROM LoanPayments WHERE item_quantity != cuotas_prestamo
        `);
        const diff = remaining[0]?.total ?? 0;
        if (diff == 0) {
            console.log('✅ Verificación OK: item_quantity = cuotas_prestamo en todos los registros.');
        } else {
            console.warn(`⚠️  Aún hay ${diff} registros con item_quantity ≠ cuotas_prestamo.`);
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error durante la corrección:', err.message);
        console.error(err);
        process.exit(1);
    }
}

fixItemQuantityYCuotas();
