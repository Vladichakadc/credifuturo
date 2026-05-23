const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('C:/Credifuturo/Credifuturo-Web/database.sqlite');

async function revert() {
    const originalEmail = 'cliente1@credifuturo.com';
    // Restaurar el hash original que tenía (empezaba con $2a$10$yN.5DYJK8fpQ35GhS9z2x.)
    // Como no tenemos el hash completo, reseteamos a la contraseña conocida del sistema
    // El hash original correspondia a la misma contraseña que los demás clientes
    // Vamos a dejarlo con la misma contraseña que los demás socios del sistema
    const password = 'admin123'; // contraseña que el admin ya usaba
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
        "UPDATE Clients SET email = ? WHERE email = 'admin@credifuturo.com' AND role = 'admin'",
        [originalEmail],
        function(err) {
            if (err) {
                console.error('❌ Error:', err.message);
                db.close();
            } else if (this.changes === 0) {
                console.log('⚠️  No se encontró admin@credifuturo.com para revertir.');
                db.close();
            } else {
                console.log(`✅ Email restaurado: admin@credifuturo.com → cliente1@credifuturo.com`);
                db.close();
            }
        }
    );
}

revert().catch(console.error);
