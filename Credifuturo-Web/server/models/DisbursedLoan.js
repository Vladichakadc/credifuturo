const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Client = require('./Client');

const DisbursedLoan = sequelize.define('DisbursedLoan', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    // 1. Id_VM - Consecutivo (SOL##)
    idVm: {
        type: DataTypes.STRING,
        // unique: true, // No soportado en SQLite ALTER TABLE, validado en application logic
        allowNull: true, // Permitimos null para registros legacy
        field: 'id_vm'
    },
    // 2. Customer_id (Foreign Key)
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'client_id',
        references: {
            model: Client,
            key: 'id'
        }
    },
    // 3-4. Nombre y Apellido se obtienen de la relación con Client (no se duplican)

    // 5. Estado
    estado: {
        type: DataTypes.ENUM('Pendiente', 'Activo', 'Cancelado', 'Desembolsado', 'Vigente'),
        allowNull: false,
        defaultValue: 'Pendiente'
    },
    // 6. Fecha Prestamo
    fechaPrestamo: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'fecha_prestamo'
    },
    // 7. Mes Desembolso (Calculado automáticamente)
    mesDesembolso: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'mes_desembolso'
    },
    // 8. Año Desembolso (Calculado automáticamente)
    anioDesembolso: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'anio_desembolso'
    },
    // 9. Valor Prestado
    valorPrestado: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'valor_prestado',
        validate: { min: 0 }
    },
    // 10. # Cuotas Prestamo
    cuotas: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    // 11. Interes Mensual (almacenado como decimal: 1.5% = 0.015)
    interesMensual: {
        type: DataTypes.DECIMAL(5, 4), // Ajustado a 4 decimales para almacenar 0.0150
        allowNull: true,
        field: 'interes_mensual'
    },
    // 12. Dias de pago Max
    diasPagoMax: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'dias_pago_max'
    },
    // 13. Item_Quantity
    itemQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        field: 'item_quantity'
    },
    // 14. Banco desembolsado
    banco: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // 15. # Transaccion
    numeroTransaccion: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'numero_transaccion'
    },
    // 16. Cuenta de Ahorros
    cuentaAhorros: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'cuenta_ahorros'
    },
    // 17. Observaciones
    observaciones: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    // Campos legacy (mantener por compatibilidad con importación)
    orderId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'order_id'
    },
    socio: {
        type: DataTypes.STRING,
        allowNull: true // Ahora opcional, se obtiene de Client
    },
    fechaDesembolso: {
        type: DataTypes.DATEONLY,
        allowNull: true, // Ahora opcional (usamos fechaPrestamo como principal)
        field: 'fecha_desembolso'
    },
    monto: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true // Ahora opcional (usamos valorPrestado como principal)
    },
    cuenta: {
        type: DataTypes.STRING,
        allowNull: true // Alias de cuentaAhorros
    }
});

DisbursedLoan.belongsTo(Client, { foreignKey: 'clientId', allowNull: false });
Client.hasMany(DisbursedLoan, { foreignKey: 'clientId' });

module.exports = DisbursedLoan;
