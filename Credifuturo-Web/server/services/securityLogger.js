// A09 (Security Logging and Monitoring Failures): logger estructurado
// de eventos de seguridad.
//
// - Cada evento se emite como una línea JSON precedida de '[SECURITY] '
//   a consola (visible en logs del proceso), a `logs/security.log`
//   (append-only, para análisis offline / agregadores externos) Y a la
//   tabla SecurityEvents, que es de donde leen las pantallas.
// - El archivo está fuera de git (.gitignore excluye *.log) y rota por
//   tamaño manual — en operación seria, conectar a un agregador externo
//   (Loki, CloudWatch, Papertrail) leyendo este archivo.
// - La base es la copia que importa: el disco del contenedor es efímero en
//   Railway y cada despliegue borraba el archivo entero, así que la auditoría
//   de acceso se perdía cada pocos días. El volumen persistente está montado
//   donde vive la base de datos, no donde viven los logs.
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

// Reparte un evento entre las columnas que las pantallas leen por nombre y el
// JSON de `extra`, que recoge todo lo demás sin obligar a migrar la tabla.
function persistirEnBase(entry) {
    const { ts, event, userId, targetClientId, cedula, role, ip, mustChangePassword, ...resto } = entry;
    // Se carga aquí y no arriba para no atar este módulo al orden de carga de
    // los modelos: `securityLogger` lo usan las rutas de auth, que se montan
    // antes de que sequelize.sync() haya corrido.
    const SecurityEvent = require('../models/SecurityEvent');
    return SecurityEvent.create({
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
    // Sin await: un evento de auditoría no puede demorar ni tumbar la petición
    // que lo genera. Si la escritura falla, el evento sigue en consola y en el
    // archivo, que es exactamente el respaldo para el que están.
    try {
        persistirEnBase(entry).catch(e => {
            console.warn('[securityLogger] no se pudo guardar en base:', e.message);
        });
    } catch (e) {
        console.warn('[securityLogger] no se pudo guardar en base:', e.message);
    }
}

function getClientIp(req) {
    if (!req) return null;
    const fwd = req.headers?.['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return req.ip || null;
}

module.exports = { logSecurityEvent, getClientIp, LOG_FILE };
