/**
 * migrate_cleanup_loanpayments.js
 * ══════════════════════════════════════════════════════════════════════════
 * PROPÓSITO: Eliminar las columnas camelCase huérfanas de la tabla
 *            LoanPayments, dejando solo las 24 columnas snake_case activas.
 *
 * PASOS:
 *   0. Backup automático con timestamp
 *   1. Validación de datos (detectar inconsistencias entre duplicados)
 *   2. Migración dentro de transacción SQLite
 *   3. Verificación post-migración
 *
 * ROLLBACK: Si el script falla, la DB NO se modifica (transacción completa).
 *           El backup .bak_* puede usarse para restaurar manualmente.
 * ══════════════════════════════════════════════════════════════════════════
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'database.sqlite');

// ── Helpers ──────────────────────────────────────────────────────────────────
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const ok  = (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const err = (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
const warn= (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`);
const sep = ()    => console.log('─'.repeat(70));

// Promisify sqlite3
function openDB(filePath, flags = sqlite3.OPEN_READWRITE) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filePath, flags, (e) => {
            if (e) reject(e); else resolve(db);
        });
    });
}
function run(db, sql, params = []) {
    return new Promise((resolve, reject) =>
        db.run(sql, params, function (e) { if (e) reject(e); else resolve(this); })
    );
}
function all(db, sql, params = []) {
    return new Promise((resolve, reject) =>
        db.all(sql, params, (e, rows) => { if (e) reject(e); else resolve(rows); })
    );
}
function get(db, sql, params = []) {
    return new Promise((resolve, reject) =>
        db.get(sql, params, (e, row) => { if (e) reject(e); else resolve(row); })
    );
}
function closeDB(db) {
    return new Promise((resolve) => db.close(resolve));
}

// ── FASE 0: Backup ────────────────────────────────────────────────────────────
async function doBackup() {
    sep();
    log('FASE 0 — Backup automático');

    if (!fs.existsSync(DB_PATH)) {
        throw new Error(`Base de datos no encontrada: ${DB_PATH}`);
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = `${DB_PATH}.bak_${ts}`;

    fs.copyFileSync(DB_PATH, backupPath);

    const stats = fs.statSync(backupPath);
    ok(`Backup creado: ${backupPath} (${(stats.size / 1024).toFixed(1)} KB)`);
    return backupPath;
}

// ── FASE 1: Validación ────────────────────────────────────────────────────────
async function doValidation(db) {
    sep();
    log('FASE 1 — Validación de datos');

    // 1a. Obtener columnas actuales
    const cols = await all(db, "PRAGMA table_info('LoanPayments')");
    const colNames = cols.map(c => c.name);
    log(`Columnas actuales en LoanPayments: ${colNames.length}`);
    console.log('  ' + colNames.join(', '));

    // 1b. Columnas snake_case activas (las que queremos CONSERVAR)
    const KEEP_COLS = [
        'id', 'id_ep', 'clientId',
        'mes_desembolso', 'saldo_inicial', 'cuotas_prestamo',
        'interes_mensual', 'valor_intereses_amortizados',
        'fecha_pago_max', 'mes_pago', 'valor_cuota_variable',
        'estado', 'valor_cuota_pago', 'saldo_final',
        'item_quantity', 'banco', 'numero_transaccion',
        'cuenta_ahorros', 'observaciones', 'id_vm',
        'estado_prestamo', 'loan_id',
        'createdAt', 'updatedAt'
    ];

    // 1c. Columnas camelCase huérfanas (las que queremos ELIMINAR)
    // Map: nombreCamelCase → nombreSnakeCase correspondiente (para validación de datos)
    const ORPHAN_MAP = {
        'mesDesembolso':              'mes_desembolso',
        'saldoInicial':               'saldo_inicial',
        'cuotasPrestamo':             'cuotas_prestamo',
        'interesMensual':             'interes_mensual',
        'valorInteresesAmortizados':  'valor_intereses_amortizados',
        'fechaPagoMax':               'fecha_pago_max',
        'mesPago':                    'mes_pago',
        'valorCuotaVariable':         'valor_cuota_variable',
        'valorCuotaPago':             'valor_cuota_pago',
        'saldoFinal':                 'saldo_final',
        'numeroTransaccion':          'numero_transaccion',
        'cuentaAhorros':              'cuenta_ahorros',
        'estadoPrestamo':             'estado_prestamo',
        'loanId':                     'loan_id',
    };

    // Detectar qué columnas huérfanas existen realmente en la DB
    const existingOrphans = Object.keys(ORPHAN_MAP).filter(c => colNames.includes(c));
    warn(`Columnas huérfanas detectadas: ${existingOrphans.length} → [${existingOrphans.join(', ')}]`);

    // 1d. Verificar inconsistencias de datos entre camelCase y snake_case
    log('Verificando consistencia de datos entre columnas duplicadas...');
    let inconsistencias = 0;
    for (const [camel, snake] of Object.entries(ORPHAN_MAP)) {
        if (!colNames.includes(camel) || !colNames.includes(snake)) continue;

        // Contar filas donde los valores difieren (ignorando NULLs en ambos)
        const result = await get(db, `
            SELECT COUNT(*) as cnt FROM LoanPayments
            WHERE "${camel}" IS NOT NULL
              AND "${snake}" IS NOT NULL
              AND CAST("${camel}" AS TEXT) != CAST("${snake}" AS TEXT)
        `);
        if (result.cnt > 0) {
            err(`  INCONSISTENCIA: '${camel}' vs '${snake}' difieren en ${result.cnt} filas`);
            inconsistencias++;
        } else {
            // También chequear filas donde snake es NULL pero camel tiene valor (posible problema)
            const r2 = await get(db, `
                SELECT COUNT(*) as cnt FROM LoanPayments
                WHERE "${camel}" IS NOT NULL AND "${snake}" IS NULL
            `);
            if (r2.cnt > 0) {
                warn(`  ALERTA: '${camel}' tiene datos pero '${snake}' es NULL en ${r2.cnt} filas → se perderían datos`);
                inconsistencias++;
            }
        }
    }

    if (inconsistencias > 0) {
        throw new Error(`Se encontraron ${inconsistencias} inconsistencias. Migración cancelada por seguridad. Revisa los datos manualmente.`);
    }

    ok('Sin inconsistencias — los datos en columnas snake_case son completos y correctos.');

    // 1e. Contar filas antes de migración
    const countBefore = await get(db, 'SELECT COUNT(*) as cnt FROM LoanPayments');
    ok(`Filas en LoanPayments ANTES de migración: ${countBefore.cnt}`);

    // 1f. Verificar que todas las columnas KEEP_COLS existen
    const missingKeep = KEEP_COLS.filter(c => !colNames.includes(c));
    if (missingKeep.length > 0) {
        throw new Error(`Columnas requeridas no encontradas: ${missingKeep.join(', ')}`);
    }
    ok('Todas las columnas snake_case activas están presentes.');

    return { countBefore: countBefore.cnt, existingOrphans, KEEP_COLS, ORPHAN_MAP };
}

// ── FASE 2: Migración ─────────────────────────────────────────────────────────
async function doMigration(db, countBefore) {
    sep();
    log('FASE 2 — Migración de tabla (transacción atómica)');

    await run(db, 'PRAGMA foreign_keys = OFF');
    await run(db, 'BEGIN TRANSACTION');

    try {
        // 2a. Crear tabla nueva con solo las columnas activas
        log('Creando tabla LoanPayments_clean...');
        await run(db, `
            CREATE TABLE LoanPayments_clean (
                id                          INTEGER PRIMARY KEY AUTOINCREMENT,
                id_ep                       VARCHAR(255),
                clientId                    INTEGER,
                mes_desembolso              TEXT,
                saldo_inicial               DECIMAL(12,2),
                cuotas_prestamo             INTEGER,
                interes_mensual             DECIMAL(5,4),
                valor_intereses_amortizados DECIMAL(12,2),
                fecha_pago_max              DATE,
                mes_pago                    TEXT,
                valor_cuota_variable        DECIMAL(12,2),
                estado                      VARCHAR(255),
                valor_cuota_pago            DECIMAL(12,2),
                saldo_final                 DECIMAL(12,2),
                item_quantity               INTEGER DEFAULT 1,
                banco                       VARCHAR(255),
                numero_transaccion          TEXT,
                cuenta_ahorros              TEXT,
                observaciones               TEXT,
                id_vm                       TEXT,
                estado_prestamo             TEXT,
                loan_id                     INTEGER,
                createdAt                   DATETIME,
                updatedAt                   DATETIME
            )
        `);
        ok('Tabla LoanPayments_clean creada.');

        // 2b. Copiar datos (solo columnas snake_case activas)
        log('Copiando datos a LoanPayments_clean...');
        const insertResult = await run(db, `
            INSERT INTO LoanPayments_clean (
                id, id_ep, clientId,
                mes_desembolso, saldo_inicial, cuotas_prestamo,
                interes_mensual, valor_intereses_amortizados,
                fecha_pago_max, mes_pago, valor_cuota_variable,
                estado, valor_cuota_pago, saldo_final,
                item_quantity, banco, numero_transaccion,
                cuenta_ahorros, observaciones, id_vm,
                estado_prestamo, loan_id,
                createdAt, updatedAt
            )
            SELECT
                id, id_ep, clientId,
                mes_desembolso, saldo_inicial, cuotas_prestamo,
                interes_mensual, valor_intereses_amortizados,
                fecha_pago_max, mes_pago, valor_cuota_variable,
                estado, valor_cuota_pago, saldo_final,
                item_quantity, banco, numero_transaccion,
                cuenta_ahorros, observaciones, id_vm,
                estado_prestamo, loan_id,
                createdAt, updatedAt
            FROM LoanPayments
        `);
        ok(`Datos copiados: ${insertResult.changes} filas.`);

        // 2c. Verificar conteo en tabla nueva antes de hacer DROP
        const countNew = await get(db, 'SELECT COUNT(*) as cnt FROM LoanPayments_clean');
        if (countNew.cnt !== countBefore) {
            throw new Error(`Conteo no coincide: original=${countBefore}, nuevo=${countNew.cnt}. ROLLBACK.`);
        }
        ok(`Verificación de filas: ${countNew.cnt} = ${countBefore} ✓`);

        // 2d. Eliminar tabla original y renombrar
        log('Reemplazando tabla original...');
        await run(db, 'DROP TABLE LoanPayments');
        await run(db, 'ALTER TABLE LoanPayments_clean RENAME TO LoanPayments');
        ok('Tabla LoanPayments reemplazada exitosamente.');

        // 2e. Recrear índice en clientId (importante para FK performance)
        await run(db, 'CREATE INDEX IF NOT EXISTS idx_loanpayments_clientid ON LoanPayments(clientId)');
        await run(db, 'CREATE INDEX IF NOT EXISTS idx_loanpayments_idvm ON LoanPayments(id_vm)');
        await run(db, 'CREATE INDEX IF NOT EXISTS idx_loanpayments_estado ON LoanPayments(estado)');
        ok('Índices recreados.');

        // 2f. Actualizar secuencia autoincrement
        const maxId = await get(db, 'SELECT MAX(id) as maxId FROM LoanPayments');
        if (maxId && maxId.maxId) {
            await run(db, `UPDATE sqlite_sequence SET seq = ? WHERE name = 'LoanPayments'`, [maxId.maxId]);
            await run(db, `INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES ('LoanPayments', ?)`, [maxId.maxId]);
        }

        await run(db, 'COMMIT');
        ok('Transacción COMMIT — migración exitosa.');

    } catch (migErr) {
        await run(db, 'ROLLBACK');
        err('Transacción ROLLBACK — DB restaurada al estado original.');
        throw migErr;
    } finally {
        await run(db, 'PRAGMA foreign_keys = ON');
    }
}

// ── FASE 3: Verificación ──────────────────────────────────────────────────────
async function doVerification(db, countBefore) {
    sep();
    log('FASE 3 — Verificación post-migración');

    // 3a. Contar filas
    const countAfter = await get(db, 'SELECT COUNT(*) as cnt FROM LoanPayments');
    if (countAfter.cnt !== countBefore) {
        throw new Error(`❌ PÉRDIDA DE DATOS: antes=${countBefore}, después=${countAfter.cnt}`);
    }
    ok(`Filas intactas: ${countAfter.cnt}`);

    // 3b. Verificar columnas
    const cols = await all(db, "PRAGMA table_info('LoanPayments')");
    ok(`Columnas en LoanPayments: ${cols.length}`);
    console.log('  ' + cols.map(c => c.name).join(', '));

    // Verificar que NO haya columnas camelCase
    const orphanCheck = ['mesDesembolso','saldoInicial','cuotasPrestamo','interesMensual',
        'valorInteresesAmortizados','fechaPagoMax','mesPago','valorCuotaVariable',
        'valorCuotaPago','saldoFinal','numeroTransaccion','cuentaAhorros','estadoPrestamo','loanId'];
    const remainingOrphans = orphanCheck.filter(o => cols.some(c => c.name === o));
    if (remainingOrphans.length > 0) {
        err(`Columnas huérfanas aún presentes: ${remainingOrphans.join(', ')}`);
        throw new Error('Migración incompleta: columnas huérfanas no eliminadas.');
    }
    ok('Sin columnas huérfanas camelCase — tabla limpia.');

    // 3c. Prueba de SELECT real (simula lo que hace Sequelize)
    const sample = await all(db, `
        SELECT id, id_ep, clientId, mes_pago, estado, estado_prestamo,
               saldo_inicial, valor_cuota_variable, fecha_pago_max, id_vm
        FROM LoanPayments LIMIT 5
    `);
    ok(`Prueba SELECT: ${sample.length} filas obtenidas correctamente.`);
    if (sample.length > 0) {
        console.log('  Muestra fila 1:', JSON.stringify(sample[0]));
    }

    // 3d. Verificar que Sequelize puede acceder al modelo
    try {
        const { LoanPayment } = require('./models');
        const testCount = await LoanPayment.count();
        ok(`Sequelize LoanPayment.count() = ${testCount} (esperado: ${countBefore})`);
        if (testCount !== countBefore) {
            warn(`Conteo vía Sequelize difiere: ${testCount} vs ${countBefore}`);
        }

        // Prueba findAll con campos del modelo
        const testRow = await LoanPayment.findOne({
            attributes: ['externalId', 'mesDesembolso', 'mesPago', 'estadoPrestamo',
                         'saldoInicial', 'valorCuotaVariable', 'itemQuantity']
        });
        if (testRow) {
            ok(`Sequelize findOne exitoso: mesPago="${testRow.mesPago}", estado="${testRow.estado}"`);
        }
    } catch (seqErr) {
        warn(`Prueba Sequelize: ${seqErr.message}`);
    }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n' + '═'.repeat(70));
    console.log('🔧 MIGRACIÓN: LoanPayments — Eliminar columnas camelCase huérfanas');
    console.log('═'.repeat(70));

    let db;
    let backupPath;

    try {
        // FASE 0: Backup
        backupPath = await doBackup();

        // Abrir DB
        db = await openDB(DB_PATH);

        // FASE 1: Validación
        const { countBefore, existingOrphans } = await doValidation(db);

        if (existingOrphans.length === 0) {
            ok('No hay columnas huérfanas. La tabla ya está limpia. Nada que hacer.');
            await closeDB(db);
            return;
        }

        // FASE 2: Migración
        await doMigration(db, countBefore);

        // FASE 3: Verificación
        await doVerification(db, countBefore);

        sep();
        console.log('\n' + '═'.repeat(70));
        ok('MIGRACIÓN COMPLETADA EXITOSAMENTE');
        console.log(`  📦 Backup guardado en: ${backupPath}`);
        console.log(`  📊 Columnas eliminadas: ${existingOrphans.length} camelCase huérfanas`);
        console.log(`  ✅ Datos íntegros: todos los registros preservados`);
        console.log('═'.repeat(70) + '\n');

    } catch (e) {
        sep();
        err('ERROR DURANTE LA MIGRACIÓN:');
        err(e.message);
        if (backupPath && fs.existsSync(backupPath)) {
            console.log(`\n  Para restaurar, ejecuta:`);
            console.log(`  copy "${backupPath}" "${DB_PATH}"`);
        }
        console.log('');
        process.exit(1);
    } finally {
        if (db) await closeDB(db);
    }
}

main();
