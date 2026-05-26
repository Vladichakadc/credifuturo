/**
 * Script de migración única:
 * Asigna la contraseña genérica "Coop2025" a todos los socios (role='user')
 * y activa mustChangePassword=true para forzar cambio en primer ingreso.
 *
 * Uso: node reset-all-passwords.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('./config/database');
const Client = require('./models/Client');

async function main() {
    await sequelize.authenticate();
    console.log('Conexión a la base de datos establecida.\n');

    const GENERIC_PASSWORD = 'Coop2025';
    const hashed = await bcrypt.hash(GENERIC_PASSWORD, 10);

    const socios = await Client.findAll({ where: { role: 'user' } });
    console.log(`Socios encontrados (role=user): ${socios.length}`);

    let updated = 0;
    for (const socio of socios) {
        await socio.update({ password: hashed, mustChangePassword: true });
        console.log(`  ✓ ${socio.name} ${socio.surname1 || ''} (${socio.cedula || socio.customerId})`);
        updated++;
    }

    console.log(`\nListo. ${updated} socios actualizados con contraseña genérica: ${GENERIC_PASSWORD}`);
    console.log('Todos deberán cambiar su contraseña en el primer ingreso.');
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
