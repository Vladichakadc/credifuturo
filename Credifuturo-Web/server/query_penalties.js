const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/Credifuturo/Credifuturo-Web/database.sqlite');

db.all("SELECT id, status, amount, diasPenalizacion FROM Savings WHERE status = 'Descuento Total Anual Penalizacion'", [], (err, rows) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('Registros encontrados:', rows.length);
        if (rows.length > 0) {
            console.log(JSON.stringify(rows.slice(0, 5), null, 2));
        }
    }
    db.close();
});
