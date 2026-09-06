require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// [RESTORE] Si hay una BD subida pendiente de aplicar (POST /admin/backup/restore,
// solo disponible fuera de producción), reemplazarla antes de que Sequelize se
// conecte. Nunca corre en producción — la restauración de la BD de Railway usa
// el mecanismo dedicado y auditado /api/setup/restore-db (gated por SETUP_KEY).
if (process.env.NODE_ENV !== 'production') {
    const dbPathForRestore = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite');
    const restorePendingPath = dbPathForRestore + '.restore';
    if (fs.existsSync(restorePendingPath)) {
        try {
            if (fs.existsSync(dbPathForRestore)) {
                fs.copyFileSync(dbPathForRestore, dbPathForRestore + '.bak_pre_restore');
            }
            fs.renameSync(restorePendingPath, dbPathForRestore);
            console.log('✅ [RESTORE] Base de datos local reemplazada exitosamente durante el inicio.');
        } catch (e) {
            console.error('❌ [RESTORE] Error reemplazando base de datos local:', e);
        }
    }
}

const sequelize = require('./config/database');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');

// Models
const Client = require('./models/Client');
const Saving = require('./models/Saving');
const Loan = require('./models/Loan');
const DisbursedLoan = require('./models/DisbursedLoan');
const LoanPayment = require('./models/LoanPayment');
const Soporte = require('./models/Soporte'); // Tabla de soportes de pago
const PasswordResetRequest = require('./models/PasswordResetRequest');
const AppSetting = require('./models/AppSetting');
const ScoreSnapshot = require('./models/ScoreSnapshot'); // Foto mensual de insumos del score crediticio
const LoanRequest = require('./models/LoanRequest'); // Solicitudes de préstamo pendientes de aprobación del gerente
const LoanBoardVote = require('./models/LoanBoardVote'); // Voto individual de cada miembro de la Junta Administrativa
const Notification = require('./models/Notification'); // Notificaciones en la app (campana)
// Registro y punto de retorno de cada reajuste por abono a capital. Va aquí, y
// no donde se usa, porque sequelize.sync() solo crea las tablas de los modelos
// que ya estén definidos cuando corre: cargarlo dentro de una ruta lo deja
// fuera del sync y el primer barrido falla con "no such table".
const AbonoAplicado = require('./models/AbonoAplicado');
// Auditoría de acceso y actividad de sesión. Van aquí por el mismo motivo que
// AbonoAplicado: sync() solo crea las tablas de los modelos ya definidos cuando
// corre. Antes ambas cosas vivían fuera de la base —el log en un archivo del
// contenedor y la actividad en un Map— y se perdían enteras en cada despliegue.
const SecurityEvent = require('./models/SecurityEvent');
const SessionActivity = require('./models/SessionActivity');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const isProduction = process.env.NODE_ENV === 'production';

// Railway (y otros PaaS) terminan TLS en un proxy y añaden X-Forwarded-*.
// Sin esto, express-rate-limit avisa con ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// y todas las requests parecen venir de la misma IP del proxy, desactivando
// efectivamente el límite anti brute-force. '1' = confiar en un solo hop.
if (isProduction) {
    app.set('trust proxy', 1);
}

// Compresión gzip de TODA respuesta (estáticos y JSON de la API).
//
// Va antes que helmet, la API y express.static: `compression` envuelve
// res.write/res.end, así que tiene que estar montado antes que cualquier
// middleware que escriba una respuesta, o no la alcanza a comprimir.
//
// Por qué importa: el bundle de React son ~2,9 MB de JavaScript y Railway NO
// comprime por su cuenta lo que responde la app. Cada visita descargaba los
// 2,9 MB enteros; con gzip bajan a ~0,8 MB. Es la causa principal de la
// lentitud al abrir la página, sobre todo en móvil.
app.use(compression());

