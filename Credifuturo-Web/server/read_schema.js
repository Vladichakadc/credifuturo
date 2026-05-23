const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite', sqlite3.OPEN_READONLY, (err) => {
    if (err) return console.error(err.message);
    db.serialize(() => {
        db.all(`SELECT sql FROM sqlite_master WHERE name='Soportes'`, [], (err, rows) => {
            if (err) return console.error(err.message);
            console.log(rows);
        });
    });
    db.close();
});
