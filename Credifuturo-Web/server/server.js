require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
app.use(cors({
    origin: isProduction
        ? true  // mismo origen — frontend servido por Express, CORS no aplica
        : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// Servir frontend React en producción
if (isProduction) {
    const clientDist = path.join(__dirname, '..', 'client', 'dist');
    app.use(express.static(clientDist));
}

// Request Logger — excluye rutas de auth para no exponer contraseñas en consola
app.use((req, res, next) => {
    const isSensitiveRoute = req.url.startsWith('/api/auth');
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (!isSensitiveRoute && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2).substring(0, 500));
    }
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

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/user', require('./routes/user'));

// En producción: cualquier ruta no-API devuelve el index.html de React
if (isProduction) {
    app.get('*', (_req, res) => {
        res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    });
}

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 SERVER ERROR:', err);
    res.status(500).json({
        ok: false,
        error: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ── One-time database restore endpoint (gated by SETUP_KEY env var) ──────────
// Usage: curl -X POST -F "db=@database.sqlite" -H "X-Setup-Key: <value>" <url>/api/setup/restore-db
// Disable by removing SETUP_KEY from env vars after use.
if (process.env.SETUP_KEY) {
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
    console.log('[SETUP] Database restore endpoint enabled at /api/setup/restore-db');

    // One-time password reset: POST /api/setup/reset-password { email, newPassword }
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
    console.log('[SETUP] Password reset endpoint enabled at /api/setup/reset-password');

    // Database download: GET /api/setup/download-db (header: X-Setup-Key)
    // Allows pulling the production SQLite back to local for syncing development data.
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
    console.log('[SETUP] Database download endpoint enabled at /api/setup/download-db');
}

// Sync Database and Start Server
// Using sync() without alter to avoid SQLite migration issues with foreign keys
// The new column fechaBaja has been verified to exist manually.
sequelize.sync().then(async () => {
    console.log('Database synced');

    // Auto-seed admin if no admin user exists (e.g. first deploy with empty DB)
    try {
        const adminCount = await Client.count({ where: { role: 'admin' } });
        if (adminCount === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await Client.create({
                name: 'Admin', surname1: 'Sistema', cedula: '0000000000',
                email: 'admin@credifuturo.com', password: hash,
                role: 'admin', estatus: 'Activo', customerId: 'ADM001',
                mustChangePassword: false
            });
            console.log('[SEED] Admin creado: admin@credifuturo.com / admin123  ← cambiar contraseña después de ingresar');
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
app.post('/api/admin/log-crash', (req, res) => { require('fs').writeFileSync(path.join(__dirname, 'crash_log.txt'), req.body.error + '\n' + req.body.stack); res.send('ok'); });
