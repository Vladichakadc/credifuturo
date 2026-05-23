const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (e) => { if (e) throw e; });

// Investigar filas con clientId NULL o problemas de NOT NULL
db.all(`SELECT id, id_ep, clientId, estado, estado_prestamo, saldo_inicial, fecha_pago_max, id_vm 
        FROM LoanPayments 
        WHERE clientId IS NULL OR clientId = 0
        LIMIT 20`, (e, rows) => {
    console.log('Filas con clientId NULL/0:', rows ? rows.length : 0);
    if (rows) rows.forEach(r => console.log(' ', JSON.stringify(r)));
    
    db.get('SELECT COUNT(*) as cnt FROM LoanPayments WHERE clientId IS NULL OR clientId = 0', (e2, r2) => {
        console.log('Total filas con clientId NULL/0:', r2 ? r2.cnt : 'error');
        
        // También verificar otros campos NOT NULL
        db.get('SELECT COUNT(*) as cnt FROM LoanPayments WHERE saldo_inicial IS NULL', (e3, r3) => {
            console.log('Filas con saldo_inicial NULL:', r3 ? r3.cnt : 'error');
            
            db.get('SELECT COUNT(*) as cnt FROM LoanPayments WHERE fecha_pago_max IS NULL', (e4, r4) => {
                console.log('Filas con fecha_pago_max NULL:', r4 ? r4.cnt : 'error');
                
                db.get('SELECT COUNT(*) as cnt FROM LoanPayments WHERE estado IS NULL', (e5, r5) => {
                    console.log('Filas con estado NULL:', r5 ? r5.cnt : 'error');
                    db.close();
                });
            });
        });
    });
});
