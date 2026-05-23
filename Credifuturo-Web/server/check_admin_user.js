const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/Credifuturo/Credifuturo-Web/database.sqlite');

// Ver tablas
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) { console.error('Error tablas:', err); return; }
    console.log('=== TABLAS ===');
    console.log(tables.map(t => t.name).join(', '));

    // Ver todos los usuarios en Clients
    db.all("SELECT id, name, email, role, estatus, substr(password,1,30) as pwd_preview FROM Clients LIMIT 20", [], (err2, rows) => {
        if (err2) console.error('Error Clients:', err2);
        else {
            console.log('\n=== USUARIOS (Clients) ===');
            console.log(JSON.stringify(rows, null, 2));
        }
        db.close();
    });
});
