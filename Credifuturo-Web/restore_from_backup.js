const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const sequelize = require('./server/config/database');
const Client = require('./server/models/Client');
const Saving = require('./server/models/Saving');
const DisbursedLoan = require('./models/DisbursedLoan');
const LoanPayment = require('./models/LoanPayment');
const { Op } = require('sequelize');

function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
        // Excel base date is 1899-12-30
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return date;
    }
    return val;
}

async function restore() {
    const backupDir = 'C:\\Credifuturo\\Backups\\2026-03-07';
    console.log(`Starting clean restore from: ${backupDir}`);

    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Disable foreign keys temporarily for truncation
        await sequelize.query('PRAGMA foreign_keys = OFF');

        // 1. Restore Clients
        console.log('Restoring Clients...');
        const clientFile = path.join(backupDir, 'Tabla_Clientes.xlsx');
        const clientWb = XLSX.readFile(clientFile);
        const clientData = XLSX.utils.sheet_to_json(clientWb.Sheets[clientWb.SheetNames[0]]);
        
        await Client.destroy({ where: {}, truncate: true });
        for (const row of clientData) {
            await Client.create({
                customerId: String(row['Customer_id']),
                cedula: String(row['Cedula']),
                name: String(row['Nombre'] || ''),
                surname1: String(row['1 Apellido'] || ''),
                surname2: String(row['2 Apellido'] || ''),
                email: row['Correo'] || null,
                password: row['password'] || '$2a$10$ko3aa711kf2D23T1WSlqiOSzJBKODLePcHohJw/JmBHQrUGqWorvi', // Initial fallback
                role: 'user', // Default
                genero: row['Genero'],
                pais: row['Pais'],
                ciudad: row['Ciudad'],
                tipoCliente: row['Tipo de Cliente'],
                socioFundador: row['Socio Fundador'],
                referido: row['Referido'],
                cargo: row['Cargo'],
                fechaIngreso: parseExcelDate(row['Fecha de Ingreso']),
                fechaBaja: parseExcelDate(row['Fecha de baja']),
                estatus: row['Estado'] || 'Activo'
            });
        }

        // Map customerId to internal ID for relations
        const clientMap = {};
        const allClients = await Client.findAll();
        allClients.forEach(c => { clientMap[c.customerId] = c.id; });

        // 2. Restore Savings
        console.log('Restoring Savings...');
        const savingFile = path.join(backupDir, '1-orders_table_ahorro_mensual.xlsx');
        const savingWb = XLSX.readFile(savingFile);
        const savingRows = XLSX.utils.sheet_to_json(savingWb.Sheets[savingWb.SheetNames[0]]);
        
        await Saving.destroy({ where: {}, truncate: true });
        for (const row of savingRows) {
            const cid = clientMap[String(row['Customer_id'])];
            if (!cid) continue;
            await Saving.create({
                clientId: cid,
                amount: row['Valor Mensual'],
                date: parseExcelDate(row['Fecha Pago']),
                year: row['Año pago'],
                month: row['Mes pago'],
                penalizacion: row['Penalizacion'],
                diasPenalizacion: row['Dias Penalizacion'],
                valorAhorrado: row['Valor Ahorrado'],
                valorAPenalizar: row['Valor a Penalizar'],
                mesAbonado: row['Mes Abonado'],
                anioAbonado: row['Año Abonado'],
                itemQuantity: row['Item_Quantity'],
                banco: row['Banco'],
                numeroTransaccion: row['# Transaccion'],
                origen: row['Desde Cuenta de Ahorros'],
                type: row['Tipo de Ahorro'] || 'Mensual',
                externalId: row['Id_VM'],
                status: row['Estado'],
                observaciones: row['Observaciones']
            });
        }

        // 3. Restore Disbursed Loans
        console.log('Restoring Loans...');
        const loanFile = path.join(backupDir, '1-orders_table_prestamos_desembolsados.xlsx');
        const loanWb = XLSX.readFile(loanFile);
        const loanRows = XLSX.utils.sheet_to_json(loanWb.Sheets[loanWb.SheetNames[0]]);
        
        await DisbursedLoan.destroy({ where: {}, truncate: true });
        for (const row of loanRows) {
            const cid = clientMap[String(row['customer_id'])];
            if (!cid) continue;
            await DisbursedLoan.create({
                clientId: cid,
                idVm: row['id_vm'],
                socio: row['nombre'] + ' ' + row['apellido'],
                monto: row['valor prestado'],
                cuotas: row['# cuotas'],
                interesMensual: row['interes mensual'],
                fechaDesembolso: parseExcelDate(row['fecha de prestamo']),
                fechaPrestamo: parseExcelDate(row['fecha de prestamo']),
                mesDesembolso: row['mes desembolso'],
                anioDesembolso: row['año desembolso'],
                diasPagoMax: row['dias pago max'],
                itemQuantity: row['item_quantity'],
                banco: row['banco desembolsado'],
                numeroTransaccion: row['# transaccion'],
                cuentaAhorros: row['cuenta de ahorros'],
                observaciones: row['observaciones'],
                estado: row['estado']
            });
        }

        // 4. Restore Payments
        console.log('Restoring Payments...');
        const payFile = path.join(backupDir, '1-orders_table_estado_prestamos.xlsx');
        const payWb = XLSX.readFile(payFile);
        const payRows = XLSX.utils.sheet_to_json(payWb.Sheets[payWb.SheetNames[0]]);
        
        await LoanPayment.destroy({ where: {}, truncate: true });
        for (const row of payRows) {
            const cid = clientMap[String(row['Customer_id'])];
            if (!cid) continue;
            await LoanPayment.create({
                clientId: cid,
                externalId: row['Id_EP'],
                idVm: row['Id_VM'],
                mesDesembolso: row['Mes Desembolso'],
                saldoInicial: row['Saldo Inicial'],
                cuotasPrestamo: row['# Cuotas Prestamo'],
                interesMensual: row['Interes Mensual'],
                valorInteresesAmortizados: row['Valor Intereses amortizados'],
                fechaPagoMax: parseExcelDate(row['Fecha de Pago Max']),
                mesPago: row['Mes de Pago'],
                valorCuotaVariable: row['Valor Cuota Variable'],
                estado: row['Estado'],
                valorCuotaPago: row['Valor Cuota Pago'],
                saldoFinal: row['Saldo Final'],
                itemQuantity: row['Item_Quantity'],
                banco: row['Banco desembolsado'],
                numeroTransaccion: row['# Transaccion'],
                cuentaAhorros: row['Cuenta de Ahorros'],
                observaciones: row['Observaciones'],
                estadoPrestamo: row['Estado Prestamo']
            });
        }

        await sequelize.query('PRAGMA foreign_keys = ON');
        console.log('✅ Restore completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Restore failed:', err);
        process.exit(1);
    }
}

restore();
