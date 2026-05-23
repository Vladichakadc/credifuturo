const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (e) => { if(e) throw e; });
const g = (sql) => new Promise((res,rej) => db.get(sql, (e,r)=>e?rej(e):res(r)));
const a = (sql) => new Promise((res,rej) => db.all(sql, (e,r)=>e?rej(e):res(r)));

const fmt = (n) => '$' + Math.round(n||0).toLocaleString('es-CO');

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('💰  DIAGNÓSTICO SALDO EN BANCO');
  console.log('══════════════════════════════════════════════════════\n');

  // 1. Ahorros mensuales (socios activos, excluyendo Aporte Inicial)
  const r1 = await g(`
    SELECT ROUND(SUM(s.amount),0) as v FROM Savings s
    INNER JOIN Clients c ON c.id = s.clientId
    WHERE s.type != 'Aporte Inicial'
    AND c.estatus LIKE '%Activo%'`);
  console.log(`Capital Ahorrado (mensual, activos):   ${fmt(r1.v)}`);

  // 2. Aportes Iniciales (socios activos)
  const r2 = await g(`
    SELECT ROUND(SUM(s.amount),0) as v FROM Savings s
    INNER JOIN Clients c ON c.id = s.clientId
    WHERE s.type = 'Aporte Inicial'
    AND c.estatus LIKE '%Activo%'`);
  console.log(`Total Aportes Iniciales (activos):     ${fmt(r2.v)}`);

  // 3. TODOS los aportes iniciales (sin filtro de estatus)
  const r2b = await g(`SELECT ROUND(SUM(amount),0) as v FROM Savings WHERE type = 'Aporte Inicial'`);
  console.log(`Total Aportes Iniciales (TODOS):       ${fmt(r2b.v)}`);

  // 4. Total Ahorrado = mensual + aportes (activos)
  const totalAhorrado = (r1.v||0) + (r2.v||0);
  console.log(`\nTotal Ahorrado (activos):              ${fmt(totalAhorrado)}`);
  console.log(`  → Esperado por usuario:              $36.508.314`);

  // 5. Total Prestado (DisbursedLoans, socios activos)
  const r3 = await g(`
    SELECT ROUND(SUM(d.valorPrestado),0) as v FROM DisbursedLoans d
    INNER JOIN Clients c ON c.id = d.clientId
    WHERE c.estatus LIKE '%Activo%'`);
  console.log(`\nTotal Prestado (activos):              ${fmt(r3.v)}`);

  // 6. Total Prestado (TODOS, sin filtro)
  const r3b = await g(`SELECT ROUND(SUM(valorPrestado),0) as v FROM DisbursedLoans`);
  console.log(`Total Prestado (TODOS):                ${fmt(r3b.v)}`);
  console.log(`  → Esperado por usuario:              $26.600.000`);

  // 7. Total Cuotas Pagadas (histórico, estado='Pago')
  const r4 = await g(`
    SELECT ROUND(SUM(valor_cuota_pago),0) as v FROM LoanPayments
    WHERE estado = 'Pago'`);
  console.log(`\nTotal Cuotas Pagadas (estado=Pago):    ${fmt(r4.v)}`);

  // 8. Total valorCuotaVariable pagadas (deduplicado como en el backend)
  const r4b = await g(`
    SELECT ROUND(SUM(valor_cuota_variable),0) as v FROM LoanPayments
    WHERE estado = 'Pago'`);
  console.log(`Total valorCuotaVariable (Pago):       ${fmt(r4b.v)}`);
  console.log(`  → Esperado por usuario:              $8.720.917`);

  // 9. Cálculo con fórmula ACTUAL (con 367099)
  const actual = (r1.v||0) + (r2.v||0) - (r3.v||0) + (r4b.v||0) + 367099;
  console.log(`\n──────────────────────────────────────────────────────`);
  console.log(`Fórmula ACTUAL  (+ rentabilidadNU):    ${fmt(actual)}`);
  console.log(`  = (${fmt(r1.v)} + ${fmt(r2.v)}) - ${fmt(r3.v)} + ${fmt(r4b.v)} + $367.099`);

  // 10. Cálculo con fórmula NUEVA (sin 367099, usando ALL loans)
  const nueva = (r1.v||0) + (r2b.v||0) - (r3b.v||0) + (r4b.v||0);
  console.log(`\nFórmula NUEVA   (sin rentabilidad):    ${fmt(nueva)}`);
  console.log(`  = (${fmt(r1.v)} + ${fmt(r2b.v)}) - ${fmt(r3b.v)} + ${fmt(r4b.v)}`);
  console.log(`  → Esperado por usuario:              $18.629.231`);

  // 11. Distribución DisbursedLoans por estatus de cliente
  const dlDist = await a(`
    SELECT c.estatus, COUNT(*) as cnt, ROUND(SUM(d.valorPrestado),0) as total
    FROM DisbursedLoans d
    LEFT JOIN Clients c ON c.id = d.clientId
    GROUP BY c.estatus`);
  console.log('\nDisbursedLoans por estatus cliente:');
  dlDist.forEach(r => console.log(`  estatus="${r.estatus}" → ${r.cnt} préstamos | ${fmt(r.total)}`));

  // 12. Distribución Savings aportes por estatus
  const savDist = await a(`
    SELECT c.estatus, s.type, COUNT(*) as cnt, ROUND(SUM(s.amount),0) as total
    FROM Savings s
    LEFT JOIN Clients c ON c.id = s.clientId
    GROUP BY c.estatus, s.type`);
  console.log('\nSavings por estatus+tipo:');
  savDist.forEach(r => console.log(`  estatus="${r.estatus}" tipo="${r.type}" → ${r.cnt} reg | ${fmt(r.total)}`));

  console.log('\n══════════════════════════════════════════════════════\n');
  db.close();
}

main().catch(e => console.error('ERROR:', e.message));
