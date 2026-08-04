const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Client = require('./Client');
const DisbursedLoan = require('./DisbursedLoan');

const LoanRequest = sequelize.define('LoanRequest', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Client,
            key: 'id'
        }
    },
    // ── Lo que el socio pidió ──
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    installments: { type: DataTypes.INTEGER, allowNull: false },
    monthlyRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false }, // en %, ej. 1.4

    // ── Snapshot de la simulación que vio el socio ──
    firstInstallment: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    lastInstallment: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    totalInterest: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    totalToPay: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    estimatedEndDate: { type: DataTypes.DATEONLY, allowNull: true },

    // ── A dónde desembolsar (mismos nombres de campo que DisbursedLoan, para prellenado 1:1) ──
    banco: { type: DataTypes.STRING, allowNull: true },
    cuentaAhorros: { type: DataTypes.STRING, allowNull: true },
    observaciones: { type: DataTypes.TEXT, allowNull: true },

    // ── Foto del perfil del socio en el momento de pedir ──
    scoreAtRequest: { type: DataTypes.INTEGER, allowNull: true },
    availableCapacityAtRequest: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    requiresVote: { type: DataTypes.BOOLEAN, defaultValue: false },

    // ── Decisión del gerente ──
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'disbursed'),
        defaultValue: 'pending',
        allowNull: false
    },
    reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewNote: { type: DataTypes.TEXT, allowNull: true },
    disbursedLoanId: { type: DataTypes.INTEGER, allowNull: true }
}, {
    tableName: 'LoanRequests',
    timestamps: true
});

LoanRequest.belongsTo(Client, { as: 'Client', foreignKey: 'clientId' });
Client.hasMany(LoanRequest, { foreignKey: 'clientId' });
LoanRequest.belongsTo(Client, { as: 'Reviewer', foreignKey: 'reviewedBy' });
LoanRequest.belongsTo(DisbursedLoan, { as: 'DisbursedLoan', foreignKey: 'disbursedLoanId' });

module.exports = LoanRequest;
