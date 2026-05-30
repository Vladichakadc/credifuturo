// A07 + A09: detector de patrones sospechosos en logins fallidos.
// Complementa el rate limiter por IP (que ya bloquea 10/15min) detectando:
//   - Ataques distribuidos contra UNA MISMA cédula desde IPs distintas
//   - Patrones lentos que pasan bajo el rate limit por IP
//
// Mantiene un contador en memoria — se reinicia al reiniciar el server.
// Es deliberadamente simple: si el umbral se cruza, emite una sola alerta
// SECURITY_ALERT_BRUTE_FORCE_SUSPECTED y resetea el contador para no spamear.
//
// Para producción seria, sustituir el Map por Redis con TTL.

const { logSecurityEvent } = require('./securityLogger');

const WINDOW_MS = 10 * 60 * 1000;     // 10 minutos
const THRESHOLD_PER_CEDULA = 5;         // 5 fallos a la misma cédula
const THRESHOLD_PER_IP = 15;            // 15 fallos desde la misma IP

const failuresByCedula = new Map(); // cedula → [{ ts, ip }]
const failuresByIp = new Map();     // ip → [{ ts, cedula }]

function prune(arr) {
    const cutoff = Date.now() - WINDOW_MS;
    return arr.filter(e => e.ts >= cutoff);
}

function recordLoginFailure({ cedula, ip, reason }) {
    const now = Date.now();
    const cedulaKey = (cedula || '').trim() || '(unknown)';
    const ipKey = ip || '(unknown)';

    const cedulaHistory = prune(failuresByCedula.get(cedulaKey) || []);
    cedulaHistory.push({ ts: now, ip: ipKey });
    failuresByCedula.set(cedulaKey, cedulaHistory);

    const ipHistory = prune(failuresByIp.get(ipKey) || []);
    ipHistory.push({ ts: now, cedula: cedulaKey });
    failuresByIp.set(ipKey, ipHistory);

    if (cedulaHistory.length >= THRESHOLD_PER_CEDULA) {
        const uniqueIps = new Set(cedulaHistory.map(e => e.ip)).size;
        logSecurityEvent('ALERT_BRUTE_FORCE_SUSPECTED', {
            target: 'cedula',
            cedula: cedulaKey,
            failuresInWindow: cedulaHistory.length,
            uniqueIps,
            windowMinutes: WINDOW_MS / 60000,
            reason
        });
        failuresByCedula.delete(cedulaKey);
    }

    if (ipHistory.length >= THRESHOLD_PER_IP) {
        const uniqueCedulas = new Set(ipHistory.map(e => e.cedula)).size;
        logSecurityEvent('ALERT_BRUTE_FORCE_SUSPECTED', {
            target: 'ip',
            ip: ipKey,
            failuresInWindow: ipHistory.length,
            uniqueCedulas,
            windowMinutes: WINDOW_MS / 60000,
            reason
        });
        failuresByIp.delete(ipKey);
    }
}

function recordLoginSuccess({ cedula }) {
    // Login exitoso limpia el contador de la cédula — evita ruido tras intentos fallidos legítimos.
    if (cedula) failuresByCedula.delete(cedula.trim());
}

module.exports = { recordLoginFailure, recordLoginSuccess };
