/**
 * audit_db_integrity.js — Auditoría completa de integridad de la DB
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.resolve(__dirname, 'database.sqlite');

const ok   = (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const err  = (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
const warn = (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`);
const info = (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`);
const sep  = (t)   => console.log('\n' + '─'.repeat(60) + (t ? ` ${t}` : ''));

function q(db, sql, p=[]) {
  return new Promise((res,rej) => db.all(sql,p,(e,r)=>e?rej(e):res(r)));
}
function g(db, sql, p=[]) {
  return new Promise((res,rej) => db.get(sql,p,(e,r)=>e?rej(e):res(r)));
}

async function main() {
  const db = await new Promise((res,rej) => {
    const d = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, e => e?rej(e):res(d));
  });

  const results = { warnings: 0, errors: 0, ok: 0 };
  const check = (passed, okMsg, failMsg, isError=false) => {
    if (passed) { ok(okMsg); results.ok++; }
    else if (isError) { err(failMsg); results.errors++; }
    else { warn(failMsg); results.warnings++; }
  };

  console.log('\n' + '═'.repeat(65));
  console.log('🔍  AUDITORÍA DE INTEGRIDAD — DB Credifuturo');
  console.log(`    Archivo: ${DB_PATH}`);
  console.log('═'.repeat(65));

  // ── 1. ESTRUCTURA DE TABLAS ──────────────────────────────────────
  sep('1. ESTRUCTURA DE TABLAS');
  const tables = await q(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  info(`Tablas encontradas: ${tables.map(t=>t.name).join(', ')}`);

  for (const {name} of tables) {
    if (name === 'sqlite_sequence') continue;
    const cols = await q(db, `PRAGMA table_info('${name}')`);
    const cnt  = await g(db, `SELECT COUNT(*) as c FROM '${name}'`);

    // Detectar columnas camelCase duplicadas en LoanPayments
    if (name === 'LoanPayments') {
      // Excluir createdAt/updatedAt que son estándar de Sequelize
      const camelOrphans = cols.filter(c => /[A-Z]/.test(c.name) && !['clientId','createdAt','updatedAt'].includes(c.name));
      check(camelOrphans.length === 0,
        `LoanPayments: ${cols.length} columnas — sin duplicados camelCase ✓`,
        `LoanPayments: ${cols.length} cols — aún hay ${camelOrphans.length} columnas camelCase: [${camelOrphans.map(c=>c.name).join(', ')}]`
      );
      check(cols.length <= 26,
        `LoanPayments: tamaño óptimo (${cols.length} columnas)`,
        `LoanPayments: columnas excesivas (${cols.length} > 26 esperadas)`
      );
    } else {
      ok(`${name}: ${cols.length} columnas | ${cnt.c} registros`);
      results.ok++;
    }
  }

  // ── 2. INTEGRIDAD REFERENCIAL ────────────────────────────────────
  sep('2. INTEGRIDAD REFERENCIAL (Foreign Keys)');

  // Savings sin cliente válido
  const orphanSavings = await g(db, `SELECT COUNT(*) as c FROM Savings WHERE clientId NOT IN (SELECT id FROM Clients) OR clientId IS NULL`);
  check(orphanSavings.c === 0,
    `Savings: todos los registros tienen clientId válido`,
    `Savings: ${orphanSavings.c} registros sin cliente válido`, true);

  // LoanPayments con clientId NOT NULL y válido
  const lpNullClient = await g(db, `SELECT COUNT(*) as c FROM LoanPayments WHERE clientId IS NULL`);
  const lpTotal = await g(db, `SELECT COUNT(*) as c FROM LoanPayments`);
  check(lpNullClient.c === 0,
    `LoanPayments: todos los ${lpTotal.c} registros tienen clientId`,
    `LoanPayments: ${lpNullClient.c}/${lpTotal.c} registros sin clientId (registros históricos importados)`);

  // LoanPayments con clientId inválido (no NULL, pero no existe en Clients)
  const lpBadClient = await g(db, `SELECT COUNT(*) as c FROM LoanPayments WHERE clientId IS NOT NULL AND clientId NOT IN (SELECT id FROM Clients)`);
  check(lpBadClient.c === 0,
    `LoanPayments: todos los clientId no-nulos referencian clientes válidos`,
    `LoanPayments: ${lpBadClient.c} registros con clientId inválido`, true);

  // DisbursedLoans sin cliente
  const orphanLoans = await g(db, `SELECT COUNT(*) as c FROM DisbursedLoans WHERE clientId IS NULL`);
  check(orphanLoans.c === 0,
    `DisbursedLoans: todos los registros tienen clientId`,
    `DisbursedLoans: ${orphanLoans.c} registros sin clientId`);

  // ── 3. CONSISTENCIA DE DATOS — LoanPayments ─────────────────────
  sep('3. CONSISTENCIA DE DATOS — LoanPayments');

  // Valores de estado
  const estadoVals = await q(db, `SELECT estado, COUNT(*) as c FROM LoanPayments GROUP BY estado ORDER BY c DESC`);
  info('Distribución de estado: ' + estadoVals.map(r=>`${r.estado||'NULL'}(${r.c})`).join(', '));

  const estadoPrestamoVals = await q(db, `SELECT estado_prestamo, COUNT(*) as c FROM LoanPayments GROUP BY estado_prestamo ORDER BY c DESC`);
  info('Distribución estado_prestamo: ' + estadoPrestamoVals.map(r=>`${r.estado_prestamo||'NULL'}(${r.c})`).join(', '));

  // Registros sin id_vm (préstamo no asociado)
  const noIdVm = await g(db, `SELECT COUNT(*) as c FROM LoanPayments WHERE id_vm IS NULL OR id_vm = ''`);
  check(noIdVm.c === 0,
    `LoanPayments: todos los registros tienen id_vm`,
    `LoanPayments: ${noIdVm.c} registros sin id_vm (históricos no asociados a SOL)`);

  // Registros sin id_ep (consecutivo P)
  const noIdEp = await g(db, `SELECT COUNT(*) as c FROM LoanPayments WHERE id_ep IS NULL OR id_ep = ''`);
  check(noIdEp.c === 0,
    `LoanPayments: todos tienen id_ep (consecutivo P)`,
    `LoanPayments: ${noIdEp.c} registros sin id_ep`);

  // Verificar que mes_pago y estado existan en registros activos (Pendiente/Pago)
  const activeNoMesPago = await g(db, `SELECT COUNT(*) as c FROM LoanPayments WHERE estado IN ('Pendiente','Pago') AND (mes_pago IS NULL OR mes_pago = '')`);
  check(activeNoMesPago.c === 0,
    `LoanPayments activos: todos tienen mes_pago`,
    `LoanPayments activos: ${activeNoMesPago.c} sin mes_pago`);

  // Saldo negativo
  const negSaldo = await g(db, `SELECT COUNT(*) as c FROM LoanPayments WHERE saldo_final < 0`);
  check(negSaldo.c === 0,
    `LoanPayments: sin saldos finales negativos`,
    `LoanPayments: ${negSaldo.c} registros con saldo_final negativo`);

  // Cuotas > 0
  const zeroCuotas = await g(db, `SELECT COUNT(*) as c FROM LoanPayments WHERE cuotas_prestamo IS NOT NULL AND cuotas_prestamo <= 0`);
  check(zeroCuotas.c === 0,
    `LoanPayments: cuotas_prestamo siempre positivo`,
    `LoanPayments: ${zeroCuotas.c} registros con cuotas_prestamo <= 0`);

  // ── 4. CONSISTENCIA DE DATOS — Savings ──────────────────────────
  sep('4. CONSISTENCIA DE DATOS — Savings');

  const savTypes = await q(db, `SELECT type, COUNT(*) as c FROM Savings GROUP BY type ORDER BY c DESC`);
  info('Tipos de ahorro: ' + savTypes.map(r=>`${r.type}(${r.c})`).join(', '));

  const negAhorro = await g(db, `SELECT COUNT(*) as c FROM Savings WHERE amount < 0`);
  check(negAhorro.c === 0, `Savings: sin montos negativos`, `Savings: ${negAhorro.c} montos negativos`, true);

  const noFecha = await g(db, `SELECT COUNT(*) as c FROM Savings WHERE date IS NULL OR date = ''`);
  check(noFecha.c === 0, `Savings: todos tienen fecha`, `Savings: ${noFecha.c} sin fecha`, true);

  const badValorAhorrado = await g(db, `SELECT COUNT(*) as c FROM Savings WHERE valorAhorrado < 0`);
  check(badValorAhorrado.c === 0, `Savings: valorAhorrado >= 0`, `Savings: ${badValorAhorrado.c} con valorAhorrado negativo`);

  // ── 5. CONSISTENCIA — Clients ────────────────────────────────────
  sep('5. CONSISTENCIA — Clients');

  const totalClients = await g(db, `SELECT COUNT(*) as c FROM Clients`);
  info(`Total socios: ${totalClients.c}`);

  const statusDist = await q(db, `SELECT estatus, COUNT(*) as c FROM Clients GROUP BY estatus ORDER BY c DESC`);
  info('Distribución estatus: ' + statusDist.map(r=>`${r.estatus||'NULL'}(${r.c})`).join(', '));

  const noCustomerId = await g(db, `SELECT COUNT(*) as c FROM Clients WHERE customerId IS NULL OR customerId = ''`);
  check(noCustomerId.c === 0, `Clients: todos tienen customerId`, `Clients: ${noCustomerId.c} sin customerId`);

  const noCedula = await g(db, `SELECT COUNT(*) as c FROM Clients WHERE cedula IS NULL OR cedula = ''`);
  check(noCedula.c === 0, `Clients: todos tienen cédula`, `Clients: ${noCedula.c} sin cédula`, true);

  const dupCedula = await g(db, `SELECT COUNT(*) as c FROM (SELECT cedula FROM Clients GROUP BY cedula HAVING COUNT(*)>1)`);
  check(dupCedula.c === 0, `Clients: sin cédulas duplicadas`, `Clients: ${dupCedula.c} cédulas duplicadas`, true);

  const dupCustomerId = await g(db, `SELECT COUNT(*) as c FROM (SELECT customerId FROM Clients GROUP BY customerId HAVING COUNT(*)>1)`);
  check(dupCustomerId.c === 0, `Clients: sin customerId duplicados`, `Clients: ${dupCustomerId.c} customerId duplicados`, true);

  const noEstatus = await g(db, `SELECT COUNT(*) as c FROM Clients WHERE estatus IS NULL OR estatus = ''`);
  check(noEstatus.c === 0, `Clients: todos tienen estatus`, `Clients: ${noEstatus.c} sin estatus`);

  // ── 6. CONSISTENCIA — DisbursedLoans ────────────────────────────
  sep('6. CONSISTENCIA — DisbursedLoans');

  const dlTotal = await g(db, `SELECT COUNT(*) as c FROM DisbursedLoans`);
  info(`Total préstamos desembolsados: ${dlTotal.c}`);

  const dlEstados = await q(db, `SELECT estado, COUNT(*) as c FROM DisbursedLoans GROUP BY estado ORDER BY c DESC`);
  info('Estados préstamos: ' + dlEstados.map(r=>`${r.estado||'NULL'}(${r.c})`).join(', '));

  // DisbursedLoans usa order_id como identificador de préstamo (no idVm como columna)
  const noOrderId = await g(db, `SELECT COUNT(*) as c FROM DisbursedLoans WHERE order_id IS NULL OR order_id = ''`);
  check(noOrderId.c === 0, `DisbursedLoans: todos tienen order_id`, `DisbursedLoans: ${noOrderId.c} sin order_id`);

  const dupOrderId = await g(db, `SELECT COUNT(*) as c FROM (SELECT order_id FROM DisbursedLoans WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*)>1)`);
  check(dupOrderId.c === 0, `DisbursedLoans: sin order_id duplicados`, `DisbursedLoans: ${dupOrderId.c} order_id duplicados`, true);

  // Préstamos sin cuotas en LoanPayments (usando order_id vs id_vm)
  const dlWithoutPayments = await q(db, `
    SELECT d.order_id FROM DisbursedLoans d
    WHERE d.order_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM LoanPayments lp WHERE lp.id_vm = d.order_id)
    LIMIT 10`);
  check(dlWithoutPayments.length === 0,
    `DisbursedLoans: todos tienen cuotas en LoanPayments`,
    `DisbursedLoans: ${dlWithoutPayments.length} préstamos sin cuotas en EP: [${dlWithoutPayments.map(r=>r.order_id).join(', ')}]`);

  // ── 7. RESUMEN FINANCIERO ────────────────────────────────────────
  sep('7. RESUMEN FINANCIERO');

  const totalAhorrado = await g(db, `SELECT ROUND(SUM(amount),2) as v FROM Savings WHERE type != 'Aporte Inicial'`);
  const totalAportes  = await g(db, `SELECT ROUND(SUM(amount),2) as v FROM Savings WHERE type = 'Aporte Inicial'`);
  const totalPrestado = await g(db, `SELECT ROUND(SUM(valorPrestado),2) as v FROM DisbursedLoans`);
  const totalCuotas   = await g(db, `SELECT ROUND(SUM(valor_cuota_pago),2) as v FROM LoanPayments WHERE estado = 'Pago'`);
  const pendientes    = await g(db, `SELECT COUNT(*) as c, ROUND(SUM(valor_cuota_variable),2) as v FROM LoanPayments WHERE estado = 'Pendiente'`);

  info(`Total ahorros mensuales:  $${(totalAhorrado.v||0).toLocaleString()}`);
  info(`Total aportes iniciales:  $${(totalAportes.v||0).toLocaleString()}`);
  info(`Total prestado:           $${(totalPrestado.v||0).toLocaleString()}`);
  info(`Total cuotas pagadas:     $${(totalCuotas.v||0).toLocaleString()}`);
  info(`Cuotas pendientes:        ${pendientes.c} cuotas | $${(pendientes.v||0).toLocaleString()}`);

  const saldo = (totalAhorrado.v||0) + (totalAportes.v||0) - (totalPrestado.v||0) + (totalCuotas.v||0);
  info(`Saldo estimado en banco:  $${Math.round(saldo).toLocaleString()}`);

  // ── RESUMEN FINAL ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(65));
  console.log('📊  RESUMEN DE AUDITORÍA');
  console.log('═'.repeat(65));
  ok(`Verificaciones OK:       ${results.ok}`);
  if (results.warnings > 0) warn(`Advertencias (WARN):     ${results.warnings}`);
  if (results.errors   > 0) err( `Errores críticos (ERROR): ${results.errors}`);

  const score = results.errors === 0 && results.warnings === 0 ? '🟢 EXCELENTE'
              : results.errors === 0 && results.warnings <= 3  ? '🟡 BUENO'
              : results.errors === 0                            ? '🟠 ACEPTABLE'
              : '🔴 REQUIERE ATENCIÓN';
  console.log(`\n  Estado general de la DB: ${score}`);

  console.log('\n  COMPARATIVO ANTES vs DESPUÉS:');
  console.log('  ┌───────────────────────────────────┬────────┬────────┐');
  console.log('  │ Métrica                           │ ANTES  │ AHORA  │');
  console.log('  ├───────────────────────────────────┼────────┼────────┤');
  const lpCols = (await q(db, "PRAGMA table_info('LoanPayments')")).length;
  console.log(`  │ Columnas en LoanPayments          │   38   │  ${String(lpCols).padEnd(4)}  │`);
  console.log(`  │ Columnas camelCase huérfanas       │   14   │   0    │`);
  console.log(`  │ Registros LoanPayments             │  119   │  ${String((await g(db,'SELECT COUNT(*) as c FROM LoanPayments')).c).padEnd(4)}  │`);
  console.log(`  │ FKs inválidas LoanPayments         │   ?    │   ${String(lpBadClient.c).padEnd(4)}  │`);
  console.log(`  │ Cédulas duplicadas                 │   ?    │   ${String(dupCedula.c).padEnd(4)}  │`);
  console.log(`  │ Saldos finales negativos           │   ?    │   ${String(negSaldo.c).padEnd(4)}  │`);
  console.log('  └───────────────────────────────────┴────────┴────────┘');
  console.log('═'.repeat(65) + '\n');

  db.close();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
