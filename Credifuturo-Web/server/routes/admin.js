const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Client, Saving, Soporte, Loan, DisbursedLoan, LoanPayment } = require('../models');
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole, requireFreshPassword } = require('../middleware/authMiddleware');
const { validatePassword, generateTempPassword } = require('../services/passwordPolicy');
const { logSecurityEvent, getClientIp } = require('../services/securityLogger');

// --- Funciones de Utilidad ---
/**
 * Formatea un string de fecha de AAAA-MM-DD a DD-MM-AAAA.
 * Devuelve el string original si el formato no es el esperado.
 * @param {string | null | undefined} dateString - La fecha en formato AAAA-MM-DD.
 * @returns {string | null | undefined} La fecha en formato DD-MM-AAAA.
 */
const formatDateToDMY = (dateString) => {
    if (!dateString || typeof dateString !== 'string') {
        return dateString;
    }
    const datePart = dateString.split('T')[0]; // Maneja 'AAAA-MM-DDTHH:mm:ss.sssZ'
    const parts = datePart.split('-');
    if (parts.length === 3 && parts[0].length === 4) { // Chequeo básico para AAAA-MM-DD
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateString; // Devuelve original si no está en el formato esperado
};

const normalizeEmailPart = (str) => {
    if (!str || typeof str !== 'string') return '';
    const firstWord = str.trim().split(/\s+/)[0];
    return firstWord
        .normalize('NFD')
        .replace(/\p{Mn}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
};

const generateUniqueEmail = async (name, surname1, excludeId = null) => {
    const { Op } = require('sequelize');
    const first = normalizeEmailPart(name);
    const last  = normalizeEmailPart(surname1);
    if (!first && !last) return null;
    const baseLocal = `${first}.${last}`;
    const domain    = '@credifuturo.com';
    let candidate   = `${baseLocal}${domain}`;
    let counter     = 1;
    while (true) {
        const where = { email: candidate };
        if (excludeId) where.id = { [Op.ne]: excludeId };
        const conflict = await Client.findOne({ where });
        if (!conflict) return candidate;
        counter++;
        candidate = `${baseLocal}${counter}${domain}`;
    }
};

// Multer: almacenar archivo en memoria para guardar como BLOB en SQLite
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (JPG, PNG, GIF, WEBP) y PDF'));
        }
    }
});


// --- Loan Status Validation Helper ---
async function validateAndFixLoanStatuses() {
    const { Op } = require('sequelize');
    try {
        const activeLoans = await DisbursedLoan.findAll({
            attributes: ['id', 'idVm', 'estado']
        });

        let fixed = 0;
        for (const loan of activeLoans) {
            if (!loan.idVm) continue;
            if ((loan.estado || '').trim() === 'Cancelado') continue;
            const total = await LoanPayment.count({ where: { idVm: loan.idVm } });
            if (total === 0) continue;
            const paid = await LoanPayment.count({ where: { idVm: loan.idVm, estado: 'Pago' } });
            if (paid === total) {
                await loan.update({ estado: 'Cancelado' });
                await LoanPayment.update(
                    { estadoPrestamo: 'Cancelado' },
                    { where: { idVm: loan.idVm } }
                );
                fixed++;
                console.log(`✅ Préstamo ${loan.idVm} marcado como Cancelado (${paid}/${total} cuotas pagadas)`);
            }
        }
        return fixed;
    } catch (err) {
        console.error('Error en validateAndFixLoanStatuses:', err);
        return 0;
    }
}

// A01 (Broken Access Control): deny-by-default.
// /my/* lleva su propia auth por ruta. /dashboard-stats lo puede leer cualquier socio
// autenticado (el panel de Inicio lo comparte). El resto exige rol admin.
// A07: ademas exigimos que el usuario no tenga mustChangePassword pendiente.
const READ_ONLY_FOR_ALL = new Set(['/dashboard-stats']);
router.use((req, res, next) => {
    if (req.path.startsWith('/my/')) return next();
    if (req.method === 'GET' && READ_ONLY_FOR_ALL.has(req.path)) {
        return verifyToken(req, res, () => requireFreshPassword(req, res, next));
    }
    verifyToken(req, res, () =>
        requireFreshPassword(req, res, () =>
            requireRole('admin')(req, res, next)
        )
    );
});

// --- Clients ---
router.get('/clients', async (req, res) => {
    try {
        const clients = await Client.findAll({
            limit: 500,
            attributes: { exclude: ['password'] } // A02: no exponer hashes bcrypt
        });
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /clients/list - Lista completa de clientes para tabla (ordenada por PK ASC)
router.get('/clients/list', async (req, res) => {
    try {
        const { q } = req.query;
        let whereClause = {};

        // Búsqueda opcional por nombre, apellido o cédula
        if (q && q.trim()) {
            const { Op } = require('sequelize');
            const searchTerm = q.trim();
            whereClause = {
                [Op.or]: [
                    { name: { [Op.like]: `%${searchTerm}%` } },
                    { surname1: { [Op.like]: `%${searchTerm}%` } },
                    { surname2: { [Op.like]: `%${searchTerm}%` } },
                    { cedula: { [Op.like]: `%${searchTerm}%` } },
                    { customerId: { [Op.like]: `%${searchTerm}%` } }
                ]
            };
        }

        const clients = await Client.findAll({
            where: whereClause,
            // Order by customerId (official business PK) as integer for correct sorting
            order: [[require('sequelize').Sequelize.literal('CAST(customerId AS INTEGER)'), 'ASC']],
            attributes: { exclude: ['password'] } // No exponer contraseñas hasheadas
        });

        // Normalizar datos: trim strings, nulls seguros, fechas ISO
        const normalizedData = clients.map(c => {
            const raw = c.toJSON();
            const normalized = {};
            for (const [key, value] of Object.entries(raw)) {
                if (typeof value === 'string') {
                    normalized[key] = value.trim();
                } else if (value === undefined) {
                    normalized[key] = null;
                } else {
                    normalized[key] = value;
                }
            }

            // Formatear fecha a DD-MM-AAAA
            normalized.fechaPrestamo = formatDateToDMY(normalized.fechaPrestamo);
            return normalized;
        });

        res.json({
            ok: true,
            data: normalizedData,
            total: normalizedData.length
        });
    } catch (err) {
        console.error('Error en /clients/list:', err);
        res.status(500).json({ ok: false, error: err.message, data: [], total: 0 });
    }
});

router.get('/clients/cedula/:cedula', async (req, res) => {
    try {
        const client = await Client.findOne({
            where: { cedula: req.params.cedula },
            attributes: { exclude: ['password'] } // A02: no exponer hashes bcrypt
        });
        if (!client) return res.status(404).json({ error: 'Socio no encontrado con esa cédula.' });
        res.json(client);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/clients', async (req, res) => {
    try {
        const {
            cedula, name, surname1, surname2, email, password,
            genero, pais, ciudad, tipoCliente, socioFundador,
            referido, cargo, fechaIngreso, fechaBaja, estatus, customerId
        } = req.body;

        const existing = await Client.findOne({ where: { cedula } });
        if (existing) {
            return res.status(400).json({ error: 'Ya existe un socio registrado con esta cédula.' });
        }

        let nextCustomerId = customerId;
        if (!nextCustomerId) {
            const lastClient = await Client.findOne({
                where: { customerId: { [require('sequelize').Op.ne]: null } },
                order: [
                    [require('sequelize').Sequelize.literal('CAST(customerId AS INTEGER)'), 'DESC'],
                    ['customerId', 'DESC']
                ]
            });
            nextCustomerId = lastClient ? (parseInt(lastClient.customerId) + 1).toString() : "1";
        }

        // A07: sin contraseña por defecto compartida. Si el admin no la provee,
        // generamos una temporal aleatoria que cumple política y la devolvemos
        // UNA SOLA VEZ en la respuesta para que se la comunique al socio.
        const providedPassword = password && String(password).trim();
        let tempPasswordForResponse = null;
        if (providedPassword) {
            const policyError = validatePassword(providedPassword);
            if (policyError) return res.status(400).json({ error: policyError });
        } else {
            tempPasswordForResponse = generateTempPassword();
        }
        const hashedPassword = await bcrypt.hash(providedPassword || tempPasswordForResponse, 10);

        let resolvedEmail = (email === '' || email === 'null' || email === 'undefined') ? null : email;
        if (!resolvedEmail) {
            resolvedEmail = await generateUniqueEmail(name, surname1);
        }

        const newClient = await Client.create({
            customerId: nextCustomerId,
            cedula,
            name,
            surname1,
            surname2,
            email: resolvedEmail,
            password: hashedPassword,
            role: 'user',
            genero,
            pais,
            ciudad,
            tipoCliente,
            socioFundador,
            referido,
            cargo,
            fechaIngreso: fechaIngreso || new Date(),
            fechaBaja: (fechaBaja === '' || fechaBaja === 'Invalid date') ? null : fechaBaja,
            // Ensure strictly Activo or Inactivo
            // Ensure strictly Activo or Inactivo
            estatus: estatus || 'Activo',
            mustChangePassword: true
        });
        logSecurityEvent('CLIENT_CREATED', { actorId: req.user?.id, newClientId: newClient.id, ip: getClientIp(req) });
        const safeClient = newClient.toJSON();
        delete safeClient.password;
        // tempPassword se devuelve solo si el admin no proveyó una — debe comunicársela al socio
        res.status(201).json({ ...safeClient, tempPassword: tempPasswordForResponse });
    } catch (err) {
        console.error("Error creating client:", err);
        if (err.name === 'SequelizeValidationError') {
            const messages = err.errors.map(e => e.message).join(', ');
            return res.status(400).json({ error: `Datos inválidos: ${messages}` });
        }
        if (err.name === 'SequelizeUniqueConstraintError') {
            const field = err.errors[0].path;
            const value = err.errors[0].value;
            return res.status(409).json({ error: `El valor '${value}' para '${field}' ya está registrado.` });
        }
        res.status(400).json({ error: err.message });
    }
});

// A08 (Software and Data Integrity Failures): whitelist explícita de campos
// editables. Bloquea mass-assignment de role, customerId, password, mustChangePassword, etc.
const ALLOWED_CLIENT_FIELDS = [
    'cedula', 'name', 'surname1', 'surname2', 'email',
    'genero', 'pais', 'ciudad', 'tipoCliente', 'socioFundador',
    'referido', 'cargo', 'fechaIngreso', 'fechaBaja', 'estatus'
];

router.put('/clients/:id', async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id);
        if (!client) return res.status(404).json({ error: 'Socio no encontrado' });

        // Rechaza cambios de contraseña por este endpoint — existe /clients/:id/reset-password
        if (req.body.password !== undefined) {
            return res.status(400).json({
                error: 'Use /clients/:id/reset-password para cambiar contraseñas.'
            });
        }

        const updates = {};
        for (const k of ALLOWED_CLIENT_FIELDS) {
            if (req.body[k] !== undefined) updates[k] = req.body[k];
        }
        if (updates.fechaBaja === '' || updates.fechaBaja === 'Invalid date') updates.fechaBaja = null;
        if (updates.email === '' || updates.email === 'null') updates.email = null;

        await client.update(updates);

        const safe = client.toJSON();
        delete safe.password;
        res.json(safe);
    } catch (err) {
        console.error("Error updating client:", err);
        if (err.name === 'SequelizeValidationError') {
            const messages = err.errors.map(e => e.message).join(', ');
            return res.status(400).json({ error: `Datos inválidos: ${messages}` });
        }
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'Ya existe otro socio con este dato único (Cédula/Email).' });
        }
        res.status(400).json({ error: err.message });
    }
});

