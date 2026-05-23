const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3(dbPath);

console.log('🔄 Iniciando migración de tabla LoanPayments...');

// 22 columnas esperadas del modelo LoanPayment.js
const expectedColumns = [
    { name: 'id_ep', type: 'TEXT' }, // externalId
    { name: 'client_id', type: 'INTEGER NOT NULL REFERENCES Clients(id)' }, // clientId
    { name: 'mes_desembolso', type: 'TEXT' },
    { name: 'saldo_inicial', type: 'DECIMAL(12, 2)' },
    { name: 'cuotas_prestamo', type: 'INTEGER' },
    { name: 'interes_mensual', type: 'DECIMAL(5, 4)' },
    { name: 'valor_intereses_amortizados', type: 'DECIMAL(12, 2)' },
    { name: 'fecha_pago_max', type: 'DATE' },
    { name: 'mes_pago', type: 'TEXT' },
    { name: 'valor_cuota_variable', type: 'DECIMAL(12, 2)' },
    { name: 'estado', type: 'TEXT DEFAULT "Pendiente"' },
    { name: 'valor_cuota_pago', type: 'DECIMAL(12, 2)' },
    { name: 'saldo_final', type: 'DECIMAL(12, 2)' },
    { name: 'item_quantity', type: 'INTEGER DEFAULT 1' },
    { name: 'banco', type: 'TEXT' },
    { name: 'numero_transaccion', type: 'TEXT' },
    { name: 'cuenta_ahorros', type: 'TEXT' },
    { name: 'observaciones', type: 'TEXT' },
    { name: 'id_vm', type: 'TEXT' },
    { name: 'estado_prestamo', type: 'TEXT' },
    { name: 'loan_id', type: 'INTEGER' } // Legacy
];

try {
    // 1. Verificar si la tabla existe
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='LoanPayments'").get();

    if (!tableExists) {
        console.log('⚠️ La tabla LoanPayments no existe. Se creará automáticamente al iniciar el servidor (sync).');
        process.exit(0);
    }

    // 2. Obtener columnas actuales
    const currentColumns = db.prepare("PRAGMA table_info(LoanPayments)").all();
    const currentColumnNames = currentColumns.map(c => c.name);
    console.log('📊 Columnas actuales:', currentColumnNames.join(', '));

    // 3. Agregar columnas faltantes
    let addedCount = 0;

    for (const col of expectedColumns) {
        if (!currentColumnNames.includes(col.name)) {
            console.log(`➕ Agregando columna faltante: ${col.name} (${col.type})`);
            try {
                // SQLite ALTER TABLE ADD COLUMN es limitado, pero funciona para agregar columnas simples
                // Si falla por constraints (NOT NULL), habría que recrear la tabla, pero intentemos ADD COLUMN primero
                // Para simplificar, si es NOT NULL y la tabla tiene datos, SQLite dará error salvo que tenga DEFAULT.
                // Como es migración, quitaremos NOT NULL temporalmente en el ALTER para evitar errores en datos existentes
                const safeType = col.type.replace('NOT NULL', '');
                db.prepare(`ALTER TABLE LoanPayments ADD COLUMN ${col.name} ${safeType}`).run();
                addedCount++;
            } catch (err) {
                console.error(`❌ Error agregando ${col.name}: ${err.message}`);
                // Si falla, probablemente necesitamos recrear la tabla o es un constraint complejo
            }
        }
    }

    if (addedCount > 0) {
        console.log(`✅ Migración completada. Se agregaron ${addedCount} columnas.`);
    } else {
        console.log('✨ La tabla ya tiene todas las columnas necesarias.');
    }

} catch (error) {
    console.error('❌ Error fatal en migración:', error);
} finally {
    db.close();
}
