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

// Sync Database and Start Server
// Using sync() without alter to avoid SQLite migration issues with foreign keys
// The new column fechaBaja has been verified to exist manually.
sequelize.sync().then(async () => {
    console.log('Database synced');

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
