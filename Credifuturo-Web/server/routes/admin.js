const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Client, Saving, Soporte, Loan, DisbursedLoan, LoanPayment } = require('../models');
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole, requireFreshPassword } = require('../middleware/authMiddleware');
const { validatePassword, generateTempPassword } = require('../services/passwordPolicy');
const { hoyISOFondo } = require('../services/fechaFondo');
const { logSecurityEvent, getClientIp, LOG_FILE } = require('../services/securityLogger');
const { getLastActivity } = require('../services/sessionActivity');
const { verifyFileMagicBytes, sanitizeFilename } = require('../services/fileValidator');

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
// autenticado (el panel de Inicio lo comparte). /executive-stats y /savings-evolution
// se suman por la misma razón: el Panel Ejecutivo (client/.../ExecutivePanelPage.jsx)
// ahora se monta también en /dashboard/panel-ejecutivo como vista de solo lectura para
// socios — igual que /dashboard-stats con DashboardHome. El resto exige rol admin.
// A07: ademas exigimos que el usuario no tenga mustChangePassword pendiente.
// /year-comparison acompaña a /dashboard-stats: alimenta el mismo Panel de
// Inteligencia Financiera, que se monta también en /dashboard/fondo para socios.
// Son agregados por año/mes del fondo, sin nombres ni cédulas de nadie.
const READ_ONLY_FOR_ALL = new Set(['/dashboard-stats', '/executive-stats', '/savings-evolution', '/year-comparison']);
const READ_ONLY_PREFIXES = ['/settings/'];

