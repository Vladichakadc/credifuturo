const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Última actividad registrada de cada usuario autenticado. Una fila por socio,
 * actualizada al vuelo desde el middleware de autenticación.
 *
 * Es lo que permite que "Registros de Acceso" diga cuánto lleva conectado un
 * socio y quién está en línea ahora. Antes vivía solo en un Map en memoria, de
 * modo que un reinicio del contenedor —o un despliegue— dejaba a todo el mundo
 * como si nunca hubiera entrado: la columna de duración salía vacía para todas
 * las sesiones anteriores al arranque.
 *
 * La escritura va limitada (ver `sessionActivity.js`): un socio navegando genera
 * decenas de peticiones por minuto y ninguna de ellas justifica un INSERT. El
 * valor en memoria sigue siendo el que se lee en caliente; la tabla es la copia
 * que sobrevive al reinicio.
 */
const SessionActivity = sequelize.define('SessionActivity', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clientId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'client_id' },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false, field: 'last_seen_at' },
}, {
    tableName: 'SessionActivities',
    timestamps: true,
});

module.exports = SessionActivity;
