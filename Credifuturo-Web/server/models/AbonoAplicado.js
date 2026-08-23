const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Registro de cada reajuste de cronograma por abono extraordinario a capital.
 *
 * Existe por una razón concreta: el reajuste reescribe la deuda registrada de
 * un socio y en producción no hay forma de restaurar la base (los respaldos
 * son exportes .xlsx, no copias del .sqlite, y los endpoints de mantenimiento
 * no están montados). Guardar aquí el estado ANTERIOR de cada fila tocada
 * convierte una operación irreversible en una reversible, y es lo que hace
 * defendible que el barrido corra solo.
 *
 * No sirve como marca de idempotencia —de eso se encarga `abonosSinAplicar`,
 * que interroga las propias cifras—, sino como pista de auditoría y como
 * punto de retorno.
 */
const AbonoAplicado = sequelize.define('AbonoAplicado', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    idVm: { type: DataTypes.STRING, allowNull: false, field: 'id_vm' },
    clientId: { type: DataTypes.INTEGER, allowNull: true, field: 'client_id' },
    loanPaymentId: { type: DataTypes.INTEGER, allowNull: true, field: 'loan_payment_id' },
    excedente: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    politica: { type: DataTypes.STRING, allowNull: false },
    // De dónde vino: 'barrido' (automático), 'edicion' (guardar la cuota en la
    // UI) o 'manual' (el administrador lo pidió para un préstamo concreto).
    origen: { type: DataTypes.STRING, allowNull: false, defaultValue: 'barrido' },
    aplicadoPor: { type: DataTypes.STRING, allowNull: true, field: 'aplicado_por' },
    // JSON con el valor previo de cada columna de cada cuota modificada.
    estadoAnterior: { type: DataTypes.TEXT, allowNull: false, field: 'estado_anterior' },
    resumen: { type: DataTypes.TEXT, allowNull: true },
    revertidoEn: { type: DataTypes.DATE, allowNull: true, field: 'revertido_en' },
    revertidoPor: { type: DataTypes.STRING, allowNull: true, field: 'revertido_por' },
}, {
    tableName: 'AbonosAplicados',
    timestamps: true,
});

module.exports = AbonoAplicado;
