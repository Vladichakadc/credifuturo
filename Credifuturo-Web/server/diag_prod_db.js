const sqlite3 = require('sqlite3').verbose();
const DB_PATH = 'C:\\Credifuturo\\Credifuturo-Web\\database.sqlite';
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (e) => { if(e) throw e; });
const a = (sql,p=[]) => new Promise((res,rej) => db.all(sql,p,(e,r)=>e?rej(e):res(r)));
const g = (sql,p=[]) => new Promise((res,rej) => db.get(sql,p,(e,r)=>e?rej(e):res(r)));
const fmt = n => '$' + Math.round(n||0).toLocaleString('es-CO');

async function main() {
  // Aportes iniciales por socio y estatus
  console.log('\n=== APORTES INICIALES POR SOCIO ===');
  const ai = await a(`
    SELECT s.clientId, c.name||' '||COALESCE(c.apellido1,'') as nombre, 
           c.estatus, s.amount, s.date, s.month
    FROM Savings s 
    LEFT JOIN Clients c ON c.id = s.clientId
    WHERE s.type = 'Aporte Inicial'
    ORDER BY s.amount DESC`);
  ai.forEach(r => console.log(` ID=${r.clientId} | ${r.nombre||'?'} | estatus=${r.estatus} | ${fmt(r.amount)} | ${r.date||r.month}`));
  console.log(`TOTAL: ${fmt(ai.reduce((s,r)=>s+(r.amount||0),0))}`);

  // Verificar columns en Clients
  const cls = await a("PRAGMA table_info('Clients')");
  const nameCol = cls.find(c=>['nombre','name'].includes(c.name))?.name || 'name';
  console.log('\nClients nombre columna:', nameCol, '| Columnas:', cls.map(c=>c.name).join(', '));

  // Clients con estatus Activo y su aporte
  console.log('\n=== CLIENTS ACTIVOS ===');
  const clientes = await a(`SELECT id, ${nameCol}, estatus FROM Clients WHERE estatus LIKE '%Activo%'`);
  clientes.forEach(c => console.log(` ID=${c.id} | ${c[nameCol]} | ${c.estatus}`));

  // totalCuotasPagadas con la lógica deduplicada del backend
  console.log('\n=== CUOTAS PAGADAS (deduplicado como backend) ===');
  const r1 = await g(`SELECT COUNT(*) as cnt, ROUND(SUM(valor_cuota_variable),0) as v FROM LoanPayments WHERE estado='Pago' AND estado_prestamo='Pendiente'`);
  console.log(`estado=Pago AND estado_prestamo=Pendiente: ${r1.cnt} filas | ${fmt(r1.v)}`);
  const r2 = await g(`SELECT COUNT(*) as cnt, ROUND(SUM(valor_cuota_variable),0) as v FROM LoanPayments WHERE estado='Pago'`);
  console.log(`estado=Pago (sin filtro estadoPrestamo): ${r2.cnt} filas | ${fmt(r2.v)}`);

  // Fórmula correcta usando los mismos filtros que el dashboard
  console.log('\n=== FÓRMULA CON FILTROS DEL DASHBOARD ===');
  const men   = await g("SELECT ROUND(SUM(amount),0) as v FROM Savings s INNER JOIN Clients c ON c.id=s.clientId WHERE s.type!='Aporte Inicial' AND c.estatus LIKE '%Activo%'");
  const aporAct = await g("SELECT ROUND(SUM(amount),0) as v FROM Savings s INNER JOIN Clients c ON c.id=s.clientId WHERE s.type='Aporte Inicial' AND c.estatus LIKE '%Activo%'");
  const aporTodo = await g("SELECT ROUND(SUM(amount),0) as v FROM Savings WHERE type='Aporte Inicial'");
  const vigente = await g("SELECT ROUND(SUM(valor_prestado),0) as v FROM DisbursedLoans WHERE estado LIKE '%Vigente%'");
  const cuotasD = await g("SELECT ROUND(SUM(valor_cuota_variable),0) as v FROM LoanPayments WHERE estado='Pago' AND estado_prestamo='Pendiente'");

  console.log(`Capital ahorrado (activos):       ${fmt(men.v)}`);
  console.log(`Aportes iniciales (activos):      ${fmt(aporAct.v)}`);
  console.log(`Aportes iniciales (TODOS):        ${fmt(aporTodo.v)}`);
  console.log(`Préstamos Vigentes:               ${fmt(vigente.v)}`);
  console.log(`Cuotas pagadas (deduplicado):     ${fmt(cuotasD.v)}`);

  const saldo1 = (men.v||0) + (aporAct.v||0) - (vigente.v||0) + (cuotasD.v||0);
  const saldo2 = (men.v||0) + (aporTodo.v||0) - (vigente.v||0) + (cuotasD.v||0);
  console.log(`\nSaldo con aportes ACTIVOS: ${fmt(saldo1)}`);
  console.log(`Saldo con aportes TODOS:   ${fmt(saldo2)}`);
  console.log(`Usuario espera:            $18.629.231`);

  db.close();
}
main().catch(e => { console.error('ERROR:', e.message); db.close(); });
