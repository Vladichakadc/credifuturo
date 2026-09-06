/**
 * Reparto de utilidades — la parte que la pantalla necesita recalcular sola.
 *
 * La ponderación por tiempo (qué día entró cada peso y cuántos días trabajó)
 * tiene UNA sola implementación y vive en el servidor: `server/services/reparto.js`.
 * Es la parte frágil —depende de tres campos de fecha con semánticas distintas—
 * y duplicarla sería garantizar que las dos versiones se separen.
 *
 * Aquí solo está lo que es función de números que el servidor ya envió:
 * aplicar los parámetros de la Junta y repartir el monto. Eso permite que los
 * deslizadores del panel respondan al instante, sin una llamada por cada
 * movimiento del dedo, y que el socio simule un abono sin escribir nada en la
 * base.
 *
 * Regla: si cambia la fórmula del servidor, cambia también aquí. Las dos están
 * cubiertas por `server/pruebas_reparto.js`.
 */

/**
 * La base de reparto de un socio: el hecho aritmético más la política.
 *
 * El premio de permanencia se aplica SOLO sobre el saldo de apertura que
 * realmente permaneció hasta el corte. Quien abrió el año con saldo y lo retiró
 * en marzo no conservó nada, y premiarlo por un saldo que ya no está convertiría
 * el incentivo en su contrario.
 */
export function resolverBase(agg, factorPermanencia = 1) {
    if (!agg) return { base: 0, premioPermanencia: 0, factorAplicado: 1 };
    const f = Number(factorPermanencia);
    const factor = Number.isFinite(f) && f >= 1 ? f : 1;
    const premio = (agg.aperturaPermanente || 0) * (factor - 1);
    return {
        base: Math.max(0, (agg.saldoPromedio || 0) + premio),
        premioPermanencia: premio,
        factorAplicado: factor,
    };
}

/**
 * Reparte un monto entero sin perder ni un peso (resto mayor / Hare).
 *
 * Redondear la parte de cada socio por separado deja un descuadre de unos pocos
 * pesos entre lo repartido y lo que la Junta aprobó — y en un acta ese descuadre
 * hay que explicarlo. Aquí los pesos que sobran del redondeo van, uno a uno, a
 * quienes tenían el resto decimal más alto, así que la suma cuadra siempre.
 */
export function repartir(bases, monto) {
    const limpias = bases.map(b => Math.max(0, Number(b) || 0));
    const total = limpias.reduce((s, b) => s + b, 0);
    const M = Math.round(Number(monto) || 0);

    if (!(total > 0) || M <= 0) return limpias.map(() => ({ participacion: 0, utilidad: 0 }));

    const exactos = limpias.map(b => (b / total) * M);
    const enteros = exactos.map(v => Math.floor(v));
    let sobrante = M - enteros.reduce((s, v) => s + v, 0);

    exactos
        .map((v, i) => ({ i, resto: v - Math.floor(v) }))
        .sort((a, b) => b.resto - a.resto || a.i - b.i)
        .forEach(({ i }) => { if (sobrante > 0) { enteros[i] += 1; sobrante--; } });

    return limpias.map((b, i) => ({ participacion: b / total, utilidad: enteros[i] }));
}

/** Días entre dos fechas 'YYYY-MM-DD', ambas inclusive. */
export function diasInclusive(desde, hasta) {
    const a = Date.parse(`${desde}T00:00:00Z`);
    const b = Date.parse(`${hasta}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.round((b - a) / 86400000) + 1;
}

/**
 * Cuánto pesaría un abono hecho un día concreto. Es la fórmula del servidor,
 * en una línea, y solo se usa para el simulador — nunca para una cifra real.
 */
export function factorDeDia(fechaISO, periodo) {
    if (!periodo?.inicio || !periodo?.corte || !periodo?.dias) return 0;
    const dia = fechaISO < periodo.inicio ? periodo.inicio : fechaISO;
    if (dia > periodo.corte) return 0;
    return Math.max(0, Math.min(1, diasInclusive(dia, periodo.corte) / periodo.dias));
}

/**
 * El reparto completo, listo para pintar.
 *
 * Devuelve las filas ordenadas por participación descendente para que los
 * cálculos internos (residuo del redondeo, acumulados) sean estables, pero la
 * pantalla ordena como quiera: el orden por monto NO es la lectura por defecto
 * de esta pantalla — ver el comentario del componente.
 */
export function construirReparto(socios = [], { factorPermanencia = 1, incluyeAporteInicial = false, monto = 0 } = {}) {
    const filas = socios.map(s => {
        const agg = incluyeAporteInicial ? s.conAporteInicial : s.sinAporteInicial;
        const { base, premioPermanencia } = resolverBase(agg, factorPermanencia);
        return { ...s, agg, base, premioPermanencia };
    });

    const cuotas = repartir(filas.map(f => f.base), monto);
    const totalBase = filas.reduce((s, f) => s + f.base, 0);

    const conReparto = filas.map((f, i) => ({
        ...f,
        participacion: cuotas[i].participacion,
        utilidad: cuotas[i].utilidad,
    })).sort((a, b) => b.base - a.base);

    return {
        filas: conReparto,
        totalBase,
        totalSaldoPromedio: filas.reduce((s, f) => s + (f.agg?.saldoPromedio || 0), 0),
        totalPremio: filas.reduce((s, f) => s + f.premioPermanencia, 0),
        totalRepartido: conReparto.reduce((s, f) => s + f.utilidad, 0),
        // Que lo repartido cuadre con lo aprobado no es una esperanza: es una
        // propiedad del método. La pantalla lo muestra igualmente, porque una
        // afirmación verificable vale más que una promesa.
        cuadra: conReparto.reduce((s, f) => s + f.utilidad, 0) === Math.round(Number(monto) || 0),
    };
}
