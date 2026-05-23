const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('C:/Credifuturo/Credifuturo-Web/database.sqlite');

async function updateAdminEmail() {
    const newEmail = 'admin@credifuturo.com';
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    // El admin actual es cliente1@credifuturo.com (id=68, role=admin)
    db.run(
        "UPDATE Clients SET email = ?, password = ? WHERE email = 'cliente1@credifuturo.com' AND role = 'admin'",
        [newEmail, hashedPassword],
        function(err) {
            if (err) {
                console.error('❌ Error:', err.message);
            } else if (this.changes === 0) {
                console.log('⚠️  No se encontró el usuario admin para actualizar.');
            } else {
                console.log(`✅ Email actualizado: cliente1@credifuturo.com → admin@credifuturo.com`);
                console.log(`✅ Contraseña reseteada a: admin123`);
            }
            db.close();
        }
    );
}

updateAdminEmail().catch(console.error);
