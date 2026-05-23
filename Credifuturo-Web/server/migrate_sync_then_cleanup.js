/**
 * migrate_sync_then_cleanup.js
 * ══════════════════════════════════════════════════════════════════════════
 * FASE 1.5 — SINCRONIZACIÓN DE DATOS
 * Copia los valores de columnas camelCase hacia snake_case donde estas
 * últimas sean NULL, para que la migración pueda proceder sin pérdida de datos.
 *
 * Columnas afectadas (camelCase → snake_case):
 *   mesDesembolso            → mes_desembolso
 *   saldoInicial             → saldo_inicial
 *   cuotasPrestamo           → cuotas_prestamo
 *   interesMensual           → interes_mensual
 *   valorInteresesAmortizados→ valor_intereses_amortizados
 *   fechaPagoMax             → fecha_pago_max
 *   mesPago                  → mes_pago
 *   valorCuotaVariable       → valor_cuota_variable
 *   valorCuotaPago           → valor_cuota_pago
 *   saldoFinal               → saldo_final
 *   numeroTransaccion        → numero_transaccion
 *   cuentaAhorros            → cuenta_ahorros
 *   estadoPrestamo           → estado_prestamo
 *   loanId                   → loan_id
 * ══════════════════════════════════════════════════════════════════════════
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'database.sqlite');

const log  = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const ok   = (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const err  = (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
const warn = (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`);
const info = (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`);
const sep  = ()    => console.log('─'.repeat(70));

function openDB(filePath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filePath, sqlite3.OPEN_READWRITE, (e) => {
            if (e) reject(e); else resolve(db);
        });
    });
}
function run(db, sql, params = []) {
    return new Promise((resolve, reject) =>
        db.run(sql, params, function (e) { if (e) reject(e); else resolve(this); })
    );
}
function get(db, sql, params = []) {
    return new Promise((resolve, reject) =>
        db.get(sql, params, (e, row) => { if (e) reject(e); else resolve(row); })
    );
}
function all(db, sql, params = []) {
    return new Promise((resolve, reject) =>
        db.all(sql, params, (e, rows) => { if (e) reject(e); else resolve(rows); })
    );
}
function closeDB(db) {
    return new Promise((resolve) => db.close(resolve));
}

// Pares a sincronizar: [camelCase_origen, snake_case_destino]
// Solo se actualiza si destino es NULL y origen tiene valor
const SYNC_PAIRS = [
    ['mesDesembolso',             'mes_desembolso'],
    ['saldoInicial',              'saldo_inicial'],
    ['cuotasPrestamo',            'cuotas_prestamo'],
    ['interesMensual',            'interes_mensual'],
    ['valorInteresesAmortizados', 'valor_intereses_amortizados'],
    ['fechaPagoMax',              'fecha_pago_max'],
    ['mesPago',                   'mes_pago'],
    ['valorCuotaVariable',        'valor_cuota_variable'],
    ['valorCuotaPago',            'valor_cuota_pago'],
    ['saldoFinal',                'saldo_final'],
    ['numeroTransaccion',         'numero_transaccion'],
    ['cuentaAhorros',             'cuenta_ahorros'],
    ['estadoPrestamo',            'estado_prestamo'],
    ['loanId',                    'loan_id'],
];

async function main() {
    console.log('\n' + '═'.repeat(70));
    console.log('🔄 SINCRONIZACIÓN: camelCase → snake_case en LoanPayments');
    console.log('═'.repeat(70));

    // Backup previo
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = `${DB_PATH}.bak_sync_${ts}`;
    fs.copyFileSync(DB_PATH, backupPath);
    ok(`Backup creado: ${backupPath}`);
    sep();

    const db = await openDB(DB_PATH);
    let totalUpdated = 0;

    try {
        await run(db, 'BEGIN TRANSACTION');

        for (const [camel, snake] of SYNC_PAIRS) {
            // Caso 1: snake_case es NULL pero camelCase tiene datos → copiar
            const r1 = await run(db, `
                UPDATE LoanPayments
                SET "${snake}" = "${camel}"
                WHERE "${camel}" IS NOT NULL
                  AND ("${snake}" IS NULL OR "${snake}" = '')
            `);
            if (r1.changes > 0) {
                info(`  "${camel}" → "${snake}": ${r1.changes} filas sincronizadas`);
                totalUpdated += r1.changes;
            }

            // Caso 2: Ambos tienen datos pero son distintos → priorizar camelCase
            // (los datos camelCase son los originales, snake fue añadido después)
            const r2 = await run(db, `
                UPDATE LoanPayments
                SET "${snake}" = "${camel}"
                WHERE "${camel}" IS NOT NULL
                  AND "${snake}" IS NOT NULL
                  AND "${snake}" != ''
                  AND CAST("${camel}" AS TEXT) != CAST("${snake}" AS TEXT)
            `);
            if (r2.changes > 0) {
                warn(`  "${camel}" → "${snake}": ${r2.changes} filas con conflicto → usada versión camelCase`);
                totalUpdated += r2.changes;
            }
        }

        await run(db, 'COMMIT');
        sep();
        ok(`Sincronización completada: ${totalUpdated} actualizaciones totales.`);

        // Verificación final
        sep();
        log('Verificando consistencia post-sincronización...');
        let allGood = true;
        for (const [camel, snake] of SYNC_PAIRS) {
            const check = await get(db, `
                SELECT COUNT(*) as cnt FROM LoanPayments
                WHERE "${camel}" IS NOT NULL
                  AND ("${snake}" IS NULL OR "${snake}" = '')
            `);
            if (check.cnt > 0) {
                err(`  AÚN HAY DATOS SIN SINCRONIZAR: "${camel}" → "${snake}": ${check.cnt} filas`);
                allGood = false;
            }
        }

        // Mostrar resumen de datos clave
        const sample = await all(db, `
            SELECT id, mes_desembolso, saldo_inicial, cuotas_prestamo,
                   interes_mensual, fecha_pago_max, mes_pago, valor_cuota_variable,
                   estado_prestamo, estado, item_quantity, id_vm
            FROM LoanPayments LIMIT 3
        `);
        log('Muestra post-sincronización (primeras 3 filas):');
        sample.forEach((r, i) => console.log(`  Fila ${i+1}:`, JSON.stringify(r)));

        if (allGood) {
            console.log('\n' + '═'.repeat(70));
            ok('SINCRONIZACIÓN EXITOSA — Ejecuta ahora: node migrate_cleanup_loanpayments.js');
            console.log('═'.repeat(70) + '\n');
        } else {
            warn('Hay filas sin sincronizar. Revisa manualmente antes de continuar la migración.');
        }

    } catch (e) {
        await run(db, 'ROLLBACK').catch(() => {});
        err('ERROR: ' + e.message);
        console.log(`\nRestaurar con: copy "${backupPath}" "${DB_PATH}"`);
        process.exit(1);
    } finally {
        await closeDB(db);
    }
}

main();
