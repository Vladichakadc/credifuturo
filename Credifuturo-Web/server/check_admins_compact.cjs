const { Client } = require('./models');

async function checkAdmins() {
    try {
        const admins = await Client.findAll({
            where: { role: 'admin' },
            raw: true
        });
        console.log('Admins found:');
        admins.forEach(a => {
            console.log(`- ID:${a.id} CED:${a.cedula} NAME:${a.name} EMAIL:${a.email}`);
        });
    } catch (e) {
        console.error(e);
    }
}

checkAdmins();
