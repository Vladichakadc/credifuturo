/**
 * fix_estadoprestamo_cancelado.js
 *
 * Regla: Si TODAS las cuotas de un préstamo (agrupadas por id_vm) tienen
 *        estado = 'Pago', entonces actualizar estado_prestamo = 'Cancelado'
 *        en TODAS esas cuotas que aún tengan estado_prestamo = 'Pendiente'.
 *
 * Uso: node fix_estadoprestamo_cancelado.js
 */

const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('📂 Conectado a la base de datos.');
        console.log('');

        // ── 1. Encontrar todos los idVm donde TODAS sus cuotas tienen estado = 'Pago' ──
        const candidatos = await sequelize.query(`
            SELECT id_vm
            FROM LoanPayments
            WHERE id_vm IS NOT NULL AND id_vm != ''
            GROUP BY id_vm
            HAVING COUNT(*) > 0
               AND COUNT(*) = SUM(CASE WHEN LOWER(TRIM(estado)) = 'pago' THEN 1 ELSE 0 END)
        `, { type: QueryTypes.SELECT });

        console.log(`🔍 Préstamos con TODAS las cuotas en estado 'Pago': ${candidatos.length}`);
        console.log('');

        if (candidatos.length === 0) {
            console.log('ℹ️  No se encontraron préstamos que cumplan la condición.');
            await sequelize.close();
            return;
        }

        // ── 2. Para cada candidato, ver cuántas cuotas tienen estadoPrestamo = 'Pendiente' ──
        let totalPorActualizar = 0;
        const conPendiente = [];

        for (const row of candidatos) {
            const idVm = row.id_vm;

            const check = await sequelize.query(`
                SELECT COUNT(*) as cnt
                FROM LoanPayments
                WHERE id_vm = ?
                  AND LOWER(TRIM(estado_prestamo)) = 'pendiente'
            `, { type: QueryTypes.SELECT, replacements: [idVm] });

            const cnt = check[0].cnt;
            if (cnt > 0) {
                conPendiente.push({ idVm, cnt });
                totalPorActualizar += cnt;
                console.log(`   🔧 ${idVm}: ${cnt} cuota(s) con estadoPrestamo = 'Pendiente' → se actualizarán a 'Cancelado'`);
            } else {
                console.log(`   ✅ ${idVm}: ya tiene estadoPrestamo correcto (sin Pendientes)`);
            }
        }

        console.log('');

        if (conPendiente.length === 0) {
            console.log('✅ Todos los préstamos ya tienen estadoPrestamo correcto. Nada que hacer.');
            await sequelize.close();
            return;
        }

        console.log(`📝 Total cuotas a actualizar: ${totalPorActualizar}`);
        console.log('');

        // ── 3. Ejecutar la actualización ──────────────────────────────────────────
        let totalActualizados = 0;

        for (const { idVm, cnt } of conPendiente) {
            const [, meta] = await sequelize.query(`
                UPDATE LoanPayments
                SET estado_prestamo = 'Cancelado'
                WHERE id_vm = ?
                  AND LOWER(TRIM(estado_prestamo)) = 'pendiente'
            `, { replacements: [idVm] });

            // Sequelize con SQLite retorna info en meta.changes o en el resultado
            const changes = meta?.changes ?? cnt;
            console.log(`   ✔ ${idVm}: ${changes} cuota(s) actualizadas → Cancelado`);
            totalActualizados += changes;
        }

        console.log('');
        console.log(`🎉 Actualización completada: ${totalActualizados} registros cambiados a 'Cancelado'`);

        // ── 4. Verificación post-update ───────────────────────────────────────────
        console.log('');
        console.log('🔎 Verificación post-actualización:');
        for (const { idVm } of conPendiente) {
            const estados = await sequelize.query(`
                SELECT DISTINCT estado_prestamo
                FROM LoanPayments
                WHERE id_vm = ?
            `, { type: QueryTypes.SELECT, replacements: [idVm] });

            const lista = estados.map(r => r.estado_prestamo).join(', ');
            console.log(`   • ${idVm}: ${lista}`);
        }

        await sequelize.close();
        console.log('');
        console.log('✅ Proceso finalizado.');

    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
})();
