/**
 * sync_prod_db_disbursed.js
 * Sincroniza columnas camelCase vacías con datos snake_case en DisbursedLoans (DB de producción)
 */
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = 'C:\\Credifuturo\\Credifuturo-Web\\database.sqlite';
const fs = require('fs');

const ok   = m => console.log(`\x1b[32m✅ ${m}\x1b[0m`);
const info = m => console.log(`\x1b[36mℹ️  ${m}\x1b[0m`);
const warn = m => console.log(`\x1b[33m⚠️  ${m}\x1b[0m`);

function run(db, sql, p=[]) {
  return new Promise((res,rej) => db.run(sql,p,function(e){ e?rej(e):res(this); }));
}
function all(db, sql, p=[]) {
  return new Promise((res,rej) => db.all(sql,p,(e,r)=>e?rej(e):res(r)));
}
function get(db, sql, p=[]) {
  return new Promise((res,rej) => db.get(sql,p,(e,r)=>e?rej(e):res(r)));
}

// Pares camelCase → snake_case a sincronizar en DisbursedLoans
const DL_SYNC = [
  ['valorPrestado',       'valor_prestado'],
  ['interesMensual',      'interes_mensual'],
  ['diasPagoMax',         'dias_pago_max'],
  ['itemQuantity',        'item_quantity'],
  ['numeroTransaccion',   'numero_transaccion'],
  ['cuentaAhorros',       'cuenta_ahorros'],
  ['fechaPrestamo',       'fecha_prestamo'],
  ['mesDesembolso',       'mes_desembolso'],
  ['anioDesembolso',      'anio_desembolso'],
  ['fechaDesembolso',     'fecha_desembolso'],
];

async function main() {
  // Backup
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const bak = `${DB_PATH}.bak_dlsync_${ts}`;
  fs.copyFileSync(DB_PATH, bak);
  ok(`Backup: ${bak}`);

  const db = await new Promise((res,rej) => {
    const d = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, e=>e?rej(e):res(d));
  });

  // Verificar columnas existentes
  const cols = (await all(db, "PRAGMA table_info('DisbursedLoans')")).map(c=>c.name);
  console.log('\nColumnas DisbursedLoans:', cols.join(', '));

  await run(db, 'BEGIN TRANSACTION');
  let totalUpdated = 0;

  try {
    for (const [camel, snake] of DL_SYNC) {
      if (!cols.includes(camel) || !cols.includes(snake)) continue;

      // Copiar snake → camel donde camel es NULL y snake tiene valor
      const r = await run(db, `
        UPDATE DisbursedLoans
        SET "${camel}" = "${snake}"
        WHERE "${snake}" IS NOT NULL
          AND ("${camel}" IS NULL OR "${camel}" = '')
      `);
      if (r.changes > 0) {
        info(`"${snake}" → "${camel}": ${r.changes} filas`);
        totalUpdated += r.changes;
      }
    }

    await run(db, 'COMMIT');
    ok(`Sincronización DisbursedLoans: ${totalUpdated} actualizaciones`);

    // Verificar resultado
    const check = await get(db, `SELECT SUM(valorPrestado) as sp, SUM(valor_prestado) as sv FROM DisbursedLoans WHERE estado LIKE '%Vigente%'`);
    ok(`valorPrestado Vigentes (camel): ${check.sp} | snake: ${check.sv}`);

    // Ahora sincronizar LoanPayments también si hace falta
    const lpcols = (await all(db, "PRAGMA table_info('LoanPayments')")).map(c=>c.name);
    console.log('\nColumnas LoanPayments:', lpcols.join(', '));

    const camelCheck = lpcols.filter(c => /[A-Z]/.test(c) && !['clientId','createdAt','updatedAt'].includes(c));
    if (camelCheck.length > 0) {
      warn(`LoanPayments aún tiene camelCase: ${camelCheck.join(', ')} — necesita migración`);
    } else {
      ok('LoanPayments: sin columnas camelCase duplicadas ✓');
    }

    console.log('\n══════════════════════════════════════════');
    ok('SINCRONIZACIÓN COMPLETADA');
    console.log('══════════════════════════════════════════\n');

  } catch(e) {
    await run(db, 'ROLLBACK').catch(()=>{});
    console.error('ERROR:', e.message);
    console.log(`Restaurar: copy "${bak}" "${DB_PATH}"`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
