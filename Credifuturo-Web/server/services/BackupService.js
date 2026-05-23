const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const Client = require('../models/Client');
const Saving = require('../models/Saving');
const DisbursedLoan = require('../models/DisbursedLoan');
const LoanPayment = require('../models/LoanPayment');

const BACKUP_BASE_DIR = process.env.BACKUP_DIR || 'C:\\Credifuturo\\Backups';

// Formatea fechas al formato dd-mm-aaaa para los Excel de backup
const formatDate = (value) => {
    if (!value) return '';
    try {
        const str = String(value).split('T')[0];
        const parts = str.split('-');
        if (parts.length === 3) {
            const [yyyy, mm, dd] = parts;
            return `${dd.padStart(2, '0')}-${mm.padStart(2, '0')}-${yyyy}`;
        }
        return value;
    } catch { return value; }
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getTodayFolder() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const MM = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return path.join(BACKUP_BASE_DIR, `${yyyy}-${mm}-${dd}_${HH}${MM}${ss}`);
}

function saveWorkbook(wb, filename, folder) {
    if (!fs.existsSync(folder)) {
        try {
            fs.mkdirSync(folder, { recursive: true });
        } catch (mkdirErr) {
            console.error(`[BackupService] No se pudo crear el directorio de backup: ${folder}`, mkdirErr.message);
            throw mkdirErr;
        }
    }
    const filePath = path.join(folder, `${filename}.xlsx`);
    XLSX.writeFile(wb, filePath);
    return filePath;
}

function applyColumnFormats(ws, data, columnFormats) {
    if (!data.length || !columnFormats) return;
    const headers = Object.keys(data[0]);
    headers.forEach((header, colIdx) => {
        if (!columnFormats[header]) return;
        for (let rowIdx = 1; rowIdx <= data.length; rowIdx++) {
            const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
            if (ws[cellAddr]) {
                ws[cellAddr].z = columnFormats[header];
            }
        }
    });
}

function buildWorkbook(data, sheetName, columnFormats) {
    const ws = XLSX.utils.json_to_sheet(data);
    if (columnFormats) applyColumnFormats(ws, data, columnFormats);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return wb;
}

// ── Report Builders ──────────────────────────────────────────────────────────

function buildClientsReport(clients) {
    const data = clients.map(c => ({
        'Customer_id': c.customerId ?? '',
        'Nombre': c.name ?? '',
        '1 Apellido': c.surname1 ?? '',
        '2 Apellido': c.surname2 ?? '',
        'Estado': c.estatus ?? '',
        'Genero': c.genero ?? '',
        'Pais': c.pais ?? '',
        'Ciudad': c.ciudad ?? '',
        'Tipo de Cliente': c.tipoCliente ?? '',
        'Concatenar': [c.name, c.surname1, c.surname2].filter(Boolean).join(' '),
        'Socio Fundador': c.socioFundador ?? '',
        'Referido': c.referido ?? '',
        'Cargo': c.cargo ?? '',
        'Fecha de Ingreso': formatDate(c.fechaIngreso),
        'Fecha de baja': formatDate(c.fechaBaja),
        'Cedula': c.cedula ?? '',
        'Correo': c.email ?? '',
    }));
    return buildWorkbook(data, 'Socios');
}

