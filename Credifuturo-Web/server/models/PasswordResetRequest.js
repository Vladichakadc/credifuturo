const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PasswordResetRequest = sequelize.define('PasswordResetRequest', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    cedula: {
        type: DataTypes.STRING,
        allowNull: true
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'resolved', 'rejected'),
        defaultValue: 'pending',
        allowNull: false
    }
}, {
    tableName: 'PasswordResetRequests',
    timestamps: true
});

module.exports = PasswordResetRequest;
