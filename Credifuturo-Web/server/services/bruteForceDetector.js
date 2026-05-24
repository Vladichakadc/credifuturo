// A07 + A09: detector de patrones sospechosos en logins fallidos.
// Complementa el rate limiter por IP (que ya bloquea 10/15min) detectando:
//   - Ataques distribuidos contra UN MISMO usuario desde IPs distintas
//   - Patrones lentos que pasan bajo el rate limit por IP
//
// Mantiene un contador en memoria — se reinicia al reiniciar el server.
// Es deliberadamente simple: si el umbral se cruza, emite una sola alerta
// SECURITY_ALERT_BRUTE_FORCE_SUSPECTED y resetea el contador para no spamear.
//
// Para producción seria, sustituir el Map por Redis con TTL.

const { logSecurityEvent } = require('./securityLogger');

const WINDOW_MS = 10 * 60 * 1000;     // 10 minutos
const THRESHOLD_PER_EMAIL = 5;          // 5 fallos al mismo email
const THRESHOLD_PER_IP = 15;            // 15 fallos desde la misma IP

const failuresByEmail = new Map(); // email → [{ ts, ip }]
const failuresByIp = new Map();    // ip → [{ ts, email }]

function prune(arr) {
    const cutoff = Date.now() - WINDOW_MS;
    return arr.filter(e => e.ts >= cutoff);
}

function recordLoginFailure({ email, ip, reason }) {
    const now = Date.now();
    const emailKey = (email || '').toLowerCase().trim() || '(unknown)';
    const ipKey = ip || '(unknown)';

    const emailHistory = prune(failuresByEmail.get(emailKey) || []);
    emailHistory.push({ ts: now, ip: ipKey });
    failuresByEmail.set(emailKey, emailHistory);

    const ipHistory = prune(failuresByIp.get(ipKey) || []);
    ipHistory.push({ ts: now, email: emailKey });
    failuresByIp.set(ipKey, ipHistory);

    if (emailHistory.length >= THRESHOLD_PER_EMAIL) {
        const uniqueIps = new Set(emailHistory.map(e => e.ip)).size;
        logSecurityEvent('ALERT_BRUTE_FORCE_SUSPECTED', {
            target: 'email',
            email: emailKey,
            failuresInWindow: emailHistory.length,
            uniqueIps,
            windowMinutes: WINDOW_MS / 60000,
            reason
        });
        failuresByEmail.delete(emailKey);
    }

    if (ipHistory.length >= THRESHOLD_PER_IP) {
        const uniqueEmails = new Set(ipHistory.map(e => e.email)).size;
        logSecurityEvent('ALERT_BRUTE_FORCE_SUSPECTED', {
            target: 'ip',
            ip: ipKey,
            failuresInWindow: ipHistory.length,
            uniqueEmails,
            windowMinutes: WINDOW_MS / 60000,
            reason
        });
        failuresByIp.delete(ipKey);
    }
}

function recordLoginSuccess({ email, ip }) {
    // Login exitoso limpia el contador del email — evita ruido tras intentos fallidos legítimos.
    if (email) failuresByEmail.delete(email.toLowerCase().trim());
}

module.exports = { recordLoginFailure, recordLoginSuccess };
