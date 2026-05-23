const { Client, Saving } = require('./models');

async function audit() {
    try {
        const jose = await Client.findOne({
            where: { name: 'Jose Antonio', surname1: 'Guerrero' }
        });

        if (!jose) {
            console.log("No se encontró a Jose Antonio Guerrero");
            return;
        }

        console.log(`ID Socio: ${jose.id}`);
        
        const savings = await Saving.findAll({
            where: { clientId: jose.id }
        });

        let totalValorAhorrado = 0;
        let totalAmount = 0;
        let totalInitialContributionAmount = 0;

        savings.forEach(s => {
            console.log(`- [${s.type}] ${s.externalId}: amount=${s.amount}, valorAhorrado=${s.valorAhorrado}`);
            totalValorAhorrado += parseFloat(s.valorAhorrado || 0);
            totalAmount += parseFloat(s.amount || 0);
            if (s.type === 'Aporte Inicial') {
                totalInitialContributionAmount += parseFloat(s.amount || 0);
            }
        });

        console.log("\n--- Totales ---");
        console.log(`Suma total de valorAhorrado (Ranking actual): ${totalValorAhorrado}`);
        console.log(`Suma total de amount: ${totalAmount}`);
        
        // Simulating SavingsSummaryPage.jsx logic
        const monthlySavingsRecords = savings.filter(s => s.type !== 'Aporte Inicial');
        const totalMonthlyNet = monthlySavingsRecords.reduce((acc, s) => acc + parseFloat(s.valorAhorrado || s.amount || 0), 0);
        const totalAhorradoGeneral = totalMonthlyNet + totalInitialContributionAmount;

        console.log(`Total Ahorrado General (Lógica Dashboard): ${totalAhorradoGeneral}`);
        
    } catch (err) {
        console.error(err);
    }
}

audit();
