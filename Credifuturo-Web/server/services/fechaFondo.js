// Fechas del fondo en el servidor, siempre en la zona horaria de Colombia.
//
// El contenedor de Railway corre en UTC, así que `new Date().toISOString()`
// devuelve la fecha UTC: a partir de las 7:00 p.m. hora de Colombia ya es el
// día siguiente. Cualquier fecha de negocio calculada así queda un día
// adelantada para todo lo que se haga de noche.
//
// Es el mismo criterio que ya usan los cron de respaldo y de snapshots
// (`America/Bogota`) y el helper equivalente del cliente
// (client/src/utils/fechas.js).
//
// OJO: esto es para fechas de NEGOCIO (fecha de baja, de pago, de desembolso).
// Las marcas de tiempo de auditoría —logs de seguridad, `timestamp` de una
// respuesta— deben seguir en UTC con `toISOString()`, que es lo correcto para
// un instante absoluto.

const ZONA_FONDO = 'America/Bogota';

const formateadorISO = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_FONDO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/** Fecha de un momento dado en Colombia, como 'YYYY-MM-DD'. */
function aISOFondo(fecha = new Date()) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(d)) return null;
    return formateadorISO.format(d);
}

/** El día de hoy en Colombia, como 'YYYY-MM-DD'. */
function hoyISOFondo() {
    return aISOFondo(new Date());
}

module.exports = { hoyISOFondo, aISOFondo, ZONA_FONDO };