// Funciones "(BETA)" (Ranking de Ahorro, Buzón de Propuestas): el menú del socio ya
// las oculta a todos menos a este grupo, pero la API debe exigir lo mismo — si no,
// cualquier socio autenticado podría pedir el endpoint directo y ver los datos reales
// de todos los demás socios. La cédula sí viene en el JWT (surname1 no), así que el
// grupo beta se identifica por cédula, no por nombre.
const BETA_CEDULAS = new Set(['36304875', '52496873', '79863805']); // Lady Torres, Xiomara Rojas, Leonardo Rojas
async function requireAdminOrBetaTester(req, res, next) {
    if (req.user?.role === 'admin') return next();
    if (!BETA_CEDULAS.has(req.user?.cedula)) {
        return res.status(403).json({ error: 'Esta función todavía no está disponible para tu cuenta.' });
    }
    try {
        const AppSetting = require('../models/AppSetting');
        const setting = await AppSetting.findOne({ where: { key: 'propuestas_enabled' } });
        if (setting?.value === 'true') return next();
        return res.status(403).json({ error: 'Esta función todavía no está disponible para tu cuenta.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// { método, ruta o test(path) } -> abierta a admin + grupo beta (no a cualquier autenticado)
const BETA_ROUTES = [
    { method: 'GET', path: '/savings/ranking' },
    { method: 'GET', path: '/propuestas' },
    { method: 'POST', path: '/propuestas' },
    { method: 'PUT', test: p => /^\/propuestas\/\d+\/voto$/.test(p) },
    { method: 'PUT', test: p => /^\/propuestas\/\d+$/.test(p) },
];

// Junta Administrativa del fondo: gerente (admin) + subgerente + tesorera. Un
// préstamo solo se puede desembolsar cuando los 3 hayan votado y los 3 hayan
// aprobado — ver PUT /loan-requests/:id/vote. El gerente entra por role==='admin'
// (no hay más de un admin hoy); los otros dos, por cédula (igual que BETA_CEDULAS).
const JUNTA_CEDULAS = new Set(['79863805', '52496873']); // Leonardo Rojas (Subgerente), Xiomara Rojas (Tesorera)
function isJuntaMember(user) {
    return user?.role === 'admin' || JUNTA_CEDULAS.has(user?.cedula);
}
function requireJuntaMember(req, res, next) {
    if (isJuntaMember(req.user)) return next();
    return res.status(403).json({ error: 'Esta función es exclusiva de la Junta Administrativa.' });
}
async function getJuntaClientIds() {
    const admins = await Client.findAll({ where: { role: 'admin' }, attributes: ['id'] });
    const otros = await Client.findAll({ where: { cedula: Array.from(JUNTA_CEDULAS) }, attributes: ['id'] });
    return [...new Set([...admins.map(a => a.id), ...otros.map(o => o.id)])];
}
const JUNTA_ROUTES = [
    { method: 'GET', path: '/loan-requests' },
    { method: 'GET', test: p => /^\/loan-requests\/\d+$/.test(p) },
    { method: 'PUT', test: p => /^\/loan-requests\/\d+\/vote$/.test(p) },
    { method: 'GET', test: p => /^\/clients\/\d+\/loan-capacity$/.test(p) },
    { method: 'GET', path: '/junta/members' },
    // Solo lectura — listar y ver informes. El DELETE de /informes/:name NO se
    // agrega aquí a propósito: cae al gate por defecto (solo admin), la Junta
    // puede consultar documentos institucionales pero no borrarlos.
    { method: 'GET', path: '/informes' },
    { method: 'GET', test: p => /^\/informes\/[^/]+$/.test(p) },
];

router.use((req, res, next) => {
    if (req.path.startsWith('/my/')) return next();
    if (req.method === 'GET' && (READ_ONLY_FOR_ALL.has(req.path) || READ_ONLY_PREFIXES.some(p => req.path.startsWith(p)))) {
        return verifyToken(req, res, () => requireFreshPassword(req, res, next));
    }
    const betaRoute = BETA_ROUTES.some(r => r.method === req.method && (r.path === req.path || (r.test && r.test(req.path))));
    if (betaRoute) {
        return verifyToken(req, res, () => requireFreshPassword(req, res, () => requireAdminOrBetaTester(req, res, next)));
    }
    const juntaRoute = JUNTA_ROUTES.some(r => r.method === req.method && (r.path === req.path || (r.test && r.test(req.path))));
    if (juntaRoute) {
        return verifyToken(req, res, () => requireFreshPassword(req, res, () => requireJuntaMember(req, res, next)));
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
            attributes: { exclude: ['password'] } // A02: no exponer hashes bcrypt
        });
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Construye el `where` de búsqueda/filtro de socios a partir del query string.
// Centraliza los Op.like/Op.in que antes estaban duplicados en varios endpoints.
// Params soportados (todos opcionales): q, estatus, tipoCliente, socioFundador,
// ciudad. `estatus`/`tipoCliente`/`ciudad` aceptan lista separada por comas.
function buildClientWhere(query = {}) {
    const { Op } = require('sequelize');
    const and = [];

    const q = (query.q || '').trim();
    if (q) {
        and.push({
            [Op.or]: [
                { name: { [Op.like]: `%${q}%` } },
                { surname1: { [Op.like]: `%${q}%` } },
                { surname2: { [Op.like]: `%${q}%` } },
                { cedula: { [Op.like]: `%${q}%` } },
                { customerId: { [Op.like]: `%${q}%` } },
                { email: { [Op.like]: `%${q}%` } }
            ]
        });
    }

    const addIn = (field, value) => {
        if (value === undefined || value === null || String(value).trim() === '') return;
        const arr = String(value).split(',').map(s => s.trim()).filter(Boolean);
        if (arr.length === 1) and.push({ [field]: arr[0] });
        else if (arr.length > 1) and.push({ [field]: { [Op.in]: arr } });
    };
    addIn('estatus', query.estatus);
    addIn('tipoCliente', query.tipoCliente);
    addIn('socioFundador', query.socioFundador);
    addIn('ciudad', query.ciudad);

    return and.length ? { [Op.and]: and } : {};
}

// GET /clients/list - Lista de socios para tabla (ordenada por PK ASC).
// Compatibilidad: sin params de paginación devuelve TODOS los socios como antes
// (misma forma { ok, data, total }); con ?page/?limit pagina y añade page/limit.
router.get('/clients/list', async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const paginate = req.query.page !== undefined || req.query.limit !== undefined;
        const sinTasa = String(req.query.sinTasa) === 'true' || String(req.query.sinTasa) === '1';
        const whereClause = buildClientWhere(req.query);

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

        // Calcular % Préstamos efectivo: préstamo activo del año actual tiene prioridad
        // sobre el valor manual almacenado en el socio. Se acota la consulta a los
        // socios devueltos (evita traer préstamos de socios que no están en la lista).
        const DisbursedLoan = require('../models/DisbursedLoan');
        const anioActual = new Date().getFullYear();
        const clientIds = clients.map(c => c.id);
        const prestamosActivos = clientIds.length ? await DisbursedLoan.findAll({
            where: {
                anioDesembolso: anioActual,
                estado: { [Op.in]: ['Activo', 'Vigente', 'Pendiente'] },
                clientId: { [Op.in]: clientIds }
            },
            attributes: ['clientId', 'interesMensual']
        }) : [];
        // Mapa clientId → interesMensual del préstamo más reciente del año
        const loanRateMap = {};
        prestamosActivos.forEach(l => {
            if (l.clientId && !loanRateMap[l.clientId]) {
                loanRateMap[l.clientId] = parseFloat(l.interesMensual || 0);
            }
        });

        normalizedData.forEach(client => {
            const loanRate = loanRateMap[client.id];
            if (loanRate !== undefined && loanRate > 0) {
                // Convertir decimal a porcentaje (0.015 → 1.5)
                client.porcentajeEfectivo = parseFloat((loanRate * 100).toFixed(4));
                client.porcentajeFuente = 'loan';
            } else if (client.porcentajePrestamo !== null && client.porcentajePrestamo !== undefined) {
                client.porcentajeEfectivo = parseFloat((client.porcentajePrestamo * 100).toFixed(4));
                client.porcentajeFuente = 'manual';
            } else {
                client.porcentajeEfectivo = null;
                client.porcentajeFuente = null;
            }
        });

        // Filtro "sin tasa asignada": se aplica sobre la tasa EFECTIVA ya calculada
        // (ni manual ni por préstamo activo), por eso va aquí y no en el where SQL.
        let result = sinTasa
            ? normalizedData.filter(c => c.porcentajeEfectivo === null)
            : normalizedData;

        const total = result.length;
        let page = 1;
        let limit = total;
        if (paginate) {
            page = Math.max(1, parseInt(req.query.page, 10) || 1);
            limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 500));
            const start = (page - 1) * limit;
            result = result.slice(start, start + limit);
        }

        res.json({
            ok: true,
            data: result,
            total,
            page,
            limit
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
            referido, cargo, fechaIngreso, fechaBaja, estatus, customerId,
            porcentajePrestamo
        } = req.body;

        if (estatus !== undefined && estatus !== null && estatus !== '' && !VALID_ESTATUS.includes(estatus)) {
            return res.status(400).json({ error: `Estatus inválido. Valores permitidos: ${VALID_ESTATUS.join(', ')}.` });
        }

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
            estatus: estatus || 'Activo',
            // La tasa de perfil del socio (la que usa el Simulador) faltaba en
            // esta lista: el formulario de alta la enviaba y Client.create la
            // descartaba en silencio, así que el socio quedaba creado siempre
            // sin tasa y sin ningún aviso de que se había perdido. En el UPDATE
            // sí estaba contemplada (ALLOWED_CLIENT_FIELDS), de ahí que editar
            // funcionara y crear no.
            //
            // Se normaliza igual que en el update: número finito y no negativo,
            // o null. Un texto vacío o basura no debe guardarse como 0, que
            // significaría "0% de interés" en vez de "sin tasa asignada".
            porcentajePrestamo: (() => {
                if (porcentajePrestamo === undefined || porcentajePrestamo === null || porcentajePrestamo === '') return null;
                const n = Number(porcentajePrestamo);
                return Number.isFinite(n) && n >= 0 ? n : null;
            })(),
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
// editables. Bloquea mass-assignment de role, customerId, password,
// mustChangePassword, externalId, idVm, etc.
//
// pickFields(body, allowed) → solo conserva las llaves de la whitelist.
// Aplicar antes de cualquier .update(body) o .create({ ...body }) directo.
function pickFields(body, allowed) {
    if (!body || typeof body !== 'object') return {};
    const out = {};
    for (const k of allowed) {
        if (body[k] !== undefined) out[k] = body[k];
    }
    return out;
}

// Ahorros que NO son aporte inicial — a prueba de nulos.
//
// El filtro natural, `type: { [Op.ne]: 'Aporte Inicial' }`, tiene una trampa:
// en SQL `NULL != 'Aporte Inicial'` no se evalúa como verdadero sino como NULL,
// así que TODA fila con `type` nulo queda fuera sin que nadie lo note. Y esas
// filas existen: las devoluciones anuales de intereses se guardaron sin `type`.
//
// El efecto era que un socio no veía sus propias devoluciones en el extracto
// (el admin sí, porque su pantalla pide `type=Todos`, que quita el filtro
// entero), su saldo no cuadraba con la suma de sus movimientos —el saldo se
// calcula sin filtrar por tipo— y un ahorro con tipo nulo no contaba como
// cubierto al evaluar la mora.
const NO_ES_APORTE_INICIAL = () => {
    const { Op } = require('sequelize');
    return { [Op.or]: [{ [Op.ne]: 'Aporte Inicial' }, { [Op.is]: null }] };
};

// ── Movimientos de concepto vs. abonos del socio ──────────────────────
//
// En la tabla de ahorros conviven dos cosas distintas. Un ABONO es plata que
// el socio consigna, y solo sobre él tiene sentido la penalización por pagar
// tarde. Un MOVIMIENTO DE CONCEPTO —devolución de ahorros, descuento anual por
// mora, distribución de intereses— lo mueve el fondo, no el socio: no se
// "paga tarde" una devolución.
//
// El estado se normaliza (minúsculas, sin tildes) porque viene del histórico en
// Excel y no tiene una redacción única; es el mismo criterio con el que la
// pantalla del socio clasifica sus movimientos, para que las dos no discrepen.
const normalizarEstado = (s) => String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const esMovimientoDeConcepto = (status, monto) => {
    const t = normalizarEstado(status);
    if (t.includes('devolucion') || t.includes('distribucion')
        || t.includes('descuento') || t.includes('penaliz')) return true;
    // Un importe negativo nunca es un abono, aunque su estado no lo diga.
    return Number(monto) < 0;
};

// Importe de dinero recibido por API. Descarta NaN e Infinity, que `parseFloat`
// sí acepta ("Infinity" es una cadena válida para él) y que en una columna
// DECIMAL quedarían guardados como un valor sin sentido.
const importeValido = (valor, porDefecto) => {
    const n = parseFloat(valor);
    return Number.isFinite(n) ? n : porDefecto;
};

// La versión SQL de lo anterior: "esta fila es un abono del socio".
//
// Hace falta para detectar si el socio YA pagó un mes —lo que exime de mora al
// siguiente pago de ese mes—. Sin esta condición, una devolución o un descuento
// registrados en el mismo mes contarían como si el socio hubiera abonado, y le
// perdonarían la mora a un pago que sí llegó tarde.
//
// Se comparan fragmentos sin la primera letra ('evoluc' en vez de 'devoluc')
// para que un estado con tilde —"Devolución"— también coincida.
const ES_ABONO_DEL_SOCIO = () => {
    const { Op } = require('sequelize');
    return {
        amount: { [Op.gt]: 0 },
        status: {
            [Op.or]: [
                { [Op.is]: null },
                {
                    [Op.and]: [
                        { [Op.notLike]: '%evoluc%' },
                        { [Op.notLike]: '%istribuc%' },
                        { [Op.notLike]: '%escuent%' },
                        { [Op.notLike]: '%enaliz%' },
                    ],
                },
            ],
        },
    };
};

const ALLOWED_CLIENT_FIELDS = [
    'cedula', 'name', 'surname1', 'surname2', 'email',
    'genero', 'pais', 'ciudad', 'tipoCliente', 'socioFundador',
    'referido', 'cargo', 'fechaIngreso', 'fechaBaja', 'estatus',
    'porcentajePrestamo'
];

// Vocabulario controlado de `estatus`. SQLite no fuerza el ENUM del modelo, así
// que se valida a mano en create/update para evitar valores libres ("Inactivo").
const VALID_ESTATUS = ['Activo', 'Desactivado'];

const ALLOWED_DISBURSED_LOAN_FIELDS = [
    'clientId', 'estado', 'fechaPrestamo', 'mesDesembolso', 'anioDesembolso',
    'valorPrestado', 'cuotas', 'interesMensual', 'diasPagoMax', 'itemQuantity',
    'banco', 'numeroTransaccion', 'cuentaAhorros', 'observaciones',
    // legacy
    'socio', 'fechaDesembolso', 'monto', 'cuenta'
    // NOTA: 'idVm' y 'orderId' deliberadamente excluidos — no cambian por API.
];

const ALLOWED_LOAN_PAYMENT_FIELDS = [
    'clientId', 'mesDesembolso', 'saldoInicial', 'cuotasPrestamo',
    'interesMensual', 'valorInteresesAmortizados', 'fechaPagoMax', 'mesPago',
    'valorCuotaVariable', 'estado', 'valorCuotaPago', 'saldoFinal',
    'itemQuantity', 'banco', 'numeroTransaccion', 'cuentaAhorros',
    'observaciones', 'idVm', 'estadoPrestamo', 'esPrepago'
    // NOTA: 'externalId' deliberadamente excluido — se autogenera en POST.
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

        const tasaAnterior = client.porcentajePrestamo;
        const updates = pickFields(req.body, ALLOWED_CLIENT_FIELDS);
        if (updates.fechaBaja === '' || updates.fechaBaja === 'Invalid date') updates.fechaBaja = null;
        if (updates.email === '' || updates.email === 'null') updates.email = null;
        if (updates.estatus !== undefined && !VALID_ESTATUS.includes(updates.estatus)) {
            return res.status(400).json({ error: `Estatus inválido. Valores permitidos: ${VALID_ESTATUS.join(', ')}.` });
        }

        // Snapshot previo (solo campos editables) para la traza de auditoría
        const beforeSnapshot = pickFields(client.toJSON(), ALLOWED_CLIENT_FIELDS);
        await client.update(updates);

        // Auditoría: registra qué campos cambiaron (antes → después), sin secretos
        const changed = {};
        for (const k of Object.keys(updates)) {
            if (String(beforeSnapshot[k] ?? '') !== String(updates[k] ?? '')) {
                changed[k] = { from: beforeSnapshot[k] ?? null, to: updates[k] ?? null };
            }
        }
        if (Object.keys(changed).length) {
            logSecurityEvent('CLIENT_UPDATED', { actorId: req.user?.id, clientId: client.id, cedula: client.cedula, changed, ip: getClientIp(req) });
        }

        // Notifica al socio solo si su tasa asignada realmente cambió a un valor
        // nuevo (no cuando se limpia/deja en null, ni en ediciones de otros campos).
        if ('porcentajePrestamo' in updates && client.porcentajePrestamo != null
            && Number(tasaAnterior) !== Number(client.porcentajePrestamo)) {
            const { createNotification } = require('../services/NotificationService');
            await createNotification({
                clientId: client.id,
                type: 'tasa_actualizada',
                title: 'Tu tasa de interés fue actualizada',
                message: `El comité definió tu nueva tasa mensual: ${(Number(client.porcentajePrestamo) * 100).toFixed(2)}%.`,
                link: '/dashboard/mis-creditos'
            });
        }

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

// DELETE /clients/:id — por defecto DESACTIVA (soft-delete reversible vía
// estatus/fechaBaja), preservando el historial financiero del socio. El borrado
// físico (?hard=true) solo se permite si el socio no tiene NINGÚN registro
// financiero. Ambas ramas dejan traza de auditoría.
router.delete('/clients/:id', async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id);
        if (!client) return res.status(404).json({ error: 'Socio no encontrado' });

        const hard = String(req.query.hard) === 'true';

        if (hard) {
            const LoanRequest = require('../models/LoanRequest');
            const [savingsCount, loansCount, disbCount, payCount, reqCount] = await Promise.all([
                Saving.count({ where: { clientId: req.params.id } }),
                Loan.count({ where: { clientId: req.params.id } }),
                DisbursedLoan.count({ where: { clientId: req.params.id } }),
                LoanPayment.count({ where: { clientId: req.params.id } }),
                LoanRequest.count({ where: { clientId: req.params.id } })
            ]);
            if (savingsCount || loansCount || disbCount || payCount || reqCount) {
                return res.status(400).json({
                    error: 'No se puede eliminar definitivamente un socio con registros financieros (ahorros, préstamos, cuotas o solicitudes). Use la desactivación.'
                });
            }
            await client.destroy();
            logSecurityEvent('CLIENT_HARD_DELETED', { actorId: req.user?.id, clientId: client.id, cedula: client.cedula, ip: getClientIp(req) });
            return res.json({ message: 'Socio eliminado definitivamente', mode: 'hard' });
        }

        // Soft-delete: desactivar (reversible)
        if (client.estatus === 'Desactivado') {
            return res.status(400).json({ error: 'El socio ya está desactivado.' });
        }
        const before = { estatus: client.estatus, fechaBaja: client.fechaBaja };
        // Fecha de NEGOCIO: en Colombia, no en el UTC del contenedor. Con
        // toISOString() una baja registrada de noche quedaba fechada mañana.
        await client.update({ estatus: 'Desactivado', fechaBaja: hoyISOFondo() });
        logSecurityEvent('CLIENT_DEACTIVATED', {
            actorId: req.user?.id, clientId: client.id, cedula: client.cedula,
            before, after: { estatus: 'Desactivado', fechaBaja: client.fechaBaja }, ip: getClientIp(req)
        });
        res.json({ message: 'Socio desactivado con éxito', mode: 'soft', estatus: 'Desactivado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
            },
            attributes: { exclude: ['password'] } // A02: no exponer hashes bcrypt
        });
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// GET /clients/:id — un socio por PK (sin hash). Registrado DESPUÉS de las rutas
// literales (/clients/list, /search, /cedula/:cedula) para no ensombrecerlas.
router.get('/clients/:id', async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id, {
            attributes: { exclude: ['password'] } // A02: no exponer hashes bcrypt
        });
        if (!client) return res.status(404).json({ error: 'Socio no encontrado' });
        res.json(client);
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

// Reconstruye una fecha cuando día y mes vienen invertidos (bug de importación ya
// documentado en CLAUDE.md: afecta fechaPagoMax en ~72 de 183 cuotas del fondo) usando
// mesPago como referencia confiable (se genera correctamente al crear la cuota y el bug
// nunca lo toca). Misma lógica que las copias ya usadas en getLoanCapacityAnalysis y
// dashboard-stats para mora EP — aquí se reutiliza para no volver a calcular "días
// transcurridos" contra una fecha corrida un mes.
function safeParseDateAdmin(dateVal, mesRef) {
    if (!dateVal) return null;
    let dateStr = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal);
    if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date(dateStr + 'T00:00:00');
    const [y, m, d] = parts.map(Number);
    if (mesRef) {
        const monthsLower = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const targetIdx = monthsLower.indexOf(mesRef.toLowerCase().trim()) + 1;
        if (targetIdx > 0) {
            if (m === targetIdx) return new Date(y, m - 1, d);
            if (d === targetIdx) return new Date(y, d - 1, m);
        }
    }
    return new Date(dateStr + 'T00:00:00');
}

// Interés proporcional en retanqueos — cálculo compartido entre la previsualización
// (GET /clients/:id/active-loan, lo que el admin ve ANTES de confirmar) y la operación
// real (POST /disbursed-loans, sección REFINANCIACIÓN). Antes vivía duplicado en un solo
// lugar (solo en POST /disbursed-loans) — la advertencia que veía el admin seguía
// mostrando "interés condonado" por el 100%, sin reflejar lo que en realidad se iba a
// cobrar. Extraído a una sola función para que ambos lados nunca puedan volver a
// desincronizarse.
function calcularInteresRetanqueo({ prestamoAnterior, cuotasPendientesAnteriores, fechaNuevoDesembolso }) {
    let interesCondonado = cuotasPendientesAnteriores.reduce(
        (s, c) => s + parseFloat(c.valorInteresesAmortizados || 0), 0
    );
    let interesCausado = 0;
    let diasTranscurridos = 0;

    if (cuotasPendientesAnteriores.length > 0) {
        const ordenadas = [...cuotasPendientesAnteriores].sort((a, b) => a.itemQuantity - b.itemQuantity);
        const primeraCuota = ordenadas[0];

        let fechaInicio;
        if (primeraCuota.itemQuantity === 1 && prestamoAnterior.fechaPrestamo) {
            fechaInicio = new Date(prestamoAnterior.fechaPrestamo);
        } else if (primeraCuota.fechaPagoMax) {
            const fechaMax = safeParseDateAdmin(primeraCuota.fechaPagoMax, primeraCuota.mesPago) || new Date(primeraCuota.fechaPagoMax);
            fechaInicio = new Date(fechaMax);
            fechaInicio.setMonth(fechaInicio.getMonth() - 1);
        } else {
            fechaInicio = new Date();
        }

        const fechaActual = new Date(fechaNuevoDesembolso);
        const diffTime = fechaActual.getTime() - fechaInicio.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        diasTranscurridos = Math.max(0, Math.min(30, diffDays));

        const saldoPendiente = parseFloat(primeraCuota.saldoInicial || 0);
        const tasaAnterior = parseFloat(prestamoAnterior.interesMensual || 0);
        interesCausado = saldoPendiente * tasaAnterior * (diasTranscurridos / 30);

        interesCondonado = interesCondonado - interesCausado;
        if (interesCondonado < 0) interesCondonado = 0;
    }

    return { interesCausado, interesCondonado, diasTranscurridos };
}

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

        // Misma fórmula que se aplica de verdad al guardar (POST /disbursed-loans). Como
        // todavía no se conoce la fecha exacta del nuevo desembolso en este punto del
        // formulario (recién se seleccionó el socio), se usa hoy — es lo que el admin va a
        // dejar en el 99% de los casos, y si la cambia, el cálculo real al guardar manda.
        const { interesCausado, interesCondonado } = calcularInteresRetanqueo({
            prestamoAnterior: prestamoVigente,
            cuotasPendientesAnteriores: cuotasPendientes,
            fechaNuevoDesembolso: new Date()
        });

        res.json({
            tienePrestamoActivo: true,
            prestamo: {
                id: prestamoVigente.id,
                idVm: prestamoVigente.idVm,
                valorPrestado: parseFloat(prestamoVigente.valorPrestado || prestamoVigente.monto || 0),
                cuotas: prestamoVigente.cuotas,
                cuotasPendientes: cuotasPendientes.length,
                saldoPendiente: Math.round(saldoPendiente),
                interesCausado: Math.round(interesCausado),
                interesCondonable: Math.round(interesCondonado)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /clients/:id/loan-capacity — Análisis de capacidad de segundo préstamo
async function getLoanCapacityAnalysis(clientId) {
    const { Op } = require('sequelize');
    const client = await Client.findByPk(clientId, { attributes: { exclude: ['password'] } });
    if (!client) throw new Error('Socio no encontrado');

    // ── Ahorros ────────────────────────────────────────────────────────────
    // Decisión del comité (plan Detalle de Cuenta + Capacidad, 7-jul-2026): el cupo 3×
    // se calcula sobre el ahorro NETO acreditado (valorAhorrado), no sobre el bruto —
    // el recargo por mora es una sanción, no capital del socio. Las devoluciones de
    // intereses (amount negativo, sin valorAhorrado) restan del acumulado.
    const savingRows = await Saving.findAll({
        where: { clientId },
        attributes: ['type', 'amount', 'valorAhorrado']
    });
    const netoDe = (s) => {
        const v = parseFloat(s.valorAhorrado);
        return v > 0 ? v : (parseFloat(s.amount) || 0);
    };
    const ahorroTotal = savingRows.reduce((t, s) => t + netoDe(s), 0);
    const aporteInicial = savingRows.filter(s => s.type === 'Aporte Inicial').reduce((t, s) => t + netoDe(s), 0);
    const ahorroMensual = savingRows.filter(s => s.type === 'Mensual').reduce((t, s) => t + netoDe(s), 0);

    // ── Parámetros del comité (AppSettings, editables vía PUT /admin/settings/:key) ──
    // referenteConstanciaAhorro: techo del promedio mensual para el componente Constancia
    // tasasInteresVigentes: tasas mensuales ofrecidas en el simulador (ej. "1.4,1.6")
    const AppSetting = require('../models/AppSetting');
    const [referenteSetting, tasasSetting] = await Promise.all([
        AppSetting.findOne({ where: { key: 'referenteConstanciaAhorro' } }),
        AppSetting.findOne({ where: { key: 'tasasInteresVigentes' } }),
    ]);
    const referenteConstancia = referenteSetting && Number(referenteSetting.value) > 0
        ? Number(referenteSetting.value)
        : 200000;
    const tasasVigentes = String(tasasSetting?.value || '1.4,1.6')
        .split(',').map(Number).filter(n => n > 0);

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
    // Mora histórica directa (legacy: cuotas con estado='Mora'; en la BD actual nadie usa ese estado)
    const historialMoraDirecta = await LoanPayment.count({ where: { clientId, estado: 'Mora' } });
    const historialPendTotal = cuotasPendientes.length; // total pendientes del socio

    // ── Mora histórica real (P1.1): pagos tardíos ─────────────────────────
    // Una cuota se pagó tarde si updatedAt > fecha_pago_max. Excluimos cuotas
    // cargadas en la migración masiva del 12-mar-2026 (createdAt ≤ ese día) porque
    // no tenemos fecha real de pago — solo la fecha en que se cargó el dato heredado.
    // Solo cuentan cuotas creadas nativamente en el sistema (post-migración).
    const MIGRATION_CUTOFF = new Date('2026-03-13T00:00:00');
    const pagosCompletados = await LoanPayment.findAll({
        where: { clientId, estado: { [Op.in]: ['Pago', 'Abono'] } },
        attributes: ['fechaPagoMax', 'mesPago', 'createdAt', 'updatedAt']
    });
    let pagosTardios = 0;
    let pagosEvaluables = 0;
    for (const p of pagosCompletados) {
        const limite = safeParseDate(p.fechaPagoMax, p.mesPago);
        const real = p.updatedAt ? new Date(p.updatedAt) : null;
        const creado = p.createdAt ? new Date(p.createdAt) : null;
        if (!limite || !real || !creado) continue;
        if (creado < MIGRATION_CUTOFF) continue; // saltar migrados
        pagosEvaluables++;
        // Comparar SOLO la parte de fecha (truncar hora) para evitar falso positivo:
        // pagar a las 17:00 del mismo día del vencimiento NO es tardío.
        // updatedAt almacena datetime con hora; safeParseDate devuelve medianoche,
        // así que sin truncar cualquier pago en el día de vencimiento aparece tardío.
        const limiteDay = new Date(limite.getFullYear(), limite.getMonth(), limite.getDate());
        const realDay   = new Date(real.getFullYear(),   real.getMonth(),   real.getDate());
        if (realDay > limiteDay) pagosTardios++;
    }

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

    // ── Última cuota por préstamo (para regla "cruza fin de año" del Primer Informe 2026) ──
    // La fecha más tardía de fechaPagoMax entre TODAS las cuotas (pagadas+pendientes+mora) representa el fin del préstamo.
    const finPorIdVm = {};
    if (idVmsList.length > 0) {
        const todasCuotas = await LoanPayment.findAll({
            where: { clientId, idVm: { [Op.in]: idVmsList } },
            attributes: ['idVm', 'fechaPagoMax', 'mesPago']
        });
        for (const q of todasCuotas) {
            const vm = (q.idVm || '').trim();
            const f = safeParseDate(q.fechaPagoMax, q.mesPago);
            if (!f) continue;
            if (!finPorIdVm[vm] || f > finPorIdVm[vm]) finPorIdVm[vm] = f;
        }
    }

    // Regla Primer Informe 2026: préstamos cuya última cuota supera el 31-dic del año en curso
    // requieren compromiso de no retirar ahorros mientras esté vigente.
    const yearActual = nowLocal.getFullYear();
    const finDeAnio = new Date(yearActual, 11, 31, 23, 59, 59);

    const detallesPrestamos = idVmsList.map(vm => {
        const d = disbursedMap[vm];
        const info = porIdVm[vm];
        const fechaUltimaCuota = finPorIdVm[vm] || null;
        const cuotasTotales = d ? d.cuotas : null;
        const cruzaFinDeAnio = !!(fechaUltimaCuota && fechaUltimaCuota > finDeAnio);
        // El compromiso aplica a préstamos largos (>12 cuotas) que además crucen el 31-dic.
        // El paréntesis del informe aclara qué se entiende por "mayores a 12 cuotas".
        const aplicaCompromisoNoRetiro = cruzaFinDeAnio && (cuotasTotales == null || cuotasTotales > 12);
        return {
            idVm: vm,
            valorPrestado: d ? parseFloat(d.valorPrestado || 0) : 0,
            cuotas: cuotasTotales,
            interesMensual: info.interesMensual,
            saldoPendiente: info.saldoPendiente,
            valorCuotasPendientes: Math.round(info.valorCuotasPendientes),
            cuotasPendientesCount: info.cuotasPendientesCount,
            cuotasMoraEPCount: info.cuotasMoraEPCount,
            enMoraEP: info.enMoraEP,
            fechaPrestamo: d ? d.fechaPrestamo : null,
            fechaUltimaCuota: fechaUltimaCuota ? fechaUltimaCuota.toISOString().split('T')[0] : null,
            cruzaFinDeAnio,
            aplicaCompromisoNoRetiro,
            estado: d ? d.estado : 'Vigente',
            cuotasDetalle: info.cuotasDetalle
        };
    });

    const totalDeudaPendiente = detallesPrestamos.reduce((s, l) => s + l.saldoPendiente, 0);
    const enMoraActual = detallesPrestamos.some(l => l.enMoraEP);
    const totalCuotasMoraEP = cuotasMoraEP.length;
    const totalMoraEPValor = cuotasMoraEP.reduce((s, q) => s + parseFloat(q.valorCuotaVariable || 0), 0);
    const tieneCompromisoNoRetiroAhorros = detallesPrestamos.some(l => l.aplicaCompromisoNoRetiro);

    // ── P1.3: préstamos liquidados (estado='Cancelado' en la convención del fondo) ─
    const prestamosLiquidados = await DisbursedLoan.count({ where: { clientId, estado: 'Cancelado' } });

    // ── P1.4: antigüedad como socio ──────────────────────────────────────────
    let mesesComoSocio = null;
    if (client.fechaIngreso) {
        const ing = new Date(client.fechaIngreso);
        if (!isNaN(ing)) {
            const diff = nowLocal - ing;
            mesesComoSocio = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24 * 30.44)));
        }
    }

    // ── Penalizaciones por Ahorro: historial completo (todos los años) ───────
    // Se usa el ratio penalizaciones/meses para que sea justo entre socios
    // con distinta antigüedad — un socio de 5 años no es penalizado por tener
    // más datos que uno de 1 año.
    const totalAhorrosConPenalizacion = await Saving.count({
        where: { clientId, penalizacion: 'SI' }
    });
    const totalDiasPenalizacionAhorro = parseInt(await Saving.sum('diasPenalizacion', {
        where: { clientId }
    }) || 0);

    // ── Constancia de ahorro: meses con aporte mensual + valor promedio ─────
    // Reconoce al socio que ahorra con regularidad y con monto significativo.
    const ahorrosMensuales = await Saving.findAll({
        where: { clientId, type: 'Mensual' },
        attributes: ['anioAbonado', 'mesAbonado', 'valorAhorrado', 'amount']
    });
    const periodosUnicos = new Set();
    let sumaValorAhorradoMensual = 0;
    for (const a of ahorrosMensuales) {
        if (a.anioAbonado && a.mesAbonado) {
            periodosUnicos.add(`${a.anioAbonado}-${String(a.mesAbonado).trim().toLowerCase()}`);
        }
        sumaValorAhorradoMensual += parseFloat(a.valorAhorrado || a.amount || 0);
    }
    const mesesConAhorroMensual = periodosUnicos.size;
    const promedioAhorroMensual = mesesConAhorroMensual > 0
        ? sumaValorAhorradoMensual / mesesConAhorroMensual
        : 0;

    return {
        clientId,
        nombre: `${client.name} ${client.surname1 || ''} ${client.surname2 || ''}`.trim(),
        cedula: client.cedula,
        estatus: client.estatus,
        fechaIngreso: client.fechaIngreso || null,
        mesesComoSocio,
        ahorroTotal,
        aporteInicial,
        ahorroMensual,
        prestamosVigentes: detallesPrestamos,
        totalPrestamosVigentes: detallesPrestamos.length,
        prestamosLiquidados,
        totalDeudaPendiente,
        enMoraActual,
        totalCuotasMoraEP,
        totalMoraEPValor: Math.round(totalMoraEPValor),
        historialMoraTotal: historialMoraDirecta + totalCuotasMoraEP,
        // P1.1: nuevo campo - cuotas pagadas después de la fecha límite (excluyendo datos heredados)
        pagosTardios,
        pagosEvaluables,
        historialPagoTotal,
        historialPendTotal,
        tieneCompromisoNoRetiroAhorros,
        totalAhorrosConPenalizacion,
        totalDiasPenalizacionAhorro,
        mesesConAhorroMensual,
        promedioAhorroMensual,
        yearActual,
        // Parámetros del comité: el cliente (calcScore/simulador) los usa en lugar de constantes
        referenteConstancia,
        tasasVigentes,
        // Tasa mensual asignada al socio (regla de devoluciones: 1,6% si retiró
        // ahorros el año anterior, 1,4% si no). En %, ej. 1.6; null si no está fijada.
        tasaAsignada: client.porcentajePrestamo
            ? Number((Number(client.porcentajePrestamo) * 100).toFixed(2))
            : null,
        definicionAhorro: 'neto', // el cupo 3× se calcula sobre ahorro neto de recargos
        // Resolución vigente del fondo (mostrada al socio y al admin)
        resolucionVigente: {
            titulo: 'Primer Informe 2026',
            regla: 'Se aprueban los préstamos mayores a 12 cuotas (que superen el 31 de diciembre), con el requisito de no retirar los ahorros mientras el préstamo esté vigente.',
            anioReferencia: yearActual
        }
    };
}

router.get('/clients/:id/loan-capacity', async (req, res) => {
    try {
        const analysis = await getLoanCapacityAnalysis(req.params.id);
        res.json(analysis);
    } catch (err) {
        console.error('loan-capacity error:', err);
        if (err.message === 'Socio no encontrado') {
            res.status(404).json({ error: err.message });
        } else {
            res.status(500).json({ error: err.message });
        }
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
            order: [['date', 'DESC']] // Parte D: ordenar por fecha más reciente
        });
        res.json(savings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /savings/list - Lista completa de ahorros para tabla
router.get('/savings/list', async (req, res) => {
    try {
        const { q, year, status, type, clientId } = req.query;
        const { Op } = require('sequelize');
        let whereClause = {};

        // Filtro opcional por socio (usado por la ficha 360° del admin)
        if (clientId) whereClause.clientId = clientId;

        // Filtro tipo (Mensual o Aporte Inicial)
        if (type && type.trim() && type.trim() !== 'Todos') {
            whereClause.type = type.trim();
        } else {
            // Default filter for "Lista de Ahorro": EXCLUDE "Aporte Inicial"
            whereClause.type = NO_ES_APORTE_INICIAL();
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

        // Filtro estado: usa LIKE para tolerar espacios sobrantes en los datos heredados
        if (status && status.trim()) {
            whereClause.status = { [Op.like]: `%${status.trim()}%` };
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
// ─────────────────────────────────────────────
// MATRIZ DE CONTROL DE AHORROS — socio × mes
// ─────────────────────────────────────────────
//
// Una rejilla de socios por meses para ver de un vistazo quién aportó y quién
// no. Devuelve DOS cifras por celda porque responden a preguntas distintas:
//
//   · abonos   — solo lo que el socio consignó. Es la cifra de control: si en
//                marzo no hay abono, en marzo no ahorró, y da igual que ese mes
//                le hayan devuelto intereses.
//   · neto     — todo el movimiento del mes, devoluciones y descuentos
//                incluidos. Es la cifra que cuadra con su ahorro acumulado.
//
// Mezclarlas sería el error clásico: una devolución en un mes taparía la falta
// de aporte de ese mes, o al revés, un socio al día aparecería en rojo.
router.get('/savings/matriz', async (req, res) => {
    try {
        const { Sequelize, Op } = require('sequelize');

        // El período que se acredita, no la fecha en que se hizo la transacción:
        // quien paga el año entero en enero tiene doce meses acreditados, no uno.
        const periodo = (s) => ({
            anio: Number(s.anioAbonado || s.year || 0),
            mes: Number(s.mesAbonado || s.monthInt || 0),
        });

        const clientes = await Client.findAll({
            attributes: ['id', 'customerId', 'name', 'surname1', 'surname2', 'cedula', 'estatus', 'fechaIngreso'],
            order: [[Sequelize.literal('CAST(customerId AS INTEGER)'), 'ASC']],
        });

        // Los aportes iniciales viven en su propio menú y no son ahorro mensual.
        const movimientos = await Saving.findAll({
            where: { type: NO_ES_APORTE_INICIAL() },
            attributes: ['id', 'clientId', 'year', 'monthInt', 'mesAbonado', 'anioAbonado',
                'valorAhorrado', 'amount', 'status', 'diasPenalizacion'],
        });

        const aniosDisponibles = new Set();
        for (const m of movimientos) {
            const { anio } = periodo(m);
            if (anio > 0) aniosDisponibles.add(anio);
        }
        const anios = [...aniosDisponibles].sort((a, b) => b - a);
        const anioPedido = req.query.anio === 'todos' ? null : (parseInt(req.query.anio, 10) || anios[0] || new Date().getFullYear());

        // Un movimiento es "de concepto" cuando lo mueve el fondo —devolución,
        // descuento, distribución— y no el socio. El mismo criterio que usa la
        // pantalla del socio, para que las dos no discrepen.
        const esConcepto = (m) => {
            const e = normalizarEstado(m.status);
            return parseFloat(m.amount) < 0
                || e.includes('evoluc') || e.includes('istribuc') || e.includes('escuent') || e.includes('enaliz');
        };

        const vacio = () => Array.from({ length: 12 }, () => ({ abonos: 0, neto: 0, conceptos: 0, n: 0 }));
        const porSocio = new Map();
        for (const c of clientes) {
            porSocio.set(c.id, {
                clientId: c.id,
                customerId: c.customerId,
                nombre: [c.name, c.surname1, c.surname2].filter(Boolean).join(' ').trim(),
                cedula: c.cedula,
                estatus: c.estatus,
                fechaIngreso: c.fechaIngreso,
                meses: vacio(),
                totalAnio: 0,
                abonosAnio: 0,
                // El acumulado de toda la vida del socio, para cuadrar la fila
                // contra lo que lleva ahorrado desde que entró al fondo.
                historico: 0,
                mesesConAbono: 0,
            });
        }

        for (const m of movimientos) {
            const fila = porSocio.get(m.clientId);
            if (!fila) continue;
            const { anio, mes } = periodo(m);
            // valorAhorrado es el neto acreditado; amount, el bruto recibido. Se
            // prefiere el neto y se cae al bruto cuando no está, que es el mismo
            // criterio del Ranking de Ahorro: las dos pantallas deben cuadrar.
            const valor = parseFloat(m.valorAhorrado > 0 ? m.valorAhorrado : m.amount) || 0;
            fila.historico += valor;
            if (anioPedido !== null && anio !== anioPedido) continue;
            if (!(mes >= 1 && mes <= 12)) continue;
            const celda = fila.meses[mes - 1];
            celda.neto += valor;
            celda.n += 1;
            if (esConcepto(m)) celda.conceptos += valor;
            else celda.abonos += valor;
        }

        const filas = [...porSocio.values()];
        for (const f of filas) {
            f.totalAnio = f.meses.reduce((s, c) => s + c.neto, 0);
            f.abonosAnio = f.meses.reduce((s, c) => s + c.abonos, 0);
            f.mesesConAbono = f.meses.filter((c) => c.abonos > 0).length;
            f.meses = f.meses.map((c) => ({
                abonos: parseFloat(c.abonos.toFixed(2)),
                neto: parseFloat(c.neto.toFixed(2)),
                conceptos: parseFloat(c.conceptos.toFixed(2)),
                n: c.n,
            }));
            f.totalAnio = parseFloat(f.totalAnio.toFixed(2));
            f.abonosAnio = parseFloat(f.abonosAnio.toFixed(2));
            f.historico = parseFloat(f.historico.toFixed(2));
        }

        // Totales de cada columna, que es la otra mitad del control: cuánto
        // entró al fondo cada mes, y en cuántos socios.
        const totalesMes = Array.from({ length: 12 }, (_, i) => {
            const abonos = filas.reduce((s, f) => s + f.meses[i].abonos, 0);
            const neto = filas.reduce((s, f) => s + f.meses[i].neto, 0);
            return {
                mes: i + 1,
                abonos: parseFloat(abonos.toFixed(2)),
                neto: parseFloat(neto.toFixed(2)),
                socios: filas.filter((f) => f.meses[i].abonos > 0).length,
            };
        });

        res.json({
            ok: true,
            anio: anioPedido,
            anios,
            // El mes hasta el que tiene sentido exigir aporte: en el año en curso
            // no se puede marcar en rojo un mes que todavía no ha llegado.
            mesLimite: anioPedido === new Date().getFullYear() ? new Date().getMonth() + 1
                : (anioPedido === null || anioPedido < new Date().getFullYear() ? 12 : 0),
            data: filas,
            totalesMes,
            totales: {
                abonos: parseFloat(filas.reduce((s, f) => s + f.abonosAnio, 0).toFixed(2)),
                neto: parseFloat(filas.reduce((s, f) => s + f.totalAnio, 0).toFixed(2)),
                historico: parseFloat(filas.reduce((s, f) => s + f.historico, 0).toFixed(2)),
                socios: filas.length,
                sociosActivos: filas.filter((f) => f.estatus === 'Activo').length,
            },
        });
    } catch (err) {
        console.error('Error al construir la matriz de ahorros:', err);
        res.status(500).json({ error: 'No se pudo construir la matriz de ahorros.' });
    }
});

router.get('/savings/ranking', async (req, res) => {
    try {
        const { Sequelize } = require('sequelize');
        const CURRENT_YEAR = new Date().getFullYear();

        const clients = await Client.findAll({
            where: { estatus: 'Activo' },
            attributes: ['id', 'customerId', 'name', 'surname1', 'surname2'],
        });

        const allSavings = await Saving.findAll({
            where: {
                type: NO_ES_APORTE_INICIAL(),
                clientId: { [Sequelize.Op.in]: clients.map(c => c.id) }
            },
            attributes: ['clientId', 'year', 'monthInt', 'mesAbonado', 'anioAbonado', 'valorAhorrado', 'amount', 'status'],
            order: [['anioAbonado', 'ASC'], ['mesAbonado', 'ASC']]
        });

        // El comité ya repartió utilidades a TODOS los socios sobre lo ahorrado en años
        // anteriores (contarlo de nuevo aquí sería pagarlo dos veces). Lo que sí sigue
        // pesando para el fondo es el CAPITAL que cada socio conservó: quien no pidió
        // devolución empezó este año con un saldo de apertura mayor que quien sí la pidió
        // (total o parcial) — ese saldo de apertura cuenta a peso completo (estuvo los
        // 12 meses trabajando para el fondo), y se calcula neto de cualquier devolución,
        // así que también funciona correctamente para devoluciones parciales.
        const priorNetByClient = {};    // clientId -> neto de todos los años anteriores al actual
        const thisYearByClient = {};    // clientId -> [{year, monthInt, amount}] del año en curso
        const devolucionByClient = {};  // clientId -> {mes, anio} de su última "Devolución Total Intereses" (solo informativo)
        for (const s of allSavings) {
            const val = parseFloat(s.valorAhorrado > 0 ? s.valorAhorrado : s.amount) || 0;
            // Number(...) es obligatorio: mesAbonado llega como string de la BD, y sumarlo
            // directo con un número (año*12) haría concatenación de texto en vez de suma.
            const effectiveYear = Number(s.anioAbonado || s.year || 0);
            const effectiveMonth = Number(s.mesAbonado || s.monthInt || 0);

            if (effectiveYear < CURRENT_YEAR) {
                priorNetByClient[s.clientId] = (priorNetByClient[s.clientId] || 0) + val;
            } else if (effectiveYear === CURRENT_YEAR) {
                if (!thisYearByClient[s.clientId]) thisYearByClient[s.clientId] = [];
                thisYearByClient[s.clientId].push({ year: effectiveYear, monthInt: effectiveMonth, amount: val });
            }

            if ((s.status || '').includes('Devolucion Total Intereses')) {
                const prev = devolucionByClient[s.clientId];
                if (!prev || (effectiveYear * 12 + effectiveMonth) > (prev.anio * 12 + prev.mes)) {
                    devolucionByClient[s.clientId] = { mes: effectiveMonth, anio: effectiveYear };
                }
            }
        }
        for (const id of Object.keys(thisYearByClient)) {
            thisYearByClient[id].sort((a, b) => a.monthInt - b.monthInt);
        }

        // Calcular métricas de comportamiento por socio
        const mesActual = new Date().getMonth() + 1;
        // Casos que ameritan revisión del comité antes de confiar en el reparto —
        // no bloquean el cálculo (se sigue mostrando el ranking), solo se marcan.
        const anomalias = [];
        let excluidosSinAhorro = 0;
        const data = clients.map(c => {
            const priorNetRaw = priorNetByClient[c.id] || 0;
            const saldoApertura = Math.max(priorNetRaw, 0);
            if (priorNetRaw < 0) {
                // Más devuelto que lo ahorrado en años anteriores: el saldo de apertura
                // se protege en 0 para no calcular con un número negativo, pero esto casi
                // siempre indica un dato mal registrado (devolución duplicada, o aplicada
                // al socio equivocado) y merece revisión antes de repartir utilidades.
                anomalias.push({
                    clientId: c.id,
                    fullName: `${c.name} ${c.surname1} ${c.surname2 || ''}`.trim(),
                    tipo: 'saldo_apertura_negativo',
                    detalle: `Las devoluciones registradas superan lo ahorrado en años anteriores por $${Math.round(Math.abs(priorNetRaw)).toLocaleString('es-CO')}. Revisar los registros de "Devolución Total" de este socio.`
                });
            }
            const thisYear = thisYearByClient[c.id] || [];
            const totalEsteAnio = thisYear.reduce((sum, m) => sum + m.amount, 0);
            const total = saldoApertura + totalEsteAnio;
            if (total === 0) { excluidosSinAhorro++; return null; }

            // El saldo de apertura se modela como un aporte de enero del año en curso
            // (peso completo, 12/12): representa capital que ya estaba en el fondo desde
            // el primer día del año, disponible para prestar/generar rendimiento todo el año.
            const months = saldoApertura > 0
                ? [{ year: CURRENT_YEAR, monthInt: 1, amount: saldoApertura, esAperturaAnual: true }, ...thisYear]
                : thisYear;

            // Últimos 3 meses vs. 3 anteriores para tendencia (solo actividad del año en curso)
            const recent = thisYear.slice(-3).reduce((s, m) => s + m.amount, 0);
            const prev = thisYear.slice(-6, -3).reduce((s, m) => s + m.amount, 0);
            const trendPct = prev > 0 ? Math.round(((recent - prev) / prev) * 100) : 0;

            // Consistencia: meses con ahorro este año / meses transcurridos del año
            const consistencyPct = thisYear.length > 0 ? Math.round((thisYear.length / mesActual) * 100) : 100;

            const devolucion = devolucionByClient[c.id];
            return {
                id: c.id,
                customerId: c.customerId,
                fullName: `${c.name} ${c.surname1} ${c.surname2 || ''}`.trim(),
                totalNetSavings: total,
                monthsActive: thisYear.length,
                avgMonthly: thisYear.length > 0 ? Math.round(totalEsteAnio / thisYear.length) : 0,
                trendPct,
                consistencyPct,
                monthlyData: months,
                saldoAperturaAnio: saldoApertura,
                liquidadoPreviamente: !!devolucion,
                liquidacionMesAnio: devolucion || null
            };
        }).filter(Boolean).sort((a, b) => b.totalNetSavings - a.totalNetSavings);

        const devolucionSum = await Saving.sum('amount', {
            where: {
                clientId: { [Sequelize.Op.in]: clients.map(c => c.id) },
                status: { [Sequelize.Op.like]: '%Devolucion Total Intereses%' }
            }
        }) || 0;
        // Los registros de devolución se guardan en negativo: se reporta el valor absoluto.
        const totalDevolucionIntereses = Math.abs(Math.round(parseFloat(devolucionSum)));

        // Valor de utilidades a distribuir: decisión del comité en AppSettings
        // (editable desde el modal de Ranking). Sin valor fijo en código.
        const AppSetting = require('../models/AppSetting');
        const utilidadesSetting = await AppSetting.findOne({ where: { key: 'utilidadesADistribuir' } });
        const utilidadesADistribuir = utilidadesSetting && Number(utilidadesSetting.value) > 0
            ? Number(utilidadesSetting.value)
            : null;

        res.json({
            ok: true,
            data,
            totalDevolucionIntereses,
            utilidadesADistribuir,
            calculatedAt: new Date().toISOString(),
            anomalias,
            excluidosSinAhorro,
        });
    } catch (err) {
        console.error('Error en /savings/ranking:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Exención de penalización para socios nuevos: el mes de ingreso (Aporte Inicial)
// y el mes inmediatamente siguiente (primer Mensual) nunca generan penalización,
// sin importar el día en que se registre el pago. A partir del segundo mes
// posterior al ingreso aplican las reglas normales de penalización (día > 10 / pago atrasado).
function isExentoPenalizacionNuevoSocio(fechaIngreso, mesAbonado, anioAbonado) {
    if (!fechaIngreso) return false;
    const [entryYearStr, entryMonthStr] = String(fechaIngreso).split('-');
    const entryYear = parseInt(entryYearStr);
    const entryMonth = parseInt(entryMonthStr);
    if (isNaN(entryYear) || isNaN(entryMonth)) return false;

    const entryIndex = entryYear * 12 + (entryMonth - 1);
    const abonadoIndex = anioAbonado * 12 + (mesAbonado - 1);
    const diff = abonadoIndex - entryIndex;
    return diff >= 0 && diff <= 1;
}

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

        // Una devolución, un descuento o una distribución no se "pagan tarde":
        // los mueve el fondo. Sin esta salida temprana se les calculaba una mora
        // inventada (a una devolución del día 13 se le estampaban 3 días y
        // $3.000 de recargo) y después el guardián de más abajo rechazaba la
        // operación, porque un importe negativo nunca supera su penalización.
        const esConcepto = esMovimientoDeConcepto(req.body.status, monto);

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
                    type: NO_ES_APORTE_INICIAL(),
                    // Solo un abono cuenta como "ya pagó este mes".
                    ...ES_ABONO_DEL_SOCIO()
                }
            });
            isPagoAdicionalMesActual = !!existePagoMesActual;
            if (isPagoAdicionalMesActual) {
                console.log(`✅ Pago adicional detectado: socio ${clientIdForCheck} ya pagó ${mesTextoBody} ${anio} (ID: ${existePagoMesActual.externalId}). Sin penalización.`);
            }
        }

        // ── VALIDACIÓN: Exención por socio nuevo (mes de ingreso y mes siguiente) ──
        let isNuevoSocioExento = false;
        if (clientIdForCheck) {
            const clienteSocio = await Client.findByPk(clientIdForCheck, { attributes: ['fechaIngreso'] });
            if (clienteSocio) {
                isNuevoSocioExento = isExentoPenalizacionNuevoSocio(clienteSocio.fechaIngreso, mesAbonadoNum, anioAbonadoReq);
                if (isNuevoSocioExento) {
                    console.log(`✅ Exención nuevo socio: cliente ${clientIdForCheck} (ingreso ${clienteSocio.fechaIngreso}) - mes abonado ${mesAbonadoNum}/${anioAbonadoReq}. Sin penalización.`);
                }
            }
        }

        if (esConcepto) {
            // Movimiento del fondo, no un abono del socio: sin penalización.
            penalizacion = "NO";
            diasPenalizacion = 0;
            valorAPenalizar = 0;
        } else if (isPagoAdicionalMesActual) {
            // Pago adicional: el socio ya pagó este mes, NO genera penalización
            penalizacion = "NO";
            diasPenalizacion = 0;
            valorAPenalizar = 0;
        } else if (isNuevoSocioExento) {
            // Socio nuevo: el mes de ingreso (Aporte Inicial) y el mes siguiente (primer Mensual)
            // no generan penalización, sin importar el día de pago.
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

        // En un movimiento de concepto el valor acreditado es el propio importe:
        // no hay recargo que restarle. Se permite enviarlo explícito porque el
        // histórico no es uniforme — los descuentos anuales se guardaron con
        // valorAhorrado en cero y las devoluciones con el importe completo.
        const valorAhorrado = esConcepto
            ? (req.body.valorAhorrado !== undefined ? importeValido(req.body.valorAhorrado, monto) : monto)
            : monto - valorAPenalizar;

        // Validar monto suficiente. Solo aplica a un abono del socio: un
        // movimiento negativo nunca "cubre" su penalización, y exigírselo
        // bloqueaba por completo registrarlo o editarlo.
        if (!esConcepto && valorAhorrado < 0) {
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

        const { createNotification } = require('../services/NotificationService');
        await createNotification({
            clientId: saving.clientId,
            type: 'saving_registered',
            title: 'Se registró un nuevo ahorro',
            message: `Se registró un ahorro de $${Math.round(Number(saving.amount || 0)).toLocaleString('es-CO')} a tu cuenta.`,
            link: '/dashboard/cuenta'
        });

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

        // Igual que en POST: una devolución, un descuento o una distribución no
        // llevan mora. Se mira el estado que quedará tras la edición, no solo el
        // enviado, para que cambiar un campo suelto no reclasifique la fila.
        const esConcepto = esMovimientoDeConcepto(
            req.body.status !== undefined ? req.body.status : saving.status,
            monto
        );

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
                    type: NO_ES_APORTE_INICIAL(),
                    // Solo un abono cuenta como "ya pagó este mes".
                    ...ES_ABONO_DEL_SOCIO(),
                    id: { [Op.ne]: saving.id } // Excluir el registro que se está editando
                }
            });
            isPagoAdicionalMesActual = !!existePagoMesActual;
            if (isPagoAdicionalMesActual) {
                console.log(`✅ [PUT] Pago adicional detectado: socio ${clientIdForCheck} ya pagó ${mesTextoForCheck} ${anio}. Sin penalización.`);
            }
        }

        // ── VALIDACIÓN: Exención por socio nuevo (mes de ingreso y mes siguiente) ──
        let isNuevoSocioExento = false;
        if (clientIdForCheck) {
            const clienteSocio = await Client.findByPk(clientIdForCheck, { attributes: ['fechaIngreso'] });
            if (clienteSocio) {
                isNuevoSocioExento = isExentoPenalizacionNuevoSocio(clienteSocio.fechaIngreso, mesAbonadoNum, anioAbonadoReq);
                if (isNuevoSocioExento) {
                    console.log(`✅ [PUT] Exención nuevo socio: cliente ${clientIdForCheck} (ingreso ${clienteSocio.fechaIngreso}) - mes abonado ${mesAbonadoNum}/${anioAbonadoReq}. Sin penalización.`);
                }
            }
        }

        if (esConcepto) {
            penalizacion = "NO";
            diasPenalizacion = 0;
            valorAPenalizar = 0;
        } else if (isPagoAdicionalMesActual) {
            penalizacion = "NO";
            diasPenalizacion = 0;
            valorAPenalizar = 0;
        } else if (isNuevoSocioExento) {
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

        // En un movimiento de concepto se CONSERVA el valor acreditado que ya
        // tenía, salvo que la edición lo cambie explícitamente. Recalcularlo
        // reescribiría una cifra que el administrador no tocó: los descuentos
        // anuales están guardados con valorAhorrado en cero, y volverlos a
        // calcular como `monto` los pondría en negativo, alterando el ranking
        // de ahorro por editar, por ejemplo, una observación.
        const valorAhorrado = esConcepto
            ? (req.body.valorAhorrado !== undefined
                ? importeValido(req.body.valorAhorrado, parseFloat(saving.valorAhorrado) || 0)
                : parseFloat(saving.valorAhorrado) || 0)
            : monto - valorAPenalizar;

        // Solo un abono del socio tiene que cubrir su penalización.
        if (!esConcepto && valorAhorrado < 0) {
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
        // calcular los días basado en el monto (1000 por día).
        //
        // Solo cuando la edición cambia el importe. Antes esta línea era
        // inalcanzable —el guardián de más arriba rechazaba toda edición de un
        // movimiento negativo—, y al volverse alcanzable recalculaba los días en
        // CUALQUIER edición: corregir una observación le ponía 42 días a un
        // descuento que estaba guardado con cero. Esos días se suman en el KPI
        // "Días en retraso", y como cada abono tardío ya aporta los suyos, el
        // descuento anual —que es su resumen— los contaría dos veces.
        if (updateData.status === 'Descuento Total Anual Penalizacion' && req.body.amount !== undefined) {
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
router.post('/savings/:id/soporte', upload.single('soporte'), verifyFileMagicBytes, async (req, res) => {
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
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(soporte.originalName)}"`);
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
        // A02: excluir password del Client embebido para no filtrar hashes bcrypt.
        const loans = await Loan.findAll({
            include: [{ model: Client, attributes: { exclude: ['password'] } }],
            limit: 500
        });
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
        // A02: excluir password del Client embebido para no filtrar hashes bcrypt.
        const disbursedLoans = await DisbursedLoan.findAll({
            include: [{ model: Client, attributes: { exclude: ['password'] } }],
            order: [['fechaPrestamo', 'DESC']]
        });
        res.json(disbursedLoans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /disbursed-loans/orphans - Préstamos sin clientId asignado (datos huérfanos)
router.get('/disbursed-loans/orphans', verifyToken, requireRole('admin'), async (_req, res) => {
    try {
        const orphans = await DisbursedLoan.findAll({
            where: { clientId: null },
            order: [['id', 'ASC']]
        });
        res.json({ ok: true, total: orphans.length, data: orphans });
    } catch (err) {
        console.error('orphans error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /disbursed-loans/:id/assign - Asignar un préstamo huérfano a un socio
router.put('/disbursed-loans/:id/assign', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const { clientId } = req.body;
        if (!clientId) return res.status(400).json({ ok: false, error: 'clientId requerido' });
        const loan = await DisbursedLoan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ ok: false, error: 'Préstamo no encontrado' });
        const client = await Client.findByPk(clientId);
        if (!client) return res.status(404).json({ ok: false, error: 'Socio no encontrado' });
        await loan.update({ clientId });
        // También actualizar las cuotas asociadas (si el préstamo tiene idVm conocido)
        if (loan.idVm) {
            await LoanPayment.update(
                { clientId },
                { where: { idVm: loan.idVm, clientId: null } }
            );
        }
        res.json({ ok: true, message: `Préstamo asignado a ${client.name} ${client.surname1 || ''}.` });
    } catch (err) {
        console.error('assign orphan error:', err);
        res.status(500).json({ ok: false, error: err.message });
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
            order: [['fechaPrestamo', 'DESC']],
            limit: 3000 // tope de seguridad — ver nota en /payments/list
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

        let cuotasPendientesAnteriores = [];
        if (prestamoAnterior) {
            cuotasPendientesAnteriores = await LoanPayment.findAll({
                where: { idVm: prestamoAnterior.idVm, estado: 'Pendiente' },
                transaction: t
            });
            // Orden ascendente por itemQuantity: calcularInteresRetanqueo() ordena su propia
            // copia internamente, pero el loop de abajo (i === 0 → cobra interesCausado)
            // necesita que ESTE array también quede ordenado — si no, se le podría cobrar
            // el interés a una cuota que no es la más antigua.
            cuotasPendientesAnteriores.sort((a, b) => a.itemQuantity - b.itemQuantity);
        }

        // ==== 9.1 VALIDAR CAPACIDAD DE CRÉDITO Y MORA (política del fondo) ====
        // Antes, "Registrar Nuevo Desembolso" no aplicaba NINGUNA de las reglas que el
        // propio Analizador de Capacidad le muestra al admin como asesoría (regla 3× y
        // bloqueo por mora EP) — eran solo texto informativo en otra pantalla, nunca se
        // exigían al mover el dinero de verdad. Se reutiliza getLoanCapacityAnalysis
        // (misma fuente que el Analizador) para que la regla se aplique en el único
        // punto donde de verdad importa.
        const capacidad = await getLoanCapacityAnalysis(clientId);

        if (capacidad.enMoraActual) {
            return res.status(400).json({
                error: `No se puede desembolsar: ${capacidad.nombre} tiene ${capacidad.totalCuotasMoraEP} cuota(s) en mora EP vigente por $${Math.round(capacidad.totalMoraEPValor).toLocaleString('es-CO')}. El reglamento del fondo no autoriza nuevos desembolsos con mora vigente — regularice los pagos primero.`
            });
        }

        // Si es un retanqueo, el saldo del préstamo que se está cancelando en esta misma
        // operación ya no debe contar contra el cupo — se está extinguiendo ahora mismo.
        const saldoPrestamoQueSeCancela = cuotasPendientesAnteriores[0]
            ? parseFloat(cuotasPendientesAnteriores[0].saldoInicial || 0) : 0;
        const deudaEfectiva = Math.max(0, capacidad.totalDeudaPendiente - saldoPrestamoQueSeCancela);
        const cupoMaximo = capacidad.ahorroTotal * 3; // misma regla 3× del Analizador (utils/loanCapacity.js)
        const capacidadDisponible = cupoMaximo - deudaEfectiva;

        // Un préstamo ya aprobado por la Junta (solicitud + votación unánime, módulo
        // Aprobación de Préstamos) queda exento del tope 3× sin votación — ya pasó por
        // el canal de gobierno correcto antes de llegar aquí.
        const loanRequestId = req.body.loanRequestId ? parseInt(req.body.loanRequestId) : null;
        let vieneDeSolicitudAprobada = false;
        if (loanRequestId) {
            const LoanRequest = require('../models/LoanRequest');
            const solicitud = await LoanRequest.findByPk(loanRequestId, { transaction: t });
            vieneDeSolicitudAprobada = !!(solicitud && solicitud.clientId === clientId && solicitud.status === 'approved');
        }

        // El gerente (único rol que llega a este endpoint — la ruta ya exige
        // requireRole('admin')) puede aprobar directamente un monto sobre cupo sin
        // esperar la votación completa de la Junta. No aplica al bloqueo por mora EP
        // (ese es absoluto, sin excepción, por reglamento del fondo). Queda auditado:
        // log de seguridad + nota permanente en observaciones del préstamo.
        const gerenteAprueba = req.body.gerenteAprueba === true;

        if (!vieneDeSolicitudAprobada && !gerenteAprueba && valorPrestado > capacidadDisponible) {
            return res.status(400).json({
                error: `El monto solicitado ($${valorPrestado.toLocaleString('es-CO')}) supera el cupo máximo sin votación de ${capacidad.nombre} (3× ahorro: $${Math.round(cupoMaximo).toLocaleString('es-CO')}, disponible: $${Math.round(Math.max(0, capacidadDisponible)).toLocaleString('es-CO')}). Este monto requiere aprobación de la Junta Administrativa — regístralo primero como solicitud en Aprobación de Préstamos, o usa "Aprobar como Gerente" si decides autorizarlo directamente.`
            });
        }

        const aprobadoDirectoPorGerente = gerenteAprueba && !vieneDeSolicitudAprobada && valorPrestado > capacidadDisponible;
        if (aprobadoDirectoPorGerente) {
            logSecurityEvent('GERENTE_APRUEBA_SOBRE_CUPO', {
                actorId: req.user?.id,
                clientId,
                valorPrestado,
                cupoMaximo: Math.round(cupoMaximo),
                capacidadDisponible: Math.round(Math.max(0, capacidadDisponible)),
                ip: getClientIp(req)
            });
            const notaGerente = `[Aprobado directamente por el gerente el ${new Date().toISOString().split('T')[0]}, sin votación completa de la Junta — monto ($${valorPrestado.toLocaleString('es-CO')}) supera el cupo 3× disponible ($${Math.round(Math.max(0, capacidadDisponible)).toLocaleString('es-CO')})]`;
            loanData.observaciones = loanData.observaciones ? `${notaGerente} ${loanData.observaciones}` : notaGerente;
        }

        let refinanciacion = null;

        if (prestamoAnterior) {
            // NOTA: si hay más de una cuota pendiente (el socio ya lleva 2+ meses sin pagar
            // antes de retanquear), solo la primera recibe el cargo proporcional (topado a
            // 30 días); el resto se sigue condonando al 100% aunque hayan pasado más de un
            // mes real desde su vencimiento. Es una limitación conocida — evaluar si vale la
            // pena calcular el interés causado cuota por cuota si en la práctica llegan a
            // darse retanqueos con mora de varios meses.
            const { interesCausado, interesCondonado, diasTranscurridos } = calcularInteresRetanqueo({
                prestamoAnterior,
                cuotasPendientesAnteriores,
                fechaNuevoDesembolso: fechaPrestamo // fecha del nuevo desembolso elegida en el formulario
            });

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

            // Marcar cada cuota pendiente como Pago (prepago).
            // A la primera cuota pendiente se le cobra el interés causado proporcional. A las demás 0.
            for (let i = 0; i < cuotasPendientesAnteriores.length; i++) {
                const cuota = cuotasPendientesAnteriores[i];
                let interesCobradoCuota = 0;
                
                if (i === 0) {
                    interesCobradoCuota = interesCausado;
                }

                const capitalCuota = parseFloat(cuota.valorCuotaVariable || 0) - parseFloat(cuota.valorInteresesAmortizados || 0);
                const saldoInicial = parseFloat(cuota.saldoInicial || 0);
                const saldoFinalCal = Math.max(0, parseFloat((saldoInicial - capitalCuota).toFixed(2)));
                
                const valorCuotaAjustado = capitalCuota + interesCobradoCuota;

                await cuota.update({
                    estado: 'Pago',
                    estadoPrestamo: 'Cancelado',
                    valorInteresesAmortizados: interesCobradoCuota, // interés realmente cobrado por días
                    valorCuotaVariable: Math.max(0, valorCuotaAjustado),
                    valorCuotaPago: Math.max(0, valorCuotaAjustado),
                    saldoFinal: saldoFinalCal,
                    esPrepago: true,
                    observaciones: `Cancelado por refinanciación ${nextIdVm} — interés causado por ${diasTranscurridos} días.`
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
                interesCausado: Math.round(interesCausado),
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

        const { createNotification } = require('../services/NotificationService');
        await createNotification({
            clientId: loan.clientId,
            type: 'loan_disbursed',
            title: 'Se registró tu préstamo',
            message: `Tu préstamo de $${Math.round(Number(loan.valorPrestado)).toLocaleString('es-CO')} (${loan.idVm}) fue registrado.`,
            link: '/dashboard/loans'
        });

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

        // A08: whitelist explícita. Bloquea mass-assignment de idVm, orderId, etc.
        const updateData = {
            ...pickFields(req.body, ALLOWED_DISBURSED_LOAN_FIELDS),
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
    const sequelize = require('../config/database');
    const { Op } = require('sequelize');
    const t = await sequelize.transaction();
    try {
        const loan = await DisbursedLoan.findByPk(req.params.id, { transaction: t });
        if (!loan) {
            await t.rollback();
            return res.status(404).json({ error: 'Préstamo no encontrado' });
        }

        // ==== Si este préstamo fue creado como retanqueo, restaurar el préstamo anterior ====
        // POST /disbursed-loans, al refinanciar, cancela el préstamo vigente anterior y marca
        // sus cuotas pendientes como Pago (esPrepago=true, ver calcularInteresRetanqueo arriba).
        // Si el admin se equivocó al registrar el retanqueo y borra este préstamo nuevo, sin
        // esto el préstamo anterior queda "Cancelado" para siempre y sin el desembolso que lo
        // reemplazaba — el socio pierde su préstamo. Se detecta el vínculo por el marcador que
        // la refinanciación deja en observaciones ("...refinanciación <idVm> — ...") y se
        // revierte: préstamo anterior → Vigente, sus cuotas prepagadas → Pendiente (recalculadas
        // con la misma fórmula de capital fijo/interés decreciente usada al crearlas).
        let restauracion = null;
        if (loan.idVm) {
            const marcador = `refinanciación ${loan.idVm} —`;
            const cuotasPrepagadas = await LoanPayment.findAll({
                where: { esPrepago: true, observaciones: { [Op.like]: `%${marcador}%` } },
                transaction: t
            });

            if (cuotasPrepagadas.length > 0) {
                const idVmAnterior = cuotasPrepagadas[0].idVm;
                const prestamoAnterior = await DisbursedLoan.findOne({ where: { idVm: idVmAnterior }, transaction: t });

                if (prestamoAnterior) {
                    const capitalPorCuota = parseFloat(prestamoAnterior.valorPrestado) / prestamoAnterior.cuotas;

                    for (const cuota of cuotasPrepagadas) {
                        const saldoInicial = parseFloat(cuota.saldoInicial || 0);
                        const interesMensualCuota = parseFloat(cuota.interesMensual || 0);
                        const interesesCuota = parseFloat((saldoInicial * interesMensualCuota).toFixed(2));
                        const valorCuotaOriginal = parseFloat((capitalPorCuota + interesesCuota).toFixed(2));
                        const saldoFinalOriginal = Math.max(0, parseFloat((saldoInicial - capitalPorCuota).toFixed(2)));

                        await cuota.update({
                            estado: 'Pendiente',
                            estadoPrestamo: 'Vigente',
                            valorInteresesAmortizados: interesesCuota,
                            valorCuotaVariable: valorCuotaOriginal,
                            valorCuotaPago: 0,
                            saldoFinal: saldoFinalOriginal,
                            esPrepago: false,
                            observaciones: null
                        }, { transaction: t });
                    }

                    // Las cuotas que ya estaban Pago/Mora antes de la refinanciación solo
                    // recibieron estadoPrestamo=Cancelado (su estado real no se tocó) — revertir.
                    await LoanPayment.update(
                        { estadoPrestamo: 'Vigente' },
                        { where: { idVm: idVmAnterior, esPrepago: false }, transaction: t }
                    );

                    await prestamoAnterior.update({ estado: 'Vigente' }, { transaction: t });

                    restauracion = { idVmAnterior, cuotasRestauradas: cuotasPrepagadas.length };

                    logSecurityEvent('RETANQUEO_REVERTIDO', {
                        actorId: req.user?.id,
                        idVmEliminado: loan.idVm,
                        idVmRestaurado: idVmAnterior,
                        cuotasRestauradas: cuotasPrepagadas.length,
                        ip: getClientIp(req)
                    });
                    console.log(`↩️  Retanqueo revertido: ${loan.idVm} eliminado, ${idVmAnterior} vuelve a Vigente (${cuotasPrepagadas.length} cuota(s) a Pendiente).`);
                }
            }
        }

        // Eliminar cuotas asociadas en Estado de Préstamos antes de borrar el préstamo
        if (loan.idVm) {
            const deletedCount = await LoanPayment.destroy({ where: { idVm: loan.idVm }, transaction: t });
            console.log('🗑️  Eliminadas ' + deletedCount + ' cuotas de Estado de Préstamos para ' + loan.idVm);
        }

        await loan.destroy({ transaction: t });
        await t.commit();

        res.json({
            message: restauracion
                ? `Préstamo eliminado. Se restauró el préstamo anterior ${restauracion.idVmAnterior} a Vigente (${restauracion.cuotasRestauradas} cuota(s) revertida(s) a Pendiente).`
                : 'Préstamo y sus cuotas eliminados con éxito',
            restauracion
        });
    } catch (err) {
        await t.rollback();
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
                    attributes: ['fechaPrestamo', 'valorPrestado', 'estado']
                }
            ],
            order: [['id', 'ASC']],
            // Tope de seguridad: sin filtro (clientId/año/estado/etc.), esta consulta
            // no tenía límite y crecía sin techo con cada cuota nueva. Un límite
            // generoso evita un full scan ilimitado sin cambiar el comportamiento
            // actual para el volumen de datos de hoy; paginación real en SQL queda
            // como trabajo aparte (requiere mover los StatCards/filtros al backend).
            limit: 3000
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
                    // estadoPrestamoVivo guarda el estado REAL y actual del préstamo padre —
                    // se aplica después del loop (ver abajo) para pisar la copia por-cuota,
                    // que puede quedar desincronizada (edición manual, datos legacy, etc.)
                    normalized.estadoPrestamoVivo = value ? value.estado : null;
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

            // Estado Préstamo mostrado = el estado ACTUAL del DisbursedLoan, no la copia
            // guardada en la cuota (esa copia se desincroniza: ediciones manuales del
            // formulario "Registrar Pago", datos legacy de antes de que existiera esta
            // lógica, etc. — ver validación 2026-07-29: 41 cuotas de 5 préstamos Vigentes
            // mostraban "Pendiente"). Si la cuota no tiene préstamo padre (huérfana), se
            // deja el valor guardado tal cual.
            if (normalized.estadoPrestamoVivo) {
                normalized.estadoPrestamo = normalized.estadoPrestamoVivo.trim();
            }
            delete normalized.estadoPrestamoVivo;

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
        // Soporte incluido aquí (excluyendo el BLOB 'data') para que el frontend
        // sepa qué cuotas tienen comprobante adjunto en esta misma respuesta, sin
        // tener que preguntarle a /payments/:id/soporte/info una vez por cada fila.
        const payments = await LoanPayment.findAll({
            include: [
                { model: Client, attributes: { exclude: ['password'] } }, // A02: no exponer hashes bcrypt
                { model: Soporte, attributes: ['id', 'originalName', 'mimeType', 'uploadedAt'] },
                { model: DisbursedLoan, as: 'disbursedLoan', attributes: ['estado'] }
            ],
            order: [['fechaPagoMax', 'DESC']]
        });

        // Estado Préstamo mostrado = el estado ACTUAL del DisbursedLoan, no la copia
        // guardada en la cuota (misma corrección que /payments/list — ver el comentario
        // ahí sobre cuotas que quedaban desincronizadas del estado real del préstamo).
        const normalized = payments.map(p => {
            const raw = p.toJSON();
            if (raw.disbursedLoan?.estado) {
                raw.estadoPrestamo = raw.disbursedLoan.estado.trim();
            }
            delete raw.disbursedLoan;
            return raw;
        });
        res.json(normalized);
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

        // A08: whitelist; externalId solo lo asigna el backend.
        const data = {
            ...pickFields(req.body, ALLOWED_LOAN_PAYMENT_FIELDS),
            externalId: nextExternalId,
            valorInteresesAmortizados: valorInteresesAmortizados,
            itemQuantity: req.body.itemQuantity || 0
        };

        // estadoPrestamo no lo decide el formulario "Registrar Pago" — se deriva del
        // estado real del préstamo (idVm). Antes era un <select> editable a mano y
        // podía quedar desincronizado del estado real (ver GET /payments/list).
        if (data.idVm) {
            const prestamoRef = await DisbursedLoan.findOne({ where: { idVm: data.idVm }, attributes: ['estado'] });
            if (prestamoRef) data.estadoPrestamo = (prestamoRef.estado || '').trim();
        }

        const newPayment = await LoanPayment.create(data);
        validateAndFixLoanStatuses().catch(() => { });

        // Un pago registrado directamente como 'Pago' y por encima de su cuota
        // lleva un abono a capital igual que si se hubiera editado después. Sin
        // esto, el excedente solo se aplicaba entrando por PUT.
        let abonoNuevo = null;
        if (newPayment.estado === 'Pago' && newPayment.idVm) {
            abonoNuevo = await aplicarAbonoExtraordinario(newPayment, req.body.politicaAbono, {
                origen: 'edicion', aplicadoPor: req.user && req.user.cedula,
            });
        }
        res.status(201).json(abonoNuevo ? { ...newPayment.toJSON(), abonoExtraordinario: abonoNuevo } : newPayment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * Aplica a capital lo que el socio pagó por encima de su cuota y rehace el
 * cronograma.
 *
 * El cálculo vive en `services/abonoCapital.js`, que es el mismo motor que usa
 * el barrido automático: así una cuota da el mismo resultado se guarde desde la
 * pantalla o la encuentre el barrido, y hay un solo sitio donde arreglar la
 * aritmética.
 *
 * Devuelve siempre un resumen de lo ocurrido —incluso cuando decide no tocar
 * nada— para que la pantalla pueda explicárselo al administrador.
 */
async function aplicarAbonoExtraordinario(payment, politicaPedida, contexto = {}) {
    if (!payment || !payment.idVm) return null;
    const abonoCapital = require('../services/abonoCapital');

    const plan = await abonoCapital.planificarPrestamo({
        idVm: payment.idVm,
        politica: politicaPedida,
    });

    if (!plan.aplicable) {
        // Sin abono pendiente no hay nada que contar: la pantalla no debe
        // mostrar un aviso cuando el socio pagó justo.
        if (plan.yaAlDia && !plan.excedente) return null;
        return {
            aplicado: false,
            excedente: plan.excedente || 0,
            fueraDePeriodo: Boolean(plan.fueraDePeriodo),
            motivo: plan.motivo,
            diagnostico: plan.diagnostico,
        };
    }

    const aplicado = await abonoCapital.aplicarPlan(plan, {
        origen: contexto.origen || 'edicion',
        aplicadoPor: contexto.aplicadoPor || 'sistema',
    });

    return {
        aplicado: true,
        excedente: plan.resumen.excedente,
        politica: plan.politica,
        cuotasAntes: plan.resumen.cuotasAntes,
        cuotasDespues: plan.resumen.cuotasDespues,
        interesAntes: plan.resumen.interesAntes,
        interesDespues: plan.resumen.interesDespues,
        ahorroInteres: plan.resumen.ahorroInteres,
        interesReintegrado: plan.resumen.interesReintegrado,
        cancelaElCredito: plan.cancelaElCredito,
        registroId: aplicado.registroId,
    };
}

// ─────────────────────────────────────────────
// ABONOS EXTRAORDINARIOS A CAPITAL — revisión, aplicación y reversión
// ─────────────────────────────────────────────
//
// Que un socio pague por encima de su cuota queda registrado el día del pago,
// pero durante un tiempo el recálculo solo se disparaba si alguien volvía a
// guardar esa cuota desde la pantalla. Los pagos anteriores quedaron con su
// excedente sin aplicar: el socio había entregado capital y seguía pagando
// intereses sobre él. Estas rutas cierran ese hueco sobre la cartera existente.

/** Qué abonos siguen sin aplicar. No escribe nada: es el previo de la aplicación. */
router.get('/payments/abonos', async (req, res) => {
    try {
        const abonoCapital = require('../services/abonoCapital');
        const anio = parseInt(req.query.anio, 10) || abonoCapital.anioBogota();
        const informe = await abonoCapital.barrer({ anio, aplicar: false });
        res.json({
            ok: true,
            anio,
            resumen: {
                prestamosConAbono: informe.pendientes.length,
                capitalPorAplicar: informe.pendientes.reduce((s, p) => s + (p.resumen.excedente || 0), 0),
                ahorroEnIntereses: informe.pendientes.reduce((s, p) => s + (p.resumen.ahorroInteres || 0), 0),
                interesPorReintegrar: informe.pendientes.reduce((s, p) => s + (p.resumen.interesReintegrado || 0), 0),
                alDia: informe.alDia,
                bloqueados: informe.bloqueados.length,
            },
            pendientes: informe.pendientes,
            bloqueados: informe.bloqueados,
            errores: informe.errores,
        });
    } catch (err) {
        console.error('Error al revisar abonos:', err);
        res.status(500).json({ error: 'No se pudo revisar los abonos pendientes.' });
    }
});

/** Aplica los abonos: todos los pendientes, o los de un préstamo concreto. */
router.post('/payments/abonos/aplicar', async (req, res) => {
    try {
        const abonoCapital = require('../services/abonoCapital');
        const { notifyAdmins, createNotification } = require('../services/NotificationService');
        const anio = parseInt(req.body.anio, 10) || abonoCapital.anioBogota();
        const quien = (req.user && req.user.cedula) || 'admin';

        if (req.body.idVm) {
            // Pedirlo para un préstamo concreto es una decisión explícita: puede
            // volver a aplicar un reajuste que antes se revirtió.
            const plan = await abonoCapital.planificarPrestamo({
                idVm: req.body.idVm, politica: req.body.politica, anio, respetarReversion: false,
            });
            if (!plan.aplicable) return res.status(400).json({ error: plan.motivo });
            const hecho = await abonoCapital.aplicarPlan(plan, { origen: 'manual', aplicadoPor: quien });
            await avisarAlSocio(createNotification, plan);
            return res.json({ ok: true, aplicados: [hecho] });
        }

        const informe = await abonoCapital.barrer({ anio, aplicar: true, origen: 'manual', aplicadoPor: quien });
        for (const plan of informe.aplicados) await avisarAlSocio(createNotification, plan);
        if (informe.aplicados.length > 0) {
            await notifyAdmins({
                type: 'abono_capital',
                title: 'Se aplicaron abonos a capital',
                message: `Se recalcularon ${informe.aplicados.length} préstamo(s) con pagos por encima de la cuota.`,
                link: '/admin/payments',
            });
        }
        res.json({ ok: true, ...informe });
    } catch (err) {
        console.error('Error al aplicar abonos:', err);
        res.status(500).json({ error: 'No se pudo aplicar los abonos.' });
    }
});

/**
 * Fija qué se hace con el excedente de un préstamo: bajar la cuota o acortar el
 * plazo. Queda guardado, así que el barrido automático lo respeta en los abonos
 * que vengan después en vez de volver al defecto del fondo.
 */
router.put('/payments/abonos/politica', async (req, res) => {
    try {
        const { idVm, politica } = req.body || {};
        if (!idVm) return res.status(400).json({ error: 'Falta el préstamo (idVm).' });
        const abonoCapital = require('../services/abonoCapital');
        const guardada = await abonoCapital.guardarPolitica(idVm, politica);
        if (!guardada) return res.status(400).json({ error: 'La política debe ser "reducir-cuota" o "reducir-plazo".' });
        // Se devuelve el plan recalculado para que la pantalla muestre en el acto
        // qué cambiaría con la política nueva, antes de confirmar nada.
        const plan = await abonoCapital.planificarPrestamo({ idVm, respetarReversion: false });
        res.json({ ok: true, idVm, politica: guardada, plan });
    } catch (err) {
        console.error('Error al fijar la política de abono:', err);
        res.status(500).json({ error: 'No se pudo guardar la política.' });
    }
});

/** Deshace un reajuste devolviendo cada cuota a como estaba antes. */
router.post('/payments/abonos/:id/revertir', async (req, res) => {
    try {
        const abonoCapital = require('../services/abonoCapital');
        const r = await abonoCapital.revertir(req.params.id, { revertidoPor: (req.user && req.user.cedula) || 'admin' });
        if (!r.ok) return res.status(400).json({ error: r.motivo });
        res.json({ ok: true, ...r });
    } catch (err) {
        console.error('Error al revertir un abono:', err);
        res.status(500).json({ error: 'No se pudo revertir el reajuste.' });
    }
});

/** Historial de reajustes aplicados, para auditoría. */
router.get('/payments/abonos/historial', async (req, res) => {
    try {
        const AbonoAplicado = require('../models/AbonoAplicado');
        const filas = await AbonoAplicado.findAll({ order: [['createdAt', 'DESC']], limit: 200 });
        res.json({ ok: true, data: filas.map((f) => ({ ...f.toJSON(), resumen: JSON.parse(f.resumen || 'null'), estadoAnterior: undefined })) });
    } catch (err) {
        console.error('Error al listar el historial de abonos:', err);
        res.status(500).json({ error: 'No se pudo leer el historial.' });
    }
});

/** Le cuenta al socio qué pasó con el dinero que pagó de más. */
async function avisarAlSocio(createNotification, plan) {
    if (!plan || !plan.clientId) return;
    try {
        const { mensajeParaElSocio } = require('../services/abonoCapital');
        await createNotification({
            clientId: plan.clientId,
            type: 'abono_capital',
            title: 'Se aplicó a capital lo que pagaste de más',
            // El mismo texto que usa el barrido automático: el socio no debe
            // recibir un mensaje distinto según por dónde entró el reajuste.
            message: mensajeParaElSocio(plan),
            link: '/dashboard/mis-creditos?tab=cuotas',
        });
    } catch (err) {
        // Que falle un aviso no debe deshacer un reajuste ya confirmado.
        console.warn('No se pudo notificar el abono al socio:', err.message);
    }
}

router.put('/payments/:id', async (req, res) => {
    try {
        const payment = await LoanPayment.findByPk(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Registro de pago no encontrado' });

        const estadoAnterior = payment.estado;

        // A08: whitelist; bloquea cambios a externalId.
        const updateData = pickFields(req.body, ALLOWED_LOAN_PAYMENT_FIELDS);

        // Igual que en POST /payments: estadoPrestamo se deriva del préstamo real,
        // nunca del valor que traiga el formulario.
        const idVmRef = updateData.idVm || payment.idVm;
        if (idVmRef) {
            const prestamoRef = await DisbursedLoan.findOne({ where: { idVm: idVmRef }, attributes: ['estado'] });
            if (prestamoRef) updateData.estadoPrestamo = (prestamoRef.estado || '').trim();
        }

        await payment.update(updateData);
        validateAndFixLoanStatuses().catch(() => { });

        // ── Abono extraordinario a capital ────────────────────────────
        // Si el socio pagó por encima de su cuota, el excedente no es un dinero
        // suelto: es capital que amortiza por adelantado y que debe rebajar los
        // intereses que aún no se han causado. Antes se guardaba en
        // `valorCuotaPago` y ahí moría — el saldo no bajaba, las cuotas
        // siguientes no cambiaban y el socio seguía pagando el mismo interés.
        let abono = null;
        if (payment.estado === 'Pago' && payment.idVm) {
            abono = await aplicarAbonoExtraordinario(payment, req.body.politicaAbono, {
                origen: 'edicion', aplicadoPor: req.user && req.user.cedula,
            });
        }

        // Notifica al socio solo cuando la cuota PASA a 'Pago' (no en cualquier otra
        // edición del registro, como corregir una fecha o un monto).
        if (estadoAnterior !== 'Pago' && payment.estado === 'Pago' && payment.clientId) {
            const { createNotification } = require('../services/NotificationService');
            await createNotification({
                clientId: payment.clientId,
                type: 'payment_registered',
                title: 'Se registró el pago de tu cuota',
                message: abono && abono.aplicado
                    ? `Tu cuota ${payment.externalId || ''} quedó pagada. Los $${Math.round(abono.excedente).toLocaleString('es-CO')} que pagaste de más abonaron a capital y te ahorran $${Math.round(abono.ahorroInteres).toLocaleString('es-CO')} en intereses.`.trim()
                    : `Tu cuota ${payment.externalId || ''} de $${Math.round(Number(payment.valorCuotaPago || payment.valorCuotaVariable || 0)).toLocaleString('es-CO')} quedó registrada como pagada.`.trim(),
                link: '/dashboard/mis-creditos?tab=cuotas'
            });
        }

        // El resumen del abono viaja aparte del registro para que la pantalla
        // pueda explicar qué se recalculó — o por qué no se recalculó nada.
        res.json(abono ? { ...payment.toJSON(), abonoExtraordinario: abono } : payment);
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
router.post('/payments/:id/soporte', upload.single('soporte'), verifyFileMagicBytes, async (req, res) => {
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
        res.set('Content-Disposition', `attachment; filename="${sanitizeFilename(soporte.originalName)}"`);
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
// ── Diagnóstico: registros fechados un día por delante (bug de UTC) ──────────
//
// Hasta el arreglo de fechas, los formularios proponían "hoy" con
// toISOString(), que devuelve la fecha en UTC. Colombia va cinco horas por
// detrás, así que entre las 7:00 p.m. y la medianoche hora local el UTC ya era
// el día siguiente y lo registrado en esa franja quedó fechado mañana.
//
// Un registro se marca como afectado cuando se cumplen DOS cosas:
//   1. createdAt (que Sequelize guarda en UTC) cae entre las 00:00 y las 05:00
//      UTC — o sea, entre las 7 p.m. y la medianoche en Colombia del día antes.
//   2. Y su fecha de negocio coincide EXACTAMENTE con la fecha UTC de createdAt.
//
// La segunda condición es la que evita falsos positivos: si el admin escribió
// la fecha a mano, no coincide con el valor por defecto y no se cuenta. Solo
// salen los que aceptaron el default equivocado.
//
// Es de SOLO LECTURA. Corregir fechas de movimientos ya contabilizados es una
// decisión del comité, no algo que deba pasar de rebote por abrir un informe.
router.get('/diagnostico/fechas-utc', async (req, res) => {
    try {
        const sequelize = require('../config/database');

        // Solo columnas que salían de un <input type="date"> del formulario.
        // Se excluyen las calculadas por el sistema (vencimientos derivados del
        // cronograma), que nunca tomaron ese valor por defecto.
        const OBJETIVOS = [
            { tabla: 'Savings', etiqueta: 'Ahorros', columnas: ['date'] },
            { tabla: 'Loans', etiqueta: 'Solicitudes de préstamo', columnas: ['date'] },
            { tabla: 'DisbursedLoans', etiqueta: 'Préstamos desembolsados', columnas: ['fecha_prestamo', 'fecha_desembolso'] },
            { tabla: 'Clients', etiqueta: 'Socios', columnas: ['fechaIngreso', 'fechaBaja'] },
        ];

        const tablas = (await sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table'", { type: sequelize.QueryTypes.SELECT }
        )).map(r => r.name);

        const resultado = [];
        let totalAfectados = 0;
        let totalCambianMes = 0;

        for (const obj of OBJETIVOS) {
            if (!tablas.includes(obj.tabla)) continue;
            const cols = (await sequelize.query(`PRAGMA table_info("${obj.tabla}")`, { type: sequelize.QueryTypes.SELECT })).map(c => c.name);
            if (!cols.includes('createdAt')) continue;

            for (const col of obj.columnas) {
                if (!cols.includes(col)) continue;

                const filas = await sequelize.query(
                    `SELECT id,
                            "${col}" AS fechaGuardada,
                            date(createdAt, '-1 day') AS fechaCorrecta,
                            createdAt AS creadoUtc
                       FROM "${obj.tabla}"
                      WHERE createdAt IS NOT NULL AND "${col}" IS NOT NULL
                        AND time(createdAt) >= '00:00:00' AND time(createdAt) < '05:00:00'
                        AND date("${col}") = date(createdAt)
                      ORDER BY createdAt DESC`,
                    { type: sequelize.QueryTypes.SELECT }
                );

                const [{ n: total }] = await sequelize.query(
                    `SELECT COUNT(*) AS n FROM "${obj.tabla}" WHERE "${col}" IS NOT NULL`,
                    { type: sequelize.QueryTypes.SELECT }
                );

                // Los que además cambian de MES son los que pueden mover cuentas
                // de un período a otro: un ahorro del 31 contabilizado en el mes
                // siguiente deja de contar para el mes que le tocaba.
                const cambianMes = filas.filter(f =>
                    String(f.fechaGuardada).slice(0, 7) !== String(f.fechaCorrecta).slice(0, 7));

                totalAfectados += filas.length;
                totalCambianMes += cambianMes.length;

                resultado.push({
                    tabla: obj.tabla,
                    etiqueta: obj.etiqueta,
                    columna: col,
                    total,
                    afectados: filas.length,
                    cambianDeMes: cambianMes.length,
                    ejemplos: filas.slice(0, 20),
                });
            }
        }

        res.json({ totalAfectados, totalCambianMes, detalle: resultado, soloLectura: true });
    } catch (err) {
        console.error('Error en diagnóstico de fechas UTC:', err);
        res.status(500).json({ error: 'No se pudo ejecutar el diagnóstico.' });
    }
});

router.get('/dashboard-stats', async (req, res) => {
    try {
        const PENALIZACION_DIARIA = 1000;
        const now = new Date();
        const currentYear = now.getFullYear();
        const nextYear = currentYear + 1;
        const currentMonth = now.getMonth() + 1; // 1-12
        const { Op, fn, col } = require('sequelize');
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
        // No se filtra por esPrepago: valorInteresesAmortizados ya es la fuente de verdad
        // (0 en cuotas 100% condonadas por refinanciación, el monto real cobrado por días
        // en la cuota que sí tiene interés proporcional causado — ver retanqueos). Filtrar
        // por esPrepago excluía también ese interés real, subestimando el ingreso del fondo.
        const totalIntereses = await LoanPayment.sum('valorInteresesAmortizados', {
            where: {
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
            // Se cuenta lo REALMENTE recibido, no lo que la cuota decía. Antes,
            // en una cuota normal se sumaba `valorCuotaVariable`, así que si un
            // socio pagaba de más ese excedente no aparecía en el recaudo: el
            // fondo recibía un dinero que no figuraba en ninguna cifra. Se
            // conserva `valorCuotaVariable` como respaldo para las filas
            // históricas que no registraron el valor pagado.
            const pagadoReal = parseFloat(p.valorCuotaPago || 0);
            const valor = pagadoReal > 0 ? pagadoReal : parseFloat(p.valorCuotaVariable || 0);
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


        // Intereses recaudados en el año actual (Estado: Pago). No se filtra por esPrepago
        // por la misma razón que totalIntereses arriba — valorInteresesAmortizados ya es 0
        // en lo condonado y el monto real en lo cobrado por días en un retanqueo.
        const totalInteresesPagados = await LoanPayment.sum('valorInteresesAmortizados', {
            where: {
                estado: 'Pago',
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

        // ── 4.5 TOTAL PRÉSTAMOS VIGENTES (cartera activa, NO para Saldo en Banco) ──
        const totalAllLoans = await DisbursedLoan.sum('valorPrestado', {
            where: { estado: { [Op.like]: '%Vigente%' } }
        }) || 0;

        // ── 4.6 CAPITAL DESEMBOLSADO HISTÓRICO (para Saldo en Banco) ──
        // Suma TODOS los préstamos sin importar estado ni año.
        // BUG anterior: se usaba totalAllLoans (solo Vigente), lo que excluía el capital
        // de préstamos ya liquidados. Como sus cuotas SÍ se contaban en totalAllCuotasPagadas,
        // ese capital se contabilizaba dos veces inflando Caja Disponible ~$5.800.000.
        // Corrección 2026-06-05: usar capital histórico total para que la resta sea completa.
        const totalCapitalHistorico = await DisbursedLoan.sum('valorPrestado') || 0;

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
                type: NO_ES_APORTE_INICIAL() // Don't count "Aporte Inicial" as covering for "Mensual" mora
            },
            attributes: ['clientId', 'mesAbonado', 'anioAbonado', 'type', 'date', 'valorAPenalizar']
        });

        // ── 3. TOTAL SAVINGS: suma de amount (bruto, incluye penalizaciones cobradas)
        const totalSavingsResult = await Saving.sum('amount', {
            where: {
                type: NO_ES_APORTE_INICIAL()
            },
            include: [{
                model: Client,
                where: effectiveClientWhere,
                required: true
            }]
        }) || 0;

        // ── 3.6 AHORRO POR AÑO (no acumulable) ──
        // Suma de amount agrupada por año de transacción (year) y tipo, solo socios
        // activos y solo registros con status='Abono' (excluye distribuciones de
        // intereses, devoluciones, descuentos por penalización, etc.).
        // Cada año es independiente (NO acumulado): mensual + aportes del año.
        // Usamos `year` (fecha en que entró el dinero) porque parte limpiamente todos
        // los registros — los "Aporte Inicial" casi nunca tienen anioAbonado.
        const ahorroPorAnioRows = await Saving.findAll({
            attributes: ['year', 'type', [fn('SUM', col('amount')), 'tot']],
            where: {
                year: { [Op.ne]: null },
                [Op.or]: [
                    { status: 'Abono' },
                    { type: 'Aporte Inicial' }
                ]
            },
            include: [{
                model: Client,
                attributes: []
            }],
            group: ['year', 'type'],
            raw: true
        });
        const ahorroAnioMap = {};
        ahorroPorAnioRows.forEach(r => {
            const y = r.year;
            if (!ahorroAnioMap[y]) ahorroAnioMap[y] = { anio: y, mensual: 0, aportes: 0, total: 0 };
            const val = Math.round(parseFloat(r.tot) || 0);
            if (r.type === 'Aporte Inicial') ahorroAnioMap[y].aportes += val;
            else ahorroAnioMap[y].mensual += val;
            ahorroAnioMap[y].total += val;
        });
        const ahorroPorAnio = Object.values(ahorroAnioMap).sort((a, b) => a.anio - b.anio);

        // Total neto real del fondo: suma de TODOS los movimientos (incluyendo
        // devoluciones negativas y descuentos) solo para socios Activos.
        const totalNetoActivosResult = await Saving.sum('amount', {
            include: [{
                model: Client,
                where: { estatus: 'Activo' },
                required: true
            }]
        }) || 0;
        const totalNetoActivos = Math.round(totalNetoActivosResult);

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

        // ── Descuento Total Anual Penalizacion del año en curso ─────────────────
        // totalPenaltyValue (arriba) SIEMPRE excluye este mecanismo, porque
        // valorAPenalizar queda en 0 en esos registros — el monto real vive
        // negativo en `amount`. Es un evento único de fin de año (en 2025 se
        // aplicó el 30-nov, y representó el 100% de la mora de ese año; el
        // "totalPenaltyValue" de las cuotas mensuales fue $0 ese año). Si este
        // campo ya es > 0, el evento de este año ya ocurrió y debe sumarse al
        // total real "llevamos"; si sigue en 0, todavía no ha pasado y el
        // estimado de cierre debe anticiparlo usando el patrón del año anterior
        // (baselines.mora) en vez de asumir que nunca va a ocurrir.
        const _dbForDescuento = require('../config/database');
        const { QueryTypes: _QTDescuento } = require('sequelize');
        const descuentoAnualVigenteRow = await _dbForDescuento.query(
            `SELECT ROUND(SUM(ABS(s.amount))) total
             FROM Savings s JOIN Clients c ON c.id = s.clientId
             WHERE s.status = 'Descuento Total Anual Penalizacion'
               AND s.anioAbonado = :anio
               AND c.estatus = 'Activo'`,
            { type: _QTDescuento.SELECT, replacements: { anio: currentYear } }
        );
        const descuentoAnualVigente = Number(descuentoAnualVigenteRow[0]?.total) || 0;

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

        // ── 9. VENCIMIENTOS PRÓXIMOS 30 DÍAS ────────────────────────────────
        // `today0` se construye a partir del día de Colombia, no del de UTC: si no,
        // de noche la ventana arrancaba mañana y se perdían los vencimientos de hoy.
        const [hy, hm, hd] = hoyISOFondo().split('-').map(Number);
        const today0 = new Date(hy, hm - 1, hd);
        const in30 = new Date(today0.getTime() + 30 * 24 * 60 * 60 * 1000);
        const proximasRaw = await LoanPayment.findAll({
            where: {
                estado: 'Pendiente',
                fechaPagoMax: { [Op.gte]: today0.toISOString().split('T')[0], [Op.lte]: in30.toISOString().split('T')[0] }
            },
            attributes: ['valorCuotaVariable', 'fechaPagoMax', 'clientId'],
            include: [{ model: Client, where: { estatus: 'Activo' }, required: true, attributes: [] }]
        });
        const proximosVencimientos30d = {
            count: proximasRaw.length,
            monto: Math.round(proximasRaw.reduce((s, p) => s + parseFloat(p.valorCuotaVariable || 0), 0)),
            socios: new Set(proximasRaw.map(p => p.clientId)).size
        };

        // ── 10. SOCIOS AL DÍA CON AHORROS ESTE MES ─────────────────────────
        const mesActual = now.getMonth() + 1;
        const anioActual = now.getFullYear();
        const ahorrosMesActual = await Saving.findAll({
            where: { mesAbonado: mesActual, anioAbonado: anioActual, status: { [Op.like]: '%Abono%' } },
            attributes: ['clientId'],
            include: [{ model: Client, where: { estatus: 'Activo' }, required: true, attributes: [] }]
        });
        const sociosAlDiaMesSet = new Set(ahorrosMesActual.map(s => s.clientId));
        const sociosAlDiaMes = { count: sociosAlDiaMesSet.size, total: activeClientsCount };

        // ── 11. ACTIVIDAD RECIENTE (Top 3 Ahorros y Top 3 Pagos > 0) ──
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

        const AppSetting = require('../models/AppSetting');
        const nuSetting = await AppSetting.findOne({ where: { key: 'rentabilidadCajaNU' } });
        const rentabilidadCajaNU = nuSetting ? Number(nuSetting.value) : 543815;
        // Fecha de la última actualización manual del valor NU (el admin lo edita
        // esporádicamente, no hay serie histórica). El estimado de cierre usa esta
        // fecha para declarar qué tan fresco es el dato.
        const rentabilidadCajaNUActualizada = nuSetting?.updatedAt || null;

        // ── Baselines dinámicos del año anterior (plan de mejora de gráficas) ──
        // Préstamos e intereses se calculan de la BD (verificado: coinciden con las
        // antiguas constantes del frontend). Patrimonio de cierre y meta anual son
        // decisiones/snapshots del comité: viven en AppSettings (editables vía
        // PUT /admin/settings/:key) con los valores 2025 como semilla por defecto.
        const _anioActual = new Date().getFullYear();
        const _anioPrev = _anioActual - 1;
        const _sequelize = require('../config/database');
        const { QueryTypes: _QT } = require('sequelize');
        const [prestamosPrevRow, interesesPrevRow, metaSetting, patrimonioSetting, moraPrevRow, nuCierreSetting] = await Promise.all([
            _sequelize.query(
                `SELECT ROUND(SUM(COALESCE(valor_prestado, monto))) total, COUNT(*) cantidad
                 FROM DisbursedLoans WHERE anio_desembolso = :anio`,
                { type: _QT.SELECT, replacements: { anio: _anioPrev } }),
            _sequelize.query(
                `SELECT ROUND(SUM(valor_intereses_amortizados)) total
                 FROM LoanPayments WHERE estado IN ('Pago','Abono')
                   AND strftime('%Y', fecha_pago_max) = :anio`,
                { type: _QT.SELECT, replacements: { anio: String(_anioPrev) } }),
            AppSetting.findOne({ where: { key: 'metaGananciaAnual' } }),
            AppSetting.findOne({ where: { key: `patrimonioCierre${_anioPrev}` } }),
            // Mora sí tiene serie histórica real por año (a diferencia de NU, ver abajo).
            // Corrección: la primera versión sumaba solo valorAPenalizar agrupado por
            // `year` (fecha de la transacción) y daba $0 para 2025 — pero el recargo
            // anual real vive en registros con status='Descuento Total Anual
            // Penalizacion', donde valorAPenalizar queda en 0 y el valor real está en
            // `amount` (negativo). Además hay que agrupar por anioAbonado (período
            // acreditado), no por year: uno de los 8 descuentos de 2025 quedó con
            // year=2024 (aplicado el 29-dic-2024 para el período 2025). Verificado
            // contra la BD: esta query reproduce exactamente los $212.000 reales de
            // 2025. Sin filtro de cliente activo a propósito — es un hecho histórico
            // de lo que se cobró ese año, no debe reducirse porque el socio luego se
            // haya dado de baja.
            _sequelize.query(
                `SELECT ROUND(SUM(CASE WHEN status = 'Descuento Total Anual Penalizacion' THEN ABS(amount) ELSE valorAPenalizar END)) total
                 FROM Savings
                 WHERE anioAbonado = :anio
                   AND (valorAPenalizar > 0 OR status = 'Descuento Total Anual Penalizacion')`,
                { type: _QT.SELECT, replacements: { anio: _anioPrev } }),
            // NU no tiene serie histórica (el admin edita un único saldo acumulado,
            // sin snapshot por año) — se gobierna igual que patrimonioCierre: un
            // AppSetting editable por el comité, sembrado con el valor real de cierre
            // 2025 conocido en vez de quedar hardcodeado para siempre en el frontend.
            AppSetting.findOne({ where: { key: `rentabilidadCajaNUCierre${_anioPrev}` } }),
        ]);
        const baselines = {
            anio: _anioPrev,
            prestamos: Number(prestamosPrevRow[0]?.total) || 0,
            // Cantidad de créditos del año anterior. El frontend la tenía escrita a
            // mano ("13"), así que habría quedado congelada al cambiar de año.
            prestamosCount: Number(prestamosPrevRow[0]?.cantidad) || 0,
            intereses: Number(interesesPrevRow[0]?.total) || 0,
            ahorro: (ahorroPorAnio.find(a => Number(a.anio) === _anioPrev)?.total) || 0,
            patrimonio: patrimonioSetting ? Number(patrimonioSetting.value) : (_anioPrev === 2025 ? 36126201 : 0),
            metaGanancia: metaSetting ? Number(metaSetting.value) : 2448052,
            mora: Number(moraPrevRow[0]?.total) || 0,
            nu: nuCierreSetting ? Number(nuCierreSetting.value) : (_anioPrev === 2025 ? 1029139 : 0),
        };

        // Los agregados del fondo (patrimonio, cartera, mora total) son información
        // que todo socio tiene derecho a ver. Los desgloses persona por persona, no.
        const isAdminStatsReq = req.user?.role === 'admin';

        res.json({
            baselines,
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
            totalNetoActivos,
            ahorroPorAnio,
            totalPenaltyDays: Math.round(totalPenaltyDays),
            totalPenaltyValue: Math.round(totalPenaltyValue),
            descuentoAnualVigente: Math.round(descuentoAnualVigente),
            // Rendimiento NU: leído desde AppSettings (editable por admin desde el panel).
            rentabilidadCajaNU,
            rentabilidadCajaNUActualizada,
            // ── Caja Disponible ──────────────────────────────────────────────────
            // Fórmula: Patrimonio − Capital Desembolsado (período) + Cuotas Recaudadas (período)
            //
            // Patrimonio    = ahorros mensuales + aportes iniciales de socios activos (todos los años).
            // Capital       = totalPrestamos: suma de valorPrestado para los años seleccionados
            //                 (vigentes + cancelados del período; excluye migraciones pre-2026).
            // Cuotas        = totalCuotasPagadas: pagos recibidos dentro del período seleccionado.
            //
            // AUDITORÍA 2026-06-05 (doble corrección):
            //   Bug 1 original: usaba totalAllLoans (solo Vigente) → excluía cancelados del período.
            //   Bug 2 corrección previa: usaba totalCapitalHistorico (todo tiempo) + totalAllCuotasPagadas
            //     (todo tiempo), incluyendo 16 préstamos migrados pre-2026 ("Cancelado", $35.55M)
            //     y sus cuotas históricas ($30.95M), resultado: $23.581.911 en vez de $22.374.996.
            //   Solución final: usar las variables ya filtradas por período (totalPrestamos,
            //     totalCuotasPagadas) — consistencia temporal, excluye datos históricos migrados.
            totalCapitalHistorico: Math.round(totalCapitalHistorico),
            totalAllCuotasPagadas: Math.round(totalAllCuotasPagadas),
            saldoEnBanco: Math.round(
                (totalSavingsResult + totalInitialContributions - totalPrestamos) + totalCuotasPagadas
            ),
            carteraMora,
            moraCarteraEP: Math.round(moraCarteraEP),
            sociosMoraCount: sociosMora,
            // A01 (Broken Access Control): estos cinco campos contienen datos
            // INDIVIDUALES de otros socios — nombre, cédula, días de mora, montos
            // ahorrados y pagados. `/dashboard-stats` está en READ_ONLY_FOR_ALL
            // (cualquier socio autenticado puede llamarlo, porque el Panel Principal
            // se monta también en /dashboard/fondo), así que hasta ahora un socio
            // cualquiera podía leer con curl quién está en mora y con qué cédula.
            // En una cooperativa pequeña, donde todos se conocen, eso es una fuga
            // real. Ocultarlo en el frontend no bastaba: el dato igual viajaba.
            // Mismo criterio ya aplicado a `concentracion` en /executive-stats.
            detalleMora: isAdminStatsReq ? detalleMora : undefined,
            detalleMoraEP: isAdminStatsReq ? detalleMoraEP : undefined,
            detallePenalidad: isAdminStatsReq ? detallePenalidad : undefined,
            recentSavings: isAdminStatsReq ? recentSavings : undefined,
            recentPayments: isAdminStatsReq ? recentPayments : undefined,
            proximosVencimientos30d,
            sociosAlDiaMes,
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
        isProduction: process.env.NODE_ENV === 'production',
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
// BACKUP COMPLETO: Excel + copia del database.sqlite
// ─────────────────────────────────────────────
router.post('/backup/full', async (req, res) => {
    try {
        const BackupService = require('../services/BackupService');
        const fsSync = require('fs');
        const pathMod = require('path');

        // 1. Generar los 6 Excel en carpeta con timestamp
        const result = await BackupService.generateAllBackups();

        // 2. Copiar el database.sqlite al mismo folder de backup
        const dbSource = process.env.DATABASE_PATH ||
            pathMod.join(__dirname, '..', '..', 'database.sqlite');
        const dbDest = pathMod.join(result.folder, 'database.sqlite');

        let dbSizeBytes = 0;
        let dbCopied = false;
        if (fsSync.existsSync(dbSource)) {
            fsSync.copyFileSync(dbSource, dbDest);
            dbSizeBytes = fsSync.statSync(dbDest).size;
            dbCopied = true;
            result.files.push(dbDest);
        }

        console.log(`[BackupFull] Completado. ${result.files.length} archivos en ${result.folder} | BD: ${dbCopied ? `${Math.round(dbSizeBytes / 1024)} KB` : 'no encontrada'}`);
        res.json({
            ok: true,
            folder: result.folder,
            files: result.files,
            timestamp: result.timestamp,
            dbCopied,
            dbSizeKB: Math.round(dbSizeBytes / 1024)
        });
    } catch (err) {
        console.error('❌ backup/full error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});


// ─────────────────────────────────────────────
// HISTORIAL DE BACKUPS
// ─────────────────────────────────────────────
// Antes: ruta de Windows hardcodeada ('C:\\Credifuturo\\Backups'), rota en
// producción (Railway/Linux). Ahora usa la MISMA función que BackupService.js
// (ancla al volumen persistente vía DATABASE_PATH cuando existe).
const BACKUPS_DIR = require('../services/BackupService').getBackupBaseDir();
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

// GET /backup-history/:folderName/download — descarga un backup como ZIP.
// Antes no existía ninguna forma de bajar un backup generado en producción
// (solo se podían abrir directamente en el disco de un Windows local).
router.get('/backup-history/:folderName/download', async (req, res) => {
    try {
        const { folderName } = req.params;
        // Reusa el mismo patrón de validación que ya filtra el listado, evita
        // path traversal (folderName va directo a un path del filesystem).
        if (!/^\d{4}-\d{2}-\d{2}(_\d{6})?$/.test(folderName)) {
            return res.status(400).json({ error: 'Nombre de carpeta inválido' });
        }
        const folderPath = path.join(BACKUPS_DIR, folderName);
        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ error: 'Backup no encontrado' });
        }
        const archiver = require('archiver');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="backup_${folderName}.zip"`);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => { throw err; });
        archive.pipe(res);
        archive.directory(folderPath, false);
        await archive.finalize();
    } catch (err) {
        console.error('Error al descargar backup:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Error al descargar el backup' });
    }
});

// ─────────────────────────────────────────────
// RESTAURAR BASE DE DATOS (solo fuera de producción)
// ─────────────────────────────────────────────
// Comodidad de desarrollo: sube un database.sqlite y reemplaza la BD local
// activa. Deliberadamente restringido a NODE_ENV !== 'production' — el
// gate real es esta variable de entorno (fijada en el despliegue), no un
// header de la petición como Host/hostname, que un cliente puede manipular.
// La restauración en Railway ya tiene su propio mecanismo dedicado y
// auditado: /api/setup/restore-db, gated por SETUP_KEY (ver server.js).
const restoreUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});

router.post('/backup/restore', restoreUpload.single('database'), async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Restauración deshabilitada en producción. Usa /api/setup/restore-db.' });
    }
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se envió ningún archivo.' });
        }
        if (!/\.(sqlite|db)$/i.test(req.file.originalname)) {
            return res.status(400).json({ error: 'El archivo debe tener extensión .sqlite o .db' });
        }

        const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'database.sqlite');
        // Se escribe como .restore y se aplica al reiniciar (ver server.js), en
        // vez de sobrescribir en caliente: evita el error EBUSY de Windows por
        // el archivo bloqueado mientras Sequelize mantiene la conexión abierta.
        fs.writeFileSync(dbPath + '.restore', req.file.buffer);
        console.log(`[RESTORE] Archivo recibido (${Math.round(req.file.size / 1024)} KB) — pendiente de aplicar al reiniciar el servidor.`);

        res.json({ message: 'Base de datos subida. El servidor se reiniciará para aplicarla.' });

        setTimeout(() => {
            console.log('[RESTORE] Reiniciando servidor para aplicar la base de datos restaurada...');
            process.exit(0);
        }, 1500);
    } catch (err) {
        console.error('Error al restaurar backup:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Error al restaurar la base de datos: ' + err.message });
    }
});

// ─────────────────────────────────────────────
// INFORMES Y AUDITORÍAS (Markdown)
// ─────────────────────────────────────────────
const INFORMES_DIR = 'C:\\Credifuturo\\Informes';

// Los ~230 documentos técnicos de INFORMES_DIR (auditorías de seguridad, planes de
// incidentes, migraciones de datos) viven solo en la máquina Windows del admin — esa
// carpeta no existe en Railway (producción), y no queremos que documentos internos
// se empaqueten en el build. Los informes que sí deben verse en producción (los
// compartidos con Junta) se guardan aparte, dentro del repo, para que viajen con
// cada despliegue.
const SHARED_INFORMES_DIR = path.join(__dirname, '..', 'shared-informes');

// La carpeta Informes/ tiene ~230 documentos técnicos pensados para el admin, no para
// consulta general de la Junta. Leonardo y Xiomara (Junta, no-admin) solo deben ver lo
// que se comparte explícitamente con ellos — hoy, solo este informe. Agregar aquí cada
// nuevo documento que se quiera compartir con Junta, y copiar el archivo también a
// SHARED_INFORMES_DIR para que esté disponible en producción.
const JUNTA_INFORMES_VISIBLES = new Set([
    'Interes_Proporcional_Retanqueos.pdf',
    'Abonos_Extraordinarios_a_Capital.pdf',
]);

function findInformePath(name) {
    const sharedPath = path.join(SHARED_INFORMES_DIR, name);
    if (fs.existsSync(sharedPath)) return sharedPath;
    const localPath = path.join(INFORMES_DIR, name);
    if (fs.existsSync(localPath)) return localPath;
    return null;
}

router.get('/informes', async (req, res) => {
    try {
        const isAdminReq = req.user?.role === 'admin';
        const seen = new Set();
        const reports = [];

        if (fs.existsSync(SHARED_INFORMES_DIR)) {
            for (const f of fs.readdirSync(SHARED_INFORMES_DIR)) {
                if (!(f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.pdf'))) continue;
                if (!(isAdminReq || JUNTA_INFORMES_VISIBLES.has(f))) continue;
                const stat = fs.statSync(path.join(SHARED_INFORMES_DIR, f));
                reports.push({ name: f, createdAt: stat.birthtime, updatedAt: stat.mtime });
                seen.add(f);
            }
        }

        if (fs.existsSync(INFORMES_DIR)) {
            for (const f of fs.readdirSync(INFORMES_DIR)) {
                if (seen.has(f)) continue;
                if (!(f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.pdf'))) continue;
                if (!(isAdminReq || JUNTA_INFORMES_VISIBLES.has(f))) continue;
                const stat = fs.statSync(path.join(INFORMES_DIR, f));
                reports.push({ name: f, createdAt: stat.birthtime, updatedAt: stat.mtime });
            }
        }

        reports.sort((a, b) => b.createdAt - a.createdAt);
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
        const isAdminReq = req.user?.role === 'admin';
        if (!isAdminReq && !JUNTA_INFORMES_VISIBLES.has(name)) {
            return res.status(403).json({ error: 'No tienes acceso a este informe.' });
        }
        const filePath = findInformePath(name);
        if (!filePath) {
            return res.status(404).json({ error: 'Informe no encontrado' });
        }
        // Los .pdf se sirven como binario (el visor los pide con responseType: 'blob'
        // desde el frontend, igual que la descarga de soportes); .md/.txt siguen el
        // contrato JSON existente que ya consume el visor de Markdown.
        if (name.endsWith('.pdf')) {
            res.set('Content-Type', 'application/pdf');
            res.set('Content-Disposition', `inline; filename="${name}"`);
            return res.send(fs.readFileSync(filePath));
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
        const filePath = findInformePath(name);
        if (filePath) {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error al eliminar informe:', err);
        res.status(500).json({ error: 'Error al eliminar informe' });
    }
});

// ─────────────────────────────────────────────
// REGISTROS DE ACCESO (AUDITORÍA) — A09
// Lee logs/security.log (eventos LOGIN_*, PASSWORD_*, alertas de fuerza
// bruta) y los enriquece con el nombre/código del socio para que el
// administrador pueda auditar el uso del portal. Nunca incluye contraseñas:
// el logger ya las redacta antes de escribir al archivo.
// ─────────────────────────────────────────────
const ACCESS_LOG_EVENTS = new Set([
    'LOGIN_SUCCESS',
    'LOGIN_FAIL_USER_NOT_FOUND',
    'LOGIN_FAIL_BAD_PASSWORD',
    'LOGIN_FAIL_DEACTIVATED',
    'ALERT_BRUTE_FORCE_SUSPECTED',
    'PASSWORD_CHANGED',
    'PASSWORD_CHANGE_FAIL_BAD_CURRENT',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_BY_ADMIN',
]);

router.get('/logs/access', async (req, res) => {
    try {
        if (!fs.existsSync(LOG_FILE)) return res.json({ data: [] });

        const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
        const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);

        const entries = [];
        for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
            const jsonStr = lines[i].replace(/^\[SECURITY\]\s*/, '');
            let obj;
            try { obj = JSON.parse(jsonStr); } catch { continue; }
            if (ACCESS_LOG_EVENTS.has(obj.event)) entries.push(obj);
        }

        const ids = [...new Set(entries.map(e => e.userId || e.targetClientId).filter(Boolean))];
        const clients = ids.length
            ? await Client.findAll({
                where: { id: ids },
                attributes: ['id', 'name', 'apellido1', 'apellido2', 'customerId', 'cedula', 'role']
            })
            : [];
        const clientMap = new Map(clients.map(c => [c.id, c]));

        // Para la sesión de inicio más reciente de cada socio, estimamos
        // cuánto tiempo lleva conectado comparando con su última actividad
        // registrada (en memoria desde el último reinicio del servidor).
        const seenLoginUsers = new Set();
        const now = Date.now();

        const data = entries.map(({ ts, event, userId, targetClientId, cedula, role, ip, mustChangePassword, ...extra }) => {
            const id = userId || targetClientId || null;
            const c = id ? clientMap.get(id) : null;

            let sessionDurationMin = null;
            let online = false;
            if (event === 'LOGIN_SUCCESS' && id && !seenLoginUsers.has(id)) {
                seenLoginUsers.add(id);
                const last = getLastActivity(id);
                const loginMs = new Date(ts).getTime();
                if (last && last >= loginMs) {
                    sessionDurationMin = Math.round((last - loginMs) / 60000);
                    online = (now - last) < 3 * 60 * 1000;
                }
            }

            return {
                ts,
                event,
                userId: id,
                cedula: c?.cedula || cedula || null,
                nombre: c ? `${c.name} ${c.apellido1 || ''} ${c.apellido2 || ''}`.trim() : null,
                customerId: c?.customerId || null,
                role: c?.role || role || null,
                ip: ip || null,
                mustChangePassword: mustChangePassword ?? null,
                sessionDurationMin,
                online,
                extra
            };
        });

        res.json({ data });
    } catch (err) {
        console.error('logs/access error:', err);
        res.status(500).json({ error: 'Error al leer registros de acceso.' });
    }
});

// ─────────────────────────────────────────────
// EVENTOS DE ATAQUE AL SISTEMA — A07/A09
// Subconjunto de logs/security.log correspondiente a intentos de vulnerar
// el sistema (no auditoría de uso legítimo): logins fallidos, cambios de
// contraseña fallidos, alertas de fuerza bruta y bloqueos por rate-limit.
// Endpoint separado de /logs/access a propósito, para no mezclar
// "auditoría de acceso" con "eventos de ataque" en la misma lista.
// ─────────────────────────────────────────────
const ATTACK_LOG_EVENTS = new Set([
    'LOGIN_FAIL_USER_NOT_FOUND',
    'LOGIN_FAIL_BAD_PASSWORD',
    'LOGIN_FAIL_DEACTIVATED',
    'PASSWORD_CHANGE_FAIL_BAD_CURRENT',
    'ALERT_BRUTE_FORCE_SUSPECTED',
    'ALERT_RATE_LIMIT_LOGIN',
    'ALERT_RATE_LIMIT_RESET',
]);

const ATTACK_SEVERITY = {
    LOGIN_FAIL_USER_NOT_FOUND: 'media',
    LOGIN_FAIL_BAD_PASSWORD: 'media',
    LOGIN_FAIL_DEACTIVATED: 'baja',
    PASSWORD_CHANGE_FAIL_BAD_CURRENT: 'baja',
    ALERT_BRUTE_FORCE_SUSPECTED: 'alta',
    ALERT_RATE_LIMIT_LOGIN: 'alta',
    ALERT_RATE_LIMIT_RESET: 'media',
};

router.get('/logs/security-events', async (req, res) => {
    try {
        if (!fs.existsSync(LOG_FILE)) return res.json({ data: [] });

        const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
        const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);

        const entries = [];
        for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
            const jsonStr = lines[i].replace(/^\[SECURITY\]\s*/, '');
            let obj;
            try { obj = JSON.parse(jsonStr); } catch { continue; }
            if (ATTACK_LOG_EVENTS.has(obj.event)) entries.push(obj);
        }

        const ids = [...new Set(entries.map(e => e.userId).filter(Boolean))];
        const clients = ids.length
            ? await Client.findAll({
                where: { id: ids },
                attributes: ['id', 'name', 'apellido1', 'apellido2', 'customerId', 'cedula', 'role']
            })
            : [];
        const clientMap = new Map(clients.map(c => [c.id, c]));

        const data = entries.map(({ ts, event, userId, cedula, ip, ...extra }) => {
            const c = userId ? clientMap.get(userId) : null;
            return {
                ts,
                event,
                severity: ATTACK_SEVERITY[event] || 'media',
                userId: userId || null,
                cedula: c?.cedula || cedula || null,
                nombre: c ? `${c.name} ${c.apellido1 || ''} ${c.apellido2 || ''}`.trim() : null,
                customerId: c?.customerId || null,
                ip: ip || null,
                extra
            };
        });

        res.json({ data });
    } catch (err) {
        console.error('logs/security-events error:', err);
        res.status(500).json({ error: 'Error al leer eventos de seguridad.' });
    }
});

// ─────────────────────────────────────────────
// ENDPOINTS PARA SOCIOS (SOLO LECTURA)
// ─────────────────────────────────────────────

// GET /my/utilidades-estimadas — participación estimada del socio en la ganancia
// del fondo del AÑO ACTUAL. La referencia es la "Ganancia Total" del panel
// principal (misma composición y período por defecto que /dashboard-stats):
// intereses pagados + rendimiento Cta. NU (AppSettings) + recargos por mora.
// Base del reparto: ahorro mensual neto del año actual (por año ABONADO) de
// todos los socios activos. Sin ganancia o sin base, se responde null.
router.get('/my/utilidades-estimadas', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const AppSetting = require('../models/AppSetting');
        const currentYear = new Date().getFullYear();

        // ── Ganancia total del fondo (réplica del panel: año actual + siguiente en intereses) ──
        // Sin filtro esPrepago — mismo motivo que en /dashboard-stats: valorInteresesAmortizados
        // ya distingue lo condonado (0) de lo cobrado por días en un retanqueo (monto real).
        const interesesPagados = await LoanPayment.sum('valorInteresesAmortizados', {
            where: {
                estado: 'Pago',
                fechaPagoMax: { [Op.between]: [`${currentYear}-01-01`, `${currentYear + 1}-12-31`] }
            }
        }) || 0;
        const recargosMora = await Saving.sum('valorAPenalizar', { where: { year: currentYear } }) || 0;
        const nuSetting = await AppSetting.findOne({ where: { key: 'rentabilidadCajaNU' } });
        const rentabilidadNU = nuSetting ? Number(nuSetting.value) : 543815;
        const utilidades = Math.round(interesesPagados + rentabilidadNU + recargosMora);
        if (utilidades <= 0) return res.json({ ok: true, data: null });

        // ── Base del reparto: ahorro neto del año actual de socios activos ──
        const activos = await Client.findAll({ where: { estatus: 'Activo' }, attributes: ['id'] });
        const rows = await Saving.findAll({
            where: {
                type: NO_ES_APORTE_INICIAL(),
                clientId: { [Op.in]: activos.map(c => c.id) }
            },
            attributes: ['clientId', 'amount', 'valorAhorrado', 'anioAbonado', 'year']
        });
        const val = (s) => {
            const v = parseFloat(s.valorAhorrado);
            return v > 0 ? v : (parseFloat(s.amount) || 0);
        };
        let base = 0, propio = 0;
        for (const s of rows) {
            // Año abonado primero (período que cubre el pago); year como respaldo
            const yr = Number(s.anioAbonado || s.year);
            if (yr !== currentYear) continue;
            const x = val(s);
            base += x;
            if (s.clientId === req.user.id) propio += x;
        }
        if (base <= 0) return res.json({ ok: true, data: null });

        const participacion = propio / base;
        res.json({
            ok: true,
            data: {
                anio: currentYear,
                utilidades,
                componentes: {
                    intereses: Math.round(interesesPagados),
                    rentabilidadNU: Math.round(rentabilidadNU),
                    recargos: Math.round(recargosMora)
                },
                participacionPct: participacion * 100,
                valorEstimado: Math.round(participacion * utilidades)
            }
        });
    } catch (err) {
        console.error('my/utilidades-estimadas error:', err);
        res.status(500).json({ ok: false, error: 'Error al calcular la participación estimada.' });
    }
});

// GET /my/score-history — últimos 12 snapshots mensuales de los insumos del score.
// El cliente recalcula cada score con calcScore() (fuente única de la fórmula).
router.get('/my/score-history', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const ScoreSnapshot = require('../models/ScoreSnapshot');
        const rows = await ScoreSnapshot.findAll({
            where: { clientId: req.user.id },
            order: [['anio', 'DESC'], ['mes', 'DESC']],
            limit: 12
        });
        const data = rows.reverse().map(r => {
            let datos = {};
            try { datos = JSON.parse(r.datos); } catch { /* snapshot corrupto: se omite el detalle */ }
            return { anio: r.anio, mes: r.mes, datos };
        });
        res.json({ ok: true, data });
    } catch (err) {
        console.error('my/score-history error:', err);
        res.status(500).json({ ok: false, error: 'Error al leer el historial de score.' });
    }
});

router.get('/my/loan-capacity', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const analysis = await getLoanCapacityAnalysis(req.user.id);
        res.json(analysis);
    } catch (err) {
        console.error('my/loan-capacity error:', err);
        if (err.message === 'Socio no encontrado') {
            res.status(404).json({ error: err.message });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// Crear una solicitud de préstamo a partir de la simulación (socio)
router.post('/my/loan-requests', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const LoanRequest = require('../models/LoanRequest');
        const { Op } = require('sequelize');

        const existing = await LoanRequest.findOne({ where: { clientId: req.user.id, status: 'pending' } });
        if (existing) {
            return res.status(409).json({ error: 'Ya tienes una solicitud de préstamo pendiente de revisión.' });
        }

        const {
            amount, installments, monthlyRate,
            firstInstallment, lastInstallment, totalInterest, totalToPay, estimatedEndDate,
            scoreAtRequest, availableCapacityAtRequest, requiresVote,
            banco, cuentaAhorros, observaciones
        } = req.body;

        if (!amount || !installments || !monthlyRate) {
            return res.status(400).json({ error: 'Monto, plazo y tasa son obligatorios.' });
        }
        if (!banco || !cuentaAhorros) {
            return res.status(400).json({ error: 'Banco y número de cuenta de ahorros son obligatorios.' });
        }
        if (!observaciones || !observaciones.trim()) {
            return res.status(400).json({ error: 'Las observaciones son obligatorias.' });
        }

        const client = await Client.findByPk(req.user.id);
        if (!client) return res.status(404).json({ error: 'Socio no encontrado.' });

        const request = await LoanRequest.create({
            clientId: req.user.id,
            amount, installments, monthlyRate,
            firstInstallment, lastInstallment, totalInterest, totalToPay, estimatedEndDate,
            scoreAtRequest, availableCapacityAtRequest, requiresVote: !!requiresVote,
            banco, cuentaAhorros, observaciones: observaciones.trim()
        });

        const { sendLoanRequestNotification } = require('../services/EmailService');
        sendLoanRequestNotification(client, request).catch(err =>
            console.error('[EmailService] Error enviando notificación de solicitud de préstamo:', err.message)
        );

        // Notifica a los 3 miembros de la Junta Administrativa (gerente, subgerente,
        // tesorera) — cada uno debe votar por separado, ver PUT .../vote más abajo.
        const { notifyMany } = require('../services/NotificationService');
        const mensajeSolicitud = `${client.name} ${client.surname1 || ''} solicitó $${Math.round(Number(request.amount)).toLocaleString('es-CO')} a ${request.installments} cuota(s). Tu voto de la Junta está pendiente.`.trim();
        const admins = await Client.findAll({ where: { role: 'admin' }, attributes: ['id'] });
        const juntaNoAdmin = await Client.findAll({ where: { cedula: Array.from(JUNTA_CEDULAS) }, attributes: ['id'] });
        await notifyMany(admins.map(a => a.id), { type: 'loan_request_submitted', title: 'Nueva solicitud de préstamo', message: mensajeSolicitud, link: '/admin/loans/approvals' });
        await notifyMany(juntaNoAdmin.map(c => c.id), { type: 'loan_request_submitted', title: 'Nueva solicitud de préstamo', message: mensajeSolicitud, link: '/dashboard/junta-prestamos' });

        res.status(201).json({ ok: true, data: request });
    } catch (err) {
        console.error('my/loan-requests POST error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Listar mis solicitudes de préstamo (socio)
router.get('/my/loan-requests', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const LoanRequest = require('../models/LoanRequest');
        const requests = await LoanRequest.findAll({
            where: { clientId: req.user.id },
            order: [['createdAt', 'DESC']]
        });
        res.json({ ok: true, data: requests });
    } catch (err) {
        console.error('my/loan-requests GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Notificaciones en la app (campana) ──────────────────────────────────────

router.get('/my/notifications', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        const notifications = await Notification.findAll({
            where: { clientId: req.user.id },
            order: [['createdAt', 'DESC']],
            limit: 30
        });
        const unreadCount = await Notification.count({ where: { clientId: req.user.id, isRead: false } });
        res.json({ ok: true, data: notifications, unreadCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/my/notifications/unread-count', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        const unreadCount = await Notification.count({ where: { clientId: req.user.id, isRead: false } });
        res.json({ ok: true, unreadCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/my/notifications/:id/read', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        const notification = await Notification.findOne({ where: { id: req.params.id, clientId: req.user.id } });
        if (!notification) return res.status(404).json({ error: 'Notificación no encontrada.' });
        if (!notification.isRead) await notification.update({ isRead: true, readAt: new Date() });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/my/notifications/read-all', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        const [updated] = await Notification.update(
            { isRead: true, readAt: new Date() },
            { where: { clientId: req.user.id, isRead: false } }
        );
        res.json({ ok: true, updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/my/profile', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
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

router.get('/my/loans', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const loans = await DisbursedLoan.findAll({
            where: { clientId: req.user.id },
            include: [{ model: Client, attributes: ['customerId', 'name', 'surname1', 'surname2', 'cedula'] }],
            order: [['fechaPrestamo', 'DESC']],
            limit: 1000 // tope defensivo: acota el costo de la consulta ante un dato anómalo, sin afectar el uso real
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

router.get('/my/savings', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const savings = await Saving.findAll({
            where: { clientId: req.user.id, type: NO_ES_APORTE_INICIAL() },
            include: [{ model: Client, attributes: ['customerId', 'name', 'surname1', 'surname2', 'cedula'] }],
            order: [['date', 'DESC']],
            limit: 1000 // tope defensivo: acota el costo de la consulta ante un dato anómalo, sin afectar el uso real
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

router.get('/my/initial-contributions', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const contributions = await Saving.findAll({
            where: { clientId: req.user.id, type: 'Aporte Inicial' },
            include: [{ model: Client, attributes: ['customerId', 'name', 'surname1', 'surname2', 'cedula'] }],
            order: [['date', 'DESC']],
            limit: 1000 // tope defensivo: acota el costo de la consulta ante un dato anómalo, sin afectar el uso real
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

router.get('/my/payments', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
    try {
        const payments = await LoanPayment.findAll({
            where: { clientId: req.user.id },
            include: [{ model: Client, attributes: ['customerId', 'name', 'surname1', 'surname2', 'cedula'] }],
            limit: 1000 // tope defensivo: acota el costo de la consulta ante un dato anómalo, sin afectar el uso real
        });

        // ── Corrección día/mes invertido en fechaPagoMax ────────────────────
        // Import histórico: ~81/163 cuotas del fondo tienen fechaPagoMax con
        // día y mes intercambiados respecto a mesPago (ej. mesPago="Agosto"
        // pero fechaPagoMax="2026-09-08" en vez de "2026-08-09"). Ya existe
        // esta misma corrección para moraCarteraEP/carteraDia (ver
        // getLoanCapacityAnalysis y /dashboard-stats) pero nunca se aplicaba
        // a la fecha cruda que este endpoint devuelve — por eso "próxima
        // cuota" en Mi Panel podía mostrar el mes equivocado aunque la cuota
        // identificada como "próxima" fuera la correcta.
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
                    if (d === targetIdx) return new Date(y, d - 1, m); // día/mes invertidos
                }
            }
            return new Date(dateStr + 'T00:00:00');
        };
        const toISODate = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const normalizedData = payments.map(p => {
            const raw = p.toJSON();
            const normalized = { ...raw };
            const c = raw.Client || raw.client;
            normalized.clientName = c ? `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.trim() : '';
            normalized.clientCedula = c ? c.cedula : '';
            normalized.clientCustomerId = c ? c.customerId : '';

            const fechaCorregida = safeParseDate(raw.fechaPagoMax, raw.mesPago);
            if (fechaCorregida) {
                normalized.fechaPagoMax = toISODate(fechaCorregida);
            }
            normalized.fechaPago = normalized.fechaPagoMax; // Ensure frontend gets fechaPago

            return normalized;
        });

        // Reordenar por la fecha YA corregida (el orden crudo de la BD podía
        // quedar mal si el intercambio día/mes alteraba el orden relativo).
        normalizedData.sort((a, b) => new Date(b.fechaPagoMax || 0) - new Date(a.fechaPagoMax || 0));

        res.json({ ok: true, data: normalizedData, total: normalizedData.length });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/my/balance', verifyToken, requireFreshPassword, requireRole('user', 'admin'), async (req, res) => {
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

// ── Panel Ejecutivo (beta): agregados financieros del fondo ───────────────
// Indicadores del plan de mejora del Panel Principal: concentración de cartera,
// eficiencia de recaudo YTD, calendario de vencimientos, penetración de crédito
// y series por año (baselines dinámicos — reemplazan las constantes 2025 del código).
router.get('/executive-stats', async (req, res) => {
    try {
        const sequelize = require('../config/database');
        const { QueryTypes } = require('sequelize');
        const q = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });

        const [
            carteraRows, recaudoYtdRows, topDeudores, vencimientos,
            penetracionRows, ahorroAnio, colocacionAnio, interesesAnio, flujo30Rows
        ] = await Promise.all([
            // Cartera pendiente: vigente vs vencida (PAR)
            q(`SELECT CASE WHEN date(fecha_pago_max) < date('now') THEN 'vencida' ELSE 'vigente' END estado,
                      COUNT(*) cuotas, ROUND(SUM(valor_cuota_variable)) valor
               FROM LoanPayments WHERE estado='Pendiente' GROUP BY 1`),
            // Recaudo del año: cuotas con vencimiento ya cumplido este año, por estado
            q(`SELECT estado, COUNT(*) n, ROUND(SUM(valor_cuota_variable)) valor
               FROM LoanPayments
               WHERE strftime('%Y', fecha_pago_max) = strftime('%Y','now')
                 AND date(fecha_pago_max) <= date('now')
               GROUP BY estado`),
            // Concentración: saldo pendiente por deudor (orden descendente).
            // nombre replica exactamente la construcción de clientName en /payments/list
            // (name + apellido1 + apellido2) para que el drill-down por socio pueda
            // armar el mismo "socioKey" y hacer match exacto al navegar con filtros.
            q(`SELECT lp.clientId, c.cedula,
                      TRIM(c.name || ' ' || COALESCE(c.apellido1,'') || ' ' || COALESCE(c.apellido2,'')) nombre,
                      ROUND(SUM(lp.valor_cuota_variable)) saldo
               FROM LoanPayments lp JOIN Clients c ON c.id = lp.clientId
               WHERE lp.estado='Pendiente'
               GROUP BY lp.clientId ORDER BY saldo DESC`),
            // Calendario de vencimientos: cuotas pendientes por mes (próximos 6 meses)
            q(`SELECT strftime('%Y-%m', fecha_pago_max) mes, COUNT(*) cuotas,
                      ROUND(SUM(valor_cuota_variable)) valor
               FROM LoanPayments
               WHERE estado='Pendiente'
                 AND date(fecha_pago_max) >= date('now','start of month')
                 AND date(fecha_pago_max) < date('now','start of month','+6 month')
               GROUP BY 1 ORDER BY 1`),
            // Penetración de crédito
            q(`SELECT (SELECT COUNT(DISTINCT clientId) FROM LoanPayments WHERE estado='Pendiente') conCredito,
                      (SELECT COUNT(*) FROM Clients WHERE estatus='Activo' AND role='user') activos`),
            // Ahorro mensual por año (mes acreditado — mesAbonado/anioAbonado)
            q(`SELECT anioAbonado anio, ROUND(SUM(amount)) total FROM Savings
               WHERE type='Mensual' AND anioAbonado != '' GROUP BY anioAbonado ORDER BY anio`),
            // Colocación de créditos por año
            q(`SELECT anio_desembolso anio, COUNT(*) creditos,
                      ROUND(SUM(COALESCE(valor_prestado, monto))) total
               FROM DisbursedLoans GROUP BY anio_desembolso ORDER BY anio`),
            // Intereses por año de vencimiento y estado (cobrados vs agendados)
            q(`SELECT strftime('%Y', fecha_pago_max) anio, estado,
                      ROUND(SUM(valor_intereses_amortizados)) intereses
               FROM LoanPayments WHERE estado IN ('Pago','Abono','Pendiente')
               GROUP BY 1, 2 ORDER BY 1`),
            // Flujo esperado próximos 30 días
            q(`SELECT COUNT(*) cuotas, ROUND(SUM(valor_cuota_variable)) valor
               FROM LoanPayments WHERE estado='Pendiente'
                 AND date(fecha_pago_max) BETWEEN date('now') AND date('now','+30 day')`),
        ]);

        const vigente = carteraRows.find(r => r.estado === 'vigente') || { cuotas: 0, valor: 0 };
        const vencida = carteraRows.find(r => r.estado === 'vencida') || { cuotas: 0, valor: 0 };
        const carteraTotal = (vigente.valor || 0) + (vencida.valor || 0);

        const pagadasYtd = recaudoYtdRows
            .filter(r => r.estado === 'Pago' || r.estado === 'Abono')
            .reduce((s, r) => ({ n: s.n + (r.n || 0), valor: s.valor + (r.valor || 0) }), { n: 0, valor: 0 });
        const vencidasSinPago = recaudoYtdRows.find(r => r.estado === 'Pendiente') || { n: 0, valor: 0 };
        const cuotasExigidas = pagadasYtd.n + (vencidasSinPago.n || 0);

        // A01 (Broken Access Control): esta ruta es de lectura para CUALQUIER socio
        // autenticado (READ_ONLY_FOR_ALL) porque el Panel Ejecutivo ahora se muestra
        // también en /dashboard/panel-ejecutivo. El top3/top3Pct se calcula aquí para
        // todos, pero el detalle "quién debe cuánto" (nombre + cédula + saldo de cada
        // deudor) SOLO se incluye si quien pide es admin — filtrar esto solo en el
        // frontend no basta, cualquier socio podría llamar este endpoint directo y leer
        // los datos de otros socios en la respuesta JSON aunque la UI no los muestre.
        const isAdminReq = req.user?.role === 'admin';
        const top3 = topDeudores.slice(0, 3).reduce((s, d) => s + (Number(d.saldo) || 0), 0);
        const top3Pct = carteraTotal > 0 ? +((top3 / carteraTotal) * 100).toFixed(1) : 0;

        res.json({
            generadoEl: new Date().toISOString(),
            cartera: {
                total: carteraTotal,
                vigente: vigente.valor || 0,
                vencida: vencida.valor || 0,
                cuotasPendientes: (vigente.cuotas || 0) + (vencida.cuotas || 0),
                parPct: carteraTotal > 0 ? +(((vencida.valor || 0) / carteraTotal) * 100).toFixed(1) : 0,
            },
            recaudoYtd: {
                pagadas: pagadasYtd.n,
                exigidas: cuotasExigidas,
                valorRecaudado: pagadasYtd.valor,
                eficienciaPct: cuotasExigidas > 0 ? +((pagadasYtd.n / cuotasExigidas) * 100).toFixed(1) : null,
            },
            top3,
            top3Pct,
            concentracion: isAdminReq ? topDeudores : undefined,
            vencimientos,
            flujo30dias: flujo30Rows[0] || { cuotas: 0, valor: 0 },
            penetracion: penetracionRows[0] || { conCredito: 0, activos: 0 },
            series: {
                ahorroPorAnio: ahorroAnio,
                colocacionPorAnio: colocacionAnio,
                interesesPorAnio: interesesAnio,
            },
        });
    } catch (err) {
        console.error('executive-stats error:', err);
        res.status(500).json({ error: 'Error generando indicadores ejecutivos' });
    }
});

// ── Comparación entre años: serie MENSUAL por año ─────────────────────────
// Existe para corregir una comparación estructuralmente engañosa del Panel
// Principal: contrastaba el acumulado PARCIAL del año en curso contra el total
// COMPLETO (12 meses) del año anterior, así que el fondo aparecía "por debajo"
// aunque fuera mejor — un artefacto del calendario, no un resultado real.
//
// Con la serie mensual el frontend puede comparar al MISMO corte del calendario
// (ene–<mes actual> de cada año), que es la única comparación honesta, y además
// permite elegir interactivamente qué años contrastar.
//
// Nota sobre el rendimiento de la cuenta NU: no tiene serie mensual posible —
// el admin edita un único saldo acumulado, sin histórico. Se expone solo el
// cierre por año (AppSetting rentabilidadCajaNUCierre{año}) y se marca como
// `sinSerieMensual` para que la UI no finja una precisión que no existe.
router.get('/year-comparison', async (req, res) => {
    try {
        const sequelize = require('../config/database');
        const { QueryTypes, Op } = require('sequelize');
        const AppSetting = require('../models/AppSetting');
        const q = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });

        const hoy = new Date();
        const anioActual = hoy.getFullYear();
        const mesCorte = hoy.getMonth() + 1;
        const diaCorte = hoy.getDate();
        const inicioAnio = new Date(anioActual, 0, 1);
        const diaDelAnio = Math.max(1, Math.round((hoy - inicioAnio) / 86400000) + 1);
        const diasDelAnio = ((anioActual % 4 === 0 && anioActual % 100 !== 0) || anioActual % 400 === 0) ? 366 : 365;

        // Corte con precisión de DÍA para los intereses (LoanPayments.fecha_pago_max es
        // una fecha real). Mora y ahorro se acreditan por período mes/año (mesAbonado /
        // anioAbonado), sin día, así que su corte es por mes completo — simétrico en
        // ambos años, que es lo que importa para que la comparación sea justa.
        const corteMD = `${String(mesCorte).padStart(2, '0')}-${String(diaCorte).padStart(2, '0')}`;

        const [interesesMes, moraMes, ahorroMes, colocacionMes, interesesYtdRows, nuSettings] = await Promise.all([
            // Intereses efectivamente cobrados, por año y mes de vencimiento.
            q(`SELECT CAST(strftime('%Y', fecha_pago_max) AS INTEGER) anio,
                      CAST(strftime('%m', fecha_pago_max) AS INTEGER) mes,
                      ROUND(SUM(valor_intereses_amortizados)) total
               FROM LoanPayments
               WHERE estado IN ('Pago','Abono') AND fecha_pago_max IS NOT NULL
               GROUP BY 1, 2 ORDER BY 1, 2`),
            // Mora: mismo criterio que baselines.mora en /dashboard-stats — el recargo
            // anual vive en registros 'Descuento Total Anual Penalizacion' (valorAPenalizar
            // en 0 y el monto real en `amount`, negativo); el resto son recargos mensuales.
            // Se agrupa por período ACREDITADO (anioAbonado/mesAbonado), no por fecha de
            // transacción, porque un descuento de 2025 puede registrarse en dic-2024.
            q(`SELECT CAST(anioAbonado AS INTEGER) anio,
                      CAST(mesAbonado AS INTEGER) mes,
                      ROUND(SUM(CASE WHEN status = 'Descuento Total Anual Penalizacion'
                                     THEN ABS(amount) ELSE valorAPenalizar END)) total
               FROM Savings
               WHERE anioAbonado IS NOT NULL AND anioAbonado != ''
                 AND (valorAPenalizar > 0 OR status = 'Descuento Total Anual Penalizacion')
               GROUP BY 1, 2 ORDER BY 1, 2`),
            // Ahorro NETO acreditado por período (valorAhorrado = neto de penalización).
            q(`SELECT CAST(anioAbonado AS INTEGER) anio,
                      CAST(mesAbonado AS INTEGER) mes,
                      ROUND(SUM(valorAhorrado)) total
               FROM Savings
               WHERE anioAbonado IS NOT NULL AND anioAbonado != ''
                 AND status != 'Descuento Total Anual Penalizacion'
               GROUP BY 1, 2 ORDER BY 1, 2`),
            // Colocación de créditos por año y mes de desembolso.
            q(`SELECT CAST(anio_desembolso AS INTEGER) anio,
                      CAST(strftime('%m', fecha_prestamo) AS INTEGER) mes,
                      ROUND(SUM(COALESCE(valor_prestado, monto))) total
               FROM DisbursedLoans
               WHERE anio_desembolso IS NOT NULL AND fecha_prestamo IS NOT NULL
               GROUP BY 1, 2 ORDER BY 1, 2`),
            // Intereses ene → corte exacto (mismo día del calendario) por año.
            q(`SELECT CAST(strftime('%Y', fecha_pago_max) AS INTEGER) anio,
                      ROUND(SUM(valor_intereses_amortizados)) total
               FROM LoanPayments
               WHERE estado IN ('Pago','Abono') AND fecha_pago_max IS NOT NULL
                 AND strftime('%m-%d', fecha_pago_max) <= '${corteMD}'
               GROUP BY 1 ORDER BY 1`),
            AppSetting.findAll({ where: { key: { [Op.like]: 'rentabilidadCajaNU%' } } }),
        ]);

        const FUENTES = { intereses: interesesMes, mora: moraMes, ahorro: ahorroMes, colocacion: colocacionMes };

        // Universo de años con algún dato real (se descartan años absurdos por si
        // hay fechas corruptas en la importación legacy).
        const aniosSet = new Set();
        Object.values(FUENTES).forEach(rows => rows.forEach(r => {
            const a = Number(r.anio);
            if (Number.isFinite(a) && a >= 2000 && a <= anioActual + 1) aniosSet.add(a);
        }));
        aniosSet.add(anioActual);
        const anios = [...aniosSet].sort((a, b) => a - b);

        // NU por año: solo cierre anual (sin serie mensual). El año en curso usa el
        // saldo vivo `rentabilidadCajaNU`; los años cerrados, su AppSetting de cierre.
        const nuMap = new Map(nuSettings.map(s => [s.key, Number(s.value) || 0]));
        const nuDeAnio = (anio) => anio === anioActual
            ? (nuMap.get('rentabilidadCajaNU') || 0)
            : (nuMap.get(`rentabilidadCajaNUCierre${anio}`) || 0);

        const series = anios.map(anio => {
            const meses = Array.from({ length: 12 }, (_, i) => {
                const mes = i + 1;
                const val = (rows) => {
                    const row = rows.find(r => Number(r.anio) === anio && Number(r.mes) === mes);
                    return Number(row?.total) || 0;
                };
                return {
                    mes,
                    intereses: val(interesesMes),
                    mora: val(moraMes),
                    ahorro: val(ahorroMes),
                    colocacion: val(colocacionMes),
                };
            });

            const sumar = (campo, hastaMes) => meses
                .filter(m => m.mes <= hastaMes)
                .reduce((s, m) => s + m[campo], 0);

            // ytdAlCorte: enero → mes de corte de HOY, para cada año. Es la comparación
            // manzana-con-manzana. totalAnio: los 12 meses (solo tiene sentido pleno
            // en años ya cerrados).
            const totalAnio = {
                intereses: sumar('intereses', 12),
                mora: sumar('mora', 12),
                ahorro: sumar('ahorro', 12),
                colocacion: sumar('colocacion', 12),
                nu: nuDeAnio(anio),
            };
            const ytdAlCorte = {
                // Intereses: corte al día exacto (la fecha de la cuota lo permite).
                intereses: Number(interesesYtdRows.find(r => Number(r.anio) === anio)?.total) || 0,
                // Mora / ahorro / colocación: corte por mes completo — es la única
                // granularidad que tiene el período acreditado, e igual en ambos años.
                mora: sumar('mora', mesCorte),
                ahorro: sumar('ahorro', mesCorte),
                colocacion: sumar('colocacion', mesCorte),
            };

            return {
                anio,
                esAnioEnCurso: anio === anioActual,
                meses,
                totalAnio: { ...totalAnio, ganancia: totalAnio.intereses + totalAnio.mora + totalAnio.nu },
                ytdAlCorte,
            };
        });

        res.json({
            corte: {
                anioActual,
                mes: mesCorte,
                dia: diaCorte,
                diaDelAnio,
                diasDelAnio,
                // Fracción del año transcurrida: el divisor honesto para saber si el
                // fondo va adelante o atrás del ritmo del año anterior.
                fraccionAnio: +(diaDelAnio / diasDelAnio).toFixed(4),
            },
            anios,
            series,
            nu: { sinSerieMensual: true, porAnio: Object.fromEntries(anios.map(a => [a, nuDeAnio(a)])) },
        });
    } catch (err) {
        console.error('year-comparison error:', err);
        res.status(500).json({ error: 'Error generando la comparación entre años' });
    }
});

// ── Evolución de Ahorros (beta): serie mensual con negativos visibles ─────
// Regla de gobernanza de gráficas: las devoluciones (meses negativos) se
// muestran, no se filtran. Serie por mes acreditado (mesAbonado/anioAbonado),
// a nivel fondo o por socio (?clientId=). Neto = valorAhorrado; bruto = amount.
router.get('/savings-evolution', async (req, res) => {
    try {
        const sequelize = require('../config/database');
        const { QueryTypes } = require('sequelize');
        const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;

        // A01 — Control de acceso roto (IDOR). Esta ruta está en READ_ONLY_FOR_ALL
        // porque su forma AGREGADA (sin ?clientId) alimenta el Panel Ejecutivo, que
        // cualquier socio puede ver. Pero con ?clientId devolvía el historial de
        // ahorro mes a mes de CUALQUIER socio a CUALQUIER socio autenticado: el
        // desplegable de SavingsEvolutionPage se limita al propio usuario en el
        // cliente, y ese filtro se saltaba con un curl o desde las devtools.
        // Iterando clientId=1..N se reconstruía el fondo entero, persona por persona.
        // Verificado: el socio id=15 leía la serie completa de los socios 17 y 18.
        //   - sin clientId  -> agregado del fondo, sin datos de nadie en particular
        //   - con clientId  -> solo el admin, o el propio socio sobre sí mismo
        if (clientId !== null && req.user?.role !== 'admin' && clientId !== req.user?.id) {
            return res.status(403).json({ error: 'Solo puedes consultar tu propia evolución de ahorros.' });
        }

        const filtro = clientId ? 'AND clientId = :clientId' : '';
        const replacements = clientId ? { clientId } : {};

        const [serieMensual, aportesRow] = await Promise.all([
            sequelize.query(`
                SELECT anioAbonado anio, CAST(mesAbonado AS INTEGER) mes,
                       ROUND(SUM(CASE WHEN amount >= 0 THEN amount ELSE 0 END)) abonos,
                       ROUND(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) - SUM(COALESCE(valorAPenalizar, 0))) retiros,
                       ROUND(SUM(COALESCE(valorAhorrado, amount))) neto,
                       ROUND(SUM(amount)) bruto
                FROM Savings
                WHERE type='Mensual' AND anioAbonado != '' AND mesAbonado != '' ${filtro}
                GROUP BY 1, 2 ORDER BY 1, 2`,
                { type: QueryTypes.SELECT, replacements }),
            sequelize.query(`
                SELECT ROUND(SUM(amount)) total, COUNT(*) registros
                FROM Savings WHERE type='Aporte Inicial' ${filtro}`,
                { type: QueryTypes.SELECT, replacements }),
        ]);

        res.json({
            clientId,
            serieMensual,
            aportes: aportesRow[0] || { total: 0, registros: 0 },
        });
    } catch (err) {
        console.error('savings-evolution error:', err);
        res.status(500).json({ error: 'Error generando la serie de evolución' });
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
            // Antes era el string fijo 'Coop2025' para TODOS los socios — un secreto
            // compartido y adivinable que cualquiera podía probar durante la ventana
            // entre el reset y el próximo ingreso real del socio. Ahora es aleatoria
            // por reset, igual que ya se hacía en el auto-seed del admin.
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

        // No se incluye la contraseña temporal en el mensaje: ya viaja una sola vez
        // en esta respuesta HTTP, no debe quedar guardada en texto plano en Notifications.
        const { createNotification } = require('../services/NotificationService');
        await createNotification({
            clientId: client.id,
            type: 'password_reset_resolved',
            title: 'Tu contraseña fue restablecida',
            message: 'El administrador restableció tu contraseña. Usa la nueva contraseña temporal que te compartieron para ingresar; se te pedirá cambiarla.',
            link: null
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

        if (request.clientId) {
            const { createNotification } = require('../services/NotificationService');
            await createNotification({
                clientId: request.clientId,
                type: 'password_reset_resolved',
                title: 'Tu contraseña fue restablecida',
                message: 'El administrador atendió tu solicitud de recuperación. Usa la nueva contraseña temporal que te compartieron para ingresar; se te pedirá cambiarla.',
                link: null
            });
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rechazar una solicitud (admin)
router.put('/password-reset-requests/:id/reject', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const PasswordResetRequest = require('../models/PasswordResetRequest');
        const request = await PasswordResetRequest.findByPk(req.params.id);
        if (!request) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        await request.update({ status: 'rejected' });

        if (request.clientId) {
            const { createNotification } = require('../services/NotificationService');
            await createNotification({
                clientId: request.clientId,
                type: 'password_reset_rejected',
                title: 'Novedades sobre tu solicitud de contraseña',
                message: 'Tu solicitud de recuperación de contraseña no fue procesada. Contacta al administrador si sigues sin poder ingresar.',
                link: null
            });
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Solicitudes de préstamo (módulo de aprobaciones del gerente) ────────────

// Listar solicitudes de préstamo (Junta Administrativa: gerente, subgerente, tesorera).
// status: 'pending' (default), 'all', un valor, o varios separados por coma (ej.
// 'approved,rejected,disbursed' para el historial). Incluye BoardVotes para que cada
// miembro vea el estado de los 3 votos, no solo el suyo.
router.get('/loan-requests', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const LoanRequest = require('../models/LoanRequest');
        const LoanBoardVote = require('../models/LoanBoardVote');
        const DisbursedLoan = require('../models/DisbursedLoan');
        const { Op } = require('sequelize');
        const { status } = req.query;

        let whereClause;
        if (!status) whereClause = { status: 'pending' };
        else if (status === 'all') whereClause = {};
        else if (status.includes(',')) whereClause = { status: { [Op.in]: status.split(',').map(s => s.trim()).filter(Boolean) } };
        else whereClause = { status };

        const requests = await LoanRequest.findAll({
            where: whereClause,
            include: [
                { model: Client, as: 'Client', attributes: ['id', 'name', 'surname1', 'surname2', 'cedula', 'email', 'customerId'] },
                { model: Client, as: 'Reviewer', attributes: ['id', 'name', 'surname1'] },
                { model: DisbursedLoan, as: 'DisbursedLoan', attributes: ['id', 'idVm', 'estado'] },
                { model: LoanBoardVote, as: 'BoardVotes', include: [{ model: Client, as: 'Voter', attributes: ['id', 'name', 'surname1', 'cargo'] }] }
            ],
            order: [['createdAt', 'DESC']]
        });
        res.json({ ok: true, data: requests, total: requests.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detalle de una solicitud de préstamo (Junta Administrativa)
router.get('/loan-requests/:id', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const LoanRequest = require('../models/LoanRequest');
        const LoanBoardVote = require('../models/LoanBoardVote');
        const request = await LoanRequest.findByPk(req.params.id, {
            include: [
                { model: Client, as: 'Client', attributes: ['id', 'name', 'surname1', 'surname2', 'cedula', 'email', 'customerId'] },
                { model: LoanBoardVote, as: 'BoardVotes', include: [{ model: Client, as: 'Voter', attributes: ['id', 'name', 'surname1', 'cargo'] }] }
            ]
        });
        if (!request) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        res.json({ ok: true, data: request });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Miembros de la Junta Administrativa (para que el frontend pueda mostrar las 3
// filas de votación incluso antes de que alguien haya votado).
router.get('/junta/members', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const ids = await getJuntaClientIds();
        const members = await Client.findAll({
            where: { id: ids },
            attributes: ['id', 'name', 'surname1', 'surname2', 'cargo', 'role']
        });
        res.json({ ok: true, data: members });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Votar una solicitud de préstamo (cada miembro de la Junta Administrativa: gerente,
// subgerente, tesorera). El estado final de la solicitud (approved/rejected) solo se
// calcula cuando los 3 miembros han votado — mientras falte alguno, la solicitud sigue
// 'pending' aunque ya existan votos registrados (se espera a los 3 antes de decidir).
router.put('/loan-requests/:id/vote', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const LoanRequest = require('../models/LoanRequest');
        const LoanBoardVote = require('../models/LoanBoardVote');
        const { decision, note } = req.body;
        if (!['approved', 'rejected'].includes(decision)) {
            return res.status(400).json({ error: 'decision debe ser "approved" o "rejected".' });
        }

        const request = await LoanRequest.findByPk(req.params.id, { include: [{ model: Client, as: 'Client' }] });
        if (!request) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'Esta solicitud ya tiene una decisión final de la Junta; no se puede votar de nuevo.' });
        }

        // Cada miembro tiene un solo voto por solicitud; puede cambiarlo mientras siga pendiente.
        const [vote, created] = await LoanBoardVote.findOrCreate({
            where: { loanRequestId: request.id, voterClientId: req.user.id },
            defaults: { decision, note: note?.trim() || null }
        });
        if (!created) await vote.update({ decision, note: note?.trim() || null });

        const juntaIds = await getJuntaClientIds();
        const votosActuales = await LoanBoardVote.findAll({
            where: { loanRequestId: request.id },
            include: [{ model: Client, as: 'Voter', attributes: ['id', 'name', 'surname1', 'cargo'] }]
        });
        const faltan = juntaIds.filter(id => !votosActuales.some(v => v.voterClientId === id));

        if (faltan.length === 0) {
            const todosAprobaron = votosActuales.every(v => v.decision === 'approved');
            const nuevoEstado = todosAprobaron ? 'approved' : 'rejected';
            await request.update({ status: nuevoEstado, reviewedAt: new Date() });

            const { createNotification, notifyMany } = require('../services/NotificationService');
            if (todosAprobaron) {
                const { sendLoanApprovalNotification } = require('../services/EmailService');
                sendLoanApprovalNotification(request.Client, request).catch(err =>
                    console.error('[EmailService] Error enviando notificación de aprobación de préstamo:', err.message)
                );
                await createNotification({
                    clientId: request.clientId,
                    type: 'loan_request_approved',
                    title: 'Tu préstamo fue aprobado',
                    message: `La Junta Administrativa aprobó tu solicitud de $${Math.round(Number(request.amount)).toLocaleString('es-CO')} a ${request.installments} cuota(s).`,
                    link: '/dashboard/loan-capacity-beta'
                });
            } else {
                const { sendLoanRejectionNotification } = require('../services/EmailService');
                sendLoanRejectionNotification(request.Client, request).catch(err =>
                    console.error('[EmailService] Error enviando notificación de rechazo de préstamo:', err.message)
                );
                await createNotification({
                    clientId: request.clientId,
                    type: 'loan_request_rejected',
                    title: 'Novedades sobre tu solicitud de préstamo',
                    message: 'Tu solicitud de préstamo no fue aprobada por la Junta Administrativa por ahora.',
                    link: '/dashboard/loan-capacity-beta'
                });
            }
            // Aviso de control a los 3 miembros: la decisión ya quedó en firme.
            const tituloFinal = `Decisión final: préstamo ${todosAprobaron ? 'aprobado' : 'rechazado'}`;
            const mensajeFinal = `${request.Client?.name || 'El socio'} ${request.Client?.surname1 || ''}: solicitud de $${Math.round(Number(request.amount)).toLocaleString('es-CO')} quedó ${todosAprobaron ? 'aprobada' : 'rechazada'} tras el voto de los 3 miembros de la Junta.`.trim();
            const admins = await Client.findAll({ where: { role: 'admin' }, attributes: ['id'] });
            const juntaNoAdmin = await Client.findAll({ where: { cedula: Array.from(JUNTA_CEDULAS) }, attributes: ['id'] });
            await notifyMany(admins.map(a => a.id), { type: 'loan_request_decided', title: tituloFinal, message: mensajeFinal, link: '/admin/loans/approvals' });
            await notifyMany(juntaNoAdmin.map(c => c.id), { type: 'loan_request_decided', title: tituloFinal, message: mensajeFinal, link: '/dashboard/junta-prestamos' });
        }

        const requestActualizada = await LoanRequest.findByPk(request.id, { include: [{ model: Client, as: 'Client' }] });
        res.json({ ok: true, data: requestActualizada, votes: votosActuales });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vincular una solicitud aprobada con el desembolso ya creado (cierre del flujo aprobar → desembolsar)
router.put('/loan-requests/:id/mark-disbursed', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const LoanRequest = require('../models/LoanRequest');
        const { disbursedLoanId } = req.body;
        if (!disbursedLoanId) return res.status(400).json({ error: 'disbursedLoanId es requerido.' });

        const request = await LoanRequest.findByPk(req.params.id);
        if (!request) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        if (request.status !== 'approved') {
            return res.status(400).json({ error: 'Solo se pueden vincular solicitudes ya aprobadas.' });
        }

        const disbursedLoan = await DisbursedLoan.findByPk(disbursedLoanId);
        if (!disbursedLoan) return res.status(404).json({ error: 'El préstamo desembolsado no existe.' });
        if (disbursedLoan.clientId !== request.clientId) {
            return res.status(400).json({ error: 'El préstamo desembolsado pertenece a otro socio distinto al de la solicitud.' });
        }

        await request.update({ status: 'disbursed', disbursedLoanId });
        res.json({ ok: true, data: request });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Configuración global (AppSettings) ──────────────────────────────────────

// GET /settings/:key — lee una configuración global (disponible para todos autenticados si está en READ_ONLY_PREFIXES)
router.get('/settings/:key', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const AppSetting = require('../models/AppSetting');
        const { key } = req.params;
        const setting = await AppSetting.findOne({ where: { key } });
        res.json({ ok: true, key, value: setting ? setting.value : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /settings/:key — actualiza o crea una configuración global (solo admin)
router.put('/settings/:key', verifyToken, requireFreshPassword, requireRole('admin'), async (req, res) => {
    try {
        const AppSetting = require('../models/AppSetting');
        const { key } = req.params;
        const { value } = req.body;
        if (value === undefined || value === null) {
            return res.status(400).json({ error: 'El campo value es requerido.' });
        }
        const [setting] = await AppSetting.upsert({ key, value: String(value) });

        // Avisa al grupo que hoy puede ver el Ranking de Ahorro (beta) que la
        // ganancia a distribuir del año quedó definida/actualizada por el comité.
        // Se limita a ese grupo — no a todos los socios activos — porque es el
        // único lugar de la app que refleja este valor específico: /dashboard/cuenta
        // muestra una "utilidad estimada" propia, calculada con una fórmula
        // completamente distinta e independiente (ver /my/utilidades-estimadas),
        // así que notificar a todos apuntaría a la mayoría a un número que no
        // corresponde a este cambio, o a una página bloqueada para ellos todavía.
        if (key === 'utilidadesADistribuir') {
            const { Op } = require('sequelize');
            const { notifyMany } = require('../services/NotificationService');
            const destinatarios = await Client.findAll({
                where: { estatus: 'Activo', [Op.or]: [{ role: 'admin' }, { cedula: Array.from(BETA_CEDULAS) }] },
                attributes: ['id']
            });
            const idsSinActor = destinatarios.map(c => c.id).filter(id => id !== req.user.id);
            await notifyMany(idsSinActor, {
                type: 'utilidades_definidas',
                title: 'Ganancia a distribuir definida',
                message: `El comité definió $${Math.round(Number(value)).toLocaleString('es-CO')} como la ganancia a distribuir de este año.`,
                link: '/dashboard/ranking-ahorro'
            });
        }

        res.json({ ok: true, key, value: setting.value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO: BUZÓN DE PROPUESTAS
// ─────────────────────────────────────────────────────────────────────────────
const Propuesta = require('../models/Propuesta');
const VotoPropuesta = require('../models/VotoPropuesta');

// Sincronizar tablas si no existen
(async () => {
    try {
        await Propuesta.sync({ alter: false });
        await VotoPropuesta.sync({ alter: false });
    } catch (e) {
        // Si ya existen, no hace nada
        try {
            await Propuesta.sync({ force: false });
            await VotoPropuesta.sync({ force: false });
        } catch (e2) { /* silencio */ }
    }
})();

// GET /propuestas — listar todas las propuestas (admin: todas; user: solo activas)
router.get('/propuestas', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const { estado, categoria, orden = 'votos' } = req.query;
        const where = {};
        if (estado) where.estado = estado;
        if (categoria) where.categoria = categoria;

        const orderMap = {
            votos: [['votos', 'DESC'], ['createdAt', 'DESC']],
            reciente: [['createdAt', 'DESC']],
            antiguo: [['createdAt', 'ASC']],
        };

        const propuestas = await Propuesta.findAll({
            where,
            order: orderMap[orden] || orderMap.votos,
        });

        // Para el usuario solicitante, marcar si ya votó
        const clientId = req.user?.clientId || req.user?.id;
        let misVotos = new Set();
        if (clientId) {
            const votos = await VotoPropuesta.findAll({ where: { clientId } });
            votos.forEach(v => misVotos.add(v.propuestaId));
        }

        const data = propuestas.map(p => ({
            ...p.toJSON(),
            yaVote: misVotos.has(p.id),
        }));

        res.json({ ok: true, data });
    } catch (err) {
        console.error('Error GET /propuestas:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /propuestas — crear nueva propuesta (cualquier usuario autenticado)
router.post('/propuestas', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const { titulo, descripcion, categoria = 'Otro', anonima = false } = req.body;
        if (!titulo || titulo.length < 5) return res.status(400).json({ ok: false, error: 'El título debe tener al menos 5 caracteres.' });
        if (!descripcion || descripcion.length < 10) return res.status(400).json({ ok: false, error: 'La descripción debe tener al menos 10 caracteres.' });

        const isAdmin = req.user?.role === 'admin';
        // Solo asignamos clientId si NO es admin (para evitar Foreign Key error)
        const finalClientId = isAdmin ? null : (req.user?.clientId || req.user?.id || null);
        
        let autorNombre = isAdmin ? 'Comité Administrativo' : 'Anónimo';

        if (!anonima && finalClientId) {
            try {
                const c = await Client.findByPk(finalClientId, { attributes: ['name', 'surname1'] });
                if (c) autorNombre = `${c.name} ${c.surname1 || ''}`.trim();
            } catch { /* fallback */ }
        } else if (!anonima && req.user?.name && !isAdmin) {
            autorNombre = `${req.user.name} ${req.user.surname1 || ''}`.trim();
        }

        const propuesta = await Propuesta.create({
            titulo: titulo.trim(),
            descripcion: descripcion.trim(),
            categoria,
            clientId: anonima ? null : finalClientId,
            autorNombre: anonima ? 'Anónimo' : autorNombre,
            estado: isAdmin ? 'aprobada' : 'pendiente', // Si lo hace admin, entra aprobada
            votos: isAdmin ? 1 : 0, // Admin arranca con 1 voto
            anonima
        });

        // Avisa al resto del grupo beta (mismo grupo que puede ver/crear propuestas
        // hoy) que hay una propuesta nueva para revisar o votar. No se notifica al
        // propio autor.
        const { Op } = require('sequelize');
        const { notifyMany } = require('../services/NotificationService');
        const destinatarios = await Client.findAll({
            where: { [Op.or]: [{ role: 'admin' }, { cedula: Array.from(BETA_CEDULAS) }] },
            attributes: ['id']
        });
        const idsSinAutor = destinatarios.map(c => c.id).filter(id => id !== req.user.id);
        await notifyMany(idsSinAutor, {
            type: 'propuesta_nueva',
            title: 'Nueva propuesta en el Buzón',
            message: `${propuesta.autorNombre} publicó "${propuesta.titulo}".`,
            link: '/dashboard/propuestas'
        });

        res.json({ ok: true, data: propuesta });
    } catch (err) {
        console.error('Error POST /propuestas:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /propuestas/:id — editar el texto de una propuesta ya creada.
// El autor puede editar la suya solo mientras siga 'pendiente' (antes de que el
// comité empiece a revisarla); el admin puede editar cualquiera en cualquier estado.
// Las propuestas anónimas (clientId null) solo las puede editar el admin, porque el
// servidor no tiene forma de verificar quién fue el autor original.
router.put('/propuestas/:id', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const propuesta = await Propuesta.findByPk(req.params.id);
        if (!propuesta) return res.status(404).json({ ok: false, error: 'Propuesta no encontrada.' });

        const isAdmin = req.user?.role === 'admin';
        const clientId = req.user?.clientId || req.user?.id;
        const esAutor = propuesta.clientId != null && propuesta.clientId === clientId;

        if (!isAdmin) {
            if (!esAutor) return res.status(403).json({ ok: false, error: 'No puedes editar una propuesta que no es tuya.' });
            if (propuesta.estado !== 'pendiente') return res.status(403).json({ ok: false, error: 'Ya no puedes editar esta propuesta: el comité ya la está revisando.' });
        }

        const { titulo, descripcion, categoria } = req.body;
        if (!titulo || titulo.trim().length < 5) return res.status(400).json({ ok: false, error: 'El título debe tener al menos 5 caracteres.' });
        if (!descripcion || descripcion.trim().length < 10) return res.status(400).json({ ok: false, error: 'La descripción debe tener al menos 10 caracteres.' });

        const categoriasValidas = ['Ahorro', 'Préstamos', 'Eventos', 'Tecnología', 'Otro'];
        if (categoria && !categoriasValidas.includes(categoria)) {
            return res.status(400).json({ ok: false, error: 'Categoría inválida.' });
        }

        await propuesta.update({
            titulo: titulo.trim(),
            descripcion: descripcion.trim(),
            ...(categoria ? { categoria } : {}),
        });

        res.json({ ok: true, data: propuesta });
    } catch (err) {
        console.error('Error PUT /propuestas/:id:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /propuestas/:id/voto — toggle voto (1 voto por socio por propuesta)
router.put('/propuestas/:id/voto', verifyToken, requireFreshPassword, async (req, res) => {
    try {
        const propuesta = await Propuesta.findByPk(req.params.id);
        if (!propuesta) return res.status(404).json({ ok: false, error: 'Propuesta no encontrada.' });

        const clientId = req.user?.clientId || req.user?.id;
        if (!clientId) return res.status(401).json({ ok: false, error: 'No identificado.' });

        const votoExistente = await VotoPropuesta.findOne({ where: { propuestaId: propuesta.id, clientId } });

        if (votoExistente) {
            // Quitar voto
            await votoExistente.destroy();
            await propuesta.update({ votos: Math.max(0, (propuesta.votos || 0) - 1) });
            return res.json({ ok: true, votos: propuesta.votos - 1, yaVote: false });
        } else {
            // Agregar voto
            await VotoPropuesta.create({ propuestaId: propuesta.id, clientId });
            await propuesta.update({ votos: (propuesta.votos || 0) + 1 });
            return res.json({ ok: true, votos: propuesta.votos + 1, yaVote: true });
        }
    } catch (err) {
        console.error('Error PUT /propuestas/:id/voto:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /propuestas/:id/estado — cambiar estado + respuesta (solo admin)
router.put('/propuestas/:id/estado', verifyToken, requireFreshPassword, requireRole('admin'), async (req, res) => {
    try {
        const propuesta = await Propuesta.findByPk(req.params.id);
        if (!propuesta) return res.status(404).json({ ok: false, error: 'Propuesta no encontrada.' });

        const { estado, respuestaAdmin } = req.body;
        const estadosValidos = ['pendiente', 'en_revision', 'aprobada', 'rechazada'];
        if (estado && !estadosValidos.includes(estado)) {
            return res.status(400).json({ ok: false, error: 'Estado inválido.' });
        }

        await propuesta.update({
            ...(estado ? { estado } : {}),
            ...(respuestaAdmin !== undefined ? { respuestaAdmin } : {}),
        });

        // Avisa al autor (si no es anónima) de cambios de estado o respuestas del
        // comité — el frontend llama esta ruta una vez por cada tipo de cambio, así
        // que como mucho se dispara una de las dos notificaciones por llamada.
        if (propuesta.clientId != null) {
            const { createNotification } = require('../services/NotificationService');
            if (estado) {
                const estadoLabels = { pendiente: 'pendiente', en_revision: 'en revisión', aprobada: 'aprobada', rechazada: 'rechazada' };
                await createNotification({
                    clientId: propuesta.clientId,
                    type: 'propuesta_estado_cambiado',
                    title: 'Novedades en tu propuesta',
                    message: `Tu propuesta "${propuesta.titulo}" quedó ${estadoLabels[estado] || estado}.`,
                    link: '/dashboard/propuestas'
                });
            }
            if (respuestaAdmin) {
                await createNotification({
                    clientId: propuesta.clientId,
                    type: 'propuesta_respondida',
                    title: 'El comité respondió tu propuesta',
                    message: `"${propuesta.titulo}": ${respuestaAdmin}`,
                    link: '/dashboard/propuestas'
                });
            }
        }

        res.json({ ok: true, data: propuesta });
    } catch (err) {
        console.error('Error PUT /propuestas/:id/estado:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// DELETE /propuestas/:id — eliminar propuesta (solo admin)
router.delete('/propuestas/:id', verifyToken, requireFreshPassword, requireRole('admin'), async (req, res) => {
    try {
        const propuesta = await Propuesta.findByPk(req.params.id);
        if (!propuesta) return res.status(404).json({ ok: false, error: 'Propuesta no encontrada.' });
        await VotoPropuesta.destroy({ where: { propuestaId: propuesta.id } });
        await propuesta.destroy();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
// Reutilizada por el cron de snapshots de score en server.js
module.exports.getLoanCapacityAnalysis = getLoanCapacityAnalysis;
