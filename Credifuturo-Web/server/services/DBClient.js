const Client = require('../models/Client');
const Loan = require('../models/Loan');
const DisbursedLoan = require('../models/DisbursedLoan');
const Saving = require('../models/Saving');
const LoanPayment = require('../models/LoanPayment');
const sequelize = require('../config/database');

/**
 * DBClient Service
 * Encapsulates formal database operations with validation and error handling.
 */
const DBClient = {
    // === FETCH OPERATIONS ===

    async getClients() {
        try {
            return await Client.findAll({
                attributes: { exclude: ['password'] },
                order: [['name', 'ASC']]
            });
        } catch (error) {
            console.error('Fetch Error (Clients):', error.message);
            throw new Error('Error al obtener datos de los socios');

        }
    },

    async getLoansWithClients() {
        try {
            return await Loan.findAll({
                include: [{ model: Client, attributes: ['name', 'cedula'] }]
            });
        } catch (error) {
            console.error('Fetch Error (Loans):', error.message);
            throw new Error('Error al obtener datos de préstamos');

        }
    },

    // === INSERT / UPSERT OPERATIONS ===

    async upsertClient(clientData) {
        try {
            if (!clientData.cedula || !clientData.name) {
                throw new Error('Campos obligatorios faltantes (cédula/nombre)');

            }

            let client;
            if (clientData.customerId) {
                client = await Client.findOne({ where: { customerId: clientData.customerId.toString() } });
            }

            if (!client) {
                client = await Client.findOne({ where: { cedula: clientData.cedula.toString() } });
            }

            const bcrypt = require('bcryptjs');
            if (clientData.password) {
                clientData.password = await bcrypt.hash(clientData.password, 10);
            }

            if (!client) {
                client = await Client.create({
                    ...clientData,
                    password: clientData.password || await bcrypt.hash('123', 10)
                });
            } else {
                await client.update(clientData);
            }

            return client;
        } catch (error) {
            console.error('Upsert Error (Client):', error.message);
            throw error;
        }
    },

    async addSaving(savingData) {
        try {
            if (!savingData.clientId || !savingData.amount) {
                throw new Error('Datos de ahorro inválidos: Falta referencia de socio o monto');

            }

            return await Saving.create(savingData);
        } catch (error) {
            console.error('Insert Error (Saving):', error.message);
            throw error;
        }
    },

    async recordDisbursedLoan(loanData) {
        const t = await sequelize.transaction();
        try {
            // High seniority check: Ensure atomicity when populating two related tables
            const disbursed = await DisbursedLoan.create(loanData, { transaction: t });

            await Loan.create({
                clientId: loanData.clientId,
                amount: loanData.monto,
                date: loanData.fechaDesembolso,
                status: 'Aprobado',

                purpose: 'Excel Import',
                interestRate: loanData.interesMensual,
                bank: loanData.banco
            }, { transaction: t });

            await t.commit();
            return disbursed;
        } catch (error) {
            await t.rollback();
            console.error('Transaction Error (DisbursedLoan):', error.message);
            throw error;
        }
    },

    async addPayment(paymentData) {
        try {
            if (!paymentData.clientId && !paymentData.loanId && !paymentData.externalId) {
                throw new Error('Datos de pago inválidos: Faltan identificadores');

            }

            // High seniority check: Duplicate prevention via externalId (id_ep)
            if (paymentData.externalId) {
                const existing = await LoanPayment.findOne({ where: { externalId: paymentData.externalId.toString() } });
                if (existing) {
                    await existing.update(paymentData);
                    return existing;
                }
            }

            return await LoanPayment.create(paymentData);
        } catch (error) {
            console.error('Insert Error (LoanPayment):', error.message);
            throw error;
        }
    }
};

module.exports = DBClient;
