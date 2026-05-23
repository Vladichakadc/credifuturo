const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database actual que usa el servidor
const dbPath = path.join(__dirname, 'database.sqlite');
console.log('Migrando base de datos:', dbPath);

const db = new sqlite3.Database(dbPath);

console.log('🔄 Agregando columnas faltantes a tabla Savings...');

db.serialize(() => {
    // Verificar si las columnas ya existen
    db.all("PRAGMA table_info(Savings)", [], (err, columns) => {
        if (err) {
            console.error('Error verificando columnas:', err);
            db.close();
            return;
        }

        const columnNames = columns.map(c => c.name);
        const missingColumns = [];

        if (!columnNames.includes('valorAPenalizar')) {
            missingColumns.push({ name: 'valorAPenalizar', type: 'REAL' });
        }
        if (!columnNames.includes('mesAbonado')) {
            missingColumns.push({ name: 'mesAbonado', type: 'VARCHAR(255)' });
        }
        if (!columnNames.includes('anioAbonado')) {
            missingColumns.push({ name: 'anioAbonado', type: 'INTEGER' });
        }
        if (!columnNames.includes('observaciones')) {
            missingColumns.push({ name: 'observaciones', type: 'TEXT' });
        }

        if (missingColumns.length === 0) {
            console.log('✅ Todas las columnas ya existen en la tabla Savings');
            db.close();
            return;
        }

        console.log(`📝 Agregando ${missingColumns.length} columnas...`);

        let completed = 0;
        missingColumns.forEach(col => {
            const sql = `ALTER TABLE Savings ADD COLUMN ${col.name} ${col.type}`;
            db.run(sql, (err) => {
                if (err) {
                    console.error(`❌ Error agregando ${col.name}:`, err.message);
                } else {
                    console.log(`✅ Columna ${col.name} agregada correctamente`);
                }
                completed++;
                if (completed === missingColumns.length) {
                    console.log('\n✅ Migración completada');
                    db.close();
                }
            });
        });
    });
});
