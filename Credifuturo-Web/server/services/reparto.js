/**
 * Reparto de utilidades — la aritmética, sin base de datos.
 *
 * El fondo reparte su ganancia entre los socios en proporción al CAPITAL que cada
 * uno puso a trabajar, PONDERADO POR LOS MESES que ese dinero estuvo disponible
 * para prestar. Es el método con el que los bancos y las entidades de ahorro
 * reparten rendimientos: un peso que entró en enero trabaja los doce meses del
 * año y pesa 100%; uno que entró en julio trabaja seis y pesa 50%.
 *
 *     capitalPonderado = Σ ( importe × meses que trabajará ÷ 12 )
 *
 * No es un promedio ni un saldo medio: es la suma de cada aporte multiplicado por
 * su peso. Cada línea del cálculo se puede leer, verificar y explicar por
 * separado, que es lo que hace falta para defender un reparto en una asamblea.
 *
 * Todo lo que hay aquí son funciones puras sobre números y fechas. La ruta que
 * las usa vive en routes/admin.js (GET /savings/ranking) y el cliente vuelve a
 * aplicar solo la parte de política (resolverBase + repartir) para poder
 * simular; la parte frágil —la que decide EN QUÉ MES entró cada peso— tiene una
 * sola implementación, y es esta.
 */

// ── La fecha en que el dinero entró de verdad ────────────────────────────────
//
// El modelo Saving guarda hasta cuatro fechas por movimiento y NO significan lo
// mismo. La única que sirve para ponderar es `date`:
//
//   · date                  — la "Fecha Pago" del formulario. POST /savings la
//                             exige y de ahí deriva todo lo demás; la importación
//                             de Excel la mapea desde la columna "fecha pago".
//                             Es el día en que el dinero llegó al fondo.
//   · mesAbonado/anioAbonado— el período que se ACREDITA. Quien paga el año
//                             entero en enero genera doce filas con mesAbonado
//                             1..12 y todas con la misma `date` de enero.
//                             Ponderar por aquí es el error que este módulo
//                             existe para corregir: le daba al socio que paga por
//                             adelantado el mismo peso que al que paga tarde,
//                             porque los dos acreditan los mismos doce meses.
//   · year/monthInt         — INSERVIBLES para ponderar, porque el par es
//                             incoherente según quién creó la fila:
//                               · POST /savings guarda year = año de pago pero
//                                 monthInt = mes ACREDITADO (`finalMonthInt =
//                                 req.body.monthInt || mesAbonadoNum`).
//                               · La importación guarda year = "año pago" y
//                                 monthInt = el mes del nombre en "mes pago".
//                             Un pago de diciembre que abona enero queda como
//                             year=2025, monthInt=1: se lee "enero de 2025", un
//                             año entero de diferencia. Por eso no se usan.
//
// Cuando `date` falta o no se puede leer se cae al período acreditado. Es un
// respaldo declarado, no un silencio: cada movimiento sale con `origenFecha` y la
// pantalla informa cuántos cayeron en cada nivel — una cifra mal fechada es
// indistinguible de una correcta si nadie la cuenta.

const MESES_ANIO = 12;

