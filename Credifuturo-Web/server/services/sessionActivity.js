// Rastreo en memoria de la última actividad por usuario autenticado.
// Permite estimar cuánto tiempo lleva conectado un socio en su sesión
// más reciente (para el menú "Logs"). Se reinicia al reiniciar el
// servidor — es una aproximación, no un registro persistente.

const lastActivity = new Map();

function touch(userId) {
    if (userId) lastActivity.set(userId, Date.now());
}

function getLastActivity(userId) {
    return lastActivity.get(userId) || null;
}

module.exports = { touch, getLastActivity };
