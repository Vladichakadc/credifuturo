const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Foto mensual de los INSUMOS del score crediticio de cada socio.
// No se guarda el score calculado: el cliente lo recalcula con calcScore()
// (client/src/utils/loanCapacity.js), que sigue siendo la fuente única de la
// fórmula. Así un cambio en la fórmula re-puntúa también el historial.
const ScoreSnapshot = sequelize.define('ScoreSnapshot', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    anio: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    mes: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    // JSON con los campos que consume calcScore (ahorroTotal, deuda, mora, etc.)
    datos: {
        type: DataTypes.TEXT,
        allowNull: false
    }
}, {
    tableName: 'ScoreSnapshots',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['clientId', 'anio', 'mes'] }
    ]
});

module.exports = ScoreSnapshot;
