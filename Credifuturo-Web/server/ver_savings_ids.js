const Saving = require('./models/Saving');

async function ver() {
    const savings = await Saving.findAll({
        attributes: ['id', 'externalId'],
        order: [['id', 'DESC']],
        limit: 15
    });

    console.log('Últimos 15 IDs:');
    savings.forEach((s, i) => {
        console.log(`  ${i + 1}. DB ID: ${s.id} -> externalId: ${s.externalId || 'NULL'}`);
    });

    process.exit(0);
}

ver();
