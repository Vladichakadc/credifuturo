const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Usar la ruta correcta: ../database.sqlite desde server/
// (server está en Credifuturo-Web/server, DB e Credifuturo-Web/)
const dbPath = path.join(__dirname, '..', 'database.sqlite');
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
            console.log('SAMPLE PAYMENT:', JSON.stringify(rows[0], null, 2));
        }
    });

    // Verificar si tienen clientId NULL
    db.all("SELECT count(*) as count FROM LoanPayments WHERE clientId IS NULL", (err, row) => {
        if (err) console.error('Error checking null clients:', err);
        else console.log('PAYMENTS WITHOUT CLIENT:', row[0].count);
    });
});

db.close();
