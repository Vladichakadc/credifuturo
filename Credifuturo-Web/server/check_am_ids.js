const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking IDs in Savings table...');

db.serialize(() => {
    db.all("SELECT id, externalId FROM Savings WHERE externalId LIKE 'AM%' OR externalId LIKE 'AI%' ORDER BY id DESC LIMIT 20", [], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('Recent IDs:', rows);

        // Check for specific AM max
        db.get("SELECT externalId FROM Savings WHERE externalId LIKE 'AM%' ORDER BY length(externalId) DESC, externalId DESC LIMIT 1", [], (err, row) => {
            console.log('Max AM ID:', row);
        });
    });
});
