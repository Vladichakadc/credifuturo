require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const isProduction = process.env.NODE_ENV === 'production';

// A05 (Security Misconfiguration): headers de seguridad por defecto
app.use(helmet({
    // El frontend React vive en mismo origen, pero permitimos contentSecurityPolicy
    // por defecto; si rompe algo en prod, ajustar las directivas aquí.
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false
}));

// A05: CORS restrictivo en producción.
// Falla cerrado: si ALLOWED_ORIGINS no está definida en prod, refleja solo el
// mismo origen (sin wildcard). Antes 'origin: true' reflejaba CUALQUIER origin,
// lo que combinado con credentials:true era riesgo de exposición de respuestas.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
if (isProduction && allowedOrigins.length === 0) {
    console.warn('[CORS] ALLOWED_ORIGINS no definida en producción — solo se aceptarán requests del mismo origen.');
}
const corsOriginCheck = (origin, callback) => {
    // Same-origin / herramientas (curl, Postman) no envían Origin
    if (!origin) return callback(null, true);
    if (isProduction) {
        if (allowedOrigins.length === 0) return callback(new Error('CORS: origen no permitido'));
        return allowedOrigins.includes(origin)
            ? callback(null, true)
            : callback(new Error(`CORS: origen no permitido: ${origin}`));
    }
    const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'];
    return devOrigins.includes(origin)
        ? callback(null, true)
        : callback(new Error(`CORS dev: origen no permitido: ${origin}`));
};
app.use(cors({ origin: corsOriginCheck, credentials: true }));
app.use(express.json({ limit: '1mb' })); // A04: límite explícito al body JSON

// Servir frontend React en producción
if (isProduction) {
    const clientDist = path.join(__dirname, '..', 'client', 'dist');
    app.use(express.static(clientDist));
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
app.post('/api/log-crash', crashLogLimiter, (req, res) => {
    const error = String(req.body?.error || '').slice(0, 2000);
    const stack = String(req.body?.stack || '').slice(0, 8000);
    const line = `[${new Date().toISOString()}] ${error}\n${stack}\n---\n`;
    try {
        require('fs').appendFileSync(path.join(__dirname, 'crash_log.txt'), line);
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
const setupAllowedInProd = process.env.ALLOW_SETUP_IN_PRODUCTION === 'true';
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
    ];
    for (const sql of indexStatements) {
        await sequelize.query(sql).catch(e => console.warn('[INDEX] Skipped:', e.message));
    }
    console.log('[INDEX] Índices de rendimiento verificados.');

    app.listen(PORT, () => {
        console.log('Server running on port ' + PORT);

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
    });
}).catch(err => {
    console.error('Database connection failed:', err);
});
