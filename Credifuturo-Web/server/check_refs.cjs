const { Saving, Loan, LoanPayment, Client } = require('./models');

async function checkReferences() {
    try {
        const admin = await Client.findOne({ where: { cedula: '0000000000' } });
        if (!admin) {
            console.log('Admin not found in DB.');
            return;
        }
        const adminId = admin.id;
        console.log(`Checking references for Admin ID: ${adminId}`);

        const results = await Promise.all([
            Saving.count({ where: { clientId: adminId } }),
            Loan.count({ where: { clientId: adminId } }),
            LoanPayment.count({ where: { clientId: adminId } })
        ]);

        console.log(`Savings records: ${results[0]}`);
        console.log(`Loan requests: ${results[1]}`);
        console.log(`Loan payments: ${results[2]}`);

    } catch (e) {
        console.error(e);
    }
}

checkReferences();
