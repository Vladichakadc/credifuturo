const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Usar la ruta correcta a la base de datos real
const dbPath = path.join(__dirname, '..', '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Verificando registros en:', dbPath);

db.serialize(() => {
    db.all("SELECT count(*) as count FROM LoanPayments", (err, row) => {
        if (err) console.error('Error counting payments:', err);
        else console.log('TOTAL PAYMENTS:', row[0].count);
    });

    db.all("SELECT * FROM LoanPayments LIMIT 5", (err, rows) => {
        if (err) console.error('Error fetching payments:', err);
        else {
            console.log('SAMPLE PAYMENTS:', JSON.stringify(rows, null, 2));
        }
    });
});

db.close();
