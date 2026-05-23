/**
 * fix_cuotas_prestamo.js
 * ───────────────────────────────────────────────────────────────────────────
 * CORRECCIÓN DE DATOS: cuotas_prestamo debe almacenar el número de cuota
 * que se está pagando (= item_quantity), NO el total de cuotas del plan.
 *
 * Ejecutar: node fix_cuotas_prestamo.js
 * ───────────────────────────────────────────────────────────────────────────
 */
const sequelize = require('./config/database');

async function fixCuotasPrestamo() {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a la base de datos establecida.\n');

        // 1. Ver el estado actual ANTES de corregir
        const [before] = await sequelize.query(`
            SELECT
                id_ep,
                id_vm,
                item_quantity,
                cuotas_prestamo,
                CASE
                    WHEN cuotas_prestamo = item_quantity THEN 'OK'
                    ELSE 'DIFERENTE'
                END AS estado
            FROM LoanPayments
            ORDER BY
                CAST(REPLACE(id_ep, 'P', '') AS UNSIGNED) ASC
        `);

        const diferentes = before.filter(r => r.estado === 'DIFERENTE');
        console.log(`📊 Total registros: ${before.length}`);
        console.log(`⚠️  Registros con cuotas_prestamo ≠ item_quantity: ${diferentes.length}\n`);

        if (diferentes.length > 0) {
            console.log('Registros a corregir:');
            console.table(diferentes.map(r => ({
                Id_EP:            r.id_ep,
                Id_VM:            r.id_vm,
                item_quantity:    r.item_quantity,
                cuotas_prestamo:  r.cuotas_prestamo,
                'Cambio':         `${r.cuotas_prestamo} → ${r.item_quantity}`
            })));
        }

        if (diferentes.length === 0) {
            console.log('✅ Todos los registros ya tienen cuotas_prestamo = item_quantity. No hay nada que corregir.');
            process.exit(0);
        }

        // 2. Confirmar antes de ejecutar
        console.log('\n⚡ Ejecutando UPDATE: SET cuotas_prestamo = item_quantity WHERE cuotas_prestamo != item_quantity\n');

        const [result] = await sequelize.query(`
            UPDATE LoanPayments
            SET cuotas_prestamo = item_quantity
            WHERE cuotas_prestamo != item_quantity
               OR cuotas_prestamo IS NULL
        `);

        console.log(`✅ Corrección aplicada. Filas afectadas: ${result.affectedRows ?? JSON.stringify(result)}\n`);

        // 3. Verificar DESPUÉS
        const [after] = await sequelize.query(`
            SELECT
                id_ep,
                id_vm,
                item_quantity,
                cuotas_prestamo
            FROM LoanPayments
            WHERE ABS(cuotas_prestamo - item_quantity) > 0
               OR cuotas_prestamo IS NULL
        `);

        if (after.length === 0) {
            console.log('✅ Verificación OK: todos los registros tienen cuotas_prestamo = item_quantity.');
        } else {
            console.warn(`⚠️  Aún quedan ${after.length} registros con diferencias:`);
            console.table(after);
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error durante la corrección:', err.message);
        console.error(err);
        process.exit(1);
    }
}

fixCuotasPrestamo();
