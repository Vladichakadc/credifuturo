const sequelize = require('./config/database');
const Client = require('./models/Client');

async function checkData() {
    try {
        await sequelize.authenticate();
        const clients = await Client.findAll({ limit: 5 });
        console.log('Sample Clients Data:');
        clients.forEach(c => {
            console.log(`ID: ${c.customerId}, Name: ${c.name}, FechaBaja: ${c.fechaBaja}`);
        });
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
}

checkData();
