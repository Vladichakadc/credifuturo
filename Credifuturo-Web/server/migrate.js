const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
    db.run('PRAGMA foreign_keys=off;');
    db.run('BEGIN TRANSACTION;');

    console.log("Creating Soportes_new...");
    db.run(`CREATE TABLE IF NOT EXISTS Soportes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        savingId INTEGER REFERENCES Savings(id) ON DELETE SET NULL ON UPDATE CASCADE,
        paymentId INTEGER REFERENCES LoanPayments(id) ON DELETE SET NULL ON UPDATE CASCADE,
        originalName VARCHAR(255) NOT NULL,
        mimeType VARCHAR(255) NOT NULL,
        data BLOB NOT NULL,
        uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log("Copying data to Soportes_new...");
    db.run(`INSERT INTO Soportes_new (id, savingId, originalName, mimeType, data, uploadedAt) 
            SELECT id, savingId, originalName, mimeType, data, uploadedAt FROM Soportes`);

    console.log("Dropping old Soportes table...");
    db.run(`DROP TABLE Soportes`);

    console.log("Replacing tables...");
    db.run(`ALTER TABLE Soportes_new RENAME TO Soportes`);

    db.run('COMMIT', (err) => {
        if (err) {
            console.error("Migration failed:", err);
        } else {
            console.log("Migration complete!");
        }
    });

    db.run('PRAGMA foreign_keys=on;');
});

db.close();
