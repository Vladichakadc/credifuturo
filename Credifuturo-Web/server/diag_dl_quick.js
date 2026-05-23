const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:/Credifuturo/Credifuturo-Web/database.sqlite', sqlite3.OPEN_READONLY);
db.all("SELECT estado, COUNT(*) as c, SUM(valorPrestado) as sp, SUM(valor_prestado) as sv FROM DisbursedLoans GROUP BY estado", (e, r) => {
  if (e) { console.error('ERROR:', e.message); } else { console.log('DisbursedLoans agrupado:', JSON.stringify(r, null, 2)); }
  db.close();
});