function buildSavingsReport(savings, clients) {
    const sorted = [...savings].sort((a, b) =>
        new Date(b.date || '1900-01-01') - new Date(a.date || '1900-01-01')
    );
    const data = sorted.map(s => {
        const c = clients.find(x => x.id === s.clientId);
        return {
            'Id_VM': s.externalId ?? '',
            'Customer_id': c ? c.customerId : '',
            'Nombre': c ? c.name : '',
            'Apellido': c ? c.surname1 : '',
            'Estado': s.status ?? '',
            'Fecha Pago': formatDate(s.date),
            'Año pago': s.year ?? '',
            'Mes pago': s.month ?? '',
            'Penalizacion': s.penalizacion ?? '',
            'Dias Penalizacion': s.diasPenalizacion || 0,
            'Valor Mensual': parseFloat(s.amount || 0),
            'Valor a Penalizar': parseFloat(s.valorAPenalizar || 0),
            'Valor Ahorrado': parseFloat(s.valorAhorrado || 0),
            'Mes Abonado': s.mesAbonado ?? '',
            'Año Abonado': s.anioAbonado ?? '',
            'Item_Quantity': s.itemQuantity ?? '',
            'Banco': s.banco ?? '',
            '# Transaccion': s.numeroTransaccion ?? '',
            'Desde Cuenta de Ahorros': s.origen ?? '',
            'Tipo de Ahorro': s.type ?? '',
            'Observaciones': s.observaciones ?? ''
        };
    });
    const fmts = { 'Valor Mensual': '"$"#,##0', 'Valor a Penalizar': '"$"#,##0', 'Valor Ahorrado': '"$"#,##0' };
    return buildWorkbook(data, 'Ahorros', fmts);
}

function buildAportesReport(savings, clients) {
    const aportes = [...savings.filter(s => s.type === 'Aporte Inicial')].sort((a, b) => {
        const nA = parseInt((a.externalId || '').replace(/\D/g, '') || '0', 10);
        const nB = parseInt((b.externalId || '').replace(/\D/g, '') || '0', 10);
        return nA - nB;
    });
    const data = aportes.map(s => {
        const c = clients.find(x => x.id === s.clientId);
        return {
            'Id_AI': s.externalId ?? '',
            'Customer_id': c ? c.customerId : '',
            'Nombre': c ? c.name : '',
            'Apellido': c ? c.surname1 : '',
            'Estado': s.status ?? '',
            'Fecha Pago': formatDate(s.date),
            'Año': s.year ?? '',
            'Mes': s.month ?? '',
            'Valor ': parseFloat(s.amount || 0),
            'Item_Quantity': s.itemQuantity ?? '',
            'Banco ': s.banco ?? '',
            '# Transaccion': s.numeroTransaccion ?? '',
            'Desde Cuenta de Ahorros': s.origen ?? ''
        };
    });
    return buildWorkbook(data, 'Aportes', { 'Valor ': '"$"#,##0' });
}

function buildLoansReport(loans, clients) {
    const data = loans.map(loan => {
        const c = clients.find(x => x.id === loan.clientId);
        return {
            'id_vm': loan.idVm ?? '',
            'customer_id': c ? c.customerId : '',
            'nombre': c ? c.name : '',
            'apellido': c ? c.surname1 : '',
            'estado': loan.estado ?? '',
            'fecha de prestamo': formatDate(loan.fechaPrestamo),
            'mes desembolso': loan.mesDesembolso ?? '',
            'año desembolso': loan.anioDesembolso ?? '',
            'valor prestado': parseFloat(loan.valorPrestado || 0),
            '# cuotas': loan.cuotas ?? '',
            'interes mensual': parseFloat(loan.interesMensual || 0),
            'dias pago max': loan.diasPagoMax ?? '',
            'item_quantity': loan.itemQuantity ?? '',
            'banco desembolsado': loan.banco ?? '',
            '# transaccion': loan.numeroTransaccion ?? '',
            'cuenta de ahorros': loan.cuentaAhorros ?? '',
            'observaciones': loan.observaciones ?? ''
        };
    });
    return buildWorkbook(data, 'Prestamos', { 'valor prestado': '"$"#,##0', 'interes mensual': '0.00%' });
}

