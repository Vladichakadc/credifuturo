const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Saving = require('./Saving');
const LoanPayment = require('./LoanPayment');

const Soporte = sequelize.define('Soporte', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    savingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: Saving,
            key: 'id'
        }
    },
    paymentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: LoanPayment,
            key: 'id'
        }
    },
    originalName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    mimeType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    data: {
        type: DataTypes.BLOB('long'),
        allowNull: false
    },
    uploadedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'Soportes',
    timestamps: false
});

Soporte.belongsTo(Saving, { foreignKey: 'savingId' });
Saving.hasOne(Soporte, { foreignKey: 'savingId' });

Soporte.belongsTo(LoanPayment, { foreignKey: 'paymentId' });
LoanPayment.hasOne(Soporte, { foreignKey: 'paymentId' });

module.exports = Soporte;
