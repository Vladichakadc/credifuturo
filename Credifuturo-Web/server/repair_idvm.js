const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
console.log('🔧 REPARACIÓN ID_VM - Base de datos:', dbPath);
console.log('═══════════════════════════════════════════════════\n');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Identificar registros con ID numérico
    db.all("SELECT id, externalId, date, amount FROM Savings WHERE externalId GLOB '[0-9]*' AND externalId NOT LIKE 'AI%'", [], (err, badRecords) => {
        if (err) {
            console.error('❌ Error:', err);
            db.close();
            return;
        }

        if (badRecords.length === 0) {
            console.log('✅ No hay registros con ID numérico incorrecto');
            db.close();
            return;
        }

        console.log(`🔴 Encontrados ${badRecords.length} registro(s) con ID numérico:\n`);
        console.table(badRecords);

        // Obtener el último AI## correcto
        db.get("SELECT externalId FROM Savings WHERE externalId LIKE 'AI%' ORDER BY CAST(SUBSTR(externalId, 3) AS INTEGER) DESC LIMIT 1", [], (err, lastAI) => {
            if (err) {
                console.error('❌ Error obteniendo último AI:', err);
                db.close();
                return;
            }

            let nextAINumber = 1;
            if (lastAI && lastAI.externalId) {
                const match = lastAI.externalId.match(/^AI(\d+)$/);
                if (match) {
                    nextAINumber = parseInt(match[1]) + 1;
                }
                console.log(`\n📊 Último ID correcto en BD: ${lastAI.externalId}`);
            }

            console.log(`📌 Próximo ID a asignar: AI${nextAINumber}\n`);

            // Corregir cada registro incorrecto
            badRecords.forEach((record, index) => {
                const newExternalId = `AI${nextAINumber + index}`;
                console.log(`🔄 Corrigiendo registro ID ${record.id}:`);
                console.log(`   Antes: externalId="${record.externalId}"`);
                console.log(`   Después: externalId="${newExternalId}"`);

                db.run(
                    "UPDATE Savings SET externalId = ? WHERE id = ?",
                    [newExternalId, record.id],
                    function (err) {
                        if (err) {
                            console.error(`   ❌ Error actualizando ID ${record.id}:`, err.message);
                        } else {
                            console.log(`   ✅ Actualizado exitosamente\n`);
                        }

                        // Si es el último registro, cerrar DB
                        if (index === badRecords.length - 1) {
                            console.log('═══════════════════════════════════════════════════');
                            console.log('✅ REPARACIÓN COMPLETADA');
                            console.log(`   Total registros corregidos: ${badRecords.length}`);
                            console.log(`   Nuevos IDs asignados: AI${nextAINumber} - AI${nextAINumber + badRecords.length - 1}`);
                            console.log('═══════════════════════════════════════════════════\n');
                            db.close();
                        }
                    }
                );
            });
        });
    });
});
