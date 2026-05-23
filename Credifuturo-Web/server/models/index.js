const Sequelize = require('sequelize');
const sequelize = require('../config/database');

const Client = require('./Client');
const Saving = require('./Saving');
const Loan = require('./Loan');
const DisbursedLoan = require('./DisbursedLoan');
const LoanPayment = require('./LoanPayment');
const Soporte = require('./Soporte');

// Associations for LoanPayment and DisbursedLoan via idVm (SOL##)
LoanPayment.belongsTo(DisbursedLoan, { foreignKey: 'idVm', targetKey: 'idVm', as: 'disbursedLoan' });
DisbursedLoan.hasMany(LoanPayment, { foreignKey: 'idVm', sourceKey: 'idVm', as: 'payments' });

const db = {
    Client,
    Saving,
    Loan,
    DisbursedLoan,
    LoanPayment,
    Soporte,
    sequelize,
    Sequelize
};

module.exports = db;