router.delete('/clients/:id', async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id);
        if (!client) return res.status(404).json({ error: 'Socio no encontrado' });

        const savingsCount = await Saving.count({ where: { clientId: req.params.id } });
        const loansCount = await Loan.count({ where: { clientId: req.params.id } });

        if (savingsCount > 0 || loansCount > 0) {
            return res.status(400).json({ error: 'No se puede eliminar un socio que tiene ahorros o préstamos registrados.' });
        }

        await client.destroy();
        res.json({ message: 'Socio eliminado con éxito' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Migración masiva: reasigna correos @credifuturo.com a todos los socios
router.post('/clients/bulk-update-emails', verifyToken, requireRole('admin'), async (_req, res) => {
    try {
        const clients = await Client.findAll({ order: [['id', 'ASC']] });
        let updated = 0;
        const errors = [];

        for (const client of clients) {
            try {
                const newEmail = await generateUniqueEmail(client.name, client.surname1, client.id);
                if (!newEmail) {
                    errors.push({ id: client.id, reason: 'Nombre/apellido vacíos' });
                    continue;
                }
                await client.update({ email: newEmail });
                updated++;
            } catch (err) {
                errors.push({ id: client.id, reason: err.message });
            }
        }

        res.json({
            ok: true,
            updated,
            total: clients.length,
            errors: errors.length > 0 ? errors : undefined,
            message: `${updated} de ${clients.length} socios actualizados.`
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/clients/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);

        const { Op } = require('sequelize');
        const clients = await Client.findAll({
            where: {
                [Op.or]: [
                    { name: { [Op.like]: `%${query}%` } },
                    { surname1: { [Op.like]: `%${query}%` } },
                    { surname2: { [Op.like]: `%${query}%` } },
                    { cedula: { [Op.like]: `%${query}%` } }
                ]
            }
        });
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get('/clients/:id/balance', async (req, res) => {
    try {
        const clientId = req.params.id;

        // Calculate total savings
        const totalSavings = await Saving.sum('amount', { where: { clientId } }) || 0;

        // Calculate total disbursed loans
        const disbursedLoans = await DisbursedLoan.findAll({ where: { clientId } });
        const totalDisbursed = disbursedLoans.reduce((sum, loan) => sum + parseFloat(loan.monto || 0), 0);

        // Calculate total payments made (amortization)
        const totalPayments = await LoanPayment.sum('valorCuotaPago', { where: { clientId } }) || 0;

        // Simple balance logic for this context
        const balance = totalSavings;
        const debt = totalDisbursed - totalPayments;

        res.json({
            balance: parseFloat(balance).toFixed(2),
            debt: parseFloat(debt).toFixed(2),
            totalSavings: parseFloat(totalSavings).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /clients/:id/active-loan — Verifica si el socio tiene un préstamo Vigente
// Usado por el formulario "Registrar Nuevo Desembolso" para mostrar alerta previa.
router.get('/clients/:id/active-loan', async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const clientId = req.params.id;

        const prestamoVigente = await DisbursedLoan.findOne({
            where: {
                client_id: clientId,
                estado: { [Op.like]: '%Vigente%' }
            },
            order: [['id', 'DESC']]
        });

        if (!prestamoVigente) {
            return res.json({ tienePrestamoActivo: false, prestamo: null });
        }

        // Cuotas pendientes del préstamo vigente
        const cuotasPendientes = await LoanPayment.findAll({
            where: {
                idVm: prestamoVigente.idVm,
                estado: 'Pendiente'
            },
            order: [['item_quantity', 'ASC']]
        });

        // saldoPendiente = saldoInicial de la primera cuota pendiente (balance actual outstanding)
        const saldoPendiente = cuotasPendientes.length > 0 ? parseFloat(cuotasPendientes[0].saldoInicial || 0) : 0;
        const interesCondonable = cuotasPendientes.reduce((s, c) => s + parseFloat(c.valorInteresesAmortizados || 0), 0);

        res.json({
            tienePrestamoActivo: true,
            prestamo: {
                id: prestamoVigente.id,
                idVm: prestamoVigente.idVm,
                valorPrestado: parseFloat(prestamoVigente.valorPrestado || prestamoVigente.monto || 0),
                cuotas: prestamoVigente.cuotas,
                cuotasPendientes: cuotasPendientes.length,
                saldoPendiente: Math.round(saldoPendiente),
                interesCondonable: Math.round(interesCondonable)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /clients/:id/loan-capacity — Análisis de capacidad de segundo préstamo
router.get('/clients/:id/loan-capacity', async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const clientId = req.params.id;

        const client = await Client.findByPk(clientId, { attributes: { exclude: ['password'] } });
        if (!client) return res.status(404).json({ error: 'Socio no encontrado' });

        // ── Ahorros ────────────────────────────────────────────────────────────
        const ahorroTotal = parseFloat(await Saving.sum('amount', { where: { clientId } }) || 0);
        const aporteInicial = parseFloat(await Saving.sum('amount', { where: { clientId, type: 'Aporte Inicial' } }) || 0);
        const ahorroMensual = parseFloat(await Saving.sum('amount', { where: { clientId, type: 'Mensual' } }) || 0);

        // ── Todas las cuotas pendientes del socio ──────────────────────────────
        const cuotasPendientes = await LoanPayment.findAll({
            where: { clientId, estado: 'Pendiente' },
            order: [['fechaPagoMax', 'ASC']]
        });

        // ── Pagos realizados (para excluir del cálculo de mora EP) ─────────────
        // Doble clave: mesPago Y itemQuantity para evitar falsos positivos por formato.
        const pagosRealizados = await LoanPayment.findAll({
            where: { clientId, estado: { [Op.in]: ['Pago', 'Abono'] } },
            attributes: ['clientId', 'idVm', 'mesPago', 'itemQuantity']
        });
        const paidKeySet = new Set();
        pagosRealizados.forEach(p => {
            const base = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}`;
            paidKeySet.add(`${base}|mes:${(p.mesPago || '').trim().toLowerCase()}`);
            if (p.itemQuantity != null) paidKeySet.add(`${base}|cuota:${p.itemQuantity}`);
        });

        // ── Umbral de mora EP: misma lógica que dashboard-stats ───────────────
        const nowLocal = new Date();
        const todayThreshold = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
        const monthsLower = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

        const safeParseDate = (dateVal, mesRef) => {
            if (!dateVal) return null;
            let dateStr = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal);
            if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
            const parts = dateStr.split('-');
            if (parts.length !== 3) return new Date(dateStr + 'T00:00:00');
            const [y, m, d] = parts.map(Number);
            if (mesRef) {
                const targetIdx = monthsLower.indexOf(mesRef.toLowerCase().trim()) + 1;
                if (targetIdx > 0) {
                    if (m === targetIdx) return new Date(y, m - 1, d);
                    if (d === targetIdx) return new Date(y, d - 1, m);
                }
            }
            return new Date(dateStr + 'T00:00:00');
        };

        // ── Clasificar cuotas: mora EP vs pendiente normal ─────────────────────
        // Mora EP: pendiente + fechaPagoMax < hoy + sin pago/abono registrado
        const cuotasMoraEP = [];
        const cuotasPendientesNormales = [];

        for (const q of cuotasPendientes) {
            const base2 = `${q.clientId}|${(q.idVm || '').trim().toLowerCase()}`;
            const keyMes2 = `${base2}|mes:${(q.mesPago || '').trim().toLowerCase()}`;
            const keyCuota2 = `${base2}|cuota:${q.itemQuantity}`;
            if (paidKeySet.has(keyMes2) || (q.itemQuantity != null && paidKeySet.has(keyCuota2))) continue;

            const fechaMax = safeParseDate(q.fechaPagoMax, q.mesPago);
            if (fechaMax && fechaMax < todayThreshold) {
                cuotasMoraEP.push(q);  // vencida = mora EP
            } else {
                cuotasPendientesNormales.push(q);  // no vencida = pendiente normal
            }
        }

        // ── Historial completo para scoring crediticio ─────────────────────────
        const historialPagoTotal = await LoanPayment.count({ where: { clientId, estado: { [Op.in]: ['Pago', 'Abono'] } } });
        // Mora histórica: cuotas con estado='Mora' (campo directo) + cuotas EP vencidas sin pagar
        const historialMoraDirecta = await LoanPayment.count({ where: { clientId, estado: 'Mora' } });
        const historialPendTotal = cuotasPendientes.length; // total pendientes del socio

        // ── Agrupar todas las cuotas activas por idVm ─────────────────────────
        const todasActivas = [...cuotasMoraEP, ...cuotasPendientesNormales];
        const porIdVm = {};

        for (const q of todasActivas) {
            const vm = (q.idVm || '').trim() || `_sin_id_${q.id}`;
            if (!porIdVm[vm]) {
                porIdVm[vm] = {
                    idVm: vm,
                    // Primera cuota (más antigua) = saldo real pendiente del préstamo
                    saldoPendiente: parseFloat(q.saldoInicial || 0),
                    cuotasMoraEPCount: 0,
                    cuotasPendientesCount: 0,
                    enMoraEP: false,
                    interesMensual: parseFloat(q.interesMensual || 0) * 100,
                    valorCuotasPendientes: 0,
                    cuotasDetalle: []
                };
            }
            const esMora = cuotasMoraEP.includes(q);
            if (esMora) {
                porIdVm[vm].cuotasMoraEPCount++;
                porIdVm[vm].enMoraEP = true;
            } else {
                porIdVm[vm].cuotasPendientesCount++;
            }
            porIdVm[vm].valorCuotasPendientes += parseFloat(q.valorCuotaVariable || 0);
            porIdVm[vm].cuotasDetalle.push({
                mes: q.mesPago,
                fecha: q.fechaPagoMax,
                valor: parseFloat(q.valorCuotaVariable || 0),
                esMora
            });
        }

        // ── Enriquecer con DisbursedLoan ───────────────────────────────────────
        const idVmsList = Object.keys(porIdVm);
        const disbursedMap = {};
        if (idVmsList.length > 0) {
            const disbursed = await DisbursedLoan.findAll({
                where: { clientId, idVm: { [Op.in]: idVmsList } }
            });
            disbursed.forEach(d => { disbursedMap[(d.idVm || '').trim()] = d; });
        }

        const detallesPrestamos = idVmsList.map(vm => {
            const d = disbursedMap[vm];
            const info = porIdVm[vm];
            return {
                idVm: vm,
                valorPrestado: d ? parseFloat(d.valorPrestado || 0) : 0,
                cuotas: d ? d.cuotas : null,
                interesMensual: info.interesMensual,
                saldoPendiente: info.saldoPendiente,
                valorCuotasPendientes: Math.round(info.valorCuotasPendientes),
                cuotasPendientesCount: info.cuotasPendientesCount,
                cuotasMoraEPCount: info.cuotasMoraEPCount,
                enMoraEP: info.enMoraEP,
                fechaPrestamo: d ? d.fechaPrestamo : null,
                estado: d ? d.estado : 'Vigente',
                cuotasDetalle: info.cuotasDetalle
            };
        });

        const totalDeudaPendiente = detallesPrestamos.reduce((s, l) => s + l.saldoPendiente, 0);
        const enMoraActual = detallesPrestamos.some(l => l.enMoraEP);
        const totalCuotasMoraEP = cuotasMoraEP.length;
        const totalMoraEPValor = cuotasMoraEP.reduce((s, q) => s + parseFloat(q.valorCuotaVariable || 0), 0);

        res.json({
            clientId,
            nombre: `${client.name} ${client.surname1 || ''} ${client.surname2 || ''}`.trim(),
            cedula: client.cedula,
            estatus: client.estatus,
            ahorroTotal,
            aporteInicial,
            ahorroMensual,
            prestamosVigentes: detallesPrestamos,
            totalPrestamosVigentes: detallesPrestamos.length,
            totalDeudaPendiente,
            enMoraActual,
            totalCuotasMoraEP,
            totalMoraEPValor: Math.round(totalMoraEPValor),
            historialMoraTotal: historialMoraDirecta + totalCuotasMoraEP,
            historialPagoTotal,
            historialPendTotal
        });
    } catch (err) {
        console.error('loan-capacity error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Savings ---
router.get('/savings', async (req, res) => {
    try {
        const { q, year, status } = req.query;
        const { Op } = require('sequelize');
        let whereClause = {};

        // Filtro año
        if (year && year.trim()) {
            whereClause.year = parseInt(year);
        }

        // Filtro estado
        if (status && status.trim()) {
            whereClause.status = status.trim();
        }

        // Búsqueda por nombre/apellido del socio
        let includeOpts = [
            {
                model: Client,
                attributes: ['id', 'customerId', 'name', 'surname1', 'surname2', 'cedula']
            }
        ];

        if (q && q.trim()) {
            const searchTerm = q.trim();
            includeOpts[0].where = {
                [Op.or]: [
                    { name: { [Op.like]: `%${searchTerm}%` } },
                    { surname1: { [Op.like]: `%${searchTerm}%` } },
                    { surname2: { [Op.like]: `%${searchTerm}%` } }
                ]
            };
            includeOpts[0].required = true; // INNER JOIN when searching by name
        }

        const savings = await Saving.findAll({
            where: whereClause,
            include: includeOpts,
            order: [['date', 'DESC']], // Parte D: ordenar por fecha más reciente
            limit: 500
        });
        res.json(savings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /savings/list - Lista completa de ahorros para tabla
router.get('/savings/list', async (req, res) => {
    try {
        const { q, year, status, type } = req.query;
        const { Op } = require('sequelize');
        let whereClause = {};

        // Filtro tipo (Mensual o Aporte Inicial)
        if (type && type.trim() && type.trim() !== 'Todos') {
            whereClause.type = type.trim();
        } else {
            // Default filter for "Lista de Ahorro": EXCLUDE "Aporte Inicial"
            whereClause.type = { [Op.ne]: 'Aporte Inicial' };
        }

        // Text search on saving fields
        if (q && q.trim()) {
            const searchTerm = q.trim();
            whereClause = {
                [Op.and]: [
                    whereClause, // Keep the type filtering
                    {
                        [Op.or]: [
                            { externalId: { [Op.like]: `%${searchTerm}%` } },
                            { banco: { [Op.like]: `%${searchTerm}%` } },
                            { numeroTransaccion: { [Op.like]: `%${searchTerm}%` } },
                            { month: { [Op.like]: `%${searchTerm}%` } },
                            { status: { [Op.like]: `%${searchTerm}%` } }
                        ]
                    }
                ]
            };
        }

        // Filtro año
        if (year && year.trim()) {
            whereClause.year = parseInt(year);
        }

        // Filtro estado
        if (status && status.trim()) {
            whereClause.status = status.trim();
        }

        const savings = await Saving.findAll({
            where: whereClause,
            include: [
                {
                    model: Client,
                    attributes: ['cedula', 'name', 'surname1', 'surname2', 'customerId', 'estatus']
                },
                {
                    model: Soporte
                }
            ],
            order: [['date', 'DESC']]
        });

        const normalizedData = savings.map(s => {
            const raw = s.get({ plain: true });
            const normalized = {};

            // Mapeo manual de campos conocidos para asegurar consistencia
            normalized.id = raw.id;
            normalized.clientId = raw.clientId;
            normalized.amount = raw.amount;
            normalized.date = raw.date;
            normalized.type = raw.type;
            normalized.banco = raw.banco ? raw.banco.trim() : '';
            normalized.numeroTransaccion = raw.numeroTransaccion ? raw.numeroTransaccion.trim() : '';
            normalized.origen = raw.origen ? raw.origen.trim() : '';
            normalized.penalizacion = raw.penalizacion || 'NO';
            normalized.diasPenalizacion = raw.diasPenalizacion || 0;
            normalized.valorAhorrado = raw.valorAhorrado || raw.amount || 0;
            normalized.valorAPenalizar = raw.valorAPenalizar || 0;
            normalized.mesAbonado = raw.mesAbonado;
            normalized.anioAbonado = raw.anioAbonado;
            normalized.year = raw.year;
            normalized.month = raw.month;
            normalized.monthInt = raw.monthInt;
            normalized.externalId = raw.externalId;
            normalized.status = raw.status;
            normalized.itemQuantity = raw.itemQuantity;
            normalized.observaciones = raw.observaciones ? raw.observaciones.trim() : '';

            // Client data
            const c = raw.Client || raw.client;
            normalized.clientName = c ? (c.name || '').trim() : '';
            normalized.clientSurname = c ? `${c.surname1 || ''} ${c.surname2 || ''}`.trim() : '';
            normalized.clientCedula = c ? c.cedula : '';
            normalized.clientCustomerId = c ? c.customerId : '';
            normalized.clientEstatus = c ? c.estatus : '';

            // Soporte data
            const sop = raw.Soporte || raw.soporte;
            normalized.soporte = sop ? { id: sop.id, name: sop.originalName || sop.name || 'Soporte' } : null;

            return normalized;
        });

        res.json({
            ok: true,
            data: normalizedData,
            total: normalizedData.length
        });
    } catch (err) {
        console.error('Error en /savings/list:', err);
        res.status(500).json({ ok: false, error: err.message, data: [], total: 0 });
    }
});

// GET /savings/ranking - Ranking de socios activos con análisis mes a mes
router.get('/savings/ranking', async (req, res) => {
    try {
        const { Sequelize } = require('sequelize');

        const clients = await Client.findAll({
            where: { estatus: 'Activo' },
            attributes: ['id', 'customerId', 'name', 'surname1', 'surname2'],
        });

        const allSavings = await Saving.findAll({
            where: {
                type: { [Sequelize.Op.ne]: 'Aporte Inicial' },
                clientId: { [Sequelize.Op.in]: clients.map(c => c.id) }
            },
            attributes: ['clientId', 'year', 'monthInt', 'mesAbonado', 'anioAbonado', 'valorAhorrado', 'amount'],
            order: [['anioAbonado', 'ASC'], ['mesAbonado', 'ASC']]
        });

        // Agrupar ahorros por socio.
        // Se usa mesAbonado/anioAbonado (el mes que CUBRE el ahorro) para que los socios
        // que pagaron el año completo en un solo mes sean correctamente clasificados.
        const savingsByClient = {};
        for (const s of allSavings) {
            const val = parseFloat(s.valorAhorrado > 0 ? s.valorAhorrado : s.amount) || 0;
            const effectiveYear = s.anioAbonado || s.year || 0;
            const effectiveMonth = s.mesAbonado || s.monthInt || 0;
            if (!savingsByClient[s.clientId]) savingsByClient[s.clientId] = [];
            savingsByClient[s.clientId].push({
                year: effectiveYear,
                monthInt: effectiveMonth,
                amount: val
            });
        }

        // Re-ordenar por mes cubierto (por si el fallback mezcló el orden)
        for (const id of Object.keys(savingsByClient)) {
            savingsByClient[id].sort((a, b) => a.year !== b.year ? a.year - b.year : a.monthInt - b.monthInt);
        }

        // Calcular métricas de comportamiento por socio
        const data = clients.map(c => {
            const months = savingsByClient[c.id] || [];
            const total = months.reduce((sum, m) => sum + m.amount, 0);
            if (total === 0) return null;

            // Últimos 3 meses vs. 3 anteriores para tendencia
            const recent = months.slice(-3).reduce((s, m) => s + m.amount, 0);
            const prev = months.slice(-6, -3).reduce((s, m) => s + m.amount, 0);
            const trendPct = prev > 0 ? Math.round(((recent - prev) / prev) * 100) : 0;

            // Consistencia: meses con ahorro / meses esperados desde el primero
            let consistencyPct = 100;
            const first = months[0];
            const last = months[months.length - 1];
            if (first && last && first.year && last.year) {
                const totalMonths = (last.year - first.year) * 12 + (last.monthInt - first.monthInt) + 1;
                consistencyPct = totalMonths > 0 ? Math.round((months.length / totalMonths) * 100) : 100;
            }

            return {
                id: c.id,
                customerId: c.customerId,
                fullName: `${c.name} ${c.surname1} ${c.surname2 || ''}`.trim(),
                totalNetSavings: total,
                monthsActive: months.length,
                avgMonthly: months.length > 0 ? Math.round(total / months.length) : 0,
                trendPct,
                consistencyPct,
                monthlyData: months
            };
        }).filter(Boolean).sort((a, b) => b.totalNetSavings - a.totalNetSavings);

        res.json({ ok: true, data });
    } catch (err) {
        console.error('Error en /savings/ranking:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/savings', async (req, res) => {
    try {
        // ==== 1. ID_VM CONSECUTIVO (SIEMPRE AM) ====
        // El usuario requiere continuar la serie AM (ej: AM338 -> AM339)
        const allSavings = await Saving.findAll({
            attributes: ['externalId'],
            where: { externalId: { [require('sequelize').Op.ne]: null } }
        });

        const amPattern = /^AM(\d+)$/;

        const amNumbers = allSavings
            .map(s => s.externalId)
            .filter(id => id && amPattern.test(id))
            .map(id => parseInt(id.match(amPattern)[1]))
            .filter(n => !isNaN(n));

        let nextExternalId;
        if (amNumbers.length === 0) {
            // Si no hay AM, iniciamos en AM1 (o el valor inicial deseado)
            nextExternalId = 'AM1';
        } else {
            const maxNum = Math.max(...amNumbers);
            nextExternalId = `AM${maxNum + 1}`;
        }

        console.log(`🔢 ID_VM Generado (AM): ${nextExternalId}`);

        // ==== 2. CÁLCULOS AUTOMÁTICOS ====
        // Extraer día, mes y año de Fecha Pago
        const fechaPago = req.body.date; // YYYY-MM-DD
        if (!fechaPago) throw new Error("Fecha Pago es requerida");

        const [yearStr, monthStr, dayStr] = fechaPago.split('-');
        const dia = parseInt(dayStr);
        const mes = parseInt(monthStr);
        const anio = parseInt(yearStr);

        // Mapeo Mes Abonado (Texto -> Número)
        // OBTENER MESE ABONADO DIRECTAMENTE DEL FRONTEND, O FALLBACK AL STRING SI ENVIAN POSTMAN
        let mesAbonadoNum = parseInt(req.body.mesAbonado);
        if (isNaN(mesAbonadoNum)) {
            const mesMap = {
                'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
                'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
            };
            const mesPagoTexto = (req.body.month || '').toLowerCase().trim();
            mesAbonadoNum = mesMap[mesPagoTexto] || mes; // Fallback al mes de la fecha
        }

        // Validar rangos de mesAbonado y anioAbonado
        if (mesAbonadoNum < 1 || mesAbonadoNum > 12) {
            return res.status(400).json({ error: 'El mes abonado debe estar entre 1 (enero) y 12 (diciembre).' });
        }
        const anioAbonadoReq = parseInt(req.body.anioAbonado) || anio;
        if (anioAbonadoReq < 2000 || anioAbonadoReq > 2100) {
            return res.status(400).json({ error: 'El año abonado debe estar entre 2000 y 2100.' });
        }

        // Penalización (Día > 10)
        let penalizacion = "NO";
        let diasPenalizacion = 0;
        let valorAPenalizar = 0;
        const monto = parseFloat(req.body.amount) || 0;
        const PENALIZACION_DIARIA = 1000; // Valor configurable si existiera, fallback 1000

        // Regla: A partir del día 11 se cobra. Día 10 NO paga.
        // PAGO ADELANTADO NO PAGA PENALIDAD.
        // PAGO ATRASADO (mes anterior) SIEMPRE PAGA PENALIDAD.
        const isPagoAdelantado = (anioAbonadoReq > anio) || (anioAbonadoReq === anio && mesAbonadoNum > mes);
        const isPagoAtrasado = (anioAbonadoReq < anio) || (anioAbonadoReq === anio && mesAbonadoNum < mes);

        // ── VALIDACIÓN: Pago adicional del mes actual (sin penalización) ──
        // Si el socio ya tiene un ahorro registrado para el mismo mes/año,
        // cualquier pago adicional NO genera penalización.
        const { Op } = require('sequelize');
        const mesTextoBody = (req.body.month || '').trim();
        const clientIdForCheck = parseInt(req.body.clientId);
        let isPagoAdicionalMesActual = false;

        if (clientIdForCheck && mesTextoBody && anio) {
            const existePagoMesActual = await Saving.findOne({
                where: {
                    clientId: clientIdForCheck,
                    year: anio,
                    month: { [Op.like]: mesTextoBody },
                    type: { [Op.ne]: 'Aporte Inicial' }
                }
            });
            isPagoAdicionalMesActual = !!existePagoMesActual;
            if (isPagoAdicionalMesActual) {
                console.log(`✅ Pago adicional detectado: socio ${clientIdForCheck} ya pagó ${mesTextoBody} ${anio} (ID: ${existePagoMesActual.externalId}). Sin penalización.`);
            }
        }

        if (isPagoAdicionalMesActual) {
            // Pago adicional: el socio ya pagó este mes, NO genera penalización
            penalizacion = "NO";
            diasPenalizacion = 0;
            valorAPenalizar = 0;
        } else if (isPagoAtrasado) {
            penalizacion = "SI";
            // Calcula los días desde el día 10 del mes y año que debió haber pagado, 
            // hasta el día de hoy (fecha de pago actual).
            const graceDate = new Date(anioAbonadoReq, mesAbonadoNum - 1, 10);
            const currentDateFull = new Date(anio, mes - 1, dia);
            const diffTime = currentDateFull.getTime() - graceDate.getTime();
            const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            diasPenalizacion = diffDays;
            valorAPenalizar = diasPenalizacion * PENALIZACION_DIARIA;
        } else if (dia > 10 && !isPagoAdelantado) {
            penalizacion = "SI";
            diasPenalizacion = dia - 10;
            valorAPenalizar = diasPenalizacion * PENALIZACION_DIARIA;
        }

        const valorAhorrado = monto - valorAPenalizar;

        // Validar monto suficiente
        if (valorAhorrado < 0) {
            return res.status(400).json({
                error: `El Valor Mensual ($${monto}) no cubre la penalización ($${valorAPenalizar}).`,
                detalles: { diasPenalizacion, valoraPenalizar: valorAPenalizar }
            });
        }

        // Funciones auxiliares de sanitización (FRONT -> BACKEND)
        const parseNum = (val, fallback = null) => {
            if (val === undefined || val === null || val === '') return fallback;
            // Remover símbolos de moneda, comas o espacios antes de parsear
            // Ej: "$ 50.000,00" -> "50000.00"
            const cleanedVal = String(val)
                .replace(/\$/g, '')
                .replace(/\s/g, '')
                .replace(/\./g, '') // Quita separadores de miles (asumiendo formato local es-CO)
                .replace(/,/g, '.'); // Convierte coma decimal a punto

            const parsed = Number(cleanedVal);
            return isNaN(parsed) ? fallback : parsed;
        };
        const parseStr = (val, fallback = null) => {
            if (val === undefined || val === null || val === '') return fallback;
            return String(val).trim();
        };

        const finalClientId = parseNum(req.body.clientId);
        if (!finalClientId) {
            return res.status(400).json({ error: 'Falta seleccionar un Socio válido (clientId).' });
        }

        const finalYear = parseNum(anio);
        const finalMonthInt = parseNum(req.body.monthInt) || parseNum(mesAbonadoNum);
        const finalMesAbonado = parseNum(mesAbonadoNum);
        const finalAnioAbonado = parseNum(req.body.anioAbonado, finalYear);

        // Construir objeto data asegurando campos calculados y tipos correctos estrictos
        const savingData = {
            clientId: finalClientId,
            externalId: parseStr(nextExternalId),
            date: parseStr(fechaPago),
            year: finalYear,
            month: parseStr(req.body.month),
            monthInt: finalMonthInt,
            mesAbonado: finalMesAbonado,
            anioAbonado: finalAnioAbonado,
            penalizacion: parseStr(penalizacion, 'NO'),
            diasPenalizacion: parseNum(diasPenalizacion, 0),
            valorAPenalizar: parseNum(valorAPenalizar, 0),
            valorAhorrado: parseNum(valorAhorrado, 0),
            amount: parseNum(monto, 0),
            type: parseStr(req.body.type, 'Mensual'),
            itemQuantity: parseNum(req.body.itemQuantity, 1),
            banco: parseStr(req.body.banco, 'N/A'),
            numeroTransaccion: parseStr(req.body.numeroTransaccion, 'N/A'),
            origen: parseStr(req.body.origen, 'N/A'),
            observaciones: parseStr(req.body.observaciones, ''),
            status: parseStr(req.body.status, 'Abono')
        };

        // Regla especial: Si el estado es "Descuento Total Anual Penalizacion", 
        // calcular los días basado en el monto (1000 por día)
        if (savingData.status === 'Descuento Total Anual Penalizacion') {
            savingData.diasPenalizacion = Math.abs(Math.round(savingData.amount / 1000));
        }

        console.log('🛠️ PRE-INSERT PAYLOAD (SAVING):', JSON.stringify({
            clientId: savingData.clientId,
            amount: savingData.amount,
            date: savingData.date,
            penalizacion: savingData.penalizacion,
            diasPenalizacion: savingData.diasPenalizacion,
            valorAPenalizar: savingData.valorAPenalizar,
            valorAhorrado: savingData.valorAhorrado,
            mesAbonado: savingData.mesAbonado,
            anioAbonado: savingData.anioAbonado,
            year: savingData.year,
            monthInt: savingData.monthInt,
            itemQuantity: savingData.itemQuantity
        }, null, 2));

        const saving = await Saving.create(savingData);
        res.status(201).json(saving);

    } catch (err) {
        console.error('❌ SQLITE INSERT ERROR EN POST /savings:', err);
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'ID_VM duplicado (concurrencia). Intente de nuevo.' });
        }
        res.status(400).json({ error: err.message, payload: req.body });
    }
});

router.put('/savings/:id', async (req, res) => {
    try {
        const saving = await Saving.findByPk(req.params.id);
        if (!saving) return res.status(404).json({ error: 'Registro no encontrado' });

        // Recalcular lógica al editar
        const fechaPago = req.body.date || saving.date;
        const [yearStr, monthStr, dayStr] = fechaPago.split('-');
        const dia = parseInt(dayStr);
        const anio = parseInt(yearStr);

        const mes = parseInt(monthStr);

        const monto = parseFloat(req.body.amount !== undefined ? req.body.amount : saving.amount) || 0;
        const mesPagoTexto = (req.body.month || saving.month || '').toLowerCase().trim();

        // Mapeo Mes Abonado
        const mesMap = {
            'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
            'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        };
        const mesAbonadoNum = parseInt(req.body.mesAbonado) || mesMap[mesPagoTexto] || mes;

        // Validar rangos de mesAbonado y anioAbonado
        if (mesAbonadoNum < 1 || mesAbonadoNum > 12) {
            return res.status(400).json({ error: 'El mes abonado debe estar entre 1 (enero) y 12 (diciembre).' });
        }
        const anioAbonadoReq = parseInt(req.body.anioAbonado) || saving.anioAbonado || anio;
        if (anioAbonadoReq < 2000 || anioAbonadoReq > 2100) {
            return res.status(400).json({ error: 'El año abonado debe estar entre 2000 y 2100.' });
        }

        // Penalización
        let penalizacion = "NO";
        let diasPenalizacion = 0;
        let valorAPenalizar = 0;
        const PENALIZACION_DIARIA = 1000;

        // Lógica de penalización tomada de la ruta POST /savings para asegurar consistencia
        const isPagoAdelantado = (anioAbonadoReq > anio) || (anioAbonadoReq === anio && mesAbonadoNum > mes);
        const isPagoAtrasado = (anioAbonadoReq < anio) || (anioAbonadoReq === anio && mesAbonadoNum < mes);

        // ── VALIDACIÓN: Pago adicional del mes actual (sin penalización) ──
        const { Op } = require('sequelize');
        const mesTextoForCheck = (req.body.month || saving.month || '').trim();
        const clientIdForCheck = req.body.clientId !== undefined ? parseInt(req.body.clientId) : saving.clientId;
        let isPagoAdicionalMesActual = false;

        if (clientIdForCheck && mesTextoForCheck && anio) {
            const existePagoMesActual = await Saving.findOne({
                where: {
                    clientId: clientIdForCheck,
                    year: anio,
                    month: { [Op.like]: mesTextoForCheck },
                    type: { [Op.ne]: 'Aporte Inicial' },
                    id: { [Op.ne]: saving.id } // Excluir el registro que se está editando
                }
            });
            isPagoAdicionalMesActual = !!existePagoMesActual;
            if (isPagoAdicionalMesActual) {
                console.log(`✅ [PUT] Pago adicional detectado: socio ${clientIdForCheck} ya pagó ${mesTextoForCheck} ${anio}. Sin penalización.`);
            }
        }

        if (isPagoAdicionalMesActual) {
            penalizacion = "NO";
            diasPenalizacion = 0;
            valorAPenalizar = 0;
        } else if (isPagoAtrasado) {
            penalizacion = "SI";
            const graceDate = new Date(anioAbonadoReq, mesAbonadoNum - 1, 10);
            const currentDateFull = new Date(anio, mes - 1, dia);
            const diffTime = currentDateFull.getTime() - graceDate.getTime();
            const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            diasPenalizacion = diffDays;
            valorAPenalizar = diasPenalizacion * PENALIZACION_DIARIA;
        } else if (dia > 10 && !isPagoAdelantado) {
            penalizacion = "SI";
            diasPenalizacion = dia - 10;
            valorAPenalizar = diasPenalizacion * PENALIZACION_DIARIA;
        }

        const valorAhorrado = monto - valorAPenalizar;

        if (valorAhorrado < 0) {
            return res.status(400).json({
                error: `El Valor Mensual ($${monto}) no cubre la penalización ($${valorAPenalizar}).`
            });
        }

        // Funciones auxiliares de sanitización
        const parseNum = (val, fallback = null) => {
            if (val === undefined || val === null || val === '') return fallback;
            const cleanedVal = String(val).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
            const parsed = Number(cleanedVal);
            return isNaN(parsed) ? fallback : parsed;
        };
        const parseStr = (val, fallback = null) => {
            if (val === undefined || val === null || val === '') return fallback;
            return String(val).trim();
        };

        const updateData = {
            clientId: req.body.clientId !== undefined ? parseNum(req.body.clientId) : saving.clientId,
            date: parseStr(fechaPago), // Aseguramos que la fecha de pago se actualice
            year: parseNum(anio),
            month: req.body.month !== undefined ? parseStr(req.body.month) : saving.month,
            monthInt: req.body.monthInt !== undefined ? parseNum(req.body.monthInt) : (parseNum(mesAbonadoNum) || saving.monthInt),
            mesAbonado: parseNum(mesAbonadoNum),
            anioAbonado: req.body.anioAbonado !== undefined ? parseNum(req.body.anioAbonado) : (req.body.date ? anio : saving.anioAbonado),
            penalizacion: parseStr(penalizacion, 'NO'),
            diasPenalizacion: parseNum(diasPenalizacion, 0),
            valorAPenalizar: parseNum(valorAPenalizar, 0),
            valorAhorrado: parseNum(valorAhorrado, 0),
            amount: parseNum(monto, 0),
            type: req.body.type !== undefined ? parseStr(req.body.type) : saving.type,
            banco: req.body.banco !== undefined ? parseStr(req.body.banco) : saving.banco,
            numeroTransaccion: req.body.numeroTransaccion !== undefined ? parseStr(req.body.numeroTransaccion) : saving.numeroTransaccion,
            origen: req.body.origen !== undefined ? parseStr(req.body.origen) : saving.origen,
            observaciones: req.body.observaciones !== undefined ? parseStr(req.body.observaciones) : saving.observaciones,
            itemQuantity: req.body.itemQuantity !== undefined ? parseNum(req.body.itemQuantity) : saving.itemQuantity,
            status: req.body.status !== undefined ? parseStr(req.body.status) : saving.status
            // externalId NO cambia en edición
        };

        // Regla especial: Si el estado es "Descuento Total Anual Penalizacion", 
        // calcular los días basado en el monto (1000 por día)
        if (updateData.status === 'Descuento Total Anual Penalizacion') {
            updateData.diasPenalizacion = Math.abs(Math.round(updateData.amount / 1000));
        }

        console.log('🛠️ PRE-UPDATE PAYLOAD (SAVING):', JSON.stringify(updateData, null, 2));

        await saving.update(updateData);
        res.json(saving);

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/savings/:id', async (req, res) => {
    try {
        const saving = await Saving.findByPk(req.params.id);
        if (!saving) return res.status(404).json({ error: 'Registro no encontrado' });
        await saving.destroy();
        res.json({ message: 'Registro eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Soportes de Pago (imágenes adjuntas a un ahorro) ─────────────────

// POST /savings/:id/soporte — subir imagen de soporte
router.post('/savings/:id/soporte', upload.single('soporte'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
        const saving = await Saving.findByPk(req.params.id);
        if (!saving) return res.status(404).json({ error: 'Ahorro no encontrado' });

        // Reemplazar soporte anterior si existe
        const existing = await Soporte.findOne({ where: { savingId: saving.id } });
        if (existing) await existing.destroy();

        const soporte = await Soporte.create({
            savingId: saving.id,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            data: req.file.buffer
        });
        res.json({ ok: true, id: soporte.id, name: soporte.originalName });
    } catch (err) {
        console.error('Error subiendo soporte:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /savings/:id/soporte — descargar imagen de soporte
router.get('/savings/:id/soporte', async (req, res) => {
    try {
        const soporte = await Soporte.findOne({ where: { savingId: req.params.id } });
        if (!soporte) return res.status(404).json({ error: 'Soporte no encontrado' });
        res.setHeader('Content-Type', soporte.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${soporte.originalName}"`);
        res.send(soporte.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /savings/:id/soporte/info — solo metadata (sin el binario)
router.get('/savings/:id/soporte/info', async (req, res) => {
    try {
        const soporte = await Soporte.findOne({
            where: { savingId: req.params.id },
            attributes: ['id', 'originalName', 'mimeType', 'uploadedAt']
        });
        if (!soporte) return res.json({ exists: false });
        res.json({ exists: true, name: soporte.originalName, mimeType: soporte.mimeType });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /savings/:id/soporte — eliminar soporte
router.delete('/savings/:id/soporte', async (req, res) => {
    try {
        const soporte = await Soporte.findOne({ where: { savingId: req.params.id } });
        if (!soporte) return res.status(404).json({ error: 'Soporte no encontrado' });
        await soporte.destroy();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Loans ---
router.get('/loans', async (req, res) => {
    try {
        const loans = await Loan.findAll({ include: Client, limit: 500 });
        res.json(loans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/loans', async (req, res) => {
    try {
        const { clientId, amount, date, purpose } = req.body;
        const loan = await Loan.create({ clientId, amount, date, purpose, status: 'Pendiente' });

        res.status(201).json(loan);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/loans/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const loan = await Loan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ message: 'Préstamo no encontrado' });
        loan.status = status;
        await loan.save();
        res.json(loan);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Disbursed Loans (Préstamos Desembolsados) ---
router.get('/disbursed-loans', async (req, res) => {
    try {
        const disbursedLoans = await DisbursedLoan.findAll({
            include: Client,
            order: [['fechaPrestamo', 'DESC']],
            limit: 500
        });
        res.json(disbursedLoans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /disbursed-loans/list - Lista completa para tabla (ordenada por PK ASC)
router.get('/disbursed-loans/list', async (req, res) => {
    try {
        const { q } = req.query;
        let whereClause = {};

        if (q && q.trim()) {
            const { Op } = require('sequelize');
            const searchTerm = q.trim();
            whereClause = {
                [Op.or]: [
                    { socio: { [Op.like]: `%${searchTerm}%` } },
                    { idVm: { [Op.like]: `%${searchTerm}%` } },
                    { orderId: { [Op.like]: `%${searchTerm}%` } },
                    { estado: { [Op.like]: `%${searchTerm}%` } },
                    { banco: { [Op.like]: `%${searchTerm}%` } },
                    { numeroTransaccion: { [Op.like]: `%${searchTerm}%` } }
                ]
            };
        }

        const loans = await DisbursedLoan.findAll({
            where: whereClause,
            include: [{
                model: Client,
                attributes: ['cedula', 'name', 'surname1', 'surname2', 'customerId']
            }],
            order: [['fechaPrestamo', 'DESC']]
        });

        const normalizedData = loans.map(l => {
            const raw = l.toJSON();
            const normalized = {};
            for (const [key, value] of Object.entries(raw)) {
                if (key === 'Client') {
                    // Flatten client info for display
                    normalized.clientName = value ? `${value.name || ''} ${value.surname1 || ''}`.trim() : (raw.socio || '');
                    normalized.clientCedula = value ? value.cedula : '';
                    normalized.clientCustomerId = value ? value.customerId : '';
                    continue;
                }
                if (typeof value === 'string') {
                    normalized[key] = value.trim();
                } else if (value === undefined) {
                    normalized[key] = null;
                } else {
                    normalized[key] = value;
                }
            }
            return normalized;
        });

        // Enrich with payment counts per loan (pagas / pendientes)
        const { Sequelize } = require('sequelize');
        const paymentCounts = await LoanPayment.findAll({
            attributes: [
                'idVm',
                'estado',
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: ['idVm', 'estado'],
            raw: true
        });

        const paymentMap = {};
        paymentCounts.forEach(row => {
            const vm = (row.idVm || '').trim();
            if (!paymentMap[vm]) paymentMap[vm] = { pagas: 0, pendientes: 0 };
            if (row.estado === 'Pago' || row.estado === 'Abono') paymentMap[vm].pagas += parseInt(row.count || 0);
            if (row.estado === 'Pendiente') paymentMap[vm].pendientes += parseInt(row.count || 0);
        });

        normalizedData.forEach(loan => {
            const vm = (loan.idVm || '').trim();
            const counts = paymentMap[vm] || { pagas: 0, pendientes: 0 };
            loan.cuotasPagas = counts.pagas;
            loan.cuotasPendientes = counts.pendientes;
        });

        res.json({
            ok: true,
            data: normalizedData,
            total: normalizedData.length
        });
    } catch (err) {
        console.error('Error en /disbursed-loans/list:', err);
        res.status(500).json({ ok: false, error: err.message, data: [], total: 0 });
    }
});

// GET /loans-capacity-analysis — Capacidad de Pago por Socio
// Compara capital ahorrado vs cartera pendiente (cuotas estado != 'Pago')
router.get('/loans-capacity-analysis', async (req, res) => {
    try {
        const { Op, fn, col } = require('sequelize');

        // 1. Total ahorrado por socio (sum of valorAhorrado)
        const savingsRaw = await Saving.findAll({
            attributes: ['clientId', [fn('SUM', col('valorAhorrado')), 'totalAhorrado']],
            group: ['clientId'],
            raw: true
        });
        const savingsMap = {};
        savingsRaw.forEach(s => { savingsMap[s.clientId] = parseFloat(s.totalAhorrado || 0); });

        // 2. Cartera pendiente por socio (cuotas con estado != 'Pago' de préstamos vigentes)
        const pendingRaw = await LoanPayment.findAll({
            attributes: ['clientId', [fn('SUM', col('valor_cuota_variable')), 'totalPendiente']],
            where: {
                estado: { [Op.ne]: 'Pago' },
                estadoPrestamo: { [Op.ne]: 'Cancelado' }
            },
            group: ['clientId'],
            raw: true
        });
        const pendingMap = {};
        pendingRaw.forEach(p => { pendingMap[p.clientId] = parseFloat(p.totalPendiente || 0); });

        // 3. Get client names
        const clientIds = [...new Set([...Object.keys(savingsMap), ...Object.keys(pendingMap)])].map(Number);
        const clients = await Client.findAll({
            where: { id: { [Op.in]: clientIds } },
            attributes: ['id', 'name', 'surname1']
        });
        const clientMap = {};
        clients.forEach(c => { clientMap[c.id] = `${c.name || ''} ${c.surname1 || ''}`.trim(); });

        // 4. Build per-partner analysis (only partners with active loans)
        const partnerIds = [...new Set(Object.keys(pendingMap).map(Number))];
        const analysis = partnerIds.map(cid => {
            const ahorrado = savingsMap[cid] || 0;
            const pendiente = pendingMap[cid] || 0;
            const cobertura = pendiente > 0 ? ((ahorrado / pendiente) * 100) : (ahorrado > 0 ? 100 : 0);
            return {
                clientId: cid,
                clientName: clientMap[cid] || `Socio ${cid}`,
                ahorrado,
                pendiente,
                cobertura: Math.min(cobertura, 999)
            };
        }).sort((a, b) => a.cobertura - b.cobertura);

        // 5. Aggregated totals
        const totalAhorrado = analysis.reduce((s, a) => s + a.ahorrado, 0);
        const totalPendiente = analysis.reduce((s, a) => s + a.pendiente, 0);
        const coberturaGlobal = totalPendiente > 0 ? ((totalAhorrado / totalPendiente) * 100) : 0;

        res.json({
            ok: true,
            totalAhorrado,
            totalPendiente,
            coberturaGlobal: parseFloat(coberturaGlobal.toFixed(1)),
            partners: analysis
        });
    } catch (err) {
        console.error('Error en /loans-capacity-analysis:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/disbursed-loans', async (req, res) => {
    const sequelize = require('../config/database');
    const t = await sequelize.transaction();
    try {
        // ==== 1. ID_VM CONSECUTIVO (MODELO: SOL{N}) ====
        // Lectura dentro de la transacción para evitar race condition con requests simultáneos
        const allLoans = await DisbursedLoan.findAll({
            attributes: ['idVm', 'orderId'],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        // Patrón más flexible: Case insensitive, espacios opcionales
        const solPattern = /^SOL\s*(\d+)$/i;

        const solNumbers = allLoans
            .map(l => l.idVm || l.orderId)
            .filter(id => id && solPattern.test(id))
            .map(id => {
                const match = id.match(solPattern);
                return parseInt(match[1]);
            })
            .filter(n => !isNaN(n));

        let nextIdVm;
        if (solNumbers.length === 0) {
            // Si no hay consecutivos SOL, iniciamos en SOL1
            nextIdVm = 'SOL1';
            console.log('🆕 Sin registros previos SOL -> Iniciando en SOL1');
        } else {
            // Máximo ID encontrado + 1
            const maxSOL = Math.max(...solNumbers);
            nextIdVm = `SOL${maxSOL + 1}`;
            console.log(`🔢 Consecutivo encontrado: Max(SOL${maxSOL}) -> Nuevo: ${nextIdVm}`);
        }

        // ==== 2. VALIDAR CLIENT_ID ====
        const clientId = parseInt(req.body.clientId);
        if (!clientId) {
            return res.status(400).json({ error: 'Debe seleccionar un socio válido.' });
        }

        const client = await Client.findByPk(clientId);
        if (!client) {
            return res.status(400).json({ error: 'El socio seleccionado no existe.' });
        }

        // ==== 3. VALIDAR FECHA PRESTAMO ====
        const fechaPrestamo = req.body.fechaPrestamo; // YYYY-MM-DD
        if (!fechaPrestamo) {
            return res.status(400).json({ error: 'Fecha de Préstamo es requerida.' });
        }

        const fechaDate = new Date(fechaPrestamo);
        if (isNaN(fechaDate.getTime())) {
            return res.status(400).json({ error: 'Fecha de Préstamo inválida.' });
        }

        // ==== 4. CALCULAR MES Y AÑO DESEMBOLSO ====
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const mesDesembolso = monthNames[fechaDate.getMonth()];
        const anioDesembolso = fechaDate.getFullYear();

        // ==== 5. VALIDAR VALOR PRESTADO ====
        const valorPrestado = parseFloat(req.body.valorPrestado);
        if (!valorPrestado || valorPrestado <= 0) {
            return res.status(400).json({ error: 'El Valor Prestado debe ser mayor a 0.' });
        }

        // ==== 6. VALIDAR # CUOTAS ====
        const cuotas = parseInt(req.body.cuotas);
        if (!cuotas || cuotas <= 0) {
            return res.status(400).json({ error: 'El número de cuotas debe ser mayor a 0.' });
        }

        // ==== 7. VALIDAR INTERES MENSUAL ====
        let interesMensual = req.body.interesMensual;
        if (interesMensual) {
            interesMensual = parseFloat(interesMensual);
            if (isNaN(interesMensual) || interesMensual < 0 || interesMensual > 1) {
                return res.status(400).json({ error: 'El Interés Mensual debe estar entre 0 y 1 (ej: 0.015 para 1.5%).' });
            }
        }

        // ==== 8. CONSTRUIR OBJETO DE DATOS ====
        const loanData = {
            idVm: nextIdVm,
            clientId,
            estado: req.body.estado || 'Pendiente',
            fechaPrestamo,
            mesDesembolso,
            anioDesembolso,
            valorPrestado,
            cuotas,
            interesMensual: interesMensual || null,
            diasPagoMax: parseInt(req.body.diasPagoMax) || null,
            itemQuantity: parseInt(req.body.itemQuantity) || 1,
            banco: req.body.banco || null,
            numeroTransaccion: req.body.numeroTransaccion || null,
            cuentaAhorros: req.body.cuentaAhorros || null,
            observaciones: req.body.observaciones || null,
            // Campos legacy para compatibilidad
            orderId: nextIdVm, // Usar mismo ID
            socio: `${client.name} ${client.surname1 || ''}`.trim(),
            fechaDesembolso: fechaPrestamo,
            monto: valorPrestado,
            cuenta: req.body.cuentaAhorros || null
        };

        // ==== 9. REFINANCIACIÓN: cancelar préstamo vigente si existe ====
        const { Op } = require('sequelize');
        const prestamoAnterior = await DisbursedLoan.findOne({
            where: {
                client_id: clientId,
                estado: { [Op.like]: '%Vigente%' }
            },
            order: [['id', 'DESC']],
            transaction: t
        });

        let refinanciacion = null;

        if (prestamoAnterior) {
            const cuotasPendientesAnteriores = await LoanPayment.findAll({
                where: { idVm: prestamoAnterior.idVm, estado: 'Pendiente' },
                transaction: t
            });

            const interesCondonado = cuotasPendientesAnteriores.reduce(
                (s, c) => s + parseFloat(c.valorInteresesAmortizados || 0), 0
            );

            // Marcar todas las cuotas ya pagadas/mora del préstamo anterior como estadoPrestamo=Cancelado
            await LoanPayment.update(
                { estadoPrestamo: 'Cancelado' },
                {
                    where: {
                        idVm: prestamoAnterior.idVm,
                        estado: { [Op.notIn]: ['Pendiente'] }
                    },
                    transaction: t
                }
            );

            // Marcar cada cuota pendiente como Pago sin interés (prepago).
            // valorCuotaVariable se ajusta al capital real (sin interés condonado).
            // saldoFinal se recalcula: saldoInicial - capital; la última cuota queda en 0.
            for (const cuota of cuotasPendientesAnteriores) {
                const capitalCuota = parseFloat(cuota.valorCuotaVariable || 0) - parseFloat(cuota.valorInteresesAmortizados || 0);
                const saldoInicial = parseFloat(cuota.saldoInicial || 0);
                const saldoFinalCal = Math.max(0, parseFloat((saldoInicial - capitalCuota).toFixed(2)));
                await cuota.update({
                    estado: 'Pago',
                    estadoPrestamo: 'Cancelado',
                    valorInteresesAmortizados: 0,
                    valorCuotaVariable: Math.max(0, capitalCuota),
                    valorCuotaPago: Math.max(0, capitalCuota),
                    saldoFinal: saldoFinalCal,
                    esPrepago: true,
                    observaciones: `Cancelado por refinanciación ${nextIdVm} — interés condonado`
                }, { transaction: t });
            }

            // Cambiar estado del préstamo anterior a Cancelado
            // Usamos la instancia directamente (evita el bug de nombre de columna raw vs atributo Sequelize)
            await prestamoAnterior.update(
                { estado: 'Cancelado' },
                { transaction: t }
            );

            refinanciacion = {
                idVmAnterior: prestamoAnterior.idVm,
                cuotasSaldadas: cuotasPendientesAnteriores.length,
                interesCondonado: Math.round(interesCondonado)
            };

            console.log(`🔄 Refinanciación: préstamo ${prestamoAnterior.idVm} cancelado. ` +
                `${cuotasPendientesAnteriores.length} cuotas saldadas, ` +
                `interés condonado: $${Math.round(interesCondonado)}`);
        }

        // ==== 10. CREAR NUEVO PRÉSTAMO ====
        const loan = await DisbursedLoan.create(loanData, { transaction: t });

        // ====================================================================
        // AUTO-GENERAR TABLA "ESTADO DE PRÉSTAMOS" (N cuotas en LoanPayment)
        // ====================================================================
        let schedule = [];
        if (interesMensual && cuotas > 0) {
            const allExistingPayments = await LoanPayment.findAll({ attributes: ['externalId'], transaction: t });
            const pPattern = /^P\s*(\d+)$/i;
            const pNumbers = allExistingPayments
                .map(p => p.externalId)
                .filter(id => id && pPattern.test(id))
                .map(id => parseInt(id.match(pPattern)[1]))
                .filter(n => !isNaN(n));

            let nextPNumber = pNumbers.length === 0 ? 1 : Math.max(...pNumbers) + 1;

            const capitalPorCuota = valorPrestado / cuotas;
            const disbMes = fechaDate.getMonth();
            const disbAnio = fechaDate.getFullYear();

            const monthNamesList = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            const scheduleRows = [];
            let saldoInicialActual = valorPrestado;

            for (let i = 1; i <= cuotas; i++) {
                const interesesCuota = parseFloat((saldoInicialActual * interesMensual).toFixed(2));
                const valorCuotaVariable = parseFloat((capitalPorCuota + interesesCuota).toFixed(2));
                const saldoFinal = parseFloat((saldoInicialActual - capitalPorCuota).toFixed(2));
                const pagoMesIdx = (disbMes + i) % 12;
                const pagoAnio = disbAnio + Math.floor((disbMes + i) / 12);

                scheduleRows.push({
                    externalId: `P${nextPNumber++}`,
                    clientId,
                    mesDesembolso,
                    saldoInicial: parseFloat(saldoInicialActual.toFixed(2)),
                    cuotasPrestamo: cuotas,
                    interesMensual,
                    valorInteresesAmortizados: interesesCuota,
                    fechaPagoMax: `${pagoAnio}-${String(pagoMesIdx + 1).padStart(2, '0')}-10`,
                    mesPago: monthNamesList[pagoMesIdx],
                    valorCuotaVariable,
                    estado: 'Pendiente',
                    valorCuotaPago: 0,
                    saldoFinal: Math.max(0, saldoFinal),
                    itemQuantity: i,
                    banco: req.body.banco || null,
                    numeroTransaccion: req.body.numeroTransaccion || null,
                    cuentaAhorros: req.body.cuentaAhorros || null,
                    observaciones: null,
                    idVm: nextIdVm,
                    estadoPrestamo: req.body.estado || 'Pendiente'
                });

                saldoInicialActual = saldoFinal;
            }

            await LoanPayment.bulkCreate(scheduleRows, { transaction: t });
            schedule = scheduleRows;
            console.log(`✅ ${scheduleRows.length} cuotas generadas para ${nextIdVm}`);
        }

        await t.commit();
        return res.status(201).json({ loan, schedule, refinanciacion });

    } catch (err) {
        await t.rollback();
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'ID_VM duplicado (concurrencia). Intente de nuevo.' });
        }
        res.status(400).json({ error: err.message });
    }
});

router.put('/disbursed-loans/:id', async (req, res) => {
    try {
        const loan = await DisbursedLoan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });

        // Recalcular Mes y Año si se cambia la fecha
        const fechaPrestamo = req.body.fechaPrestamo || loan.fechaPrestamo;
        const fechaDate = new Date(fechaPrestamo);

        if (isNaN(fechaDate.getTime())) {
            return res.status(400).json({ error: 'Fecha de Préstamo inválida.' });
        }

        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const mesDesembolso = monthNames[fechaDate.getMonth()];
        const anioDesembolso = fechaDate.getFullYear();

        // Validar Valor Prestado
        const valorPrestado = parseFloat(req.body.valorPrestado !== undefined ? req.body.valorPrestado : loan.valorPrestado);
        if (valorPrestado <= 0) {
            return res.status(400).json({ error: 'El Valor Prestado debe ser mayor a 0.' });
        }

        // Validar Cuotas
        const cuotas = parseInt(req.body.cuotas !== undefined ? req.body.cuotas : loan.cuotas);
        if (cuotas <= 0) {
            return res.status(400).json({ error: 'El número de cuotas debe ser mayor a 0.' });
        }

        // Validar Interés
        let interesMensual = req.body.interesMensual !== undefined ? req.body.interesMensual : loan.interesMensual;
        if (interesMensual) {
            interesMensual = parseFloat(interesMensual);
            if (isNaN(interesMensual) || interesMensual < 0 || interesMensual > 1) {
                return res.status(400).json({ error: 'El Interés Mensual debe estar entre 0 y 1.' });
            }
        }

        // Capturar clientId original antes de la actualización para detectar cambios
        const originalClientId = loan.clientId;

        // Si se cambia el clientId, actualizar el nombre del socio
        let socio = loan.socio;
        if (req.body.clientId && req.body.clientId !== loan.clientId) {
            const client = await Client.findByPk(req.body.clientId);
            if (!client) {
                return res.status(400).json({ error: 'El socio seleccionado no existe.' });
            }
            socio = `${client.name} ${client.surname1 || ''}`.trim();
        }

        const updateData = {
            ...req.body,
            mesDesembolso,
            anioDesembolso,
            valorPrestado,
            cuotas,
            interesMensual,
            // Sincronizar campos legacy
            fechaDesembolso: fechaPrestamo,
            monto: valorPrestado,
            socio,
            cuenta: req.body.cuentaAhorros || loan.cuentaAhorros
            // idVm NO cambia
        };

        await loan.update(updateData);

        // Sincronizar clientId en todas las cuotas si el socio propietario cambió
        if (req.body.clientId && parseInt(req.body.clientId) !== parseInt(originalClientId) && loan.idVm) {
            await LoanPayment.update(
                { clientId: parseInt(req.body.clientId) },
                { where: { idVm: loan.idVm } }
            );
        }

        // ====================================================================
        // REGENERAR TABLA "ESTADO DE PRÉSTAMOS" si hay interés y cuotas
        // ====================================================================
        if (interesMensual && cuotas > 0) {
            const idVmActual = loan.idVm; // El idVm NO cambia en edición
            const sequelize = require('../config/database');

            // Verificar si existen cuotas con pagos registrados (estado 'Pago' o 'Mora')
            const pagosRegistrados = await LoanPayment.count({
                where: { idVm: idVmActual, estado: ['Pago', 'Mora'] }
            });
            if (pagosRegistrados > 0) {
                return res.status(409).json({
                    error: `No se puede regenerar el plan de cuotas: el préstamo ${idVmActual} tiene ${pagosRegistrados} cuota(s) con pago registrado. Edite las cuotas individuales en su lugar.`
                });
            }

            // Envolver todo en una transacción para evitar pérdida de datos si falla el bulkCreate
            const t = await sequelize.transaction();
            try {
                // 1. Borrar solo cuotas pendientes (las pagadas ya fueron bloqueadas arriba)
                await LoanPayment.destroy({ where: { idVm: idVmActual }, transaction: t });

                // 2. Obtener el siguiente consecutivo P{N} global (fuera de este préstamo)
                const allExistingPayments = await LoanPayment.findAll({
                    attributes: ['externalId'],
                    transaction: t
                });
                const pPattern = /^P\s*(\d+)$/i;
                const pNumbers = allExistingPayments
                    .map(p => p.externalId)
                    .filter(id => id && pPattern.test(id))
                    .map(id => parseInt(id.match(pPattern)[1]))
                    .filter(n => !isNaN(n));
                let nextPNumber = pNumbers.length === 0 ? 1 : Math.max(...pNumbers) + 1;

                const monthNamesList = [
                    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
                ];
                const capitalPorCuota = valorPrestado / cuotas;
                const disbMes = fechaDate.getMonth();
                const disbAnio = fechaDate.getFullYear();
                const scheduleRows = [];
                let saldoInicialActual = valorPrestado;

                for (let i = 1; i <= cuotas; i++) {
                    const interesesCuota = parseFloat((saldoInicialActual * interesMensual).toFixed(2));
                    const valorCuotaVariable = parseFloat((capitalPorCuota + interesesCuota).toFixed(2));
                    const saldoFinal = parseFloat((saldoInicialActual - capitalPorCuota).toFixed(2));
                    const pagoMesIdx = (disbMes + i) % 12;
                    const pagoAnio = disbAnio + Math.floor((disbMes + i) / 12);
                    const mm = String(pagoMesIdx + 1).padStart(2, '0');
                    const fechaPagoMaxStr = pagoAnio + '-' + mm + '-10';
                    const mesPagoStr = monthNamesList[pagoMesIdx];

                    scheduleRows.push({
                        externalId: 'P' + (nextPNumber++),
                        clientId: loan.clientId,
                        mesDesembolso,
                        saldoInicial: parseFloat(saldoInicialActual.toFixed(2)),
                        cuotasPrestamo: cuotas,
                        interesMensual,
                        valorInteresesAmortizados: interesesCuota,
                        fechaPagoMax: fechaPagoMaxStr,
                        mesPago: mesPagoStr,
                        valorCuotaVariable,
                        estado: 'Pendiente',
                        valorCuotaPago: 0,
                        saldoFinal: Math.max(0, saldoFinal),
                        itemQuantity: i,
                        banco: req.body.banco || loan.banco || null,
                        numeroTransaccion: req.body.numeroTransaccion || loan.numeroTransaccion || null,
                        cuentaAhorros: req.body.cuentaAhorros || loan.cuentaAhorros || null,
                        observaciones: null,
                        idVm: idVmActual,
                        estadoPrestamo: req.body.estado || loan.estado || 'Pendiente'
                    });
                    saldoInicialActual = saldoFinal;
                }

                await LoanPayment.bulkCreate(scheduleRows, { transaction: t });
                await t.commit();
                console.log('✅ Plan de cuotas regenerado: ' + scheduleRows.length + ' cuotas para ' + idVmActual);
                return res.json({ loan, schedule: scheduleRows });
            } catch (innerErr) {
                await t.rollback();
                throw innerErr;
            }
        }

        res.json({ loan });

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/disbursed-loans/:id', async (req, res) => {
    try {
        const loan = await DisbursedLoan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });

        // Eliminar cuotas asociadas en Estado de Préstamos antes de borrar el préstamo
        if (loan.idVm) {
            const deletedCount = await LoanPayment.destroy({ where: { idVm: loan.idVm } });
            console.log('🗑️  Eliminadas ' + deletedCount + ' cuotas de Estado de Préstamos para ' + loan.idVm);
        }

        await loan.destroy();
        res.json({ message: 'Préstamo y sus cuotas eliminados con éxito' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- Estado Préstamos (Control de Pagos) ---

// GET /payments/list - Lista completa para tabla (ordenada por externalId / id ASC)
router.get('/payments/list', async (req, res) => {
    try {
        const { q, estado, estadoPrestamo, idVm, itemQuantity, clientId } = req.query;
        const { Op } = require('sequelize');
        let whereClause = {};

        // Filtro exacto por clientId
        if (clientId && clientId.trim()) {
            whereClause.clientId = clientId.trim();
        }

        // Filtro exacto por Id_VM (para buscar cuotas de un préstamo específico)
        if (idVm && idVm.trim()) {
            whereClause.idVm = idVm.trim();
        }

        // Filtro exacto por número de cuota
        if (itemQuantity !== undefined && itemQuantity !== '') {
            whereClause.itemQuantity = parseInt(itemQuantity);
        }

        // Filtro por estado de pago
        if (estado && estado.trim()) {
            whereClause.estado = estado.trim();
        }

        // Filtro por estado de préstamo
        if (estadoPrestamo && estadoPrestamo.trim()) {
            whereClause.estadoPrestamo = estadoPrestamo.trim();
        }

        // Búsqueda por texto (externalId, idVm, banco, mesPago, etc.)
        if (q && q.trim()) {
            const searchTerm = q.trim();
            whereClause = {
                ...whereClause,
                [Op.or]: [
                    { externalId: { [Op.like]: `%${searchTerm}%` } },
                    { idVm: { [Op.like]: `%${searchTerm}%` } },
                    { banco: { [Op.like]: `%${searchTerm}%` } },
                    { mesPago: { [Op.like]: `%${searchTerm}%` } },
                    { mesDesembolso: { [Op.like]: `%${searchTerm}%` } },
                    { estado: { [Op.like]: `%${searchTerm}%` } },
                    { estadoPrestamo: { [Op.like]: `%${searchTerm}%` } },
                    { numeroTransaccion: { [Op.like]: `%${searchTerm}%` } },
                ]
            };
        }

        const payments = await LoanPayment.findAll({
            where: whereClause,
            include: [
                {
                    model: Client,
                    attributes: ['id', 'customerId', 'name', 'surname1', 'surname2', 'cedula']
                },
                {
                    model: Soporte,
                    attributes: ['id', 'originalName', 'uploadedAt']
                },
                {
                    model: DisbursedLoan,
                    as: 'disbursedLoan',
                    attributes: ['fechaPrestamo', 'valorPrestado']
                }
            ],
            order: [['id', 'ASC']]
        });

        // Aplanar datos del cliente + normalizar strings
        const normalizedData = payments.map(p => {
            const raw = p.toJSON();
            const normalized = {};
            for (const [key, value] of Object.entries(raw)) {
                if (key === 'Client') {
                    normalized.clientName = value
                        ? `${value.name || ''} ${value.surname1 || ''} ${value.surname2 || ''}`.trim().replace(/\s+/g, ' ')
                        : '';
                    normalized.clientSurname = value ? (value.surname1 || '') : '';
                    normalized.clientCedula = value ? (value.cedula || '') : '';
                    normalized.clientCustomerId = value ? (value.customerId || '') : '';
                    continue;
                }
                if (key === 'Soporte') {
                    normalized.soporte = value ? { id: value.id, name: value.originalName } : null;
                    continue;
                }
                if (key === 'disbursedLoan') {
                    normalized.fechaPrestamo = value ? value.fechaPrestamo : null;
                    normalized.valorPrestado = value ? value.valorPrestado : 0;
                    continue;
                }
                if (typeof value === 'string') {
                    normalized[key] = value.trim();
                } else if (value === undefined) {
                    normalized[key] = null;
                } else {
                    normalized[key] = value;
                }
            }

            // fechaPagoMax stays as YYYY-MM-DD (frontend year filter uses substring(0,4))
            normalized.fechaPrestamo = formatDateToDMY(normalized.fechaPrestamo);
            return normalized;
        });

        // Ordenar por Id_VM numérico DESC (SOL24 > SOL23 > ... > SOL1)
        // y por cuota (itemQuantity) ASC dentro de cada préstamo
        const solNum = (idVm) => parseInt((idVm || '').replace(/\D/g, '') || '0');
        normalizedData.sort((a, b) => {
            const diff = solNum(b.idVm) - solNum(a.idVm);
            if (diff !== 0) return diff;
            return (a.itemQuantity || 0) - (b.itemQuantity || 0);
        });

        res.json({ ok: true, data: normalizedData, total: normalizedData.length });
    } catch (err) {
        console.error('Error en /payments/list:', err);
        res.status(500).json({ ok: false, error: err.message, data: [], total: 0 });
    }
});

router.get('/payments', async (req, res) => {
    try {
        const payments = await LoanPayment.findAll({
            include: [Client],
            order: [['fechaPagoMax', 'DESC']],
            limit: 500
        });
        res.json(payments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/payments', async (req, res) => {
    try {
        // 1. Generar consecutivo ID (P1, P2...) - Backend Source of Truth
        // Consultar el último ID numérico usado en externalId (Id_EP)
        const allPayments = await LoanPayment.findAll({
            attributes: ['externalId']
        });

        // Regex robusto para P{N} (case insensitive, espacios opcionales)
        const pPattern = /^P\s*(\d+)$/i;

        const pNumbers = allPayments
            .map(p => p.externalId)
            .filter(id => id && pPattern.test(id))
            .map(id => {
                const match = id.match(pPattern);
                return parseInt(match[1]);
            })
            .filter(n => !isNaN(n));

        let nextExternalId;
        if (pNumbers.length === 0) {
            nextExternalId = 'P1';
            console.log('🆕 Sin registros previos P -> Iniciando en P1');
        } else {
            const maxP = Math.max(...pNumbers);
            nextExternalId = `P${maxP + 1}`;
            console.log(`🔢 Consecutivo P encontrado: Max(P${maxP}) -> Nuevo: ${nextExternalId}`);
        }

        // 2. Validaciones básicas
        if (!req.body.clientId) return res.status(400).json({ error: 'El socio es obligatorio.' });
        if (!req.body.saldoInicial) return res.status(400).json({ error: 'El Saldo Inicial es obligatorio.' });
        if (req.body.interesMensual === undefined || req.body.interesMensual === null || req.body.interesMensual === '') {
            return res.status(400).json({ error: 'El interés mensual es obligatorio.' });
        }
        const interesMensualValidado = parseFloat(req.body.interesMensual);
        if (isNaN(interesMensualValidado) || interesMensualValidado <= 0) {
            return res.status(400).json({ error: 'El interés mensual debe ser mayor a 0.' });
        }

        // 3. Cálculos automáticos (si no vienen del frontend)
        // Intereses amortizados = saldoInicial * interesMensual
        const saldoInicial = parseFloat(req.body.saldoInicial);
        const interesMensual = interesMensualValidado;
        let valorInteresesAmortizados = req.body.valorInteresesAmortizados;

        if (!valorInteresesAmortizados && saldoInicial && interesMensual) {
            valorInteresesAmortizados = saldoInicial * interesMensual;
        }

        const data = {
            ...req.body,
            externalId: nextExternalId,
            valorInteresesAmortizados: valorInteresesAmortizados,
            itemQuantity: req.body.itemQuantity || 0
        };

        const newPayment = await LoanPayment.create(data);
        validateAndFixLoanStatuses().catch(() => { });
        res.status(201).json(newPayment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/payments/:id', async (req, res) => {
    try {
        const payment = await LoanPayment.findByPk(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Registro de pago no encontrado' });

        await payment.update(req.body);
        validateAndFixLoanStatuses().catch(() => { });
        res.json(payment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/payments/:id', async (req, res) => {
    try {
        const payment = await LoanPayment.findByPk(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Registro de pago no encontrado' });

        // Eliminar soporte asociado si existe para evitar error de llave foránea
        await Soporte.destroy({ where: { paymentId: payment.id } });

        await payment.destroy();
        res.json({ message: 'Registro eliminado con éxito' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// On-demand loan status validation endpoint
router.post('/validate-loan-statuses', async (req, res) => {
    try {
        const fixed = await validateAndFixLoanStatuses();
        res.json({ message: `Validación completa. ${fixed} préstamo(s) marcado(s) como Cancelado.`, fixed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Soportes para Estado de Préstamos ---

// 1. Subir/Reemplazar soporte (para pagos)
router.post('/payments/:id/soporte', upload.single('soporte'), async (req, res) => {
    try {
        const paymentId = req.params.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No se envió ningún archivo' });
        }

        const payment = await LoanPayment.findByPk(paymentId);
        if (!payment) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        // Buscar si ya existe un soporte para este pago
        let soporte = await Soporte.findOne({ where: { paymentId } });

        if (soporte) {
            // Actualizar existente
            soporte.originalName = file.originalname;
            soporte.mimeType = file.mimetype;
            soporte.data = file.buffer;
            soporte.uploadedAt = new Date();
            await soporte.save();
        } else {
            // Crear nuevo
            soporte = await Soporte.create({
                paymentId,
                originalName: file.originalname,
                mimeType: file.mimetype,
                data: file.buffer
            });
        }

        res.json({ ok: true, message: 'Soporte subido exitosamente', soporteId: soporte.id });
    } catch (err) {
        console.error('Error al subir soporte de pago:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Información del soporte (para pagos)
router.get('/payments/:id/soporte/info', async (req, res) => {
    try {
        const paymentId = req.params.id;
        const soporte = await Soporte.findOne({
            where: { paymentId },
            attributes: ['id', 'originalName', 'mimeType', 'uploadedAt'] // Excluimos 'data' para no saturar
        });

        if (!soporte) {
            return res.json({ exists: false });
        }

        res.json({
            exists: true,
            id: soporte.id,
            name: soporte.originalName,
            type: soporte.mimeType,
            date: soporte.uploadedAt
        });
    } catch (err) {
        console.error('Error al obtener info del soporte de pago:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Descargar el soporte (para pagos)
router.get('/payments/:id/soporte', async (req, res) => {
    try {
        const paymentId = req.params.id;
        const soporte = await Soporte.findOne({ where: { paymentId } });

        if (!soporte) {
            return res.status(404).json({ error: 'Soporte no encontrado para este pago' });
        }

        res.set('Content-Type', soporte.mimeType);
        res.set('Content-Disposition', `attachment; filename="${soporte.originalName}"`);
        res.send(soporte.data);
    } catch (err) {
        console.error('Error al descargar soporte de pago:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4. Eliminar el soporte (para pagos)
router.delete('/payments/:id/soporte', async (req, res) => {
    try {
        const paymentId = req.params.id;
        const deleted = await Soporte.destroy({ where: { paymentId } });

        if (deleted === 0) {
            return res.status(404).json({ error: 'Soporte no encontrado' });
        }

        res.json({ ok: true, message: 'Soporte eliminado correctamente' });
    } catch (err) {
        console.error('Error al eliminar soporte de pago:', err);
        res.status(500).json({ error: err.message });
    }
});
// GET /dashboard-stats
// Calcula métricas reales para el panel principal:
//   - carteraActiva: suma de valorPrestado de préstamos con estado='Vigente'
//   - carteraMora:   penalización acumulada de socios activos sin ahorro mensual
//
// Lógica de mora:
//   - Socios con estatus='Activo'
//   - Para cada mes desde enero del año actual hasta el mes actual:
//       · Si el socio NO tiene ahorro registrado en ese mes/año
//         se calcula: días desde el día 11 de ese mes hasta HOY * $1.000
//         (solo si hoy ya pasó el día 11 de ese mes)
router.get('/dashboard-stats', async (req, res) => {
    try {
        const PENALIZACION_DIARIA = 1000;
        const now = new Date();
        const currentYear = now.getFullYear();
        const nextYear = currentYear + 1;
        const currentMonth = now.getMonth() + 1; // 1-12
        const { Op } = require('sequelize');
        const { status, years } = req.query;

        // Parse year filter (multi-select from frontend: "2026,2027")
        const parsedYears = years
            ? years.split(',').map(Number).filter(y => Number.isInteger(y) && y > 2000 && y < 2100).sort((a, b) => a - b)
            : [currentYear, nextYear];
        const minYear = parsedYears.length > 0 ? parsedYears[0] : currentYear;
        const maxYear = parsedYears.length > 0 ? parsedYears[parsedYears.length - 1] : nextYear;
        const dateFrom = `${minYear}-01-01`;
        const dateTo = `${maxYear}-12-31`;

        // Where clauses base
        const clientWhere = {};
        const statusTrimmed = (status || '').trim();
        if (statusTrimmed && statusTrimmed !== 'Todos') {
            // Use LIKE to tolerate leading/trailing whitespace in DB values
            // e.g. "Activo" will match "Activo", "Activo ", " Activo"
            clientWhere.estatus = { [Op.like]: `%${statusTrimmed}%` };
        }

        // ── 0. TOTAL CLIENTS (Filtered by status if applicable) ────────────────
        let totalClientsCount = 0;
        let activeClientsCount = 0;
        let inactiveClientsCount = 0;

        if (statusTrimmed && statusTrimmed !== 'Todos') {
            totalClientsCount = await Client.count({ where: clientWhere });
            if (statusTrimmed.toLowerCase().includes('activo')) activeClientsCount = totalClientsCount;
            if (statusTrimmed.toLowerCase().includes('desactivado')) inactiveClientsCount = totalClientsCount;
        } else {
            totalClientsCount = await Client.count();
            activeClientsCount = await Client.count({ where: { estatus: { [Op.like]: '%Activo%' } } });
            inactiveClientsCount = await Client.count({ where: { estatus: { [Op.like]: '%Desactivado%' } } });
        }

        // ── 1. CARTERA ACTIVA: préstamos Vigentes (Filtered by client status) ──
        const vigentLoans = await DisbursedLoan.findAll({
            where: { estado: { [Op.like]: 'Vigente%' } },
            include: [{
                model: Client,
                where: Object.keys(clientWhere).length > 0 ? clientWhere : undefined,
                required: Object.keys(clientWhere).length > 0
            }]
        });
        const carteraActivaCount = vigentLoans.length;
        const totalVigentePrestado = vigentLoans.reduce(
            (sum, l) => sum + parseFloat(l.valorPrestado || 0), 0
        );

        // Cartera Activa = suma directa de valorCuotaVariable de cuotas con estado='Pendiente'
        // en el año actual. Esto refleja exactamente el saldo pendiente visible en la tabla de pagos.
        const carteraPayments = await LoanPayment.findAll({
            where: {
                estado: 'Pendiente',
                fechaPagoMax: {
                    [Op.between]: [dateFrom, dateTo]
                }
            },
            include: [{
                model: Client,
                where: Object.keys(clientWhere).length > 0 ? clientWhere : undefined,
                required: Object.keys(clientWhere).length > 0,
                attributes: []
            }],
            attributes: ['valorCuotaVariable', 'fechaPagoMax', 'mesPago']
        });

        // Separar cuotas al día (no vencidas) de cuotas vencidas dentro del rango de fechas.
        // Usando el mismo umbral que moraCarteraEP (hoy a las 00:00).
        const todayThresholdCartea = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const safeParseSimple = (dateVal) => {
            if (!dateVal) return null;
            let s = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal).split('T')[0];
            const [y, m, d] = s.split('-').map(Number);
            return (y && m && d) ? new Date(y, m - 1, d) : null;
        };

        let carteraDia = 0;
        let carteraDiaCount = 0;
        let carteraActiva = 0;
        for (const p of carteraPayments) {
            const val = parseFloat(p.valorCuotaVariable || 0);
            carteraActiva += val;
            const fMax = safeParseSimple(p.fechaPagoMax);
            if (!fMax || fMax >= todayThresholdCartea) {
                carteraDia += val;
                carteraDiaCount++;
            }
        }
        carteraActiva = Math.round(carteraActiva);
        carteraDia = Math.round(carteraDia);
        const pendingInstallmentsCount = carteraPayments.length;

        // ── 3. INTERESES (CURRENT YEAR): Sum of Valor Intereses amortizados ──
        // Excluye cuotas con esPrepago=true (interés condonado por refinanciación).
        const totalIntereses = await LoanPayment.sum('valorInteresesAmortizados', {
            where: {
                fechaPagoMax: {
                    [Op.between]: [dateFrom, dateTo]
                },
                esPrepago: { [Op.ne]: true }
            },
            include: [{
                model: Client,
                where: Object.keys(clientWhere).length > 0 ? clientWhere : undefined,
                required: Object.keys(clientWhere).length > 0
            }]
        }) || 0;

        // ── 4. TOTAL CUOTAS PAGADAS ──
        // Calcula el total de cuotas efectivamente pagadas en el año en curso:
        //   Condición: estado='Pago' AND fechaPagoMax en el año actual
        //   Suma: valorCuotaPago para cuotas esPrepago (interés condonado); valorCuotaVariable para el resto.
        //   Deduplicando por clave clientId|idVm|mesPago para evitar dobles conteos.
        const rawPagoRows = await LoanPayment.findAll({
            where: {
                estado: 'Pago',
                fechaPagoMax: {
                    [Op.between]: [dateFrom, dateTo]
                }
            },
            include: [{
                model: Client,
                where: Object.keys(clientWhere).length > 0 ? clientWhere : undefined,
                required: Object.keys(clientWhere).length > 0,
                attributes: []
            }],
            attributes: ['id', 'clientId', 'idVm', 'mesPago', 'valorCuotaVariable', 'valorCuotaPago', 'esPrepago']
        });

        // Deduplicar por clave clientId|idVm|mesPago para contar una sola vez por cuota de préstamo por mes.
        // Para cuotas de refinanciación (esPrepago=true) se usa valorCuotaPago (solo capital, sin interés condonado).
        const seenKeys = new Set();
        let totalCuotasPagadas = 0;
        let recaudoCuotasCount = 0;
        for (const p of rawPagoRows) {
            const key = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            const valor = p.esPrepago ? parseFloat(p.valorCuotaPago || 0) : parseFloat(p.valorCuotaVariable || 0);
            totalCuotasPagadas += valor;
            recaudoCuotasCount++;
        }
        totalCuotasPagadas = Math.round(totalCuotasPagadas);



        // ── 4.1 TOTAL HISTÓRICO DE CUOTAS PAGADAS (para Saldo en Banco) ──
        // Sin filtro de año ni de estadoPrestamo='Pendiente', incluye cuentas canceladas.
        // Para cuotas esPrepago usa valorCuotaPago (capital real cobrado, sin interés condonado).
        const rawAllPagoRows = await LoanPayment.findAll({
            where: { estado: 'Pago' },
            include: [{
                model: Client,
                where: Object.keys(clientWhere).length > 0 ? clientWhere : undefined,
                required: Object.keys(clientWhere).length > 0,
                attributes: []
            }],
            attributes: ['id', 'clientId', 'idVm', 'mesPago', 'valorCuotaVariable', 'valorCuotaPago', 'esPrepago']
        });

        const seenAllKeys = new Set();
        let totalAllCuotasPagadas = 0;
        for (const p of rawAllPagoRows) {
            const key = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`;
            if (seenAllKeys.has(key)) continue;
            seenAllKeys.add(key);
            totalAllCuotasPagadas += p.esPrepago ? parseFloat(p.valorCuotaPago || 0) : parseFloat(p.valorCuotaVariable || 0);
        }
        totalAllCuotasPagadas = Math.round(totalAllCuotasPagadas);


        // Intereses recaudados en el año actual (Estado: Pago).
        // Excluye cuotas con esPrepago=true (interés condonado por refinanciación).
        const totalInteresesPagados = await LoanPayment.sum('valorInteresesAmortizados', {
            where: {
                estado: 'Pago',
                esPrepago: { [Op.ne]: true },
                fechaPagoMax: {
                    [Op.between]: [dateFrom, dateTo]
                }
            },
            include: [{
                model: Client,
                where: Object.keys(clientWhere).length > 0 ? clientWhere : undefined,
                required: Object.keys(clientWhere).length > 0
            }]
        }) || 0;

        // Defined here for use in all subsequent sums to match "Lista de Ahorro" behavior
        const effectiveClientWhere = Object.keys(clientWhere).length > 0
            ? clientWhere
            : { estatus: { [Op.like]: '%Activo%' } };

        // ── 4.5 TOTAL PRÉSTAMOS VIGENTES (para Saldo en Banco) ──
        // Solo préstamos en estado 'Vigente' representan capital activo
        // que aún no ha sido retornado al fondo. Los cancelados ya fueron saldados
        // y sus cuotas pagadas se contabilizan en totalAllCuotasPagadas.
        const totalAllLoans = await DisbursedLoan.sum('valorPrestado', {
            where: { estado: { [Op.like]: '%Vigente%' } }
        }) || 0;

        // ── 5. TOTAL APORTES INICIALES (solo socios activos) ──
        // Se filtran por effectiveClientWhere para sumar únicamente los aportes
        // de socios activos, excluyendo socios desactivados/retirados.
        const totalInitialContributions = await Saving.sum('amount', {
            where: { type: 'Aporte Inicial' },
            include: [{
                model: Client,
                where: effectiveClientWhere,
                required: true
            }]
        }) || 0;

        // ── 2. CARTERA MORA: socios sin ahorros mensuales ──────────────────────
        // When a specific status is selected → evaluate those clients.
        // When 'Todos' → default to 'Activo' clients (mora logic by definition applies to active).
        const moraWhere = statusTrimmed && statusTrimmed !== 'Todos'
            ? clientWhere
            : { estatus: { [Op.like]: '%Activo%' } };

        const clientsToEvaluate = await Client.findAll({ where: moraWhere });

        // Traer todos los ahorros del año actual de esos clientes (para mora)
        const activeClientIds = clientsToEvaluate.map(c => c.id);
        const savingsThisYear = await Saving.findAll({
            where: {
                clientId: { [Op.in]: activeClientIds },
                anioAbonado: currentYear,
                type: { [Op.ne]: 'Aporte Inicial' } // Don't count "Aporte Inicial" as covering for "Mensual" mora
            },
            attributes: ['clientId', 'mesAbonado', 'anioAbonado', 'type', 'date', 'valorAPenalizar']
        });

        // ── 3. TOTAL SAVINGS: suma de amount (bruto, incluye penalizaciones cobradas)
        const totalSavingsResult = await Saving.sum('amount', {
            where: {
                type: { [Op.ne]: 'Aporte Inicial' }
            },
            include: [{
                model: Client,
                where: effectiveClientWhere,
                required: true
            }]
        }) || 0;

        const totalPenaltyDays = await Saving.sum('diasPenalizacion', {
            where: { year: currentYear },
            include: [{
                model: Client,
                where: effectiveClientWhere,
                required: true
            }]
        }) || 0;

        const totalPenaltyValue = await Saving.sum('valorAPenalizar', {
            where: { year: currentYear },
            include: [{
                model: Client,
                where: effectiveClientWhere,
                required: true
            }]
        }) || 0;

        // --- 3.5 DETALLE PENALIDADES PAGADAS (Para el modal de Valor Penalizado) ---
        const penSavings = await Saving.findAll({
            where: {
                year: currentYear,
                valorAPenalizar: { [Op.gt]: 0 }
            },
            include: [{
                model: Client,
                attributes: ['name', 'surname1', 'cedula'],
                where: effectiveClientWhere,
                required: true
            }],
            attributes: ['id', 'diasPenalizacion', 'valorAPenalizar', 'date', 'month']
        });

        const detallePenalidad = penSavings.map(p => ({
            id: p.id,
            nombre: `${p.Client.name} ${p.Client.surname1 || ''}`.trim(),
            cedula: p.Client.cedula,
            dias: p.diasPenalizacion,
            valor: p.valorAPenalizar,
            fecha: p.date,
            mes: p.month
        }));

        // ── 4. TOTAL PRÉSTAMOS (AÑOS SELECCIONADOS) ─────────────────────────────
        // Sum of all loans disbursed in the selected years
        const prestamosEsteAno = await DisbursedLoan.findAll({
            where: {
                anioDesembolso: { [Op.in]: parsedYears }
            },
            include: [{
                model: Client,
                where: Object.keys(clientWhere).length > 0 ? clientWhere : undefined,
                required: Object.keys(clientWhere).length > 0
            }]
        });
        const totalPrestamos = prestamosEsteAno.reduce(
            (sum, l) => sum + parseFloat(l.valorPrestado || 0), 0
        );
        const totalPrestamosCount = prestamosEsteAno.length;

        // Indexar ahorros: Set de "clientId-mes" con ahorro
        const savingSet = new Set();
        savingsThisYear.forEach(s => {
            if (s.mesAbonado) savingSet.add(`${s.clientId}-${s.mesAbonado}`);
        });

        let carteraMora = 0;
        let sociosMora = 0;
        const detalleMora = [];

        for (const client of clientsToEvaluate) {
            const clientSavings = savingsThisYear.filter(s => s.clientId === client.id);

            // Determinar la fecha de la última vez que el cliente pagó una penalidad
            const penaltyPayments = clientSavings
                .filter(s => parseFloat(s.valorAPenalizar || 0) > 0 && s.date)
                .map(s => new Date(s.date + 'T12:00:00'));
            const lastPenaltyDate = penaltyPayments.length > 0
                ? new Date(Math.max(...penaltyPayments))
                : null;

            // Los socios que ingresaron en el año en curso tienen un mes de gracia para
            // realizar su primer aporte: su primera cuota vence el día 10 del mes siguiente
            // al de registro. Por eso se empieza a evaluar desde registration_month + 1.
            let firstCheckMonth = 1;
            if (client.createdAt) {
                const reg = new Date(client.createdAt);
                if (reg.getFullYear() === currentYear) {
                    firstCheckMonth = reg.getMonth() + 2; // getMonth() 0-indexed + 1 mes gracia
                }
            }

            const mesesPendientes = [];
            for (let mes = firstCheckMonth; mes <= currentMonth; mes++) {
                if (!savingSet.has(`${client.id}-${mes}`)) {
                    const dia10 = new Date(currentYear, mes - 1, 10);
                    // Si la fecha de corte (día 10) de este mes faltante es anterior al último pago de penalidad,
                    // asumimos que la mora por este mes ya fue saldada y no debe seguir contando.
                    if (lastPenaltyDate && lastPenaltyDate > dia10) {
                        continue;
                    }
                    mesesPendientes.push(mes);
                }
            }

            if (mesesPendientes.length === 0) continue;

            // La penalización corre desde el día 10 del PRIMER mes sin ahorro hasta hoy (Inclusivo, día 11 = 1 día)
            const primerMesSinAhorro = mesesPendientes[0];
            const dia10PrimerMes = new Date(currentYear, primerMesSinAhorro - 1, 10);

            // Solo penalizar si hoy ya pasó el día 10 del primer mes sin ahorro (o sea hoy >= 11)
            if (now <= dia10PrimerMes) continue;

            // Congelar la penalización si el usuario realizó pagos de ahorro posteriores al día de mora
            let endDate = now;
            const clientSavingsDates = savingsThisYear
                .filter(s => s.clientId === client.id && s.date)
                .map(s => new Date(s.date + 'T12:00:00'))
                .filter(d => d >= dia10PrimerMes);

            if (clientSavingsDates.length > 0) {
                clientSavingsDates.sort((a, b) => a - b);
                endDate = clientSavingsDates[0];
            }

            // Diferencia en milisegundos y conversión a días (floor para días completos transcurridos desde el 10)
            const diffMs = endDate.getTime() - dia10PrimerMes.getTime();
            const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            const penalizacionCliente = diffDays * PENALIZACION_DIARIA;

            if (penalizacionCliente > 0) {
                carteraMora += penalizacionCliente;
                sociosMora++;
                detalleMora.push({
                    clientId: client.id,
                    nombre: `${client.name} ${client.surname1 || ''}`.trim(),
                    cedula: client.cedula,
                    penalizacion: penalizacionCliente,
                    diasDesdeDia11: diffDays,
                    primerMesSinAhorro,
                    mesesPendientes
                });
            }
        }
        console.log(`[DEBUG MORA] Total: $${carteraMora}, Socios: ${sociosMora}`);

        // ── 2.5 CARTERA MORA EP (Préstamos): Replicated logic from PaymentsListPage ──
        const loanPaymentsPending = await LoanPayment.findAll({
            where: {
                estado: 'Pendiente'
            },
            include: [{
                model: Client,
                attributes: ['name', 'surname1', 'cedula']
            }]
        });

        // Cargar todos los registros PAGADOS para excluirlos del cálculo de mora.
        // Doble clave: (clientId+idVm+mesPago) Y (clientId+idVm+itemQuantity).
        // Esto evita falsos positivos cuando el mesPago del registro Pendiente
        // y el del registro Pago tienen formato distinto (ej. "Enero" vs "enero 2025").
        const loanPaymentsPaid = await LoanPayment.findAll({
            where: { estado: { [Op.in]: ['Pago', 'Abono'] } },
            attributes: ['clientId', 'idVm', 'mesPago', 'itemQuantity']
        });
        const paidKeySet = new Set();
        loanPaymentsPaid.forEach(p => {
            const base = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}`;
            paidKeySet.add(`${base}|mes:${(p.mesPago || '').trim().toLowerCase()}`);
            if (p.itemQuantity != null) paidKeySet.add(`${base}|cuota:${p.itemQuantity}`);
        });

        let moraCarteraEP = 0;
        const detalleMoraEP = [];
        const nowLocal = new Date();
        // Umbral de mora EP: Hoy a las 00:00:00. Si la fecha máxima de pago ya pasó (ayer o antes), es mora.
        const todayThreshold = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
        const monthsLower = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

        const safeParseDate = (dateVal, mesRef) => {
            if (!dateVal) return null;
            let dateStr = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal);
            if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];

            const parts = dateStr.split('-');
            if (parts.length !== 3) return new Date(dateStr + 'T00:00:00');
            const [y, m, d] = parts.map(Number);

            if (mesRef) {
                const targetIdx = monthsLower.indexOf(mesRef.toLowerCase().trim()) + 1;
                if (targetIdx > 0) {
                    if (m === targetIdx) return new Date(y, m - 1, d); // YYYY-MM-DD
                    if (d === targetIdx) return new Date(y, d - 1, m); // Swapped YYYY-DD-MM
                }
            }
            return new Date(dateStr + 'T00:00:00');
        };

        loanPaymentsPending.forEach(p => {
            // ── EXCLUSIÓN: si ya existe un Pago/Abono para este cliente+préstamo ──
            // Verificamos por mesPago (texto) O por número de cuota (itemQuantity).
            // La doble clave evita falsos positivos cuando los formatos de mesPago difieren.
            const base = `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}`;
            const keyMes = `${base}|mes:${(p.mesPago || '').trim().toLowerCase()}`;
            const keyCuota = `${base}|cuota:${p.itemQuantity}`;
            if (paidKeySet.has(keyMes) || (p.itemQuantity != null && paidKeySet.has(keyCuota))) return;

            const fechaMax = safeParseDate(p.fechaPagoMax, p.mesPago);
            // Si la fecha límite ya pasó respecto a hoy (00:00:00), es mora.
            if (fechaMax && fechaMax < todayThreshold) {
                const val = parseFloat(p.valorCuotaVariable || 0);
                moraCarteraEP += val;
                detalleMoraEP.push({
                    nombre: `${p.Client.name} ${p.Client.surname1 || ''}`.trim(),
                    cedula: p.Client.cedula,
                    mes: p.mesPago || '—',
                    valor: val,
                    fecha: p.fechaPagoMax,
                    idVm: p.idVm
                });
            }
        });

        // ── 9. ACTIVIDAD RECIENTE (Top 3 Ahorros y Top 3 Pagos > 0) ──
        const [rawSavings, rawPayments] = await Promise.all([
            Saving.findAll({
                where: { amount: { [Op.gt]: 0 } },
                limit: 3,
                order: [['updatedAt', 'DESC']],
                include: [{ model: Client, attributes: ['name', 'surname1'] }]
            }),
            LoanPayment.findAll({
                where: { valorCuotaPago: { [Op.gt]: 0 } },
                limit: 3,
                order: [['updatedAt', 'DESC']],
                include: [{ model: Client, attributes: ['name', 'surname1'] }]
            })
        ]);

        const recentSavings = rawSavings.map(s => ({
            id: s.id,
            client: s.Client ? `${s.Client.name} ${s.Client.surname1 || ''}`.trim() : 'N/A',
            amount: s.amount,
            date: s.date
        }));

        const recentPayments = rawPayments.map(p => ({
            id: p.id,
            client: p.Client ? `${p.Client.name} ${p.Client.surname1 || ''}`.trim() : 'N/A',
            amount: p.valorCuotaPago,
            month: p.mesPago
        }));

        res.json({
            clientsCount: totalClientsCount,
            activeClientsCount,
            inactiveClientsCount,
            totalSavings: Math.round(totalSavingsResult),
            carteraActiva: Math.round(carteraActiva),
            carteraDia: Math.round(carteraDia),
            carteraDiaCount,
            carteraActivaCount,
            pendingInstallmentsCount,
            totalPrestamos: Math.round(totalPrestamos),
            totalPrestamosCount,
            totalIntereses: Math.round(totalIntereses),
            totalPrestamosMasIntereses: Math.round(totalPrestamos + totalIntereses),
            totalCuotasPagadas: Math.round(totalCuotasPagadas),
            recaudoCuotasCount,
            totalInteresesPagados,
            totalInitialContributions: Math.round(totalInitialContributions),
            totalAhorradoGeneral: Math.round(totalSavingsResult + totalInitialContributions),
            totalPenaltyDays: Math.round(totalPenaltyDays),
            totalPenaltyValue: Math.round(totalPenaltyValue),
            // Rendimiento NU: valor actualizado manualmente desde el extracto de Nubank.
            // Actualizar este valor cuando se consulte el extracto real de la cuenta.
            rentabilidadCajaNU: 453490,
            // Saldo en Banco:
            // = (Capital Ahorrado Activos + Aportes Iniciales Activos) - Préstamos Vigentes + Cuotas Pagadas
            // Fórmula: (totalSavingsResult + totalInitialContributions - totalAllLoans) + totalCuotasPagadas
            saldoEnBanco: Math.round((totalSavingsResult + totalInitialContributions - totalAllLoans) + totalCuotasPagadas),
            carteraMora,
            moraCarteraEP: Math.round(moraCarteraEP),
            sociosMoraCount: sociosMora,
            detalleMora,
            detalleMoraEP,
            detallePenalidad,
            recentSavings,
            recentPayments,
            timestamp: now.toISOString()
        });

    } catch (err) {
        console.error('dashboard-stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

const ImportService = require('../services/DataImportService');

// ─── Feature Flag: Excel Sync ────────────────────────────────────────────────
// Controlled by ENABLE_EXCEL_SYNC in server/.env
// Set to "true" to re-enable without code changes.
const EXCEL_SYNC_ENABLED = process.env.ENABLE_EXCEL_SYNC === 'true';

// GET /sync-status — lets the frontend know if Excel sync is available
router.get('/sync-status', (req, res) => {
    res.json({
        enabled: EXCEL_SYNC_ENABLED,
        message: EXCEL_SYNC_ENABLED
            ? 'Sincronización Excel habilitada.'
            : 'Sincronización Excel deshabilitada. Los datos se gestionan directamente desde la base de datos.'
    });
});

// POST /sync-init — Excel import (disabled by default via feature flag)
router.post('/sync-init', async (req, res) => {
    if (!EXCEL_SYNC_ENABLED) {
        return res.status(410).json({
            ok: false,
            disabled: true,
            message: 'La sincronización desde Excel está desactivada (ENABLE_EXCEL_SYNC=false). Los datos se gestionan directamente desde la base de datos.',
            summary: []
        });
    }

    try {
        const dataDir = 'C:/Credifuturo';
        console.log('🔄 Starting Data Sync from:', dataDir);
        const report = await ImportService.importAll(dataDir);
        console.table(report.summary);
        res.json(report);
    } catch (err) {
        console.error('❌ Sync error:', err);
        res.status(500).json({
            ok: false,
            error: 'Error crítico en sincronización: ' + err.message,
            summary: []
        });
    }
});

// ─── POST /validate-db — Validate & confirm DB state ──────────────────────────
// Called by the "Guardar Cambios en la Base de Datos" button on the dashboard.
// Counts records per table and runs basic integrity checks.
router.post('/validate-db', async (req, res) => {
    try {
        const Client = require('../models/Client');
        const Saving = require('../models/Saving');
        const DisbursedLoan = require('../models/DisbursedLoan');
        const LoanPayment = require('../models/LoanPayment');
        const { Op } = require('sequelize');

        const [
            totalClients,
            totalSavings,
            totalLoans,
            totalPayments,
            orphanSavings,
            orphanLoans,
            orphanPayments
        ] = await Promise.all([
            Client.count(),
            Saving.count(),
            DisbursedLoan.count(),
            LoanPayment.count(),
            // Savings sin cliente válido
            Saving.count({ where: { clientId: { [Op.notIn]: require('sequelize').literal('(SELECT id FROM Clients)') } } }).catch(() => 0),
            // Loans sin cliente válido
            DisbursedLoan.count({ where: { clientId: { [Op.is]: null } } }).catch(() => 0),
            // Payments sin cliente válido
            LoanPayment.count({ where: { clientId: { [Op.is]: null } } }).catch(() => 0),
        ]);

        // Detectar cuotas huérfanas: idVm que no existe en ningún DisbursedLoan
        const allDisbursedIdVms = await DisbursedLoan.findAll({ attributes: ['idVm'] })
            .then(loans => loans.map(l => l.idVm).filter(Boolean));
        const orphanByIdVm = allDisbursedIdVms.length > 0
            ? await LoanPayment.count({
                where: { idVm: { [Op.notIn]: allDisbursedIdVms } }
              }).catch(() => 0)
            : 0;

        const tables = [
            {
                table: 'Socios (Clientes)',
                count: totalClients,
                status: totalClients > 0 ? 'OK' : 'WARN',
                message: totalClients > 0 ? `${totalClients} registros persistidos` : 'Sin registros'
            },
            {
                table: 'Ahorros',
                count: totalSavings,
                status: totalSavings > 0 ? (orphanSavings > 0 ? 'WARN' : 'OK') : 'WARN',
                message: orphanSavings > 0
                    ? `${totalSavings} registros (${orphanSavings} sin socio)`
                    : `${totalSavings} registros persistidos`
            },
            {
                table: 'Préstamos Desembolsados',
                count: totalLoans,
                status: totalLoans > 0 ? (orphanLoans > 0 ? 'WARN' : 'OK') : 'WARN',
                message: orphanLoans > 0
                    ? `${totalLoans} registros (${orphanLoans} sin socio)`
                    : `${totalLoans} registros persistidos`
            },
            {
                table: 'Estado Préstamos (Pagos)',
                count: totalPayments,
                status: totalPayments > 0 ? (orphanPayments > 0 || orphanByIdVm > 0 ? 'WARN' : 'OK') : 'WARN',
                message: (() => {
                    const issues = [];
                    if (orphanPayments > 0) issues.push(`${orphanPayments} sin socio`);
                    if (orphanByIdVm > 0) issues.push(`${orphanByIdVm} con idVm sin préstamo padre`);
                    return issues.length > 0
                        ? `${totalPayments} registros (${issues.join(', ')})`
                        : `${totalPayments} registros persistidos`;
                })()
            }
        ];

        const hasErrors = tables.some(t => t.status === 'ERROR');
        const hasWarnings = tables.some(t => t.status === 'WARN');

        console.log(`[validate-db] Clientes:${totalClients} Ahorros:${totalSavings} Préstamos:${totalLoans} Pagos:${totalPayments}`);

        res.json({
            ok: !hasErrors,
            hasWarnings,
            timestamp: new Date().toISOString(),
            summary: tables,
            totals: { totalClients, totalSavings, totalLoans, totalPayments }
        });
    } catch (err) {
        console.error('❌ validate-db error:', err);
        res.status(500).json({ ok: false, error: err.message, summary: [] });
    }
});

// ─────────────────────────────────────────────
// BACKUP MASIVO: Genera y guarda todos los reportes Excel
// ─────────────────────────────────────────────
router.post('/backup/all', async (req, res) => {
    try {
        const BackupService = require('../services/BackupService');
        const result = await BackupService.generateAllBackups();
        console.log(`[Backup] Backup completado. ${result.files.length} archivos en ${result.folder}`);
        res.json({ ok: true, folder: result.folder, files: result.files, timestamp: result.timestamp });
    } catch (err) {
        console.error('❌ backup/all error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});



// ─────────────────────────────────────────────
// HISTORIAL DE BACKUPS
// ─────────────────────────────────────────────
const BACKUPS_DIR = 'C:\\Credifuturo\\Backups';
const fs = require('fs');
const path = require('path');

router.get('/backup-history', async (req, res) => {
    try {
        if (!fs.existsSync(BACKUPS_DIR)) {
            return res.json([]);
        }
        const entries = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true });
        const folders = entries
            .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}(_\d{6})?$/.test(e.name))
            .map(folder => {
                const folderPath = path.join(BACKUPS_DIR, folder.name);
                const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.xlsx'));
                const totalSize = files.reduce((sum, f) => {
                    try { return sum + fs.statSync(path.join(folderPath, f)).size; } catch { return sum; }
                }, 0);
                const stat = fs.statSync(folderPath);
                // Extract date and time from folder name
                const datePart = folder.name.substring(0, 10); // YYYY-MM-DD
                const timePart = folder.name.length > 10 ? folder.name.substring(11) : null; // HHmmss
                let backupTime = stat.mtime;
                if (timePart && timePart.length === 6) {
                    const hh = timePart.substring(0, 2);
                    const mm = timePart.substring(2, 4);
                    const ss = timePart.substring(4, 6);
                    backupTime = new Date(`${datePart}T${hh}:${mm}:${ss}`);
                }
                return {
                    date: datePart,
                    folderName: folder.name,
                    filesCount: files.length,
                    files: files,
                    totalSizeKB: Math.round(totalSize / 1024),
                    createdAt: stat.birthtime,
                    modifiedAt: backupTime
                };
            })
            .sort((a, b) => b.folderName.localeCompare(a.folderName));
        res.json(folders);
    } catch (err) {
        console.error('Error al listar historial de backups:', err);
        res.status(500).json({ error: 'Error al listar historial de backups' });
    }
});

// ─────────────────────────────────────────────
// INFORMES Y AUDITORÍAS (Markdown)
// ─────────────────────────────────────────────
const INFORMES_DIR = 'C:\\Credifuturo\\Informes';


router.get('/informes', async (req, res) => {
    try {
        if (!fs.existsSync(INFORMES_DIR)) {
            return res.json([]);
        }
        const files = fs.readdirSync(INFORMES_DIR);
        const reports = files
            .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
            .map(f => {
                const stat = fs.statSync(path.join(INFORMES_DIR, f));
                return {
                    name: f,
                    createdAt: stat.birthtime,
                    updatedAt: stat.mtime
                };
            })
            .sort((a, b) => b.createdAt - a.createdAt);
        res.json(reports);
    } catch (err) {
        console.error('Error al listar informes:', err);
        res.status(500).json({ error: 'Error al listar informes' });
    }
});

router.get('/informes/:name', async (req, res) => {
    try {
        const { name } = req.params;
        if (name.includes('..') || name.includes('/') || name.includes('\\')) {
            return res.status(400).json({ error: 'Nombre de archivo inválido' });
        }
        const filePath = path.join(INFORMES_DIR, name);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Informe no encontrado' });
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ name, content });
    } catch (err) {
        console.error('Error al leer informe:', err);
        res.status(500).json({ error: 'Error al leer informe' });
    }
});

router.delete('/informes/:name', async (req, res) => {
    try {
        const { name } = req.params;
        if (name.includes('..') || name.includes('/') || name.includes('\\')) {
            return res.status(400).json({ error: 'Nombre de archivo inválido' });
        }
        const filePath = path.join(INFORMES_DIR, name);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error al eliminar informe:', err);
        res.status(500).json({ error: 'Error al eliminar informe' });
    }
});

// ─────────────────────────────────────────────
// ENDPOINTS PARA SOCIOS (SOLO LECTURA)
// ─────────────────────────────────────────────

router.get('/my/profile', verifyToken, requireFreshPassword, requireRole('user'), async (req, res) => {
    try {
        const client = await Client.findByPk(req.user.id, {
            attributes: { exclude: ['password'] }
        });
        if (!client) return res.status(404).json({ error: 'Socio no encontrado' });
        res.json(client);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/my/loans', verifyToken, requireFreshPassword, requireRole('user'), async (req, res) => {
    try {
        const loans = await DisbursedLoan.findAll({
            where: { clientId: req.user.id },
            include: [{ model: Client, attributes: ['customerId', 'name', 'surname1', 'surname2', 'cedula'] }],
            order: [['fechaPrestamo', 'DESC']]
        });

        const normalizedData = loans.map(l => {
            const raw = l.toJSON();
            const normalized = { ...raw };
            const c = raw.Client || raw.client;
            normalized.clientName = c ? `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.trim() : '';
            normalized.clientCedula = c ? c.cedula : '';
            normalized.clientCustomerId = c ? c.customerId : '';
            return normalized;
        });

        res.json({ ok: true, data: normalizedData, total: normalizedData.length });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/my/savings', verifyToken, requireFreshPassword, requireRole('user'), async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const savings = await Saving.findAll({
            where: { clientId: req.user.id, type: { [Op.ne]: 'Aporte Inicial' } },
            include: [{ model: Client, attributes: ['customerId', 'name', 'surname1', 'surname2', 'cedula'] }],
            order: [['date', 'DESC']]
        });

        const normalizedData = savings.map(s => {
            const raw = s.toJSON();
            const normalized = { ...raw };
            const c = raw.Client || raw.client;
            normalized.clientName = c ? `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.trim() : '';
            normalized.clientCedula = c ? c.cedula : '';
            normalized.clientCustomerId = c ? c.customerId : '';
            return normalized;
        });

        res.json({ ok: true, data: normalizedData, total: normalizedData.length });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/my/initial-contributions', verifyToken, requireFreshPassword, requireRole('user'), async (req, res) => {
    try {
        const contributions = await Saving.findAll({
            where: { clientId: req.user.id, type: 'Aporte Inicial' },
            include: [{ model: Client, attributes: ['customerId', 'name', 'surname1', 'surname2', 'cedula'] }],
            order: [['date', 'DESC']]
        });

        const normalizedData = contributions.map(s => {
            const raw = s.toJSON();
            const normalized = { ...raw };
            const c = raw.Client || raw.client;
            normalized.clientName = c ? `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.trim() : '';
            normalized.clientCedula = c ? c.cedula : '';
            normalized.clientCustomerId = c ? c.customerId : '';
            return normalized;
        });

        res.json({ ok: true, data: normalizedData, total: normalizedData.length });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/my/payments', verifyToken, requireFreshPassword, requireRole('user'), async (req, res) => {
    try {
        const payments = await LoanPayment.findAll({
            where: { clientId: req.user.id },
            include: [{ model: Client, attributes: ['customerId', 'name', 'surname1', 'surname2', 'cedula'] }],
            order: [['fechaPagoMax', 'DESC']]
        });

        const normalizedData = payments.map(p => {
            const raw = p.toJSON();
            const normalized = { ...raw };
            const c = raw.Client || raw.client;
            normalized.clientName = c ? `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.trim() : '';
            normalized.clientCedula = c ? c.cedula : '';
            normalized.clientCustomerId = c ? c.customerId : '';
            normalized.fechaPago = raw.fechaPagoMax; // Ensure frontend gets fechaPago
            return normalized;
        });

        res.json({ ok: true, data: normalizedData, total: normalizedData.length });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/my/balance', verifyToken, requireFreshPassword, requireRole('user'), async (req, res) => {
    try {
        const clientId = req.user.id;
        const totalSavings = await Saving.sum('amount', { where: { clientId } }) || 0;

        const disbursedLoans = await DisbursedLoan.findAll({ where: { clientId } });
        const totalDisbursed = disbursedLoans.reduce((sum, loan) => sum + parseFloat(loan.valorPrestado || loan.monto || 0), 0);

        // Calcular Cartera Activa: suma de las cuotas pendientes
        const allUserPayments = await LoanPayment.findAll({
            where: { clientId }
        });
        const debt = allUserPayments
            .filter(p => p.estado && p.estado.toLowerCase().includes('pendiente'))
            .reduce((sum, p) => sum + parseFloat(p.valorCuotaPago || p.valorCuotaVariable || 0), 0);

        const balance = totalSavings;

        res.json({
            balance: parseFloat(balance).toFixed(2),
            debt: parseFloat(debt).toFixed(2),
            totalSavings: parseFloat(totalSavings).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Gestión de contraseñas (admin) ────────────────────────────────────────

// Resetear contraseña de un socio (admin)
// A07: si el admin no envía contraseña, se genera una temporal aleatoria.
// Si la envía, debe cumplir la política. La temporal se devuelve UNA SOLA VEZ.
router.post('/clients/:id/reset-password', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id);
        if (!client) return res.status(404).json({ error: 'Socio no encontrado.' });

        const provided = req.body.tempPassword && String(req.body.tempPassword).trim();
        let tempPassword;
        if (provided) {
            const policyError = validatePassword(provided);
            if (policyError) return res.status(400).json({ error: policyError });
            tempPassword = provided;
        } else {
            tempPassword = generateTempPassword();
        }
        const hashed = await bcrypt.hash(tempPassword, 10);
        await client.update({ password: hashed, mustChangePassword: true });

        // Marcar solicitudes pendientes de este socio como resueltas
        const PasswordResetRequest = require('../models/PasswordResetRequest');
        await PasswordResetRequest.update({ status: 'resolved' }, { where: { clientId: client.id, status: 'pending' } });

        logSecurityEvent('PASSWORD_RESET_BY_ADMIN', {
            actorId: req.user?.id,
            targetClientId: client.id,
            ip: getClientIp(req)
        });

        res.json({ ok: true, message: `Contraseña restablecida. El socio deberá cambiarla en su próximo ingreso.`, tempPassword });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar solicitudes de recuperación de contraseña (admin)
router.get('/password-reset-requests', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const PasswordResetRequest = require('../models/PasswordResetRequest');
        const { status } = req.query;
        const whereClause = status ? { status } : { status: 'pending' };
        const requests = await PasswordResetRequest.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']]
        });
        res.json({ ok: true, data: requests, total: requests.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Resolver manualmente una solicitud (admin)
router.put('/password-reset-requests/:id/resolve', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const PasswordResetRequest = require('../models/PasswordResetRequest');
        const request = await PasswordResetRequest.findByPk(req.params.id);
        if (!request) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        await request.update({ status: 'resolved' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
