const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPaths = [
  'c:/Credifuturo/DB_Credifuturo.db',
  path.resolve(__dirname, 'credifuturo.db'),
];

async function inspectDB(dbPath) {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) { resolve(null); return; }
      db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
        if (err || !tables || tables.length === 0) { db.close(); resolve(null); return; }
        const results = { path: dbPath, tables: [] };
        let pending = tables.length;
        tables.forEach((t) => {
          db.all(`PRAGMA table_info('${t.name}')`, (err2, cols) => {
            db.get(`SELECT COUNT(*) as cnt FROM '${t.name}'`, (err3, row) => {
              results.tables.push({ name: t.name, cols: cols || [], count: row ? row.cnt : '?' });
              pending--;
              if (pending === 0) {
                results.tables.sort((a, b) => a.name.localeCompare(b.name));
                db.close();
                resolve(results);
              }
            });
          });
        });
      });
    });
  });
}

async function main() {
  for (const dbPath of dbPaths) {
    const result = await inspectDB(dbPath);
    if (result && result.tables.length > 0) {
      console.log('\n' + '═'.repeat(70));
      console.log(`📦  BASE DE DATOS: ${result.path}`);
      console.log(`📊  Total de tablas: ${result.tables.length}`);
      console.log('═'.repeat(70));
      result.tables.forEach((t, idx) => {
        console.log(`\n┌─ [${idx + 1}] ${t.name}  (${t.cols.length} columnas | ${t.count} registros)`);
        t.cols.forEach((c, ci) => {
          const flags = [];
          if (c.pk) flags.push('🔑 PK');
          if (c.notnull && !c.pk) flags.push('NOT NULL');
          if (c.dflt_value !== null) flags.push(`default="${c.dflt_value}"`);
          const prefix = ci === t.cols.length - 1 ? '└──' : '├──';
          console.log(`${prefix}  ${String(c.cid + 1).padStart(2)}. ${c.name.padEnd(32)} ${c.type.padEnd(18)} ${flags.join(' ')}`);
        });
      });
      console.log('\n' + '═'.repeat(70));
    } else {
      console.log(`\n⚠️  ${dbPath}: sin tablas o no accesible`);
    }
  }
}
main();
