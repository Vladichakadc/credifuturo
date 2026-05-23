const sequelize = require('./config/database');
const Client = require('./models/Client');
const bcrypt = require('bcryptjs');

console.log('Connecting to database...');

sequelize.sync().then(async () => {
    try {
        console.log('Hashing password...');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        console.log('Finding/Creating Admin...');
        const [admin, created] = await Client.findOrCreate({
            where: { email: 'admin@credifuturo.com' },
            defaults: {
                cedula: '0000000000',
                name: 'Administrador Principal',
                password: hashedPassword,
                role: 'admin'
            }
        });

        if (!created) {
            console.log('Admin exists, updating password...');
            admin.password = hashedPassword;
            admin.role = 'admin';
            await admin.save();
            console.log('Admin password RESET to: admin123');
        } else {
            console.log('Admin account CREATED with: admin123');
        }
    } catch (err) {
        console.error('Error resetting admin:', err);
    }
}).catch(err => {
    console.error('Database connection failed:', err);
}).finally(() => {
    console.log('Done.');
    process.exit();
});
