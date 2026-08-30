// Rastreo de la última actividad por usuario autenticado. Permite estimar
// cuánto lleva conectado un socio en su sesión más reciente y quién está en
// línea ahora mismo (menú "Registros de Acceso").
//
// Dos capas, a propósito:
//
//   - Un Map en memoria, que es el que se lee en caliente. Es exacto y gratis.
//   - Una copia en la tabla SessionActivities, que es la que sobrevive a un
//     reinicio. Antes solo existía el Map, así que cada despliegue —y en este
//     fondo hay varios por semana— dejaba a todos los socios sin duración de
//     sesión: la columna salía vacía para todo lo anterior al arranque.
//
// La escritura en base va limitada. Un socio navegando genera decenas de
// peticiones por minuto y `touch()` corre en TODAS: guardar cada una
// convertiría la ruta más caliente de la aplicación en una escritura por
// request sin ganar un solo dato útil, porque lo único que interesa es el
// último minuto aproximado.

const PERIODO_ESCRITURA_MS = 2 * 60 * 1000; // como mucho una escritura cada 2 min por socio

const lastActivity = new Map();
const ultimaEscritura = new Map();

function guardar(userId, ahora) {
    // Se carga aquí y no arriba para no atar este módulo al orden de carga de
    // los modelos: el middleware de autenticación se monta antes del sync().
    const SessionActivity = require('../models/SessionActivity');
    return SessionActivity.upsert({ clientId: userId, lastSeenAt: new Date(ahora) });
}

function touch(userId) {
    if (!userId) return;
    const ahora = Date.now();
    lastActivity.set(userId, ahora);

    const previa = ultimaEscritura.get(userId) || 0;
    if (ahora - previa < PERIODO_ESCRITURA_MS) return;
    // Se marca ANTES de escribir: si la escritura falla no se reintenta en la
    // siguiente petición, que llegaría en milisegundos.
    ultimaEscritura.set(userId, ahora);

    // Sin await y con captura propia: registrar actividad no puede demorar ni
    // tumbar la petición del socio. Si falla, el valor en memoria sigue bien y
    // lo único que se pierde es la precisión tras un reinicio.
    try {
        guardar(userId, ahora).catch(e => {
            console.warn('[sessionActivity] no se pudo guardar última actividad:', e.message);
        });
    } catch (e) {
        console.warn('[sessionActivity] no se pudo guardar última actividad:', e.message);
    }
}

function getLastActivity(userId) {
    return lastActivity.get(userId) || null;
}

/**
 * Vuelca la tabla al Map al arrancar, para que las sesiones anteriores al
 * reinicio conserven su duración en la pantalla. Sin esto, persistir no
 * serviría de nada: el endpoint lee del Map.
 */
async function precargarDesdeBase() {
    const SessionActivity = require('../models/SessionActivity');
    const filas = await SessionActivity.findAll({ attributes: ['clientId', 'lastSeenAt'] });
    for (const f of filas) {
        const ms = new Date(f.lastSeenAt).getTime();
        if (!Number.isFinite(ms)) continue;
        // Nunca pisar un dato en memoria más reciente que el guardado.
        if ((lastActivity.get(f.clientId) || 0) < ms) lastActivity.set(f.clientId, ms);
    }
    return filas.length;
}

module.exports = { touch, getLastActivity, precargarDesdeBase };
