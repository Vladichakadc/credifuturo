const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Client = require('./Client');

const Loan = sequelize.define('Loan', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Client,
            key: 'id'
        }
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false, // disbursement date
    },
    status: {
        type: DataTypes.ENUM('Pending', 'Approved', 'Rejected', 'Paid'),
        defaultValue: 'Pending',
    },
    purpose: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Extended Fields
    disbursementYear: { type: DataTypes.INTEGER, allowNull: true },
    disbursementMonth: { type: DataTypes.STRING, allowNull: true },
    installments: { type: DataTypes.INTEGER, allowNull: true }, // # Cuotas
    interestRate: { type: DataTypes.DECIMAL(5, 4), allowNull: true }, // Interes Mensual
    maxPaymentDays: { type: DataTypes.INTEGER, allowNull: true },
    itemQuantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    bank: { type: DataTypes.STRING, allowNull: true },
    transactionId: { type: DataTypes.STRING, allowNull: true },
    savingsAccount: { type: DataTypes.STRING, allowNull: true },
    observations: { type: DataTypes.TEXT, allowNull: true },
});

// Relationship
Loan.belongsTo(Client, { foreignKey: 'clientId' });
Client.hasMany(Loan, { foreignKey: 'clientId' });

module.exports = Loan;
