// Reglas de negocio para el registro de un ahorro mensual/aporte inicial.
// Debe coincidir con la lógica de penalización del backend (server/routes/admin.js) —
// si cambia una, cambia la otra, o el admin verá en pantalla un valor distinto
// al que finalmente se guarda.

export const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_NAME_TO_INDEX = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

const PENALIZACION_POR_DIA = 1000;

export const getMonthIndex = (year, month) => year * 12 + (month - 1);

const getBaseDate = (y, m, d) => {
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return date;
};

// Exención de penalización para socios nuevos: el mes de ingreso (Aporte Inicial)
// y el mes inmediatamente siguiente (primer Mensual) nunca generan penalización,
// sin importar el día de pago.
export const isExentoPenalizacionNuevoSocio = (fechaIngreso, mesAbonado, anioAbonado) => {
    if (!fechaIngreso) return false;
    const [entryYearStr, entryMonthStr] = String(fechaIngreso).split('-');
    const entryYear = parseInt(entryYearStr);
    const entryMonth = parseInt(entryMonthStr);
    if (isNaN(entryYear) || isNaN(entryMonth)) return false;
    const diff = getMonthIndex(anioAbonado, mesAbonado) - getMonthIndex(entryYear, entryMonth);
    return diff >= 0 && diff <= 1;
};

// Si el socio ya tiene un ahorro Mensual registrado para el mismo mes/año de pago,
// cualquier pago adicional ese mes no genera penalización (la cuota ya está cubierta).
const detectarPagoAdicional = ({ savings, clientId, anio, month, isEditing, externalId }) => {
    if (isEditing || !clientId) return null;
    const mesTexto = (month || '').trim().toLowerCase();
    const existente = savings.find(s =>
        String(s.clientId) === String(clientId) &&
        String(s.year) === String(anio) &&
        (s.month || '').trim().toLowerCase() === mesTexto &&
        s.type !== 'Aporte Inicial' &&
        String(s.externalId) !== String(externalId)
    );
    return existente ? { existingId: existente.externalId } : null;
};

// Si el socio no tiene NINGÚN ahorro Mensual en el año, busca los meses adeudados
// (excluyendo el mes de ingreso y su mes de gracia) y calcula la penalización
// acumulada desde el primer mes vencido.
const detectarMesesAdeudados = ({ savings, clientId, anio, mes, isEditing, externalId, fechaIngreso, paymentDate }) => {
    if (isEditing || !clientId) return null;

    const yaTieneAhorroEsteAnio = savings.some(s =>
        String(s.clientId) === String(clientId) &&
        String(s.year) === String(anio) &&
        s.type !== 'Aporte Inicial' &&
        String(s.externalId) !== String(externalId)
    );
    if (yaTieneAhorroEsteAnio) return null;

    let entryMonthIndex = null;
    if (fechaIngreso) {
        const [eYearStr, eMonthStr] = String(fechaIngreso).split('-');
        const eYear = parseInt(eYearStr);
        const eMonth = parseInt(eMonthStr);
        if (!isNaN(eYear) && !isNaN(eMonth)) entryMonthIndex = getMonthIndex(eYear, eMonth);
    }

    const missed = [];
    for (let m = 1; m <= mes; m++) {
        if (entryMonthIndex !== null && getMonthIndex(anio, m) <= entryMonthIndex + 1) continue;
        if (paymentDate > getBaseDate(anio, m, 10)) missed.push(m);
    }
    if (missed.length === 0) return null;

    const startPenaltyDate = getBaseDate(anio, missed[0], 10);
    const days = Math.max(0, Math.floor((paymentDate - startPenaltyDate) / (1000 * 60 * 60 * 24)));

    return {
        months: missed.map(m => MONTH_NAMES[m - 1]).join(', '),
        days,
        penalty: days * PENALIZACION_POR_DIA
    };
};

/**
 * Calcula penalización y valor neto para el formulario de ahorro en curso,
 * replicando la lógica del backend para que el admin vea en pantalla el mismo
 * resultado que se va a guardar.
 *
 * @returns {{
 *   year: number|undefined, mesAbonado: number,
 *   penalizacion: 'SI'|'NO', diasPenalizacion: number,
 *   valorAPenalizar: number, valorAhorrado: number,
 *   pagoAdicionalInfo: {existingId: string}|null,
 *   dormantInfo: {months: string, penalty: number}|null
 * }}
 */
