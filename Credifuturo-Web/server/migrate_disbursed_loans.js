/**
 * Script de Migración Segura: Actualizar Tabla DisbursedLoans
 * Agrega solo las columnas faltantes sin constraints problemáticos
 */

const sequelize = require('./config/database');

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
    const queryInterface = sequelize.getQueryInterface();
    const tableDescription = await queryInterface.describeTable(tableName);

    if (!tableDescription[columnName]) {
        console.log(`   ➕ Agregando columna: ${columnName}`);
        await queryInterface.addColumn(tableName, columnName, columnDefinition);
    } else {
        console.log(`   ✓ Columna ya existe: ${columnName}`);
    }
}

async function migrateDisbursedLoans() {
    try {
        console.log('🔧 Iniciando migración segura de DisbursedLoans...\n');

        const { DataTypes } = require('sequelize');

        // Agregar columnas faltantes (sin UNIQUE, se manejará desde application logic)
        await addColumnIfNotExists('DisbursedLoans', 'id_vm', {
            type: DataTypes.STRING,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'client_id', {
            type: DataTypes.INTEGER,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'fecha_prestamo', {
            type: DataTypes.DATEONLY,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'mes_desembolso', {
            type: DataTypes.STRING,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'anio_desembolso', {
            type: DataTypes.INTEGER,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'valor_prestado', {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'interes_mensual', {
            type: DataTypes.DECIMAL(5, 4),
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'dias_pago_max', {
            type: DataTypes.INTEGER,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'item_quantity', {
            type: DataTypes.INTEGER,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'numero_transaccion', {
            type: DataTypes.STRING,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'cuenta_ahorros', {
            type: DataTypes.STRING,
            allowNull: true
        });

        await addColumnIfNotExists('DisbursedLoans', 'observaciones', {
            type: DataTypes.TEXT,
            allowNull: true
        });

        console.log('\n✅ Migración completada exitosamente.');
        console.log('📌 Nota: Constraint UNIQUE en idVm se validará desde application logic.');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error en la migración:', error.message);
        console.error(error);
        process.exit(1);
    }
}

migrateDisbursedLoans();
