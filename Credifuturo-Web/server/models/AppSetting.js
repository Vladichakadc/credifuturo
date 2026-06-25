const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AppSetting = sequelize.define('AppSetting', {
    key: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    value: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'AppSettings',
    timestamps: true
});

module.exports = AppSetting;
