const Client = require('./models/Client');
const Saving = require('./models/Saving');
const Loan = require('./models/Loan');
const DisbursedLoan = require('./models/DisbursedLoan');
const LoanPayment = require('./models/LoanPayment');
const sequelize = require('./config/database');

async function audit() {
    try {
        await sequelize.authenticate();
        console.log('--- DATABASE STATUS ---');

        const counts = {
            Clients: await Client.count(),
            Savings: await Saving.count(),
            Loans: await Loan.count(),
            DisbursedLoans: await DisbursedLoan.count(),
            LoanPayments: await LoanPayment.count()
        };

        console.log(JSON.stringify(counts, null, 2));

        if (counts.Clients > 0) {
            const sample = await Client.findOne();
            console.log('Sample Client:', JSON.stringify(sample, null, 2));
        }

        if (counts.Savings > 0) {
            const sample = await Saving.findOne({ include: Client });
            console.log('Sample Saving (incl Client):', sample.Client ? 'OK' : 'CLIENT MISSING');
        }

        if (counts.LoanPayments > 0) {
            const sample = await LoanPayment.findOne({ include: Client });
            console.log('Sample Payment (incl Client):', sample.Client ? 'OK' : 'CLIENT MISSING');
        }

    } catch (err) {
        console.error('Audit Error:', err);
    } finally {
        process.exit();
    }
}

audit();
