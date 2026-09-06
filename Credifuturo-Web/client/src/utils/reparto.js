/**
 * Reparto de utilidades — la parte que la pantalla necesita recalcular sola.
 *
 * La ponderación (en qué mes entró cada peso y cuánto pesa ese mes) tiene UNA
 * sola implementación y vive en el servidor: `server/services/reparto.js`. Es la
 * parte frágil —depende de tres campos de fecha con semánticas distintas— y
 * duplicarla sería garantizar que las dos versiones se separen.
 *
 * Aquí solo está lo que es función de números que el servidor ya envió: aplicar
 * el parámetro de la Junta y repartir la ganancia. Eso permite que el control del
 * premio responda al instante, sin una llamada por cada movimiento del dedo, y
 * que el socio simule un abono sin escribir nada en la base.
 *
 * Regla: si cambia la fórmula del servidor, cambia también aquí. Las dos están
 * cubiertas por `server/pruebas_reparto.js`.
 */

export const MESES_ANIO = 12;
export const NOMBRE_MES = ['Anterior', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * El peso de un mes: enero 100%, julio 50%, diciembre 8%.
 * El mes 0 es el capital que ya estaba antes del año y pesa completo.
 */
export function pesoDeMes(mes) {
    if (mes <= 0) return 1;
    if (mes > MESES_ANIO) return 0;
    return (MESES_ANIO - mes + 1) / MESES_ANIO;
}

/**
 * La base de reparto de un socio: el capital ponderado más el premio.
 *
 * El premio de permanencia se aplica SOLO sobre el capital de apertura que
 * realmente permaneció hasta el cierre. Quien abrió el año con saldo y lo retiró
 * en marzo no conservó nada, y premiarlo por un dinero que ya no está convertiría
 * el incentivo en su contrario.
 */
export function resolverBase(socio, factorPermanencia = 1) {
    if (!socio) return { base: 0, premioPermanencia: 0, factorAplicado: 1 };
    const f = Number(factorPermanencia);
    const factor = Number.isFinite(f) && f >= 1 ? f : 1;
    const premio = (socio.aperturaPermanente || 0) * (factor - 1);
    return {
        base: Math.max(0, (socio.capitalPonderado || 0) + premio),
        premioPermanencia: premio,
        factorAplicado: factor,
    };
}

/**
 * Reparte la ganancia entre las bases sin perder ni un peso (resto mayor / Hare).
 *
 * Redondear la parte de cada socio por separado deja un descuadre de unos pocos
 * pesos entre lo repartido y la ganancia del fondo — y en un acta ese descuadre
 * hay que explicarlo. Aquí los pesos que sobran van, uno a uno, a quienes tenían
 * el resto decimal más alto, así que la suma cuadra siempre.
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

/**
 * El reparto completo, listo para pintar, ordenado de mayor a menor.
 */
export function construirReparto(socios = [], { factorPermanencia = 1, monto = 0 } = {}) {
    const filas = socios.map(s => {
        const { base, premioPermanencia } = resolverBase(s, factorPermanencia);
        return { ...s, base, premioPermanencia };
    });

    const cuotas = repartir(filas.map(f => f.base), monto);

    const conReparto = filas
        .map((f, i) => ({ ...f, participacion: cuotas[i].participacion, utilidad: cuotas[i].utilidad }))
        .sort((a, b) => b.base - a.base || String(a.fullName).localeCompare(String(b.fullName), 'es'));

    const totalRepartido = conReparto.reduce((s, f) => s + f.utilidad, 0);

    return {
        filas: conReparto,
        totalBase: filas.reduce((s, f) => s + f.base, 0),
        totalCapitalPonderado: filas.reduce((s, f) => s + (f.capitalPonderado || 0), 0),
        totalPremio: filas.reduce((s, f) => s + f.premioPermanencia, 0),
        totalRepartido,
        // Que lo repartido cuadre con la ganancia del fondo no es una esperanza:
        // es una propiedad del método. La pantalla lo muestra igualmente, porque
        // una afirmación verificable vale más que una promesa.
        cuadra: totalRepartido === Math.round(Number(monto) || 0),
    };
}
