require('dotenv').config();
const { DisbursedLoan, LoanPayment, Client } = require('./models');
const sequelize = require('./config/database');

sequelize.authenticate().then(async () => {
    const loans = await DisbursedLoan.findAll({ include: Client });
    const monthNamesList = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Get max P number
    const allExistingPayments = await LoanPayment.findAll({ attributes: ['externalId'] });
    const pPattern = /^P\s*(\d+)$/i;
    let maxPNumber = 0;
    allExistingPayments.forEach(p => {
        if (p.externalId && pPattern.test(p.externalId)) {
            const val = parseInt(p.externalId.match(pPattern)[1]);
            if (val > maxPNumber) maxPNumber = val;
        }
    });
    let nextPNumber = maxPNumber + 1;

    let restoredLoansCount = 0;
    let generatedCuotas = 0;

    for (const loan of loans) {
        const cuotas = loan.cuotas;
        if (!cuotas || cuotas <= 0) continue;

        const payments = await LoanPayment.findAll({ where: { idVm: loan.idVm } });

        // Si le faltan cuotas (mi script borró las de itemQuantity=1)
        if (payments.length < cuotas) {
            console.log('Restaurando ' + loan.idVm + ' (faltan cuotas: tiene ' + payments.length + ', debía tener ' + cuotas + ')');

            // Borrar las existentes (incompletas)
            await LoanPayment.destroy({ where: { idVm: loan.idVm } });

            // Regenerar limpiamente
            const valorPrestado = parseFloat(loan.valorPrestado);
            const interesMensual = parseFloat(loan.interesMensual || 0);
            const capitalPorCuota = valorPrestado / cuotas;
            const fechaDate = new Date(loan.fechaPrestamo);
            const disbMes = fechaDate.getMonth();
            const disbAnio = fechaDate.getFullYear();

            let saldoInicialActual = valorPrestado;
            const scheduleRows = [];

            for (let i = 1; i <= cuotas; i++) {
                const interesesCuota = parseFloat((saldoInicialActual * interesMensual).toFixed(2));
                const valorCuotaVariable = parseFloat((capitalPorCuota + interesesCuota).toFixed(2));
                const saldoFinal = parseFloat((saldoInicialActual - capitalPorCuota).toFixed(2));
                const pagoMesIdx = (disbMes + i) % 12;
                const pagoAnio = disbAnio + Math.floor((disbMes + i) / 12);
                const mm = String(pagoMesIdx + 1).padStart(2, '0');

                scheduleRows.push({
                    externalId: 'P' + (nextPNumber++),
                    clientId: loan.clientId,
                    mesDesembolso: loan.mesDesembolso,
                    saldoInicial: parseFloat(saldoInicialActual.toFixed(2)),
                    cuotasPrestamo: cuotas,
                    interesMensual: interesMensual,
                    valorInteresesAmortizados: interesesCuota,
                    fechaPagoMax: pagoAnio + '-' + mm + '-10',
                    mesPago: monthNamesList[pagoMesIdx],
                    valorCuotaVariable: valorCuotaVariable,
                    estado: 'Pendiente',
                    valorCuotaPago: 0,
                    saldoFinal: Math.max(0, saldoFinal),
                    itemQuantity: i,
                    banco: loan.banco || null,
                    numeroTransaccion: loan.numeroTransaccion || null,
                    cuentaAhorros: loan.cuentaAhorros || null,
                    observaciones: null,
                    idVm: loan.idVm,
                    estadoPrestamo: loan.estado || 'Pendiente'
                });
                saldoInicialActual = saldoFinal;
            }
            await LoanPayment.bulkCreate(scheduleRows);
            restoredLoansCount++;
            generatedCuotas += cuotas;
        }
    }

    console.log('Se restauraron ' + restoredLoansCount + ' préstamos, generando ' + generatedCuotas + ' cuotas.');
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
