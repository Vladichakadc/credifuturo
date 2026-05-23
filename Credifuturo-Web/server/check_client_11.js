const sequelize = require('./config/database');
const Client = require('./models/Client');

async function checkClient11() {
    try {
        await sequelize.authenticate();
        const client = await Client.findOne({ where: { customerId: '11' } });
        if (client) {
            console.log(`Client 11: Name=${client.name}, FechaBaja=${client.fechaBaja}`);
        } else {
            console.log('Client 11 not found');
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
}

checkClient11();
