const Sequelize = require('sequelize');
const sequelize = require('../config/database');

const Client = require('./Client');
const Saving = require('./Saving');
const Loan = require('./Loan');
const DisbursedLoan = require('./DisbursedLoan');
const LoanPayment = require('./LoanPayment');
const Soporte = require('./Soporte');
const Propuesta = require('./Propuesta');
const VotoPropuesta = require('./VotoPropuesta');

// Associations for LoanPayment and DisbursedLoan via idVm (SOL##)
LoanPayment.belongsTo(DisbursedLoan, { foreignKey: 'idVm', targetKey: 'idVm', as: 'disbursedLoan' });
DisbursedLoan.hasMany(LoanPayment, { foreignKey: 'idVm', sourceKey: 'idVm', as: 'payments' });

// Associations for Propuestas
Propuesta.belongsTo(Client, { foreignKey: 'clientId', as: 'autor' });
Client.hasMany(Propuesta, { foreignKey: 'clientId', as: 'propuestas' });

VotoPropuesta.belongsTo(Propuesta, { foreignKey: 'propuestaId', as: 'propuesta' });
Propuesta.hasMany(VotoPropuesta, { foreignKey: 'propuestaId', as: 'votosDetalle' });

VotoPropuesta.belongsTo(Client, { foreignKey: 'clientId', as: 'votante' });
Client.hasMany(VotoPropuesta, { foreignKey: 'clientId', as: 'votosEmitidos' });

const db = {
    Client,
    Saving,
    Loan,
    DisbursedLoan,
    LoanPayment,
    Soporte,
    Propuesta,
    VotoPropuesta,
    sequelize,
    Sequelize
};

module.exports = db;
