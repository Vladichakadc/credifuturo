const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Propuesta = sequelize.define('Propuesta', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    titulo: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { len: [5, 200] }
    },
    descripcion: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: { len: [10, 2000] }
    },
    categoria: {
        type: DataTypes.ENUM('Ahorro', 'Préstamos', 'Eventos', 'Tecnología', 'Otro'),
        allowNull: false,
        defaultValue: 'Otro'
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: true, // null si fue el admin
    },
    autorNombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        defaultValue: 'Anónimo'
    },
    estado: {
        type: DataTypes.ENUM('pendiente', 'en_revision', 'aprobada', 'rechazada'),
        allowNull: false,
        defaultValue: 'pendiente'
    },
    respuestaAdmin: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    votos: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    anonima: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'Propuestas',
    timestamps: true
});

module.exports = Propuesta;
