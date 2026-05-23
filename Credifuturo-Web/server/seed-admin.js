/**
 * seed-admin.js
 * Creates or updates the admin@credifuturo.com account.
 * Run once: node seed-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const Client = require('./models/Client');
const sequelize = require('./config/database');

const ADMIN = {
    email: 'admin@credifuturo.com',
    password: 'Admin2026!',          // ← change after first login
    name: 'Administrador',
    surname1: 'Credifuturo',
    cedula: 'ADMIN-001',           // unique dummy cedula for the admin account
    customerId: 'ADMIN-001',
    role: 'admin',
    estatus: 'Activo',
};

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ DB connected');

        const hashed = await bcrypt.hash(ADMIN.password, 10);

        const [user, created] = await Client.findOrCreate({
            where: { email: ADMIN.email },
            defaults: { ...ADMIN, password: hashed }
        });

        if (!created) {
            // Update password & role in case they drifted
            await user.update({ password: hashed, role: 'admin', estatus: 'Activo' });
            console.log('🔄 Admin user updated (password reset + role=admin)');
        } else {
            console.log('🆕 Admin user CREATED');
        }

        console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Usuario admin listo para usar:
  📧 Email:    ${ADMIN.email}
  🔑 Password: ${ADMIN.password}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
})();
