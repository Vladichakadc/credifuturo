const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM LoanPayments WHERE id > 50 LIMIT 5", (err, rows) => {
    if (err) console.error(err);
    else console.log('IMPORTED SAMPLE:', JSON.stringify(rows, null, 2));
    db.close();
});