// A05 (Security Misconfiguration): headers de seguridad por defecto
app.use(helmet({
    // El frontend React vive en mismo origen. frame-src se extiende con 'blob:'
    // porque 'self' no cubre automáticamente ese esquema — lo necesita el visor
    // de informes en PDF (InformesViewerPage), que embebe el PDF en un <iframe
    // src="blob:..."> para poder mandar el JWT en la descarga.
    contentSecurityPolicy: isProduction ? {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'frame-src': ["'self'", 'blob:']
        }
    } : false,
    crossOriginEmbedderPolicy: false
}));

// A05: CORS restrictivo en producción.
// - Same-origin: si el host del header Origin coincide con el host de la
//   request (req.headers.host), se acepta sin necesitar ALLOWED_ORIGINS.
//   Esto soporta module scripts de Vite, que envían Origin incluso same-origin.
// - Cross-origin: solo se permiten orígenes listados en ALLOWED_ORIGINS (prod)
//   o en la lista hardcoded de dev. Nunca 'origin: true' (reflejaba cualquier).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
if (isProduction && allowedOrigins.length === 0) {
    console.warn('[CORS] ALLOWED_ORIGINS no definida en producción — solo se aceptarán requests del mismo origen.');
}
const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'];
const corsDelegate = (req, callback) => {
    const baseOptions = { credentials: true };
    const origin = req.headers.origin;

    // Sin Origin (curl, Postman, navegación top-level same-origin): permitir.
    if (!origin) return callback(null, { ...baseOptions, origin: true });

    // Same-origin: comparar host del Origin con el Host de la request.
    // Proxies como Railway preservan el Host público; si el cliente envía
    // Origin: https://app.railway.app y Host: app.railway.app, coinciden.
    try {
        const originHost = new URL(origin).host;
        if (originHost === req.headers.host) {
            return callback(null, { ...baseOptions, origin: true });
        }
    } catch (_) { /* Origin malformado: cae al check explícito abajo */ }

    const allowList = isProduction ? allowedOrigins : devOrigins;
    if (allowList.includes(origin)) {
        return callback(null, { ...baseOptions, origin: true });
    }
    return callback(new Error(`CORS: origen no permitido: ${origin}`));
};
app.use(cors(corsDelegate));
app.use(express.json({ limit: '1mb' })); // A04: límite explícito al body JSON

// Servir frontend React en producción
if (isProduction) {
    const clientDist = path.join(__dirname, '..', 'client', 'dist');
    app.use(express.static(clientDist, {
        // Vite pone un hash del contenido en el nombre de cada asset
        // (index-CcMlYeKq.js), así que un archivo con ese nombre nunca cambia:
        // se puede cachear un año y marcarlo `immutable`, y el navegador deja de
        // preguntar por él en cada visita. Si el contenido cambia, cambia el
        // hash y por tanto la URL.
        //
        // index.html es la excepción y NO puede cachearse: es quien apunta a los
        // assets con hash. Si el navegador se quedara con una copia vieja,
        // seguiría pidiendo el bundle anterior y un despliegue nuevo no llegaría
        // nunca al socio.
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('index.html')) {
                res.setHeader('Cache-Control', 'no-cache');
            } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        },
    }));
}

