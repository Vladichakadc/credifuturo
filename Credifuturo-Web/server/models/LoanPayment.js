const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Client = require('./Client');

/**
 * MODELO: LoanPayment (Estado de Préstamos)
 * 
 * Basado en las 22 columnas del Excel: 1-orders_table_estado_prestamos.xlsx
 * 
 * | #  | Columna Excel              | Campo DB                    | Tipo              | Requerido |
 * |----|----------------------------|-----------------------------|-------------------|-----------|
 * | 1  | Id_EP                      | externalId                  | STRING            | Sí (auto) |
 * | 2  | Customer_id                | clientId                    | INTEGER (FK)      | Sí        |
 * | 3  | Nombre                     | (desde Client)              | -                 | Auto      |
 * | 4  | Apellido                   | (desde Client)              | -                 | Auto      |
 * | 5  | Mes Desembolso             | mesDesembolso               | STRING            | No        |
 * | 6  | Saldo Inicial              | saldoInicial                | DECIMAL(12,2)     | Sí        |
 * | 7  | # Cuotas Prestamo          | cuotasPrestamo              | INTEGER           | Sí        |
 * | 8  | Interes Mensual            | interesMensual              | DECIMAL(5,4)      | Sí        |
 * | 9  | Valor Intereses amortizados| valorInteresesAmortizados   | DECIMAL(12,2)     | Auto      |
 * | 10 | Fecha de Pago Max          | fechaPagoMax                | DATEONLY          | Sí        |
 * | 11 | Mes de Pago                | mesPago                     | STRING            | Auto      |
 * | 12 | Valor Cuota Variable       | valorCuotaVariable          | DECIMAL(12,2)     | Auto      |
 * | 13 | Estado                     | estado                      | STRING            | Sí        |
 * | 14 | Valor Cuota Pago           | valorCuotaPago              | DECIMAL(12,2)     | Sí        |
 * | 15 | Saldo Final                | saldoFinal                  | DECIMAL(12,2)     | Auto      |
 * | 16 | Item_Quantity              | itemQuantity                | INTEGER           | Sí        |
 * | 17 | Banco desembolsado         | banco                       | STRING            | No        |
 * | 18 | # Transaccion              | numeroTransaccion           | STRING            | No        |
 * | 19 | Cuenta de Ahorros          | cuentaAhorros               | STRING            | No        |
 * | 20 | Observaciones              | observaciones               | TEXT              | No        |
 * | 21 | Id_VM                      | idVm                        | STRING            | Sí        |
 * | 22 | Estado Prestamo            | estadoPrestamo              | STRING            | No        |
 */
const LoanPayment = sequelize.define('LoanPayment', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    // 1. Id_EP - Consecutivo automático (P1, P2, P3...)
    externalId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'id_ep'
    },
    // 2. Customer_id (Foreign Key a Client)
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        // field: 'client_id', // COMENTADO: La tabla tiene 'clientId' (legacy), usamos ese.
        references: {
            model: Client,
            key: 'id'
        }
    },
    // 5. Mes Desembolso
    mesDesembolso: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'mes_desembolso' // Usamos la nueva columna snake_case
    },
    // 6. Saldo Inicial
    saldoInicial: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: 'saldo_inicial',
        validate: { min: 0 }
    },
    // 7. # Cuotas Prestamo
    cuotasPrestamo: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'cuotas_prestamo'
    },
    // 8. Interes Mensual (almacenado como decimal: 1.5% = 0.015)
    interesMensual: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        field: 'interes_mensual'
    },
    // 9. Valor Intereses amortizados (Calculado: saldoInicial * interesMensual)
    valorInteresesAmortizados: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: 'valor_intereses_amortizados'
    },
    // 10. Fecha de Pago Max
    fechaPagoMax: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'fecha_pago_max'
    },
    // 11. Mes de Pago (Calculado automáticamente desde fechaPagoMax)
    mesPago: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'mes_pago'
    },
    // 12. Valor Cuota Variable (Calculado: saldoInicial / cuotasRestantes + intereses)
    valorCuotaVariable: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: 'valor_cuota_variable'
    },
    // 13. Estado (Pago, Pendiente, Mora, Abono)
    estado: {
        type: DataTypes.ENUM('Pendiente', 'Pago', 'Mora', 'Abono'),
        allowNull: false,
        defaultValue: 'Pendiente'
    },
    // 14. Valor Cuota Pago (Lo que realmente pagó)
    valorCuotaPago: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: 'valor_cuota_pago',
        validate: { min: 0 }
    },
    // 15. Saldo Final (Calculado: saldoInicial - valorCuotaPago + intereses)
    saldoFinal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: 'saldo_final'
    },
    // 16. Item_Quantity
    itemQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        field: 'item_quantity'
    },
    // 17. Banco desembolsado
    banco: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // 18. # Transaccion
    numeroTransaccion: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'numero_transaccion'
    },
    // 19. Cuenta de Ahorros
    cuentaAhorros: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'cuenta_ahorros'
    },
    // 20. Observaciones
    observaciones: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    // 21. Id_VM (Referencia al préstamo desembolsado, ej: SOL1, SOL2)
    idVm: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'id_vm'
    },
    // 22. Estado Prestamo (Estado general del préstamo: Cancelado, Activo, etc.)
    estadoPrestamo: {
        type: DataTypes.ENUM('Pendiente', 'Activo', 'Cancelado', 'Vigente', 'Desembolsado'),
        allowNull: true,
        field: 'estado_prestamo'
    },

    // Campo legacy para compatibilidad con importación
    loanId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'loan_id'
    },

    // Indica que esta cuota fue cancelada por refinanciación (prepago sin interés).
    // Las cuotas con esPrepago=true tienen valorInteresesAmortizados=0 y se excluyen
    // de todos los cálculos de rentabilidad del fondo.
    esPrepago: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'es_prepago'
    }
});

LoanPayment.belongsTo(Client, { foreignKey: 'clientId' });
Client.hasMany(LoanPayment, { foreignKey: 'clientId' });

module.exports = LoanPayment;
