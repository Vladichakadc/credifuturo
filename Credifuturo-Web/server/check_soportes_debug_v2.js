const Saving = require('./models/Saving');
const Soporte = require('./models/Soporte');
const Client = require('./models/Client');
const LoanPayment = require('./models/LoanPayment');

async function checkSoportes() {
    try {
        console.log('--- DB Check ---');
        const totalSavings = await Saving.count();
        const totalPayments = await LoanPayment.count();
        const totalSoportes = await Soporte.count();

        console.log(`Totals -> Savings: ${totalSavings}, Payments: ${totalPayments}, Soportes: ${totalSoportes}`);

        const soportes = await Soporte.findAll({
            limit: 20
        });

        if (soportes.length === 0) {
            console.log('No support records found in Soportes table.');
        }

        soportes.forEach(s => {
            console.log(`Soporte ID: ${s.id}, Name: ${s.originalName}, savingId: ${s.savingId}, paymentId: ${s.paymentId}`);
        });

        // Check if there are ANY savings with a linked soporte
        const savingsWithSoporte = await Saving.findAll({
            include: [{ model: Soporte, required: true }]
        });
        console.log(`Savings found with linked Soporte: ${savingsWithSoporte.length}`);
        
        // Let's look at one saving that SHOULD HAVE a soporte (if any)
        if (savingsWithSoporte.length > 0) {
            const first = savingsWithSoporte[0].toJSON();
            console.log('Example Saving with Soporte raw JSON keys:', Object.keys(first));
            if (first.Soporte) console.log('Found Soporte key (Uppercase)');
            if (first.soporte) console.log('Found soporte key (Lowercase)');
        }

    } catch (err) {
        console.error('Error during check:', err);
    } finally {
        process.exit();
    }
}

checkSoportes();
