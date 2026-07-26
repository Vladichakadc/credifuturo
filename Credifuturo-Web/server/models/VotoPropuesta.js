const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VotoPropuesta = sequelize.define('VotoPropuesta', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    propuestaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    tableName: 'VotosPropuesta',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['propuestaId', 'clientId'],
            name: 'unique_voto_por_socio'
        }
    ]
});

module.exports = VotoPropuesta;
