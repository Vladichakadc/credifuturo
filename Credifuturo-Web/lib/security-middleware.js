// Middleware de seguridad para apps Express.
// Requiere: npm install helmet express-rate-limit hpp cors
// Uso en app.js / index.js:
//   const setupSecurity = require('./lib/security-middleware');
//   setupSecurity(app, { origins: ['https://tudominio.com'] });

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const cors = require('cors');

function setupSecurity(app, options = {}) {
  const origins = options.origins || [];

  // Cabeceras seguras
  app.use(helmet());

  // Proteccion contra HTTP Parameter Pollution
  app.use(hpp());

  // CORS: solo origenes permitidos
  app.use(cors({
    origin: origins.length ? origins : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }));

  // Rate limit basico
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: options.maxRequests || 100,
    standardHeaders: true,
    legacyHeaders: false
  }));

  // NOTA CSRF: el paquete csurf esta deprecado y no se incluye.
  // Si tu app usa cookies de sesion con formularios, considera "csrf-csrf".
  // Si es una API pura con tokens (Bearer/JWT), CSRF no aplica.

  // Cookies seguras (al hacer res.cookie):
  // res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'lax' });
}

module.exports = setupSecurity;
