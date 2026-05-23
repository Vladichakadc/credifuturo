const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🗑️ Limpiando registros de prueba...');

db.serialize(() => {
    // Eliminar registros con numeroTransaccion TEST*
    db.run("DELETE FROM Savings WHERE numeroTransaccion LIKE 'TEST%'", (err) => {
        if (err) {
            console.error('❌ Error:', err.message);
        } else {
            console.log('✅ Registros de prueba eliminados');
        }
        db.close();
    });
});
