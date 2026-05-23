const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('C:/Credifuturo/Credifuturo-Web/database.sqlite');

async function createAdminUser() {
    const email = 'admin@credifuturo.com';
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Verificar si ya existe
    db.get("SELECT id, email FROM Clients WHERE email = ?", [email], (err, row) => {
        if (err) { console.error('Error buscando usuario:', err); db.close(); return; }

        if (row) {
            // Ya existe — solo actualizar la contraseña y asegurar rol admin
            db.run(
                "UPDATE Clients SET password = ?, role = 'admin', estatus = 'Activo' WHERE email = ?",
                [hashedPassword, email],
                function(err2) {
                    if (err2) console.error('Error actualizando:', err2);
                    else console.log(`✅ Usuario admin@credifuturo.com ACTUALIZADO (id=${row.id}), contraseña = admin123`);
                    db.close();
                }
            );
        } else {
            // No existe — crear nuevo registro admin
            db.run(
                `INSERT INTO Clients (name, surname1, surname2, cedula, email, password, role, estatus, customerId)
                 VALUES ('Administrador', 'Credifuturo', '', '0000000000', ?, ?, 'admin', 'Activo', 'ADM001')`,
                [email, hashedPassword],
                function(err2) {
                    if (err2) console.error('Error creando usuario:', err2);
                    else console.log(`✅ Usuario admin@credifuturo.com CREADO (id=${this.lastID}), contraseña = admin123`);
                    db.close();
                }
            );
        }
    });
}

createAdminUser().catch(console.error);