// Request Logger — excluye rutas de auth para no exponer contraseñas en consola.
// A09 (Logging Failures): registra ip y status; el usuario autenticado se
// loguea cuando la respuesta termina (req.user ya está poblado).
// A02: redacta campos sensibles del body antes de loguear — endpoints como
// /admin/clients/:id/reset-password reciben tempPassword en el body.
const SENSITIVE_BODY_KEYS = [
    'password', 'tempPassword', 'newPassword', 'currentPassword',
    'token', 'refreshToken', 'secret', 'apiKey'
];
function redactSensitiveBody(body) {
    if (!body || typeof body !== 'object') return body;
    const out = { ...body };
    for (const k of SENSITIVE_BODY_KEYS) {
        if (k in out) out[k] = '[REDACTED]';
    }
    return out;
}
app.use((req, res, next) => {
    // Solo la API. Antes se registraba también cada asset estático (JS, CSS,
    // fuentes, favicon), lo que en producción son decenas de líneas por visita
    // que no dicen nada: quién pidió qué ya se ve en la petición de la API que
    // viene detrás. Escribir a stdout bloquea el event loop, así que ese ruido
    // se pagaba en latencia de las peticiones reales.
    if (!req.url.startsWith('/api/')) return next();

    const isSensitiveRoute = req.url.startsWith('/api/auth');
    const start = Date.now();
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ip=${ip}`);
    if (!isSensitiveRoute && Object.keys(req.body || {}).length > 0) {
        console.log('Body:', JSON.stringify(redactSensitiveBody(req.body), null, 2).substring(0, 500));
    }
    res.on('finish', () => {
        if (req.user) {
            const ms = Date.now() - start;
            console.log(`  ↳ ${res.statusCode} user=${req.user.id} role=${req.user.role} (${ms}ms)`);
        }
    });
    next();
});

// Health Check (BEFORE routes so it's always reachable)
app.get('/health', (req, res) => {
    res.json({ ok: true, status: 'UP', timestamp: new Date() });
});
app.get('/api/health', (req, res) => {
    res.json({ ok: true, status: 'UP', timestamp: new Date() });
});

// Simple connection test (solo en desarrollo)
if (!isProduction) {
    app.get('/', (_req, res) => res.send('Credifuturo API Running'));
}

// A04 (Insecure Design) + A07: log de crashes del frontend con tamaño y rate limit.
// Fuera de /api/admin para que el ErrorBoundary del cliente pueda llamarlo sin token.
const crashLogLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
});
// Los fallos del navegador se guardan junto a la base de datos, que es lo único
// montado en el volumen persistente. Escribirlos junto al código —lo que hacía
// antes— los dejaba en el disco del contenedor: cada despliegue los borraba, y
// justo después de un despliegue es cuando más falta hacen. Mismo criterio que
// ya siguen los respaldos diarios y la auditoría de accesos.
const RUTA_CRASH_LOG = process.env.DATABASE_PATH
    ? path.join(path.dirname(process.env.DATABASE_PATH), 'crash_log.txt')
    : path.join(__dirname, 'crash_log.txt');

app.post('/api/log-crash', crashLogLimiter, (req, res) => {
    const error = String(req.body?.error || '').slice(0, 2000);
    const stack = String(req.body?.stack || '').slice(0, 8000);
    const line = `[${new Date().toISOString()}] ${error}\n${stack}\n---\n`;
    try {
        require('fs').appendFileSync(RUTA_CRASH_LOG, line);
    } catch (e) {
        console.warn('[crash-log] no se pudo escribir:', e.message);
    }
    res.json({ ok: true });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/user', require('./routes/user'));

// ── Setup endpoints (gated by SETUP_KEY env var) MUST be registered BEFORE the
// React catch-all below, otherwise app.get('*') intercepts them and returns HTML.
//
// A04 (Insecure Design): defense in depth — además de SETUP_KEY,
// se exige longitud mínima de 32 caracteres y ALLOW_SETUP_IN_PRODUCTION=true
// para montar estos endpoints destructivos en NODE_ENV=production.
const setupKey = process.env.SETUP_KEY;
const setupAllowedInProd = process.env.ALLOW_SETUP_IN_PRODUCTION?.toLowerCase() === 'true';
const setupKeyStrong = typeof setupKey === 'string' && setupKey.length >= 32;
const setupEnabled = setupKey && setupKeyStrong && (!isProduction || setupAllowedInProd);

if (setupKey && !setupKeyStrong) {
    console.warn('[SETUP] SETUP_KEY definida pero < 32 caracteres. Endpoints de setup NO se montaron.');
}
if (setupKey && isProduction && !setupAllowedInProd) {
    console.warn('[SETUP] Endpoints de setup deshabilitados en producción. Defina ALLOW_SETUP_IN_PRODUCTION=true para activarlos (no recomendado).');
}

if (setupEnabled) {
    const multer = require('multer');
    const fs = require('fs');
    const dbRestoreStorage = multer.memoryStorage();
    const dbRestoreUpload = multer({ storage: dbRestoreStorage, limits: { fileSize: 50 * 1024 * 1024 } });

    app.post('/api/setup/restore-db', dbRestoreUpload.single('db'), (req, res) => {
        if (req.headers['x-setup-key'] !== process.env.SETUP_KEY) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const targetPath = process.env.DATABASE_PATH || require('path').join(__dirname, '..', 'database.sqlite');
        try {
            fs.writeFileSync(targetPath, req.file.buffer);
            res.json({ ok: true, message: `Database restored to ${targetPath} (${req.file.size} bytes). Restart the service now.` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/setup/reset-password', express.json(), async (req, res) => {
        if (req.headers['x-setup-key'] !== process.env.SETUP_KEY) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { email, newPassword } = req.body;
        if (!email || !newPassword) return res.status(400).json({ error: 'email y newPassword requeridos' });
        try {
            const user = await Client.findOne({ where: { email } });
            if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
            const hash = await bcrypt.hash(newPassword, 10);
            await user.update({ password: hash, mustChangePassword: true });
            res.json({ ok: true, message: `Contraseña de ${email} actualizada. mustChangePassword=true.` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/setup/download-db', (req, res) => {
        if (req.headers['x-setup-key'] !== process.env.SETUP_KEY) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const fs = require('fs');
        const sourcePath = process.env.DATABASE_PATH || require('path').join(__dirname, '..', 'database.sqlite');
        if (!fs.existsSync(sourcePath)) return res.status(404).json({ error: 'Database file not found' });
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="database.sqlite"`);
        fs.createReadStream(sourcePath).pipe(res);
    });

    console.log('[SETUP] Endpoints enabled: restore-db, reset-password, download-db');
}

