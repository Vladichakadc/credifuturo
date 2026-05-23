const { Client } = require('./models');

async function checkAdmins() {
    try {
        const admins = await Client.findAll({
            where: { role: 'admin' },
            raw: true
        });
        console.log('--- ADMINS FOUND ---');
        admins.forEach(a => {
            console.log(`ID: ${a.id}, Cedula: ${a.cedula}, Name: ${a.name}, Role: ${a.role}, Email: ${a.email}`);
        });
        console.log('--------------------');
        
        const vladimir = await Client.findOne({ where: { cedula: '14297227' }, raw: true });
        if (vladimir) {
            console.log('Vladimir detail:', { id: vladimir.id, cedula: vladimir.cedula, name: vladimir.name, role: vladimir.role });
        } else {
            console.log('Vladimir (14297227) not found.');
        }

    } catch (e) {
        console.error(e);
    }
}

checkAdmins();
