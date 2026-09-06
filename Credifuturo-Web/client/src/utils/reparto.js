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

/** Días entre dos fechas 'YYYY-MM-DD', ambas inclusive. */
export function diasInclusive(desde, hasta) {
    const a = Date.parse(`${desde}T00:00:00Z`);
    const b = Date.parse(`${hasta}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.round((b - a) / 86400000) + 1;
}

/**
 * El peso de una fecha: los días que ese dinero alcanza a trabajar en el año,
 * sobre los días del año. 1 de enero 100%, 1 de julio ~50%, 31 de diciembre ~0%.
 *
 * Antes se calculaba por mes y todo julio pesaba igual. El fondo tiene el dinero
 * en la cuenta NU desde el día que entra, y ahí el rendimiento se liquida por
 * día: quien consignó el 1 le dio treinta días más de trabajo que quien consignó
 * el 30. Es la misma fórmula del servidor, que sigue siendo la autoridad.
 */
export function pesoDeFecha(fechaISO, periodo) {
    if (!fechaISO || !periodo?.inicio || !periodo?.fin || !periodo?.dias) return 0;
    if (fechaISO < periodo.inicio) return 1;
    if (fechaISO > periodo.fin) return 0;
    return diasInclusive(fechaISO, periodo.fin) / periodo.dias;
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
/**
 * Lo que el fondo retiene antes de repartir. Espejo del servidor —
 * `services/reparto.js`, que sigue siendo la autoridad y el que valida.
 *
 * La ganancia no se toca: es un hecho contable que declara el Panel de
 * Administración. Lo que la asamblea decide es cuánto se queda el fondo y para
 * qué, y lo repartido es la resta. Así las tres cifras quedan separadas y
 * auditables en el acta, en vez de un único número editable que nadie puede
 * volver a explicar seis meses después.
 */
export function esPorSocio(regla) {
    return regla?.alcance === 'porSocio';
}

export function calcularRetencion(ganancia, retencion) {
    const G = Math.max(0, Math.round(Number(ganancia) || 0));
    const v = Number(retencion?.valor);
    if (!G || !Number.isFinite(v) || v <= 0) return { retenido: 0, aRepartir: G };
    // Por socio no se aparta nada de la bolsa: se reparte todo y se le cobra a
    // cada uno sobre su parte. Es lo que convierte un valor fijo en una cuota
    // por cabeza en vez de una tajada del total.
    if (esPorSocio(retencion)) return { retenido: 0, aRepartir: G };
    const retenido = retencion.tipo === 'porcentaje'
        ? Math.round(G * Math.min(100, v) / 100)
        : Math.min(G, Math.round(v));
    return { retenido, aRepartir: G - retenido };
}

/**
 * El descuento sobre la parte de UN socio. Lo descontado se queda en el fondo,
 * junto a la retención general — nunca se reparte entre los demás.
 *
 * Repartirlo convertiría una medida sobre una persona en una ganancia para sus
 * compañeros, y en un fondo de veinticinco personas que se conocen ese
 * incentivo no se puede permitir.
 */
export function calcularDescuento(utilidadBruta, descuento) {
    const U = Math.max(0, Math.round(Number(utilidadBruta) || 0));
    const v = Number(descuento?.valor);
    if (!U || !Number.isFinite(v) || v <= 0) return 0;
    return descuento.tipo === 'porcentaje'
        ? Math.round(U * Math.min(100, v) / 100)
        : Math.min(U, Math.round(v));
}

/**
 * El aporte que la retención "por socio" le cobra a ESTE socio: la misma regla
 * aplicada a todos de una vez, para no tener que ir socio por socio.
 *
 * Se topa en su parte, igual que un descuento individual. Por eso lo recaudado
 * puede quedar por debajo de «valor × socios» y la pantalla lo dice: contar con
 * una plata que nunca llegó es peor que recaudar menos.
 */
export function calcularAporteSocio(utilidadBruta, retencion) {
    if (!esPorSocio(retencion)) return 0;
    return calcularDescuento(utilidadBruta, retencion);
}

/**
 * El reparto completo, listo para pintar, ordenado de mayor a menor.
 *
 * El orden de las operaciones importa y es el del acta:
 *
 *   1. la ganancia del fondo (hecho)
 *   2. − la retención general        → se queda en el fondo
 *   3. el resto se reparte en proporción al capital ponderado
 *   4. − el descuento de cada socio  → se queda en el fondo
 *
 * De ahí sale la única igualdad que un acta puede firmar:
 *
 *   ganancia = repartido + retención general + descuentos
 *
 * Nada se pierde y nada aparece.
 */
export function construirReparto(socios = [], { factorPermanencia = 1, monto = 0, retencion = null, descuentos = {} } = {}) {
    const ganancia = Math.max(0, Math.round(Number(monto) || 0));
    const { retenido, aRepartir } = calcularRetencion(ganancia, retencion);

    const filas = socios.map(s => {
        const { base, premioPermanencia } = resolverBase(s, factorPermanencia);
        return { ...s, base, premioPermanencia };
    });

    const cuotas = repartir(filas.map(f => f.base), aRepartir);

    const conReparto = filas
        .map((f, i) => {
            const utilidadBruta = cuotas[i].utilidad;
            const regla = descuentos?.[f.id] || descuentos?.[String(f.id)] || null;
            // Los dos caminos se suman en vez de reemplazarse: "todos aportan
            // $50.000 al fondo de calamidad" y "a Juan se le descuentan $200.000"
            // son dos decisiones distintas de la asamblea, y una no anula la otra.
            // Ambos se miden sobre la parte íntegra del socio —así un "10%" es el
            // 10% de lo suyo, se mire por donde se mire— y la SUMA se topa en esa
            // parte: se le puede dejar en cero, nunca debiendo.
            const aporteGeneral = calcularAporteSocio(utilidadBruta, retencion);
            const descuentoIndividual = calcularDescuento(utilidadBruta, regla);
            const descuento = Math.min(utilidadBruta, aporteGeneral + descuentoIndividual);
            return {
                ...f,
                participacion: cuotas[i].participacion,
                utilidadBruta,
                aporteGeneral,
                descuentoIndividual,
                descuento,
                descuentoRegla: regla,
                utilidad: utilidadBruta - descuento,
            };
        })
        .sort((a, b) => b.base - a.base || String(a.fullName).localeCompare(String(b.fullName), 'es'));

    const totalRepartido = conReparto.reduce((s, f) => s + f.utilidad, 0);
    const totalDescuentos = conReparto.reduce((s, f) => s + f.descuento, 0);
    const totalAporteGeneral = conReparto.reduce((s, f) => s + f.aporteGeneral, 0);
    const totalDescuentosIndividuales = totalDescuentos - totalAporteGeneral;
    // Cuántos socios cargan la cuota por cabeza, y cuánto daría si a todos les
    // alcanzara la parte. Con un valor fijo, a quien le corresponden $12.000 no
    // se le pueden cobrar $50.000, así que lo recaudado queda por debajo — y esa
    // diferencia se informa, porque un fondo que presupuesta «$50.000 × 25» y
    // recauda menos descubre el hueco cuando ya lo gastó.
    const aportantes = conReparto.filter(f => f.utilidadBruta > 0).length;
    const aporteTeorico = esPorSocio(retencion)
        ? conReparto.reduce((s, f) => s + (f.utilidadBruta > 0
            ? (retencion.tipo === 'porcentaje'
                ? Math.round(f.utilidadBruta * Math.min(100, Number(retencion.valor) || 0) / 100)
                : Math.round(Number(retencion.valor) || 0))
            : 0), 0)
        : 0;

    return {
        filas: conReparto,
        ganancia,
        retenido,
        aRepartir,
        totalDescuentos,
        totalAporteGeneral,
        totalDescuentosIndividuales,
        aportantes,
        aporteTeorico,
        // Lo que la cuota por cabeza no alcanzó a cobrar porque a algún socio no
        // le daba la parte. Cero en el caso normal.
        aporteNoCubierto: Math.max(0, aporteTeorico - totalAporteGeneral),
        porSocio: esPorSocio(retencion),
        // Lo que se queda el fondo, por los dos caminos juntos: es la cifra que
        // el acta necesita para decir "y esto quedó para el fondo".
        totalRetenido: retenido + totalDescuentos,
        totalBase: filas.reduce((s, f) => s + f.base, 0),
        totalCapitalBase: filas.reduce((s, f) => s + (f.capitalBase || 0), 0),
        totalCapitalPonderado: filas.reduce((s, f) => s + (f.capitalPonderado || 0), 0),
        totalPremio: filas.reduce((s, f) => s + f.premioPermanencia, 0),
        totalRepartido,
        // Que todo cuadre no es una esperanza: es una propiedad del método. La
        // pantalla lo muestra igualmente, porque una afirmación verificable vale
        // más que una promesa.
        cuadra: totalRepartido + retenido + totalDescuentos === ganancia,
    };
}
