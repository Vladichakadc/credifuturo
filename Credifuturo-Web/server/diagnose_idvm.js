const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
console.log('🔍 DIAGNÓSTICO ID_VM - Base de datos:', dbPath);
console.log('═══════════════════════════════════════════════════\n');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Ver todos los externalId existentes
    console.log('📋 TODOS LOS ID_VM ACTUALES:');
    db.all("SELECT id, externalId, date, amount FROM Savings ORDER BY id DESC LIMIT 20", [], (err, rows) => {
        if (err) {
            console.error('❌ Error:', err);
            db.close();
            return;
        }

        console.table(rows);

        // Analizar patrones
        console.log('\n📊 ANÁLISIS DE PATRONES:\n');

        const aiPattern = rows.filter(r => r.externalId && r.externalId.startsWith('AI'));
        const numericPattern = rows.filter(r => r.externalId && /^\d+$/.test(r.externalId));
        const nullPattern = rows.filter(r => !r.externalId);

        console.log(`- IDs con formato AI##: ${aiPattern.length}`);
        if (aiPattern.length > 0) {
            const aiNumbers = aiPattern.map(r => parseInt(r.externalId.replace('AI', '')));
            console.log(`  Rango: AI${Math.min(...aiNumbers)} - AI${Math.max(...aiNumbers)}`);
            console.log(`  Último AI: AI${Math.max(...aiNumbers)}`);
        }

        console.log(`- IDs numéricos puros: ${numericPattern.length}`);
        if (numericPattern.length > 0) {
            console.log(`  Valores: ${numericPattern.map(r => r.externalId).join(', ')}`);
        }

        console.log(`- IDs NULL: ${nullPattern.length}`);

        // Identificar el problema
        console.log('\n🔴 PROBLEMA DETECTADO:');
        if (numericPattern.length > 0) {
            console.log(`  Hay ${numericPattern.length} registro(s) con ID numérico en vez de formato AI##`);
            console.log(`  Estos registros están rompiendo el consecutivo`);
            numericPattern.forEach(r => {
                console.log(`    - ID ${r.id}: externalId="${r.externalId}", fecha=${r.date}, monto=$${r.amount}`);
            });
        }

        db.close();
    });
});
