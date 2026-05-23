const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const Client = require('../models/Client');
const Saving = require('../models/Saving');
const DisbursedLoan = require('../models/DisbursedLoan');
const LoanPayment = require('../models/LoanPayment');

const DBClient = require('./DBClient');

const ImportService = {
    async importAll(dataDir) {
        const summary = [];

        const runImport = async (name, model, fn) => {
            const result = {
                module: name,
                table: name, // Keep for backward compatibility if needed
                status: 'ERROR',
                count: 0,
                source: 'DB',
                message: '',
                updated: false // Keep for logic
            };
            let res = { imported: 0, total: 0, error: null, criticalError: null };
            try {
                res = await fn();
                const totalInDb = await model.count();
                result.count = Number(totalInDb) || 0;
                result.updated = res.imported > 0;
                result.source = `Excel: ${res.total || 0} filas`;

                if (res.error || res.criticalError) {
                    result.status = 'ERROR';
                    result.message = res.error || res.criticalError;
                } else {
                    result.status = 'OK';
                    result.message = res.imported > 0 ? 'Datos sincronizados' : 'Sin cambios';
                }

                console.log(`[Sync ${name}] Source: ${res.total || 0}, Processed: ${res.imported}, Total DB: ${totalInDb}`);
            } catch (err) {
                result.status = 'ERROR';
                result.message = err.message || 'Error desconocido';
            }
            summary.push(result);
        };

        // Execute sequentially to avoid DB locks or race conditions if any
        await runImport('Socios', Client, () => this.importClients(path.join(dataDir, 'Tabla_Clientes.xlsx')));
        await runImport('Ahorros', Saving, () => this.importSavings(dataDir));
        await runImport('Préstamos Desembolsados', DisbursedLoan, () => this.importDisbursed(path.join(dataDir, '1-orders_table_prestamos_desembolsados.xlsx')));
        await runImport('Estado Préstamos', LoanPayment, () => this.importPayments(path.join(dataDir, '1-orders_table_estado_prestamos.xlsx')));

        return {
            ok: !summary.some(s => s.status === 'ERROR'),
            summary
        };
    },

    async importClients(filePath) {
        if (!fs.existsSync(filePath)) return { error: 'Archivo no encontrado: ' + path.basename(filePath) };

        const wb = XLSX.readFile(filePath);
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        let count = 0;

        for (const rawRow of data) {
            const row = this.normalizeRow(rawRow);
            try {
                const rawId = row['customer_id'];
                if (!rawId) continue;

                const clientExists = await Client.findOne({ where: { customerId: rawId.toString() } });
                
                const clientData = {
                    customerId: rawId.toString(),
                    cedula: `REF-${rawId}`,
                    name: (row['nombre'] || '').trim(),
                    surname1: (row['1 apellido'] || '').trim(),
                    surname2: (row['2 apellido'] || '').trim(),
                    genero: row['genero'],
                    pais: row['pais'],
                    ciudad: row['ciudad'],
                    tipoCliente: row['tipo de cliente'],
                    socioFundador: row['socio fundador'],
                    referido: row['referido'],
                    cargo: row['cargo'],
                    fechaIngreso: this.parseExcelDate(row['fecha de ingreso']),
                    fechaBaja: this.parseExcelDate(row['fecha de baja']),
                    estatus: row['estado'],
                    email: `cliente${rawId}@credifuturo.com`
                };

                if (!clientExists) {
                    clientData.password = '123';
                }

                await DBClient.upsertClient(clientData);
                count++;
            } catch (err) {
                console.error('Error importando fila de socio:', err.message);

            }
        }
        return { imported: count, total: data.length };
    },

    normalizeRow(row) {
        const normalized = {};
        for (const key in row) {
            // Replace non-breaking spaces and trim
            const cleanKey = key.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            normalized[cleanKey] = row[key];
        }
        return normalized;
    },

    async importSavings(dataDir) {
        const monthlyFile = path.join(dataDir, '1-orders_table_ahorro_mensual.xlsx');
        let count = 0;
        const importedIds = new Set();

        const processSaving = async (filePath, type) => {
            if (!fs.existsSync(filePath)) return;
            try {
                const wb = XLSX.readFile(filePath);
                if (!wb.SheetNames || wb.SheetNames.length === 0) return;

                const sheet = wb.Sheets[wb.SheetNames[0]];
                if (!sheet) return;

                const data = XLSX.utils.sheet_to_json(sheet);

                for (const rawRow of data) {
                    const row = this.normalizeRow(rawRow);
                    try {
                        const rawId = row['customer_id'];
                        if (!rawId) continue;

                        const customerId = rawId.toString();
                        const client = await Client.findOne({ where: { customerId: customerId } });

                        if (client) {
                            const transId = (row['# transaccion'] || row['#transaccion'] || '').toString();
                            const amountVal = row['valor mensual'] || row['valor'] || 0;
                            const amount = typeof amountVal === 'number' ? amountVal : parseFloat(amountVal.toString().replace(/[$,\s]/g, '')) || 0;

                            const extId = (row['id_vm'] || row['id_ai'] || '').toString();
                            const year = row['año pago'] || row['año'] || row['año pago'] || row['year'];
                            const month = row['mes pago'] || row['mes'] || row['month'];
                            const status = row['estado'] || row['status'] || 'Activo';

                            let existing = null;
                            if (extId) {
                                existing = await Saving.findOne({ where: { externalId: extId } });
                            }

                            const payDate = this.parseExcelDate(row['fecha pago']) || new Date();
                            const payDateObj = new Date(payDate);

                            const mesAbonadoRaw = row['mes abonado'];
                            const anioAbonadoRaw = row['año abonado'];
                            const finalMesAbonado = mesAbonadoRaw !== undefined ? mesAbonadoRaw : (payDateObj.getMonth() + 1);
                            const finalAnioAbonado = anioAbonadoRaw !== undefined ? anioAbonadoRaw : payDateObj.getFullYear();

                            const savingData = {
                                clientId: client.id,
                                amount: amount,
                                date: payDate,
                                type: type,
                                banco: row['banco'] || row['banco '],
                                numeroTransaccion: transId,
                                origen: row['tipo de ahorro'] || row['desde cuenta de ahorros'] || row['cuenta de ahorros'],
                                penalizacion: row['penalizacion'] || 'NO',
                                diasPenalizacion: row['dias penalizacion'] || 0,
                                valorAhorrado: row['valor ahorrado'],
                                valorAPenalizar: row['valor a penalizar'] || 0,
                                mesAbonado: finalMesAbonado,
                                anioAbonado: finalAnioAbonado,
                                year: year,
                                month: month,
                                monthInt: month ? this.getMonthIntFromName(month.toString()) : null,
                                externalId: extId,
                                status: status,
                                itemQuantity: row['item_quantity'] || row['item quantity'],
                                observaciones: row['observaciones'] || ''
                            };

                            if (existing) {
                                await existing.update(savingData);
                            } else {
                                await DBClient.addSaving(savingData);
                            }
                            if (extId) importedIds.add(extId);
                            count++;
                        }
                    } catch (rowErr) {
                        console.error(`[Saving Import Error] ${type} row:`, rowErr.message);
                    }
                }
            } catch (fileErr) {
                console.error(`[Saving Import File Error] ${filePath}:`, fileErr.message);
            }
        };

        await processSaving(monthlyFile, 'Mensual');
        await processSaving(path.join(dataDir, '1-orders_table_aportes_iniciales.xlsx'), 'Aporte Inicial');

        // LIMPIEZA DETERMINÍSTICA: Eliminar registros que NO están en el Excel actual
        const { Op } = require('sequelize');
        const deletedCount = await Saving.destroy({
            where: {
                externalId: { [Op.notIn]: Array.from(importedIds) },
                type: { [Op.in]: ['Mensual', 'Aporte Inicial'] } // Only delete these types
            }
        });

        if (deletedCount > 0) {
            console.log(`[Deterministic Sync] Registros de ahorro eliminados por no estar en origen: ${deletedCount}`);
        }

        return { imported: count, deleted: deletedCount, total: count };
    },

    async importDisbursed(filePath) {
        if (!fs.existsSync(filePath)) return { error: 'Archivo no encontrado: ' + path.basename(filePath) };
        let count = 0;
        let data = [];
        try {
            const wb = XLSX.readFile(filePath);
            if (!wb.SheetNames || wb.SheetNames.length === 0) return { error: 'Archivo sin hojas' };
            data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

            for (const rawRow of data) {
                const row = this.normalizeRow(rawRow);
                try {
                    const rawId = row['customer_id'];
                    if (!rawId) continue;
                    const customerId = rawId.toString();
                    const client = await Client.findOne({ where: { customerId: customerId } });
                    const orderId = row['id_vm'] ? row['id_vm'].toString() : null;
                    const montoVal = row['valor prestado'] || row['monto'];
                    if (!montoVal) continue;
                    const monto = typeof montoVal === 'number' ? montoVal : parseFloat(montoVal.toString().replace(/[$,\s]/g, '')) || 0;

                    const loanData = {
                        clientId: client ? client.id : null,
                        idVm: orderId, // Set idVm from id_vm
                        orderId: orderId, // Also keep orderId for backward compatibility
                        socio: ((row['nombre'] || '') + ' ' + (row['apellido'] || '')).trim(),
                        estado: row['estado'],
                        fechaPrestamo: this.parseExcelDate(row['fecha prestamo'] || row['fecha de prestamo']),
                        mesDesembolso: row['mes desembolso'] || '',
                        anioDesembolso: row['año desembolso'] || '',
                        valorPrestado: monto,
                        cuotas: row['# cuotas prestamo'] || row['# cuotas'] || row['cuotas'] || '',
                        interesMensual: row['interes mensual'] || 0,
                        diasPagoMax: row['dias de pago max'] || row['dias pago max'] || row['dias máximo de pago'] || '',
                        itemQuantity: row['item_quantity'] || row['item quantity'] || 1,
                        banco: row['banco desembolsado'] || row['banco'] || '',
                        numeroTransaccion: (row['# transaccion'] || row['#transaccion'] || '').toString(),
                        cuentaAhorros: (row['cuenta de ahorros'] || row['cuenta de ahorro'] || '').toString(),
                        observaciones: row['observaciones'] || ''
                    };

                    if (orderId) {
                        const existing = await DisbursedLoan.findOne({ where: { orderId: orderId } });
                        if (existing) {
                            await existing.update(loanData);
                            count++;
                            continue;
                        }
                    }

                    await DBClient.recordDisbursedLoan(loanData);
                    count++;
                } catch (rowErr) {
                    console.error('Error importando fila de préstamo:', rowErr.message);
                }
            }
        } catch (fileErr) {
            console.error('Error crítico leyendo archivo:', fileErr.message);
            return { error: fileErr.message };
        }
        return { imported: count, total: data.length };
    },

    async importPayments(filePath) {
        if (!fs.existsSync(filePath)) return { imported: 0, error: 'Archivo no encontrado' };

        let count = 0;
        let errors = 0;
        let data = [];

        try {
            const wb = XLSX.readFile(filePath);
            if (!wb.SheetNames || wb.SheetNames.length === 0) {
                return { imported: 0, error: 'El archivo Excel no contiene hojas de cálculo.' };
            }

            const sheetName = wb.SheetNames[0];
            const sheet = wb.Sheets[sheetName];
            if (!sheet) {
                return { imported: 0, error: 'La hoja de cálculo está vacía o corrupta.' };
            }

            data = XLSX.utils.sheet_to_json(sheet);

            for (const rawRow of data) {
                const row = this.normalizeRow(rawRow);
                try {
                    // 1. Validation: Critical External IDs
                    const epId = row['id_ep'] ? row['id_ep'].toString() : null;

                    // Skip completely empty rows that have neither EP nor VM
                    if (!epId && !row['id_vm']) {
                        continue;
                    }

                    // 2. Validation: Client Link
                    const rawId = row['customer_id'];
                    if (!rawId) {
                        console.warn(`[Import Skipped] Payment row missing customer_id: EP-${epId}`);
                        continue;
                    }
                    const customerId = rawId.toString();
                    const client = await Client.findOne({ where: { customerId: customerId } });

                    if (!client) {
                        console.warn(`[Import Skipped] Payment for unknown customer_id: ${customerId}`);
                        continue;
                    }

                    // 3. Optional Link: Loan
                    let loanId = null;
                    if (row['id_vm']) {
                        const loan = await DisbursedLoan.findOne({ where: { orderId: row['id_vm'].toString() } });
                        if (loan) loanId = loan.id;
                    }

                    // 4. Data Normalization (Prevent NOT NULL violations)
                    // Helper to safely parse numbers
                    const getNum = (val) => {
                        if (val === undefined || val === null || val === '') return 0;
                        if (typeof val === 'number') return val;
                        const clean = val.toString().replace(/[$,\s]/g, '');
                        const parsed = parseFloat(clean);
                        return isNaN(parsed) ? 0 : parsed;
                    };

                    const fechaPagoSafe = this.parseExcelDate(row['fecha de pago max']);

                    await DBClient.addPayment({
                        clientId: client.id,
                        loanId: loanId,
                        externalId: epId,

                        // Strings
                        mesDesembolso: row['mes desembolso'] || '',
                        mesPago: row['mes de pago'] || '',
                        estado: row['estado'] || 'Pendiente',
                        banco: row['banco desembolsado'] || '',
                        numeroTransaccion: row['# transaccion'] ? row['# transaccion'].toString() : '',
                        cuentaAhorros: row['cuenta de ahorros'] ? row['cuenta de ahorros'].toString() : '',
                        observaciones: row['observaciones'] || '',
                        estadoPrestamo: row['estado prestamo'] || '',
                        idVm: row['id_vm'] ? row['id_vm'].toString() : '',

                        // Numbers (Safe parsing)
                        saldoInicial: getNum(row['saldo inicial']),
                        cuotasPrestamo: getNum(row['# cuotas prestamo']),
                        itemQuantity: getNum(row['item_quantity']),
                        interesMensual: getNum(row['interes mensual']),
                        valorInteresesAmortizados: getNum(row['valor intereses amortizados']),
                        valorCuotaVariable: getNum(row['valor cuota variable']),
                        valorCuotaPago: getNum(row['valor cuota pago']),
                        saldoFinal: getNum(row['saldo final']),

                        // Dates
                        fechaPagoMax: fechaPagoSafe
                    });
                    count++;
                } catch (err) {
                    console.error(`[Import Error] Row EP-${row['id_ep']}:`, err.message);
                    errors++;
                }
            }
        } catch (fileErr) {
            console.error(`[Import File Error] ${filePath}:`, fileErr.message);
            return { imported: count, errors: errors, criticalError: fileErr.message };
        }

        console.log(`Import Payments Finished: ${count} imported, ${errors} skipped/errors.`);
        return { imported: count, errors: errors, total: data.length };
    },

    parseExcelDate(excelDate) {
        if (!excelDate) return null;
        if (typeof excelDate === 'number') {
            return new Date(Math.round((excelDate - 25569) * 864e5));
        }
        const d = new Date(excelDate);
        return isNaN(d.getTime()) ? null : d;
    },

    getMonthIntFromName(name) {
        if (!name) return null;
        const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const cleanName = name.toString().toLowerCase().trim();
        const index = months.indexOf(cleanName);
        return index !== -1 ? index + 1 : null;
    }
};

module.exports = ImportService;