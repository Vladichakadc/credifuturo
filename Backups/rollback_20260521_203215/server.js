require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request Logger (Debug Phase 1)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2).substring(0, 1000)); // Limit log size
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

// Simple connection test
app.get('/', (req, res) => {
    res.send('Credifuturo API Running');
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/user', require('./routes/user'));

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
