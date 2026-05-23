const sequelize = require('./config/database');
// Import all models to ensure relations are known
const Client = require('./models/Client');
const Saving = require('./models/Saving');
const DisbursedLoan = require('./models/DisbursedLoan');
const LoanPayment = require('./models/LoanPayment');

console.log('Force-syncing database...');
sequelize.sync({ force: true }).then(() => {
    console.log('Database schema rebuilt successfully.');
    process.exit(0);
}).catch(err => {
    console.error('Error rebuilding database:', err);
    process.exit(1);
});
