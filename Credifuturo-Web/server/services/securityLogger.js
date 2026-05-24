// A09 (Security Logging and Monitoring Failures): logger estructurado
// de eventos de seguridad.
//
// - Cada evento se emite como una línea JSON precedida de '[SECURITY] '
//   a consola (visible en logs del proceso) Y a `logs/security.log`
//   (append-only, para análisis offline / agregadores externos).
// - El archivo está fuera de git (.gitignore excluye *.log) y rota por
//   tamaño manual — en operación seria, conectar a un agregador externo
//   (Loki, CloudWatch, Papertrail) leyendo este archivo.
//
// Eventos esperados:
//   LOGIN_SUCCESS, LOGIN_FAIL_USER_NOT_FOUND, LOGIN_FAIL_BAD_PASSWORD,
//   LOGIN_FAIL_DEACTIVATED, PASSWORD_CHANGED,
//   PASSWORD_CHANGE_FAIL_BAD_CURRENT, PASSWORD_RESET_REQUESTED,
//   PASSWORD_RESET_BY_ADMIN, PASSWORD_ROTATED_COMPROMISED,
//   CLIENT_CREATED, ADMIN_SEEDED,
//   ALERT_BRUTE_FORCE_SUSPECTED

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'security.log');

try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
    console.warn('[securityLogger] no se pudo crear directorio de logs:', e.message);
}

function logSecurityEvent(event, details = {}) {
    const entry = {
        ts: new Date().toISOString(),
        event,
        ...details
    };
    const line = `[SECURITY] ${JSON.stringify(entry)}`;
    console.log(line);
    try {
        fs.appendFileSync(LOG_FILE, line + '\n');
    } catch (e) {
        // No interrumpir el flujo de la request si el filesystem falla
        console.warn('[securityLogger] no se pudo persistir evento:', e.message);
    }
}

function getClientIp(req) {
    if (!req) return null;
    const fwd = req.headers?.['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return req.ip || null;
}

module.exports = { logSecurityEvent, getClientIp, LOG_FILE };
