const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Registro permanente de los eventos de seguridad del fondo: inicios de sesión,
 * cambios y restablecimientos de contraseña, intentos fallidos y alertas de
 * fuerza bruta. Es la fuente de la pantalla "Registros de Acceso" y de la de
 * eventos de ataque.
 *
 * Existe porque el logger escribía únicamente a `logs/security.log`, dentro del
 * sistema de archivos del contenedor. En Railway ese disco es efímero: cada
 * despliegue y cada reinicio lo dejan en cero, así que la auditoría de acceso
 * se perdía entera con una frecuencia de días. El volumen persistente está
 * montado donde vive la base de datos, no donde vivían los logs.
 *
 * El archivo se sigue escribiendo —sirve para volcarlo a un agregador externo y
 * como respaldo si la escritura en base falla—, pero la lectura sale de aquí.
 *
 * Los campos que las pantallas leen por nombre tienen columna propia; el resto
 * del detalle de cada evento va en `extra` como JSON, que es lo que permite
 * añadir información a un evento sin migrar la tabla (sync() corre sin alter).
 */
const SecurityEvent = sequelize.define('SecurityEvent', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    // Momento del evento tal y como lo generó el logger (ISO, UTC). No se usa
    // createdAt: al importar el histórico del archivo hay que conservar la fecha
    // original, no la de la importación.
    ts: { type: DataTypes.DATE, allowNull: false },
    event: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: true, field: 'user_id' },
    targetClientId: { type: DataTypes.INTEGER, allowNull: true, field: 'target_client_id' },
    cedula: { type: DataTypes.STRING, allowNull: true },
    role: { type: DataTypes.STRING, allowNull: true },
    ip: { type: DataTypes.STRING, allowNull: true },
    mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: true, field: 'must_change_password' },
    extra: { type: DataTypes.TEXT, allowNull: true },
}, {
    tableName: 'SecurityEvents',
    timestamps: true,
});

module.exports = SecurityEvent;