function buildLoanStatusReport(payments, clients) {
    const sorted = [...payments].sort((a, b) => {
        const nA = parseInt(a.externalId?.replace(/\D/g, '') || '0', 10);
        const nB = parseInt(b.externalId?.replace(/\D/g, '') || '0', 10);
        return nB - nA;
    });
    const data = sorted.map(p => {
        const c = clients.find(x => x.id === p.clientId || x.id === parseInt(p.clientId));
        return {
            'Id_EP': p.externalId ?? '',
            'Customer_id': c ? c.customerId : (p.clientId ?? ''),
            'Id_VM': p.idVm ?? '',
            'Nombre': c ? c.name : '',
            'Apellido': c ? `${c.surname1 || ''} ${c.surname2 || ''}`.trim() : '',
            'Mes Desembolso': p.mesDesembolso ?? '',
            'Saldo Inicial': parseFloat(p.saldoInicial || 0),
            '# Cuotas Prestamo': p.cuotasPrestamo ?? '',
            'Interes Mensual': parseFloat(p.interesMensual || 0),
            'Valor Intereses amortizados': parseFloat(p.valorInteresesAmortizados || 0),
            'Fecha de Pago Max': formatDate(p.fechaPagoMax),
            'Mes de Pago': p.mesPago ?? '',
            'Valor Cuota Variable': parseFloat(p.valorCuotaVariable || 0),
            'Estado': p.estado ?? '',
            'Valor Cuota Pago': parseFloat(p.valorCuotaPago || 0),
            'Saldo Final': parseFloat(p.saldoFinal || 0),
            'Item_Quantity': p.itemQuantity ?? '',
            'Banco desembolsado': p.banco ?? '',
            '# Transaccion': p.numeroTransaccion ?? '',
            'Cuenta de Ahorros': p.cuentaAhorros ?? '',
            'Observaciones': p.observaciones ?? '',
            'Estado Prestamo': p.estadoPrestamo ?? ''
        };
    });
    const fmts = {
        'Saldo Inicial': '"$"#,##0', 'Interes Mensual': '0.00%',
        'Valor Intereses amortizados': '"$"#,##0', 'Valor Cuota Variable': '"$"#,##0',
        'Valor Cuota Pago': '"$"#,##0', 'Saldo Final': '"$"#,##0'
    };
    return buildWorkbook(data, 'Estado Prestamos', fmts);
}

function buildDelinquencyReport(payments, clients) {
    const data = payments.filter(p => p.estado === 'Mora').map(p => {
        const c = clients.find(x => x.id === p.clientId);
        return {
            ID_Pago: p.externalId ?? '',
            ID_Prestamo: p.idVm ?? '',
            Socio: c ? `${c.name} ${c.surname1}` : 'Desconocido',
            'Mes Pago': p.mesPago ?? '',
            'Fecha Límite': formatDate(p.fechaPagoMax),
            'Valor Cuota': parseFloat(p.valorCuotaPago || 0),
            Estado: p.estado ?? ''
        };
    });
    return buildWorkbook(data, 'Morosidad', { 'Valor Cuota': '"$"#,##0' });
}

// ── Main Export Function ─────────────────────────────────────────────────────

async function generateAllBackups() {
    const folder = getTodayFolder();
    console.log(`[BackupService] Iniciando backup en: ${folder}`);

    // Fetch all data once
    const [clients, savings, loans, payments] = await Promise.all([
        Client.findAll({ raw: true }),
        Saving.findAll({ raw: true }),
        DisbursedLoan.findAll({ raw: true }),
        LoanPayment.findAll({ raw: true })
    ]);

    const reportes = [
        { wb: buildClientsReport(clients), name: 'Tabla_Clientes' },
        { wb: buildSavingsReport(savings, clients), name: '1-orders_table_ahorro_mensual' },
        { wb: buildAportesReport(savings, clients), name: '1-orders_table_aportes_iniciales' },
        { wb: buildLoansReport(loans, clients), name: '1-orders_table_prestamos_desembolsados' },
        { wb: buildLoanStatusReport(payments, clients), name: '1-orders_table_estado_prestamos' },
        { wb: buildDelinquencyReport(payments, clients), name: 'Reporte_Morosidad' }
    ];

    const savedPaths = [];
    for (const r of reportes) {
        const filePath = saveWorkbook(r.wb, r.name, folder);
        savedPaths.push(filePath);
        console.log(`[BackupService] ✅ Guardado: ${filePath}`);
    }

    return { folder, files: savedPaths, timestamp: new Date().toISOString() };
}

module.exports = { generateAllBackups };
