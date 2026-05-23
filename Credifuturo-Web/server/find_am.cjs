const { Saving, Client } = require('./models');

async function findAM361() {
    try {
        const saving = await Saving.findOne({ 
            where: { externalId: 'AM361' },
            include: [Client]
        });
        
        if (!saving) {
            console.log('Record AM361 not found.');
            return;
        }
        
        console.log('--- Record AM361 Found ---');
        console.log(`Technical ID: ${saving.id}`);
        console.log(`Client technical ID: ${saving.clientId}`);
        if (saving.Client) {
            console.log(`Client name: ${saving.Client.name}`);
            console.log(`Client customerId: ${saving.Client.customerId}`);
        }
        console.log(`Date: ${saving.date}`);
        console.log(`Amount: ${saving.amount}`);
        console.log(`MonthAbonado: ${saving.mesAbonado}`);
        console.log(`YearAbonado: ${saving.anioAbonado}`);
        console.log(`Penalty: ${saving.valorAPenalizar}`);
        console.log(`Type: ${saving.type}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

findAM361();
