const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Client = require('./Client');
const LoanRequest = require('./LoanRequest');

// Voto individual de un miembro de la Junta Administrativa (gerente, subgerente,
// tesorera) sobre una solicitud de préstamo. Un préstamo solo puede desembolsarse
// cuando los 3 miembros hayan votado y los 3 hayan aprobado (ver PUT
// /loan-requests/:id/vote en admin.js, que calcula el estado agregado).
const LoanBoardVote = sequelize.define('LoanBoardVote', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    loanRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: LoanRequest, key: 'id' }
    },
    voterClientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: Client, key: 'id' }
    },
    decision: {
        type: DataTypes.ENUM('approved', 'rejected'),
        allowNull: false
    },
    note: { type: DataTypes.TEXT, allowNull: true }
}, {
    tableName: 'LoanBoardVotes',
    timestamps: true,
    indexes: [{ unique: true, fields: ['loanRequestId', 'voterClientId'] }]
});

LoanBoardVote.belongsTo(LoanRequest, { foreignKey: 'loanRequestId' });
LoanRequest.hasMany(LoanBoardVote, { as: 'BoardVotes', foreignKey: 'loanRequestId' });
LoanBoardVote.belongsTo(Client, { as: 'Voter', foreignKey: 'voterClientId' });

module.exports = LoanBoardVote;
