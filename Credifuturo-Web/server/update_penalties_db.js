const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/Credifuturo/Credifuturo-Web/database.sqlite');

db.all("SELECT id, amount FROM Savings WHERE status = 'Descuento Total Anual Penalizacion'", [], (err, rows) => {
    if (err) {
        console.error('Error:', err);
        db.close();
        return;
    }

    console.log(`Encontrados ${rows.length} registros para actualizar.`);

    let updatedCount = 0;
    if (rows.length === 0) {
        db.close();
        return;
    }

    rows.forEach(row => {
        const days = Math.abs(Math.round(row.amount / 1000));
        db.run("UPDATE Savings SET diasPenalizacion = ? WHERE id = ?", [days, row.id], (err2) => {
            if (err2) {
                console.error(`Error actualizando ID ${row.id}:`, err2);
            } else {
                updatedCount++;
                console.log(`ID ${row.id} actualizado: ${days} días (monto: ${row.amount})`);
            }

            if (updatedCount === rows.length) {
                console.log('Actualización completada.');
                db.close();
            }
        });
    });
});
