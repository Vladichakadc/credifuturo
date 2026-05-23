const sequelize = require('./config/database');
const Client = require('./models/Client');

async function verify() {
    try {
        await sequelize.authenticate();
        console.log('DB Connected.');

        const count = await Client.count();
        console.log(`Total Clients: ${count}`);

        if (count > 0) {
            // Find a real imported client, excluding admin
            const sample = await Client.findOne({ where: { role: 'user' } });

            if (sample) {
                console.log('Sample Client Data (Real User):');
                console.log('Name:', sample.name);
                console.log('Surname1:', sample.surname1);
                console.log('Surname2:', sample.surname2);
                console.log('City:', sample.ciudad);
                console.log('Status:', sample.estatus);
                console.log('EntryDate:', sample.fechaIngreso);
            } else {
                console.log('No user role clients found.');
            }
        } else {
            console.log('No clients found in DB.');
        }

    } catch (err) {
        console.error('Verification Error:', err);
    }
}

verify();
