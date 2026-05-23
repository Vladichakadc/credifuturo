const Client = require('./models/Client');
const sequelize = require('./config/database');

async function checkClients() {
    try {
        const clients = await Client.findAll({ limit: 5 });
        console.log(JSON.stringify(clients, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sequelize.close();
    }
}

checkClients();