export const calcularAhorro = ({ date, month, anioAbonado, amount, clientId, isEditing, externalId, fechaIngresoCliente, savings }) => {
    const [yearStr, monthStr, dayStr] = (date || '').split('-');
    const dia = parseInt(dayStr);
    const anio = parseInt(yearStr);
    const mes = parseInt(monthStr);
    const paymentDate = getBaseDate(anio, mes, dia);

    const mesAbonadoCalc = MONTH_NAME_TO_INDEX[(month || '').toLowerCase().trim()] || mes;
    const anioAbonadoUser = parseInt(anioAbonado) || anio;
    const monto = parseFloat(amount) || 0;

    const isPagoAdelantado = (anioAbonadoUser > anio) || (anioAbonadoUser === anio && mesAbonadoCalc > mes);
    const isPagoAtrasado = (anioAbonadoUser < anio) || (anioAbonadoUser === anio && mesAbonadoCalc < mes);
    const isNuevoSocioExento = isExentoPenalizacionNuevoSocio(fechaIngresoCliente, mesAbonadoCalc, anioAbonadoUser);
    const pagoAdicionalInfo = detectarPagoAdicional({ savings, clientId, anio, month, isEditing, externalId });

    let penalizacion = 'NO';
    let diasPenalizacion = 0;
    let valorAPenalizar = 0;

    if (!pagoAdicionalInfo && !isNuevoSocioExento) {
        if (isPagoAtrasado) {
            penalizacion = 'SI';
            const targetDate = getBaseDate(anioAbonadoUser, mesAbonadoCalc - 1, 10);
            diasPenalizacion = Math.max(0, Math.floor((paymentDate - targetDate) / (1000 * 60 * 60 * 24)));
            valorAPenalizar = diasPenalizacion * PENALIZACION_POR_DIA;
        } else if (dia > 10 && !isPagoAdelantado) {
            penalizacion = 'SI';
            diasPenalizacion = dia - 10;
            valorAPenalizar = diasPenalizacion * PENALIZACION_POR_DIA;
        }
    }

    let dormantInfo = null;
    if (!pagoAdicionalInfo) {
        const missedInfo = detectarMesesAdeudados({ savings, clientId, anio, mes, isEditing, externalId, fechaIngreso: fechaIngresoCliente, paymentDate });
        if (missedInfo) {
            if (missedInfo.penalty > valorAPenalizar) {
                valorAPenalizar = missedInfo.penalty;
                diasPenalizacion = missedInfo.days;
                penalizacion = 'SI';
            }
            dormantInfo = { months: missedInfo.months, penalty: valorAPenalizar };
        }
    }

    return {
        year: isNaN(anio) ? undefined : anio,
        mesAbonado: mesAbonadoCalc,
        penalizacion,
        diasPenalizacion,
        valorAPenalizar,
        valorAhorrado: monto - valorAPenalizar,
        pagoAdicionalInfo,
        dormantInfo
    };
};

// Siguiente ID secuencial disponible con un prefijo dado, a partir del mayor
// existente en `list` (ej. autoIncrementId(savings, { prefix: 'AM', start: 339 })
// → "AM339", "AM340"...; autoIncrementId(savings, { prefix: 'AI', start: 1, pad: 3 })
// → "AI001", "AI002"...). Usado tanto por el formulario de Ahorros como por el
// de Aportes Iniciales — mismo concepto, prefijo/formato distintos.
export const autoIncrementId = (list, { prefix, start = 1, pad = 0 }) => {
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    const numbers = (list || [])
        .map(item => item.externalId)
        .filter(id => id && pattern.test(id))
        .map(id => parseInt(id.match(pattern)[1], 10))
        .filter(n => !isNaN(n));
    const next = numbers.length === 0 ? start : Math.max(...numbers) + 1;
    return `${prefix}${String(next).padStart(pad, '0')}`;
};
