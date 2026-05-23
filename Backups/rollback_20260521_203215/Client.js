const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Client = sequelize.define('Client', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    customerId: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
    },
    cedula: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    surname1: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'apellido1'
    },
    surname2: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'apellido2'
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    role: {
        type: DataTypes.ENUM('admin', 'user'),
        defaultValue: 'user',
    },
    genero: { type: DataTypes.STRING },
    pais: { type: DataTypes.STRING },
    ciudad: { type: DataTypes.STRING },
    tipoCliente: { type: DataTypes.STRING },
    socioFundador: { type: DataTypes.STRING },
    referido: { type: DataTypes.STRING },
    cargo: { type: DataTypes.STRING },
    fechaIngreso: { type: DataTypes.DATEONLY },
    fechaBaja: { type: DataTypes.DATEONLY },
    estatus: { type: DataTypes.STRING }
});

module.exports = Client;
