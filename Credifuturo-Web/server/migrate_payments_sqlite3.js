const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Iniciando migración de tabla LoanPayments con sqlite3 driver...');

const columnsToAdd = [
    { name: 'id_ep', def: 'TEXT' },
    { name: 'mes_desembolso', def: 'TEXT' },
    { name: 'saldo_inicial', def: 'DECIMAL(12, 2)' },
    { name: 'cuotas_prestamo', def: 'INTEGER' },
    { name: 'interes_mensual', def: 'DECIMAL(5, 4)' },
    { name: 'valor_intereses_amortizados', def: 'DECIMAL(12, 2)' },
    { name: 'fecha_pago_max', def: 'DATE' },
    { name: 'mes_pago', def: 'TEXT' },
    { name: 'valor_cuota_variable', def: 'DECIMAL(12, 2)' },
    { name: 'estado', def: 'TEXT DEFAULT "Pendiente"' },
    { name: 'valor_cuota_pago', def: 'DECIMAL(12, 2)' },
    { name: 'saldo_final', def: 'DECIMAL(12, 2)' },
    { name: 'item_quantity', def: 'INTEGER DEFAULT 1' },
    { name: 'banco', def: 'TEXT' },
    { name: 'numero_transaccion', def: 'TEXT' },
    { name: 'cuenta_ahorros', def: 'TEXT' },
    { name: 'observaciones', def: 'TEXT' },
    { name: 'id_vm', def: 'TEXT' },
    { name: 'estado_prestamo', def: 'TEXT' },
    { name: 'loan_id', def: 'INTEGER' }
];

db.serialize(() => {
    // 1. Obtener info de la tabla
    db.all("PRAGMA table_info(LoanPayments)", (err, rows) => {
        if (err) {
            console.error('❌ Error leyendo tabla:', err);
            return;
        }

        if (!rows || rows.length === 0) {
            console.log('⚠️ La tabla LoanPayments no existe. Se creará al iniciar la app.');
            return;
        }

        const currentCols = rows.map(r => r.name);
        console.log('📊 Columnas actuales:', currentCols.join(', '));

        let addedCount = 0;
        columnsToAdd.forEach(col => {
            if (!currentCols.includes(col.name)) {
                console.log(`➕ Agregando columna: ${col.name}`);
                // Callback vacío para ignorar errores individuales (ej: si ya existe o sintaxis edge case)
                db.run(`ALTER TABLE LoanPayments ADD COLUMN ${col.name} ${col.def}`, (alterErr) => {
                    if (alterErr) {
                        console.error(`   ❌ Error en ${col.name}: ${alterErr.message}`);
                    } else {
                        console.log(`   ✅ Agregada exitosamente.`);
                        addedCount++;
                    }
                });
            }
        });

        // Esperar un poco a que terminen los callbacks asíncronos (sqlite3 es async)
        setTimeout(() => {
            console.log('🏁 Proceso finalizado.');
            db.close();
        }, 2000);
    });
});
