const Client = require('./models/Client');
const Saving = require('./models/Saving');
const Loan = require('./models/Loan');
const DisbursedLoan = require('./models/DisbursedLoan');
const LoanPayment = require('./models/LoanPayment');
const sequelize = require('./config/database');

async function checkData() {
    try {
        await sequelize.authenticate();
        console.log('--- Database Audit ---');

        const clients = await Client.count();
        console.log(`Clients: ${clients}`);

        try {
            const savings = await Saving.findAll({ include: Client, limit: 1 });
            console.log(`Savings table accessible. Count: ${await Saving.count()}. Sample include client: ${savings.length > 0 ? (savings[0].Client ? 'OK' : 'MISSING CLIENT') : 'EMPTY'}`);
        } catch (e) { console.error('Error in Savings fetch:', e.message); }

        try {
            const loans = await Loan.findAll({ include: Client, limit: 1 });
            console.log(`Loans table accessible. Count: ${await Loan.count()}. Sample include client: ${loans.length > 0 ? (loans[0].Client ? 'OK' : 'MISSING CLIENT') : 'EMPTY'}`);
        } catch (e) { console.error('Error in Loans fetch:', e.message); }

        try {
            const disbursed = await DisbursedLoan.findAll({ include: Client, limit: 1 });
            console.log(`DisbursedLoans table accessible. Count: ${await DisbursedLoan.count()}. Sample include client: ${disbursed.length > 0 ? (disbursed[0].Client ? 'OK' : 'MISSING CLIENT') : 'EMPTY'}`);
        } catch (e) { console.error('Error in DisbursedLoan fetch:', e.message); }

        try {
            const payments = await LoanPayment.findAll({ include: [Client, DisbursedLoan], limit: 1 });
            console.log(`Payments table accessible. Count: ${await LoanPayment.count()}. Sample include items: ${payments.length > 0 ? 'OK' : 'EMPTY'}`);
        } catch (e) { console.error('Error in LoanPayment fetch:', e.message); }

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        process.exit();
    }
}

checkData();
