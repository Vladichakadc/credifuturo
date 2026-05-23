const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database principal
const dbPath = path.join(__dirname, '..', 'database.sqlite');
console.log('🔧 Agregando constraint UNIQUE a externalId...');
console.log('Base de datos:', dbPath);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Verificar si ya existe el índice
    db.all("PRAGMA index_list(Savings)", [], (err, indexes) => {
        if (err) {
            console.error('❌ Error verificando índices:', err);
            db.close();
            return;
        }

        const uniqueExists = indexes.some(idx => idx.name.includes('externalId'));

        if (uniqueExists) {
            console.log('✅ El constraint UNIQUE en externalId ya existe');
            db.close();
            return;
        }

        // Crear índice UNIQUE
        const sql = 'CREATE UNIQUE INDEX idx_savings_externalId ON Savings(externalId)';
        db.run(sql, (err) => {
            if (err) {
                console.error('❌ Error creando índice UNIQUE:', err.message);
            } else {
                console.log('✅ Constraint UNIQUE agregado exitosamente a externalId');
                console.log('📌 Esto previene duplicados en Id_VM por concurrencia');
            }
            db.close();
        });
    });
});
