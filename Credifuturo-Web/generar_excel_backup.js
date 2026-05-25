/**
 * generar_excel_backup.js
 * Genera los 6 archivos Excel de backup a partir de un database.sqlite.
 * Uso: node generar_excel_backup.js <ruta_carpeta_backup>
 *
 * No requiere el servidor corriendo — usa sqlite3 y xlsx directamente.
 * Dependencias: sqlite3, xlsx  (ya instaladas en server/node_modules)
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const XLSX  = require('./server/node_modules/xlsx');
const sqlite3 = require('./server/node_modules/sqlite3').verbose();

// ── Argumento: carpeta de destino ────────────────────────────────────────────
const backupDir = process.argv[2];
if (!backupDir) {
    console.error('[ERROR] Uso: node generar_excel_backup.js <ruta_carpeta_backup>');
    process.exit(1);
}
const dbPath = path.join(backupDir, 'database.sqlite');
if (!fs.existsSync(dbPath)) {
    console.error(`[ERROR] No se encontro database.sqlite en: ${dbPath}`);
    process.exit(1);
}

console.log(`[Excel] Generando reportes desde: ${dbPath}`);
console.log(`[Excel] Destino: ${backupDir}`);

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value) {
    if (!value) return '';
    try {
        const str = String(value).split('T')[0];
        const parts = str.split('-');
        if (parts.length === 3) {
            const [yyyy, mm, dd] = parts;
            return `${dd.padStart(2,'0')}-${mm.padStart(2,'0')}-${yyyy}`;
        }
        return value;
    } catch { return value; }
}

function buildAndSave(data, sheetName, filename, colFmts) {
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{}]);
    if (colFmts && data.length) {
        const headers = Object.keys(data[0]);
        headers.forEach((h, ci) => {
            if (!colFmts[h]) return;
            for (let ri = 1; ri <= data.length; ri++) {
                const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
                if (ws[addr]) ws[addr].z = colFmts[h];
            }
        });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const outPath = path.join(backupDir, `${filename}.xlsx`);
    XLSX.writeFile(wb, outPath);
    console.log(`[Excel]   ✅ ${filename}.xlsx`);
}

function queryAll(db, sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) { console.error('[ERROR] No se pudo abrir la BD:', err.message); process.exit(1); }
    });

    try {
        // Leer todas las tablas necesarias
        const [clients, savings, loans, payments] = await Promise.all([
            queryAll(db, 'SELECT * FROM Clients'),
            queryAll(db, 'SELECT * FROM Savings'),
            queryAll(db, 'SELECT * FROM DisbursedLoans'),
            queryAll(db, 'SELECT * FROM LoanPayments'),
        ]);

        console.log(`[Excel] Datos cargados: ${clients.length} clientes, ${savings.length} ahorros, ${loans.length} prestamos, ${payments.length} pagos`);

        // Indice de clientes por id para joins rapidos
        const clientById = {};
        clients.forEach(c => { clientById[c.id] = c; });

        // ── 1. Tabla_Clientes ────────────────────────────────────────────────
        buildAndSave(clients.map(c => ({
            'Customer_id':      c.customerId  ?? '',
            'Nombre':           c.name        ?? '',
            '1 Apellido':       c.surname1    ?? '',
            '2 Apellido':       c.surname2    ?? '',
            'Estado':           c.estatus     ?? '',
            'Genero':           c.genero      ?? '',
            'Pais':             c.pais        ?? '',
            'Ciudad':           c.ciudad      ?? '',
            'Tipo de Cliente':  c.tipoCliente ?? '',
            'Concatenar':       [c.name, c.surname1, c.surname2].filter(Boolean).join(' '),
            'Socio Fundador':   c.socioFundador ?? '',
            'Referido':         c.referido    ?? '',
            'Cargo':            c.cargo       ?? '',
            'Fecha de Ingreso': formatDate(c.fechaIngreso),
            'Fecha de baja':    formatDate(c.fechaBaja),
            'Cedula':           c.cedula      ?? '',
            'Correo':           c.email       ?? '',
        })), 'Socios', 'Tabla_Clientes', null);

        // ── 2. Ahorro Mensual ────────────────────────────────────────────────
        const savingsSorted = [...savings].sort((a,b) =>
            new Date(b.date || '1900-01-01') - new Date(a.date || '1900-01-01'));
        buildAndSave(savingsSorted.map(s => {
            const c = clientById[s.clientId] || {};
            return {
                'Id_VM':                   s.externalId ?? '',
                'Customer_id':             c.customerId ?? '',
                'Nombre':                  c.name       ?? '',
                'Apellido':                c.surname1   ?? '',
                'Estado':                  s.status     ?? '',
                'Fecha Pago':              formatDate(s.date),
                'Año pago':                s.year       ?? '',
                'Mes pago':                s.month      ?? '',
                'Penalizacion':            s.penalizacion ?? '',
                'Dias Penalizacion':       s.diasPenalizacion || 0,
                'Valor Mensual':           parseFloat(s.amount || 0),
                'Valor a Penalizar':       parseFloat(s.valorAPenalizar || 0),
                'Valor Ahorrado':          parseFloat(s.valorAhorrado || 0),
                'Mes Abonado':             s.mesAbonado  ?? '',
                'Año Abonado':             s.anioAbonado ?? '',
                'Item_Quantity':           s.itemQuantity ?? '',
                'Banco':                   s.banco       ?? '',
                '# Transaccion':           s.numeroTransaccion ?? '',
                'Desde Cuenta de Ahorros': s.origen      ?? '',
                'Tipo de Ahorro':          s.type        ?? '',
                'Observaciones':           s.observaciones ?? '',
            };
        }), 'Ahorros', '1-orders_table_ahorro_mensual',
        { 'Valor Mensual': '"$"#,##0', 'Valor a Penalizar': '"$"#,##0', 'Valor Ahorrado': '"$"#,##0' });

        // ── 3. Aportes Iniciales ─────────────────────────────────────────────
        const aportes = savings
            .filter(s => s.type === 'Aporte Inicial')
            .sort((a,b) => {
                const nA = parseInt((a.externalId||'').replace(/\D/g,'') || '0', 10);
                const nB = parseInt((b.externalId||'').replace(/\D/g,'') || '0', 10);
                return nA - nB;
            });
        buildAndSave(aportes.map(s => {
            const c = clientById[s.clientId] || {};
            return {
                'Id_AI':                   s.externalId ?? '',
                'Customer_id':             c.customerId ?? '',
                'Nombre':                  c.name       ?? '',
                'Apellido':                c.surname1   ?? '',
                'Estado':                  s.status     ?? '',
                'Fecha Pago':              formatDate(s.date),
                'Año':                     s.year       ?? '',
                'Mes':                     s.month      ?? '',
                'Valor ':                  parseFloat(s.amount || 0),
                'Item_Quantity':           s.itemQuantity ?? '',
                'Banco ':                  s.banco      ?? '',
                '# Transaccion':           s.numeroTransaccion ?? '',
                'Desde Cuenta de Ahorros': s.origen    ?? '',
            };
        }), 'Aportes', '1-orders_table_aportes_iniciales', { 'Valor ': '"$"#,##0' });

        // ── 4. Prestamos Desembolsados ────────────────────────────────────────
        buildAndSave(loans.map(loan => {
            const c = clientById[loan.client_id || loan.clientId] || {};
            return {
                'id_vm':               loan.idVm         ?? '',
                'customer_id':         c.customerId      ?? '',
                'nombre':              c.name            ?? '',
                'apellido':            c.surname1        ?? '',
                'estado':              loan.estado        ?? '',
                'fecha de prestamo':   formatDate(loan.fechaPrestamo),
                'mes desembolso':      loan.mesDesembolso  ?? '',
                'año desembolso':      loan.anioDesembolso ?? '',
                'valor prestado':      parseFloat(loan.valorPrestado || 0),
                '# cuotas':            loan.cuotas        ?? '',
                'interes mensual':     parseFloat(loan.interesMensual || 0),
                'dias pago max':       loan.diasPagoMax   ?? '',
                'item_quantity':       loan.itemQuantity  ?? '',
                'banco desembolsado':  loan.banco         ?? '',
                '# transaccion':       loan.numeroTransaccion ?? '',
                'cuenta de ahorros':   loan.cuentaAhorros ?? '',
                'observaciones':       loan.observaciones ?? '',
            };
        }), 'Prestamos', '1-orders_table_prestamos_desembolsados',
        { 'valor prestado': '"$"#,##0', 'interes mensual': '0.00%' });

        // ── 5. Estado Prestamos ──────────────────────────────────────────────
        const paymentsSorted = [...payments].sort((a,b) => {
            const nA = parseInt((a.externalId||'').replace(/\D/g,'') || '0', 10);
            const nB = parseInt((b.externalId||'').replace(/\D/g,'') || '0', 10);
            return nB - nA;
        });
        buildAndSave(paymentsSorted.map(p => {
            const c = clientById[p.clientId] || {};
            return {
                'Id_EP':                          p.externalId  ?? '',
                'Customer_id':                    c.customerId  ?? (p.clientId ?? ''),
                'Id_VM':                          p.idVm        ?? '',
                'Nombre':                         c.name        ?? '',
                'Apellido':                       `${c.surname1||''} ${c.surname2||''}`.trim(),
                'Mes Desembolso':                 p.mesDesembolso ?? '',
                'Saldo Inicial':                  parseFloat(p.saldoInicial || 0),
                '# Cuotas Prestamo':              p.cuotasPrestamo ?? '',
                'Interes Mensual':                parseFloat(p.interesMensual || 0),
                'Valor Intereses amortizados':    parseFloat(p.valorInteresesAmortizados || 0),
                'Fecha de Pago Max':              formatDate(p.fechaPagoMax),
                'Mes de Pago':                    p.mesPago     ?? '',
                'Valor Cuota Variable':           parseFloat(p.valorCuotaVariable || 0),
                'Estado':                         p.estado      ?? '',
                'Valor Cuota Pago':               parseFloat(p.valorCuotaPago || 0),
                'Saldo Final':                    parseFloat(p.saldoFinal || 0),
                'Item_Quantity':                  p.itemQuantity ?? '',
                'Banco desembolsado':             p.banco       ?? '',
                '# Transaccion':                  p.numeroTransaccion ?? '',
                'Cuenta de Ahorros':              p.cuentaAhorros ?? '',
                'Observaciones':                  p.observaciones ?? '',
                'Estado Prestamo':                p.estadoPrestamo ?? '',
            };
        }), 'Estado Prestamos', '1-orders_table_estado_prestamos', {
            'Saldo Inicial': '"$"#,##0', 'Interes Mensual': '0.00%',
            'Valor Intereses amortizados': '"$"#,##0', 'Valor Cuota Variable': '"$"#,##0',
            'Valor Cuota Pago': '"$"#,##0', 'Saldo Final': '"$"#,##0'
        });

        // ── 6. Reporte Morosidad ─────────────────────────────────────────────
        const mora = payments.filter(p => p.estado === 'Mora');
        buildAndSave(mora.map(p => {
            const c = clientById[p.clientId] || {};
            return {
                'ID_Pago':      p.externalId ?? '',
                'ID_Prestamo':  p.idVm       ?? '',
                'Socio':        c.name ? `${c.name} ${c.surname1}` : 'Desconocido',
                'Mes Pago':     p.mesPago    ?? '',
                'Fecha Limite': formatDate(p.fechaPagoMax),
                'Valor Cuota':  parseFloat(p.valorCuotaPago || 0),
                'Estado':       p.estado     ?? '',
            };
        }), 'Morosidad', 'Reporte_Morosidad', { 'Valor Cuota': '"$"#,##0' });

        console.log('[Excel] ✅ Todos los reportes generados exitosamente.');

    } catch (err) {
        console.error('[ERROR] Generando Excel:', err.message);
        process.exit(1);
    } finally {
        db.close();
    }
}

main();
