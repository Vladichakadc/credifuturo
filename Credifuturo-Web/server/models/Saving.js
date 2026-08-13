const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Client = require('./Client');

const Saving = sequelize.define('Saving', {
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
        // Sin `min: 0`: un importe negativo es un valor legítimo del dominio.
        // La tabla no guarda solo abonos — también las devoluciones de ahorros,
        // los descuentos anuales por mora y las distribuciones de intereses,
        // que salen del saldo y por eso van en negativo. De hecho ya existen
        // filas así, cargadas por importación, que esta validación impedía
        // volver a crear o corregir desde la aplicación.
        //
        // La regla que sí importa —que un ABONO del socio no sea negativo— vive
        // en las rutas POST/PUT /savings, que son las que conocen el estado del
        // movimiento y pueden distinguir un abono de un movimiento del fondo.
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    type: {
        type: DataTypes.ENUM('Mensual', 'Aporte Inicial'),
        defaultValue: 'Mensual',
    },
    banco: { type: DataTypes.STRING },
    numeroTransaccion: { type: DataTypes.STRING },
    origen: { type: DataTypes.STRING },
    penalizacion: { type: DataTypes.ENUM('SI', 'NO'), defaultValue: 'NO' },
    diasPenalizacion: { type: DataTypes.INTEGER },
    valorAhorrado: { type: DataTypes.DECIMAL(10, 2) },
    valorAPenalizar: { type: DataTypes.DECIMAL(10, 2) },
    mesAbonado: { type: DataTypes.INTEGER }, // Número 1-12
    anioAbonado: { type: DataTypes.INTEGER },
    year: { type: DataTypes.INTEGER },
    month: { type: DataTypes.STRING },
    monthInt: { type: DataTypes.INTEGER },
    externalId: {
        type: DataTypes.STRING,
        unique: true
    },
    status: { type: DataTypes.STRING },
    itemQuantity: { type: DataTypes.INTEGER },
    observaciones: { type: DataTypes.TEXT }
});

Saving.belongsTo(Client, { foreignKey: 'clientId' });
Client.hasMany(Saving, { foreignKey: 'clientId' });

module.exports = Saving;
