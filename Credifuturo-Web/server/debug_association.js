const LoanPayment = require('./models/LoanPayment');
const Client = require('./models/Client');
// const DisbursedLoan = require('./models/DisbursedLoan'); // No lo uso

async function debugAssoc() {
    try {
        console.log('Probando LoanPayment.findAll({ include: [Client] })...');
        const payments = await LoanPayment.findAll({
            include: [Client],
            limit: 1
        });
        console.log('✅ Éxito. Registros encontrados:', payments.length);
        if (payments.length > 0) {
            console.log('Item 0 Client:', JSON.stringify(payments[0].Client, null, 2));
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

debugAssoc();