/** Un día calendario a medianoche UTC, a partir de 'YYYY-MM-DD' o de un Date. */
function diaUTC(valor) {
    if (valor instanceof Date) {
        if (isNaN(valor.getTime())) return null;
        return new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
    }
    const m = String(valor || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [, a, mes, d] = m;
    const anio = Number(a), mm = Number(mes), dd = Number(d);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const fecha = new Date(Date.UTC(anio, mm - 1, dd));
    // Rechaza un 31 de febrero: Date lo desborda al mes siguiente en silencio.
    if (fecha.getUTCMonth() !== mm - 1) return null;
    return fecha;
}

/**
 * Qué día entró este movimiento al fondo, y de dónde se supo.
 * Devuelve { fecha: Date|null, origen: 'pago'|'periodo'|'sin' }.
 */
function fechaValorDe(mov) {
    const real = diaUTC(mov.date);
    if (real) return { fecha: real, origen: 'pago' };

    const anio = Number(mov.anioAbonado || 0);
    const mes = Number(mov.mesAbonado || 0);
    if (anio >= 2000 && anio <= 2100 && mes >= 1 && mes <= 12) {
        return { fecha: new Date(Date.UTC(anio, mes - 1, 15)), origen: 'periodo' };
    }
    return { fecha: null, origen: 'sin' };
}

/**
 * El peso de un mes dentro del año.
 *
 *   enero  → 12/12 = 100%      julio → 6/12 = 50%      diciembre → 1/12 ≈ 8%
 *
 * Cuenta el propio mes de entrada: el dinero que llega en julio trabaja julio,
 * agosto, septiembre, octubre, noviembre y diciembre — seis meses, la mitad del
 * año, que es exactamente lo que la Junta espera ver.
 *
 * El mes 0 es el capital que ya estaba antes de que empezara el año: pesa el año
 * completo, porque estuvo desde el primer día.
 */
function pesoDeMes(mes) {
    if (mes <= 0) return 1;
    if (mes > MESES_ANIO) return 0;
    return (MESES_ANIO - mes + 1) / MESES_ANIO;
}

/**
 * El período sobre el que se reparte.
 *
 * Los pesos siempre se cuentan sobre los DOCE meses del año, también cuando el
 * año va en curso: es el método de las entidades de ahorro y es lo que hace que
 * "mitad de año" sea exactamente 50%. En un año abierto eso convierte el reparto
 * en una proyección al cierre, y la pantalla lo dice con todas las letras en vez
 * de presentar como definitiva una cifra que aún se va a mover.
 *
 * `hoy` se recibe como 'YYYY-MM-DD' para que la función siga siendo pura y las
 * pruebas puedan fijar el día.
 */
function construirPeriodo(anio, hoy) {
    const inicio = new Date(Date.UTC(anio, 0, 1));
    const fin = new Date(Date.UTC(anio, 11, 31));
    const diaHoy = diaUTC(hoy) || fin;
    const cerrado = diaHoy > fin;
    const mesActual = cerrado ? 12 : (diaHoy < inicio ? 0 : diaHoy.getUTCMonth() + 1);
    return { anio, inicio, fin, meses: MESES_ANIO, cerrado, mesActual, corte: (cerrado ? fin : diaHoy).toISOString().slice(0, 10) };
}

/**
 * El capital ponderado de un socio dentro del período.
 *
 * Un retiro entra con importe negativo y el peso de SU mes, no del principio del
 * año: quien sacó su dinero en marzo lo tuvo trabajando enero, febrero y marzo, y
 * limitarse a restarle el monto le borraría esos tres meses. Así, un retiro
 * parcial y uno total se tratan con la misma regla, sin un caso aparte.
 *
 * Lo anterior al período se acumula en el capital de apertura, con peso 1.
 */
function ponderarSocio(movimientos, periodo) {
    const { inicio, fin } = periodo;

    let capitalApertura = 0;   // lo que el socio traía cuando empezó el año
    let capitalPonderado = 0;
    let ahorroPeriodo = 0;     // solo lo que consignó el socio
    let fondoPeriodo = 0;      // solo lo que movió el fondo (devoluciones, descuentos…)
    let entradasPeriodo = 0;   // todo lo que sumó, venga de donde venga
    let netoPeriodo = 0;
    const detalle = [];
    const conteoOrigen = { pago: 0, periodo: 0, sin: 0 };
    // Un renglón por mes, más el 0 para lo que venía de antes. Es lo que la
    // pantalla necesita para mostrar el peso de cada mes sin recalcular nada.
    //
    // AHORRO y FONDO van separados a propósito, y no se suman en una sola cifra.
    // En esta tabla conviven dos cosas distintas: lo que el SOCIO consignó y lo
    // que movió el FONDO —una devolución, el descuento anual por mora, una
    // distribución de intereses—. Mezclarlas fue un defecto real: un socio que
    // ahorró $500.000 en julio y recibió otro movimiento ese mes aparecía con
    // $1.000.000 en una columna llamada "movido", que no cuadraba con la Matriz
    // de Ahorros ni con lo que él recordaba haber consignado. Es la misma regla
    // que la matriz aplica desde siempre entre `abonos` y `neto`.
    const porMes = Array.from({ length: MESES_ANIO + 1 }, (_, i) => ({
        mes: i, peso: pesoDeMes(i), ahorro: 0, fondo: 0, ponderado: 0, n: 0,
    }));

    for (const mov of movimientos) {
        const valor = Number(mov.valor) || 0;
        const { fecha, origen } = fechaValorDe(mov);
        conteoOrigen[origen] += 1;

        if (!fecha) {
            // Sin fecha utilizable no se puede ponderar. No se inventa una: se
            // deja fuera y se reporta, que es lo que permite arreglarlo. Meterla
            // con una fecha supuesta movería dinero real entre socios.
            detalle.push({ ...mov, valor, fecha: null, origenFecha: origen, mes: null, peso: 0, ponderado: 0, dentroPeriodo: false });
            continue;
        }

        const iso = fecha.toISOString().slice(0, 10);

        if (fecha > fin) {
            // Posterior al año: todavía no participa. Se muestra igual, con
            // aporte cero, para que el socio vea que su abono sí quedó registrado.
            detalle.push({ ...mov, valor, fecha: iso, origenFecha: origen, mes: null, peso: 0, ponderado: 0, dentroPeriodo: false, futuro: true });
            continue;
        }

        const previo = fecha < inicio;
        const mes = previo ? 0 : fecha.getUTCMonth() + 1;
        const peso = pesoDeMes(mes);
        const ponderado = valor * peso;

        // Un movimiento de concepto lo mueve el fondo, no el socio. `esConcepto`
        // llega calculado desde la ruta con el mismo criterio que usa la Matriz
        // de Ahorros, para que las dos pantallas no puedan discrepar.
        const deFondo = !!mov.esConcepto;

        if (previo) {
            capitalApertura += valor;
        } else {
            netoPeriodo += valor;
            if (valor >= 0) entradasPeriodo += valor;
            if (deFondo) fondoPeriodo += valor; else ahorroPeriodo += valor;
        }

        const fila = porMes[mes];
        fila.n += 1;
        if (deFondo) fila.fondo += valor; else fila.ahorro += valor;
        fila.ponderado += ponderado;

        capitalPonderado += ponderado;
        detalle.push({ ...mov, valor, fecha: iso, origenFecha: origen, mes, peso, ponderado, dentroPeriodo: !previo, previo });
    }

    // Un capital de apertura negativo es un dato mal registrado (una devolución
    // duplicada, o cargada al socio equivocado). Se protege en cero para no
    // repartir sobre un número imposible, y el valor crudo se conserva para poder
    // señalarlo en pantalla en vez de esconderlo.
    if (capitalApertura < 0) {
        capitalPonderado -= capitalApertura; // quita la parte negativa ya sumada
        porMes[0].ponderado = 0;
    }
    const aperturaPositiva = Math.max(capitalApertura, 0);
    const capitalCierre = aperturaPositiva + netoPeriodo;

    // El capital SIN ponderar: todo lo que entró, sin mirar cuándo. Existe para
    // poder mostrarlo al lado del ponderado, porque una cifra ponderada sola no
    // se puede juzgar: $5.616.667 no dice si es un socio que ahorró mucho tarde
    // o poco temprano. La distancia entre las dos ES el peso, y verla es lo que
    // hace comprensible el reparto.
    //
    // Cuenta TODAS las entradas, no solo los abonos del socio, para que el peso
    // efectivo no pueda pasar del 100%: lo que el fondo abonó también estuvo
    // trabajando y ya está dentro del ponderado.
    const capitalBase = aperturaPositiva + entradasPeriodo;
    // Qué fracción de su capital acabó contando. Nunca pasa de 1: los pesos son
    // ≤ 1 y los retiros solo restan. 100% = todo su dinero estuvo desde enero o
    // desde antes; 40% = llegó tarde, o salió durante el año.
    const pesoEfectivo = capitalBase > 0 ? Math.max(0, capitalPonderado) / capitalBase : 0;

    return {
        capitalApertura: aperturaPositiva,
        capitalAperturaCrudo: capitalApertura,
        capitalCierre,
        capitalBase,
        capitalPonderado: Math.max(0, capitalPonderado),
        pesoEfectivo,
        ahorroPeriodo,
        fondoPeriodo,
        entradasPeriodo,
        netoPeriodo,
        // La parte del capital de apertura que REALMENTE permaneció hasta el
        // cierre. Es la única que puede llevar premio de permanencia: quien abrió
        // el año con saldo y lo retiró en marzo no conservó nada, y premiarlo por
        // un dinero que ya no está convertiría el incentivo en su contrario.
        aperturaPermanente: Math.max(0, Math.min(aperturaPositiva, capitalCierre)),
        porMes,
        detalle,
        conteoOrigen,
    };
}

/**
 * La base de reparto: el hecho aritmético más la decisión de política.
 *
 * El capital ponderado no se discute. El factor de permanencia sí es una decisión
 * de la Junta —cuánto premiar a quien no retiró sus ahorros del año anterior— y
 * se aplica solo sobre el capital de apertura que permaneció, nunca sobre el
 * ahorro nuevo del año. Se mantienen separados a propósito y la pantalla los
 * muestra por separado: mezclarlos haría imposible responder "¿cuánto de esto es
 * mi ahorro y cuánto es el premio?", que es justo lo que se pregunta en una
 * asamblea. factor = 1 deja el reparto en el puro hecho aritmético.
 */
function resolverBase(agg, factorPermanencia = 1) {
    const f = Number(factorPermanencia);
    const factor = Number.isFinite(f) && f >= 1 ? f : 1;
    const premio = (agg.aperturaPermanente || 0) * (factor - 1);
    return { base: Math.max(0, (agg.capitalPonderado || 0) + premio), premioPermanencia: premio, factorAplicado: factor };
}

/**
 * Reparte un monto entero entre las bases, sin perder ni un peso.
 *
 * Método del resto mayor (Hare): a cada quien su parte entera, y los pesos que
 * sobran por el redondeo van uno a uno a quienes tenían el resto decimal más
 * alto. Repartir con Math.round por separado deja un descuadre de unos pocos
 * pesos entre lo repartido y la ganancia del fondo, y en un acta ese descuadre
 * hay que explicarlo. Aquí la suma cuadra siempre, por construcción.
 */
function repartir(bases, monto) {
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

module.exports = { MESES_ANIO, diaUTC, fechaValorDe, pesoDeMes, construirPeriodo, ponderarSocio, resolverBase, repartir };
