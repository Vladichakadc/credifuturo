const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// --- LOAD PROJECT RESOURCES ---
const sequelize = require('./config/database');
const Client = require('./models/Client');
const Saving = require('./models/Saving');
const Loan = require('./models/Loan');

// --- UTILS ---
function excelDateToJSDate(serial) {
    if (!serial) return null; // Return null if date is missing
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString().split('T')[0];
}

// --- IMPORT LOGIC ---
async function importData() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Use alter: true to add new columns without dropping tables
        await sequelize.sync({ alter: true });
        console.log('Database schema synced (altered).');

        // 1. IMPORT CLIENTS
        console.log('\n--- Importing Clients ---');
        const clientsPath = 'C:/Credifuturo/Tabla_Clientes.xlsx';
        const clientMap = new Map();

        if (fs.existsSync(clientsPath)) {
            const wb = XLSX.readFile(clientsPath);
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            const defaultPass = await bcrypt.hash('123', 10);

            for (const row of data) {
                const customerId = row['Customer_id'];
                if (!customerId) continue;

                // Construct Name
                const firstName = row['Nombre'] || '';
                const lastName1 = row['1 Apellido'] || '';
                const lastName2 = row['2 Apellido'] || '';
                const fullName = `${firstName} ${lastName1} ${lastName2}`.trim();

                const fakeCedula = `REF-${customerId}`;
                const fakeEmail = `cliente${customerId}@credifuturo.com`;

                try {
                    // Check if exists
                    let client = await Client.findOne({ where: { cedula: fakeCedula } });

                    const clientData = {
                        cedula: fakeCedula,
                        name: fullName,
                        surname1: lastName1,
                        surname2: lastName2,
                        email: fakeEmail,
                        password: defaultPass,
                        role: 'user',
                        // Extended Fields
                        status: row['Estado'] || 'Activo',
                        gender: row['Genero '],
                        country: row['Pais'],
                        city: row['Ciudad'],
                        type: row['Tipo de Cliente'],
                        founder: row['Socio Fundador '],
                        referredBy: row['Referido '],
                        job: row['Cargo '],
                        entryDate: excelDateToJSDate(row['Fecha de Ingreso']),
                        exitDate: excelDateToJSDate(row['Fecha de baja'])
                    };

                    if (!client) {
                        client = await Client.create(clientData);
                    } else {
                        // Update existing client with new fields
                        await client.update(clientData);
                    }

                    clientMap.set(customerId, client.id);
                } catch (err) {
                    console.error(`Error processing client ${fullName}: ${err.message}`);
                }
            }
            console.log(`Processed ${data.length} rows for clients.`);
        }

        // 2. IMPORT SAVINGS (Monthly)
        console.log('\n--- Importing Monthly Savings ---');
        const monthlyPath = 'C:/Credifuturo/1-orders_table_ahorro_mensual.xlsx';
        if (fs.existsSync(monthlyPath)) {
            const wb = XLSX.readFile(monthlyPath);
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            let count = 0;

            for (const row of data) {
                const customerId = row['Customer_id'];
                const dbId = clientMap.get(customerId);

                if (dbId) {
                    // Prevent duplicate saving entries if running multiple times?
                    // For now, simpler to just create. If verifying, user can delete DB.
                    // Or we could check if saving with same date & amount & clientId exists.

                    await Saving.create({
                        clientId: dbId,
                        amount: row['Valor Mensual'] || 0,
                        date: excelDateToJSDate(row['Fecha Pago']) || new Date(),
                        type: 'Mensual',
                        // Extended
                        year: row['Año pago '],
                        month: row['Mes pago'],
                        penalty: row['Penalizacion '],
                        penaltyDays: row['Dias Penalizacion '],
                        penaltyAmount: row['Valor a Penalizar'],
                        itemQuantity: row['Item_Quantity'],
                        bank: row['Banco '],
                        transactionId: row['# Transaccion'],
                        observations: row['Observaciones']
                    });
                    count++;
                }
            }
            console.log(`Imported ${count} monthly savings records.`);
        }

        // 3. IMPORT SAVINGS (Initial)
        console.log('\n--- Importing Initial Contributions ---');
        const initialPath = 'C:/Credifuturo/1-orders_table_aportes_iniciales.xlsx';
        if (fs.existsSync(initialPath)) {
            const wb = XLSX.readFile(initialPath);
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            let count = 0;

            for (const row of data) {
                const customerId = row['Customer_id'];
                const dbId = clientMap.get(customerId);

                if (dbId) {
                    await Saving.create({
                        clientId: dbId,
                        amount: row['Valor '] || row['Valor'] || 0,
                        date: excelDateToJSDate(row['Fecha Pago']) || new Date(),
                        type: 'Aporte Inicial',
                        // Extended
                        year: row['Año'],
                        month: row['Mes'],
                        itemQuantity: row['Item_Quantity'],
                        bank: row['Banco '],
                        transactionId: row['# Transaccion']
                    });
                    count++;
                }
            }
            console.log(`Imported ${count} initial contribution records.`);
        }

        // 4. IMPORT LOANS
        console.log('\n--- Importing Loans ---');
        const loansPath = 'C:/Credifuturo/1-orders_table_prestamos_desembolsados.xlsx';
        if (fs.existsSync(loansPath)) {
            const wb = XLSX.readFile(loansPath);
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            let count = 0;

            for (const row of data) {
                const customerId = row['Customer_id'];
                const dbId = clientMap.get(customerId);

                if (dbId) {
                    let status = 'Pending';
                    const rawStatus = (row['Estado'] || '').toLowerCase();
                    if (rawStatus.includes('activo')) status = 'Approved';
                    if (rawStatus.includes('cancelado')) status = 'Paid';
                    if (rawStatus.includes('pendiente')) status = 'Pending';

                    await Loan.create({
                        clientId: dbId,
                        amount: row['Valor Prestado'] || 0,
                        date: excelDateToJSDate(row['Fecha Prestamo']) || new Date(),
                        status: status,
                        purpose: row['Observaciones'] || '',
                        // Extended
                        disbursementYear: row['Año Desembolso '],
                        disbursementMonth: row['Mes Desembolso '],
                        installments: row['# Cuotas Prestamo'],
                        interestRate: row['Interes Mensual'],
                        maxPaymentDays: row['Dias de pago Max '],
                        itemQuantity: row['Item_Quantity'],
                        bank: row['Banco desembolsado'],
                        transactionId: row['# Transaccion'],
                        savingsAccount: row['Cuenta de Ahorros'] ? String(row['Cuenta de Ahorros']) : null,
                        observations: row['Observaciones']
                    });
                    count++;
                }
            }
            console.log(`Imported ${count} loan records.`);
        }

        console.log('\nFull Data Import Completed Successfully!');

    } catch (error) {
        console.error('Import FATAL Error:', error);
    }
}

importData();
