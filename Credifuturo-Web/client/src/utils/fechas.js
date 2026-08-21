// Fechas del fondo, siempre en la zona horaria de Colombia.
//
// Por qué existe: los formularios calculaban "hoy" con
// `new Date().toISOString().split('T')[0]`, y `toISOString()` devuelve la fecha
// en UTC. Colombia va cinco horas por detrás, así que a partir de las 7:00 p.m.
// hora local el UTC ya es el día siguiente y TODO lo que se registrara de noche
// quedaba fechado mañana: un ahorro anotado el 10 a las 9 p.m. se guardaba como
// del 11.
//
// No es un detalle cosmético. `mesAbonado`/`anioAbonado`, los vencimientos de
// cuota y el cálculo de mora dependen de esa fecha, así que un día de más puede
// cambiar el mes acreditado (una cuota del 31 pasa al mes siguiente) o adelantar
// un vencimiento.
//
// Se fija America/Bogota en vez de usar la zona del dispositivo porque el día
// hábil del fondo es el de Colombia: los cron de respaldo y de snapshots ya usan
// esa zona, y un equipo con la zona mal configurada no debe poder fechar un
// movimiento en otro día.

const ZONA_FONDO = 'America/Bogota';

// `en-CA` da directamente el formato ISO (YYYY-MM-DD), que es lo que esperan
// tanto <input type="date"> como las columnas de fecha de la base.
const formateadorISO = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_FONDO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/**
 * Fecha de un momento dado en Colombia, como 'YYYY-MM-DD'.
 * @param {Date} [fecha] Por defecto, ahora.
 */
export function aISOFondo(fecha = new Date()) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(d)) return '';
    return formateadorISO.format(d);
}

/** El día de hoy en Colombia, como 'YYYY-MM-DD'. Es el valor por defecto de los formularios. */
export function hoyISO() {
    return aISOFondo(new Date());
}

/**
 * Medianoche de hoy en Colombia, como objeto Date, para comparar contra
 * vencimientos sin que la hora del momento actual desplace el resultado.
 */
export function hoyMedianocheFondo() {
    const [a, m, d] = hoyISO().split('-').map(Number);
    return new Date(a, m - 1, d);
}

export default { hoyISO, aISOFondo, hoyMedianocheFondo };
