/**
 * fix_audit_warnings.js
 * Corrige las advertencias accionables detectadas en la auditoría:
 *   1. saldo_final < 0 → MAX(0, saldo_final)
 *   2. Clients con customerId o estatus NULL
 */
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

const DB_PATH = path.resolve(__dirname, 'database.sqlite');
const ok   = (m) => console.log(`\x1b[32m✅ ${m}\x1b[0m`);
const warn = (m) => console.log(`\x1b[33m⚠️  ${m}\x1b[0m`);
const info = (m) => console.log(`\x1b[36mℹ️  ${m}\x1b[0m`);
const sep  = (t) => console.log('\n─'.padEnd(62,'─') + ` ${t}`);

function run(db, sql, p=[]) {
  return new Promise((res,rej) => db.run(sql,p,function(e){ e?rej(e):res(this); }));
}
function all(db, sql, p=[]) {
  return new Promise((res,rej) => db.all(sql,p,(e,r)=>e?rej(e):res(r)));
}
function get(db, sql, p=[]) {
  return new Promise((res,rej) => db.get(sql,p,(e,r)=>e?rej(e):res(r)));
}

async function main() {
  // Backup de seguridad
  const ts  = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const bak = `${DB_PATH}.bak_fix_${ts}`;
  fs.copyFileSync(DB_PATH, bak);
  ok(`Backup: ${bak}`);

  const db = await new Promise((res,rej) => {
    const d = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, e=>e?rej(e):res(d));
  });

  await run(db, 'BEGIN TRANSACTION');
  try {

    // ── FIX 1: saldo_final negativos ───────────────────────────────
    sep('FIX 1 — saldo_final negativos → 0');
    const negativos = await all(db,
      `SELECT id, id_ep, saldo_final, saldo_inicial, cuotas_prestamo
       FROM LoanPayments WHERE saldo_final < 0 ORDER BY id`
    );
    info(`Registros con saldo_final < 0: ${negativos.length}`);
    negativos.forEach(r => console.log(`   id=${r.id} ep=${r.id_ep} saldo_final=${r.saldo_final}`));

    const r1 = await run(db,
      `UPDATE LoanPayments SET saldo_final = 0 WHERE saldo_final < 0`
    );
    ok(`saldo_final corregido en ${r1.changes} registros → ahora = 0`);

    // ── FIX 2: Clients sin customerId ──────────────────────────────
    sep('FIX 2 — Clients sin customerId');
    const noCustomer = await all(db,
      `SELECT id, name, apellido1, cedula, customerId, estatus FROM Clients
       WHERE customerId IS NULL OR customerId = '' ORDER BY id`
    );
    info(`Clients sin customerId: ${noCustomer.length}`);

    for (const c of noCustomer) {
      // Buscar el máximo customerId existente y asignar el siguiente
      const maxRow = await get(db,
        `SELECT MAX(CAST(customerId AS INTEGER)) as maxId FROM Clients
         WHERE customerId IS NOT NULL AND customerId != ''`
      );
      const nextId = String((maxRow.maxId || 0) + 1);
      await run(db,
        `UPDATE Clients SET customerId = ? WHERE id = ?`,
        [nextId, c.id]
      );
      ok(`Client id=${c.id} (${c.name}): customerId asignado → ${nextId}`);
    }

    // ── FIX 3: Clients sin estatus ─────────────────────────────────
    sep('FIX 3 — Clients sin estatus');
    const noEstatus = await all(db,
      `SELECT id, name, apellido1, estatus FROM Clients
       WHERE estatus IS NULL OR estatus = '' ORDER BY id`
    );
    info(`Clients sin estatus: ${noEstatus.length}`);

    for (const c of noEstatus) {
      await run(db,
        `UPDATE Clients SET estatus = 'Activo' WHERE id = ?`,
        [c.id]
      );
      ok(`Client id=${c.id} (${c.name}): estatus asignado → 'Activo'`);
    }

    await run(db, 'COMMIT');
    ok('Transacción COMMIT — todos los fixes aplicados.');

    // ── VERIFICACIÓN POST-FIX ──────────────────────────────────────
    sep('VERIFICACIÓN POST-FIX');
    const negCheck    = await get(db, `SELECT COUNT(*) as c FROM LoanPayments WHERE saldo_final < 0`);
    const custCheck   = await get(db, `SELECT COUNT(*) as c FROM Clients WHERE customerId IS NULL OR customerId = ''`);
    const estatCheck  = await get(db, `SELECT COUNT(*) as c FROM Clients WHERE estatus IS NULL OR estatus = ''`);

    negCheck.c   === 0 ? ok(`saldo_final < 0: 0 registros`) : warn(`saldo_final < 0 aún: ${negCheck.c}`);
    custCheck.c  === 0 ? ok(`customerId vacíos: 0 registros`) : warn(`customerId vacíos: ${custCheck.c}`);
    estatCheck.c === 0 ? ok(`estatus vacíos: 0 registros`)   : warn(`estatus vacíos: ${estatCheck.c}`);

    console.log('\n' + '═'.repeat(62));
    ok('TODOS LOS FIXES APLICADOS EXITOSAMENTE');
    info('Ejecuta ahora: node audit_db_integrity.js para confirmar 🟢');
    console.log('═'.repeat(62) + '\n');

  } catch(e) {
    await run(db, 'ROLLBACK').catch(()=>{});
    console.error(`\x1b[31m❌ ERROR: ${e.message}\x1b[0m`);
    console.log(`Restaurar: copy "${bak}" "${DB_PATH}"`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
