// A09 (Security Logging and Monitoring Failures): logger estructurado
// de eventos de seguridad. Mantiene un formato consistente para que sea fácil
// filtrar/agregar (grep "[SECURITY]" o pipear a un sistema externo más adelante).
//
// Eventos esperados:
//   LOGIN_SUCCESS, LOGIN_FAIL_USER_NOT_FOUND, LOGIN_FAIL_BAD_PASSWORD,
//   LOGIN_FAIL_DEACTIVATED, PASSWORD_CHANGED, PASSWORD_RESET_REQUESTED,
//   PASSWORD_RESET_BY_ADMIN, ADMIN_SEEDED

function logSecurityEvent(event, details = {}) {
    const entry = {
        ts: new Date().toISOString(),
        event,
        ...details
    };
    // Una sola línea JSON: fácil de parsear con `jq` o stack remoto
    console.log(`[SECURITY] ${JSON.stringify(entry)}`);
}

function getClientIp(req) {
    if (!req) return null;
    const fwd = req.headers?.['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return req.ip || null;
}

module.exports = { logSecurityEvent, getClientIp };
