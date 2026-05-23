const bcrypt = require('bcryptjs');
const { Client } = require('./models');
const sequelize = require('./config/database');

async function setPasswords() {
    try {
        console.log('Iniciando actualización de contraseñas...');
        await sequelize.authenticate();
        console.log('Conectado a la base de datos.');

        const hashedPassword = await bcrypt.hash('Cf@2026', 10);
        
        // Actualizar todos los usuarios con rol 'user'
        const result = await Client.update(
            { password: hashedPassword },
            { where: { role: 'user' } }
        );

        console.log(`✅ Contraseñas actualizadas exitosamente para ${result[0]} socios (role='user').`);
        
        // Verificación extra
        const users = await Client.findAll({ where: { role: 'user' }, attributes: ['id', 'email', 'name', 'estatus'] });
        console.log(`Total de socios verificados: ${users.length}`);

    } catch (error) {
        console.error('❌ Error al actualizar contraseñas:', error);
    } finally {
        await sequelize.close();
        console.log('Proceso finalizado.');
    }
}

setPasswords();