// En producción: cualquier ruta no-API devuelve el index.html de React
if (isProduction) {
    app.get('*', (_req, res) => {
        res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    });
}

// Global Error Handler
// A05 (Security Misconfiguration): en producción no filtramos err.message para
// errores 5xx — pueden revelar rutas internas, nombres de columnas, etc.
// Los errores 4xx (validación, multer, etc.) sí pasan el mensaje porque están
// pensados para el usuario.
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
        console.error('🔥 SERVER ERROR:', err);
        return res.status(status).json({
            ok: false,
            error: isProduction ? 'Error interno del servidor.' : (err.message || 'Internal Server Error'),
            stack: isProduction ? undefined : err.stack
        });
    }
    res.status(status).json({ ok: false, error: err.message });
});

// Sync Database and Start Server
// Using sync() without alter to avoid SQLite migration issues with foreign keys
// The new column fechaBaja has been verified to exist manually.
sequelize.sync().then(async () => {
    console.log('Database synced');

    // Auto-seed admin if no admin user exists (e.g. first deploy with empty DB)
    // A07: sin credenciales por defecto. Se genera una contraseña aleatoria que
    // se imprime UNA SOLA VEZ en consola y se fuerza mustChangePassword=true.
    try {
        const adminCount = await Client.count({ where: { role: 'admin' } });
        if (adminCount === 0) {
            const { generateTempPassword } = require('./services/passwordPolicy');
            const { logSecurityEvent } = require('./services/securityLogger');
            const tempPassword = generateTempPassword();
            const hash = await bcrypt.hash(tempPassword, 10);
            await Client.create({
                name: 'Admin', surname1: 'Sistema', cedula: '0000000000',
                email: 'admin@credifuturo.com', password: hash,
                role: 'admin', estatus: 'Activo', customerId: 'ADM001',
                mustChangePassword: true
            });
            logSecurityEvent('ADMIN_SEEDED', { email: 'admin@credifuturo.com' });
            console.log('');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('  [SEED] Admin inicial creado. ANOTE ESTA CONTRASEÑA:');
            console.log('  email:    admin@credifuturo.com');
            console.log(`  password: ${tempPassword}`);
            console.log('  Deberá cambiarla en el primer ingreso.');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('');
        }
    } catch (e) {
        console.warn('[SEED] No se pudo verificar/crear admin:', e.message);
    }

    // Migración: columna porcentajePrestamo en clients (seguro si ya existe)
    await sequelize.query(
        'ALTER TABLE clients ADD COLUMN porcentajePrestamo REAL DEFAULT NULL'
    ).catch(() => { /* ya existe — ok */ });

    // Migración: columna observaciones en LoanRequests (banco/cuentaAhorros ya existían;
    // observaciones se agrega para que la Junta vea la nota del socio al aprobar/desembolsar)
    await sequelize.query(
        'ALTER TABLE LoanRequests ADD COLUMN observaciones TEXT DEFAULT NULL'
    ).catch(() => { /* ya existe — ok */ });

    // Migración de datos: poblar porcentajePrestamo desde el préstamo más reciente
    // (sólo para clientes que tienen NULL — no sobreescribe valores ya guardados)
    try {
        await sequelize.query(`
            UPDATE clients
            SET porcentajePrestamo = (
                SELECT d.interesMensual
                FROM DisbursedLoans d
                WHERE d.clientId = clients.id
                  AND d.interesMensual IS NOT NULL
                  AND d.interesMensual > 0
                ORDER BY d.fecha_desembolso DESC
                LIMIT 1
            )
            WHERE clients.porcentajePrestamo IS NULL
        `);
        console.log('[MIGRACIÓN] porcentajePrestamo actualizado desde préstamos existentes.');
    } catch (e) {
        console.warn('[MIGRACIÓN] porcentajePrestamo:', e.message);
    }

    // Crear índices sobre tablas existentes (IF NOT EXISTS — seguro en re-arranques)
    const indexStatements = [
        'CREATE INDEX IF NOT EXISTS idx_savings_year_month   ON Savings(anioAbonado, mesAbonado)',
        'CREATE INDEX IF NOT EXISTS idx_savings_clientId     ON Savings(clientId)',
        'CREATE INDEX IF NOT EXISTS idx_loanpayment_idvm     ON LoanPayments(id_vm)',
        'CREATE INDEX IF NOT EXISTS idx_loanpayment_clientId ON LoanPayments(clientId)',
        'CREATE INDEX IF NOT EXISTS idx_loanpayment_estado   ON LoanPayments(estado)',
        'CREATE INDEX IF NOT EXISTS idx_loanpayment_fecha    ON LoanPayments(fecha_pago_max)',
        'CREATE INDEX IF NOT EXISTS idx_disbursed_clientId   ON DisbursedLoans(client_id)',
        'CREATE INDEX IF NOT EXISTS idx_disbursed_fecha      ON DisbursedLoans(fecha_prestamo)',
        // La asociación LoanPayment→DisbursedLoan genera una clave foránea hacia
        // DisbursedLoans(id_vm), y SQLite exige que la columna destino tenga
        // índice único. Sin él la considera malformada y rechaza con "foreign key
        // mismatch" cualquier INSERT en LoanPayments y cualquier DELETE sobre la
        // tabla — es decir, una instalación nueva no podría registrar un solo
        // pago. Las bases antiguas no traen esa FK y por eso nunca se notó.
        // Si hubiera id_vm repetidos el índice no se crea y el warning lo dice.
        'CREATE UNIQUE INDEX IF NOT EXISTS ux_disbursed_id_vm ON DisbursedLoans(id_vm)',
        // El consecutivo de las cuotas (P1, P2, …) se deriva del máximo global leído dentro
        // de la transacción, y SQLite no bloquea esa lectura: dos desembolsos simultáneos
        // pueden generar el mismo id_ep. Sin índice, la colisión pasa sin un solo error y
        // deja dos cuotas indistinguibles para quien las busque por ahí — DBClient lo hace.
        // Con índice, la segunda escritura falla y el handler responde 409 en vez de
        // corromper en silencio. Si la base ya trae duplicados el índice no se crea y el
        // aviso de abajo lo dice; nada más se rompe.
        'CREATE UNIQUE INDEX IF NOT EXISTS ux_loanpayment_id_ep ON LoanPayments(id_ep)',
        // Registros de Acceso: se consulta siempre por tipo de evento y ordenado
        // por fecha descendente. La tabla solo crece.
        'CREATE INDEX IF NOT EXISTS idx_secevent_ts          ON SecurityEvents(ts)',
        'CREATE INDEX IF NOT EXISTS idx_secevent_event       ON SecurityEvents(event)',
    ];
    for (const sql of indexStatements) {
        await sequelize.query(sql).catch(e => console.warn('[INDEX] Skipped:', e.message));
    }
    console.log('[INDEX] Índices de rendimiento verificados.');

    app.listen(PORT, () => {
        console.log('Server running on port ' + PORT);

        // ── Auditoría de acceso: rescatar lo que quedara en el archivo ──────
        // Solo la primera vez (tabla vacía). El archivo es de disco efímero:
        // lo que tenga ahora es lo último que sobrevivió al despliegue, y a
        // partir de aquí la base es la fuente. Va después de listen() y con su
        // propio try/catch porque el bloque de arranque termina en un .catch
        // que diagnostica "Database connection failed": una excepción antes de
        // abrir el puerto dejaría el servidor caído y con el motivo equivocado.
        (async () => {
            try {
                const yaHay = await SecurityEvent.count();
                if (yaHay === 0) {
                    const { LOG_FILE } = require('./services/securityLogger');
                    if (fs.existsSync(LOG_FILE)) {
                        const filas = [];
                        for (const linea of fs.readFileSync(LOG_FILE, 'utf-8').split('\n')) {
                            if (!linea.trim()) continue;
                            let o;
                            try { o = JSON.parse(linea.replace(/^\[SECURITY\]\s*/, '')); } catch { continue; }
                            if (!o || !o.event) continue;
                            const { ts, event, userId, targetClientId, cedula, role, ip, mustChangePassword, ...resto } = o;
                            filas.push({
                                ts: ts ? new Date(ts) : new Date(),
                                event,
                                userId: userId ?? null,
                                targetClientId: targetClientId ?? null,
                                cedula: cedula ?? null,
                                role: role ?? null,
                                ip: ip ?? null,
                                mustChangePassword: mustChangePassword ?? null,
                                extra: Object.keys(resto).length ? JSON.stringify(resto) : null,
                            });
                        }
                        if (filas.length) {
                            await SecurityEvent.bulkCreate(filas);
                            console.log(`[AUDITORÍA] ${filas.length} evento(s) del archivo importados a la base.`);
                        }
                    }
                }
                const { precargarDesdeBase } = require('./services/sessionActivity');
                const n = await precargarDesdeBase();
                console.log(`[AUDITORÍA] Registros de acceso en base: ${await SecurityEvent.count()} · actividad de ${n} socio(s) precargada.`);
            } catch (e) {
                console.warn('[AUDITORÍA] No se pudo preparar el registro de accesos:', e.message);
            }
        })();

        // ── Backup Automático Diario a las 8 PM ────────────────────────────
        // Formato cron: 'segundo minuto hora dia mes dia-semana'
        // '0 0 20 * * *' = todos los días a las 20:00:00 (8 PM) hora local del servidor
        cron.schedule('0 0 20 * * *', async () => {
            console.log(`[CRON] ⏰ Ejecutando backup automático - ${new Date().toLocaleString('es-CO')}`);
            try {
                const BackupService = require('./services/BackupService');
                const result = await BackupService.generateAllBackups();
                console.log(`[CRON] ✅ Backup completado. ${result.files.length} archivos guardados en: ${result.folder}`);
            } catch (err) {
                console.error('[CRON] ❌ Error en backup automático:', err.message);
            }
        }, {
            scheduled: true,
            timezone: 'America/Bogota'
        });

        console.log('[CRON] 📅 Backup automático programado para las 8:00 PM (hora Colombia) todos los días.');

        // ── Snapshot mensual de insumos del score crediticio ────────────────
        // Guarda (upsert) una foto por socio activo y por mes calendario con los
        // datos que consume calcScore() en el cliente — la fórmula NO se duplica
        // en el backend: el cliente recalcula el score histórico con la fuente única.
        const runScoreSnapshots = async () => {
            const { getLoanCapacityAnalysis } = require('./routes/admin');
            const hoy = new Date();
            const anio = hoy.getFullYear();
            const mes = hoy.getMonth() + 1;
            const socios = await Client.findAll({
                where: { estatus: 'Activo', role: 'user' },
                attributes: ['id']
            });
            let ok = 0, fail = 0;
            for (const socio of socios) {
                try {
                    const a = await getLoanCapacityAnalysis(socio.id);
                    const datos = {
                        ahorroTotal: a.ahorroTotal,
                        totalDeudaPendiente: a.totalDeudaPendiente,
                        enMoraActual: a.enMoraActual,
                        totalCuotasMoraEP: a.totalCuotasMoraEP,
                        historialMoraTotal: a.historialMoraTotal,
                        pagosTardios: a.pagosTardios,
                        historialPagoTotal: a.historialPagoTotal,
                        mesesComoSocio: a.mesesComoSocio,
                        prestamosLiquidados: a.prestamosLiquidados,
                        prestamosVigentes: (a.prestamosVigentes || []).map(l => ({ enMoraEP: !!l.enMoraEP })),
                        mesesConAhorroMensual: a.mesesConAhorroMensual,
                        promedioAhorroMensual: a.promedioAhorroMensual,
                        totalAhorrosConPenalizacion: a.totalAhorrosConPenalizacion,
                        referenteConstancia: a.referenteConstancia,
                    };
                    const [row, created] = await ScoreSnapshot.findOrCreate({
                        where: { clientId: socio.id, anio, mes },
                        defaults: { datos: JSON.stringify(datos) }
                    });
                    if (!created) await row.update({ datos: JSON.stringify(datos) });
                    ok++;
                } catch (e) {
                    fail++;
                    console.warn(`[SNAPSHOT] Socio ${socio.id} falló:`, e.message);
                }
            }
            console.log(`[SNAPSHOT] Score snapshots ${anio}-${String(mes).padStart(2, '0')}: ${ok} ok, ${fail} con error.`);
        };

        cron.schedule('0 10 20 * * *', () => runScoreSnapshots().catch(e => console.error('[SNAPSHOT] Error:', e.message)), {
            scheduled: true,
            timezone: 'America/Bogota'
        });

        // ── Abonos extraordinarios a capital ───────────────────────────────
        // Cuando un socio paga por encima de su cuota, ese excedente amortiza
        // capital y rebaja los intereses que aún no se han causado. El recálculo
        // se dispara al guardar la cuota, pero los pagos ya registrados —los
        // anteriores a que la función existiera— se quedaron sin aplicar: el
        // socio entregó capital y siguió pagando intereses sobre él. Este
        // barrido los encuentra y los aplica.
        //
        // Va DESPUÉS de listen() y con su propio try/catch a propósito: el
        // bloque de arranque termina en un .catch que reporta "Database
        // connection failed", así que una excepción aquí, colocada antes,
        // dejaría el servidor sin abrir el puerto y con un diagnóstico falso.
        const runBarridoAbonos = () => {
            require('./services/abonoCapital')
                .barridoProgramado()
                .catch(e => console.error('[ABONOS] Error en el barrido:', e.message));
        };
        cron.schedule('0 30 20 * * *', runBarridoAbonos, { scheduled: true, timezone: 'America/Bogota' });
        // Y una pasada al arrancar, algo después de la semilla de snapshots para
        // no competir por la única conexión de escritura de SQLite.
        setTimeout(runBarridoAbonos, 45000);
        console.log('[CRON] 💵 Barrido de abonos a capital programado para las 8:30 PM (hora Colombia) + pasada al arranque.');
        // Semilla al arrancar (20s después, para no competir con el arranque):
        // garantiza que el mes en curso siempre tenga snapshot aunque el server
        // no esté encendido a las 8:10 PM.
        setTimeout(() => runScoreSnapshots().catch(e => console.error('[SNAPSHOT] Error semilla:', e.message)), 20000);
        console.log('[CRON] 📈 Snapshot de score programado para las 8:10 PM (hora Colombia) + semilla al arranque.');
    });
}).catch(err => {
    console.error('Database connection failed:', err);
});
