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

const DIA_MS = 24 * 60 * 60 * 1000;

/** Días entre dos fechas UTC, ambas inclusive. */
function diasInclusive(desde, hasta) {
    return Math.round((hasta.getTime() - desde.getTime()) / DIA_MS) + 1;
}

/**
 * El peso de una fecha dentro del año: los días que ese dinero alcanza a
 * trabajar, sobre los días del año.
 *
 *   1 de enero   → 365/365 = 100%
 *   1 de julio   → 184/365 ≈  50%
 *   31 de julio  → 154/365 ≈  42%
 *   31 diciembre →   1/365 ≈   0%
 *
 * Antes esto se calculaba por MES, y todo julio pesaba lo mismo. Era injusto y
 * de una forma medible: el fondo tiene el dinero en la cuenta NU desde el día
 * que entra, y ahí el rendimiento se liquida por día. Quien consignó el 1 de
 * julio le dio al fondo treinta días más de trabajo que quien consignó el 30, y
 * el reparto los trataba igual. Sobre $500.000 esa diferencia era de un 8% del
 * peso —$41.000 de capital ponderado— que el puntual regalaba al que esperaba a
 * fin de mes.
 *
 * Se cuenta el propio día de entrada, porque el dinero ya está en el fondo esa
 * jornada. Por eso el 31 de diciembre no da cero exacto sino 1/365, que en
 * pantalla se redondea a 0%: un día de trabajo es un día, no ninguno.
 *
 * Lo anterior al año pesa 1 completo: estuvo desde antes del primer día.
 */
function pesoDeFecha(fecha, periodo) {
    if (!fecha || !periodo) return 0;
    if (fecha < periodo.inicio) return 1;
    if (fecha > periodo.fin) return 0;
    return diasInclusive(fecha, periodo.fin) / periodo.dias;
}

/**
 * El peso de referencia de un mes: el de su primer día. Solo para rótulos y
 * leyendas —"julio pesa 50%"—; el cálculo real usa siempre la fecha exacta.
 */
function pesoDeMes(mes, periodo) {
    if (mes <= 0) return 1;
    if (mes > MESES_ANIO) return 0;
    return pesoDeFecha(new Date(Date.UTC(periodo.anio, mes - 1, 1)), periodo);
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
    // Los días del año son el denominador de todos los pesos: 365, o 366 en
    // bisiesto. Se calcula, no se asume, porque un año de 366 días repartido
    // sobre 365 le daría a todo el mundo un peso mayor que 1 el 1 de enero.
    const dias = diasInclusive(inicio, fin);
    return { anio, inicio, fin, dias, meses: MESES_ANIO, cerrado, mesActual, corte: (cerrado ? fin : diaHoy).toISOString().slice(0, 10) };
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

    // ── La distribución de intereses solo cuenta si el socio no retiró ──────
    //
    // Decisión de la Junta (6 de septiembre de 2026): las utilidades que el
    // fondo le abonó a un socio cuentan como capital suyo para el reparto
    // SIEMPRE Y CUANDO no haya retirado —total o parcialmente— sus ahorros.
    // Quien saca su dinero rompe la permanencia que justifica que lo repartido
    // el año pasado siga trabajando a su favor este año.
    //
    // El disparador es una DEVOLUCIÓN, que es lo que el socio decide. El
    // descuento anual por mora no cuenta: lo cobra el fondo, no lo pide él, y
    // castigarlo dos veces por el mismo hecho sería otra cosa distinta de lo
    // que se decidió.
    //
    // Se resuelve en una primera pasada porque el retiro puede ocurrir DESPUÉS
    // de la distribución: la regla mira el comportamiento del socio en todo el
    // período, no el orden en que quedaron registradas las filas.
    const huboRetiro = movimientos.some((mov) => {
        if (!mov.esDevolucion) return false;
        const f = fechaValorDe(mov).fecha;
        return !!f && f >= inicio && f <= fin;
    });

    let capitalApertura = 0;   // lo que el socio traía cuando empezó el año
    let capitalPonderado = 0;
    let ahorroPeriodo = 0;     // solo lo que consignó el socio
    let fondoPeriodo = 0;      // solo lo que movió el fondo (devoluciones, descuentos…)
    let entradasPeriodo = 0;   // todo lo que sumó, venga de donde venga
    let distribucionNoContada = 0; // utilidades que el socio perdió por haber retirado
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
    // El peso del renglón ya no es un dato del mes sino el resultado de las
    // fechas que caen en él: dos abonos de julio, uno el 1 y otro el 30, pesan
    // distinto. Se deja en cero y al final se calcula el peso EFECTIVO de cada
    // mes —lo que contó dividido por lo que entró—, que es la única cifra
    // honesta cuando el mes ya no tiene un peso único.
    const porMes = Array.from({ length: MESES_ANIO + 1 }, (_, i) => ({
        mes: i, peso: 0, ahorro: 0, fondo: 0, ponderado: 0, n: 0,
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
        const peso = pesoDeFecha(fecha, periodo);

        // Una distribución que perdió su condición no pesa ni suma al capital,
        // pero sigue apareciendo en el detalle con su marca: el socio tiene que
        // ver que el abono llegó y por qué no le cuenta.
        const distribucionAnulada = !!mov.esDistribucion && huboRetiro;
        const ponderado = distribucionAnulada ? 0 : valor * peso;

        // Un movimiento de concepto lo mueve el fondo, no el socio. `esConcepto`
        // llega calculado desde la ruta con el mismo criterio que usa la Matriz
        // de Ahorros, para que las dos pantallas no puedan discrepar.
        const deFondo = !!mov.esConcepto;

        if (distribucionAnulada) {
            // No entra en ningún acumulado de capital: no cuenta, y punto.
            distribucionNoContada += valor;
            const fila = porMes[mes];
            fila.n += 1;
            fila.fondo += valor;
            detalle.push({ ...mov, valor, fecha: iso, origenFecha: origen, mes, peso: 0, ponderado: 0, dentroPeriodo: !previo, previo, noCuenta: true });
            continue;
        }

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
    // El peso efectivo de cada mes. Cuando el movido es cero —un abono y un
    // retiro que se cancelan— la división no tiene sentido y se cae al peso de
    // referencia del mes, que al menos sitúa el renglón en el año.
    for (const fila of porMes) {
        const movido = fila.ahorro + fila.fondo;
        fila.peso = movido !== 0 ? fila.ponderado / movido : pesoDeMes(fila.mes, periodo);
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
        // Se reportan las dos: si el socio retiró y por eso perdió la
        // distribución, la pantalla tiene que poder decírselo con la cifra
        // exacta en vez de dejarle una resta que no cuadra.
        huboRetiro,
        distribucionNoContada,
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

/**
 * ── Lo que el fondo retiene antes de repartir ────────────────────────────────
 *
 * La asamblea puede decidir que no se reparta toda la ganancia: que una parte se
 * quede para una reserva, para un fondo con un objetivo concreto, o para
 * cualquier destino que la Junta acuerde. Eso NO se hace tocando la ganancia:
 * la ganancia es un hecho contable que declara el Panel de Administración y no
 * se negocia. Lo que se decide es una RETENCIÓN, y lo repartido es la resta:
 *
 *     repartir = ganancia − retención
 *
 * Modelarlo así mantiene las tres cifras separadas y auditables —lo que se ganó,
 * lo que se retuvo y para qué, y lo que se repartió— en vez de dejar un único
 * número editable que nadie puede volver a explicar seis meses después.
 *
 * Se admite en pesos o en porcentaje porque las dos formas aparecen en las
 * actas: "el 10% de las utilidades" y "dos millones para el fondo de auxilios"
 * son la misma clase de decisión escrita de dos maneras.
 *
 * Nunca puede retener más de lo que hay ni una cantidad negativa: los topes
 * están aquí, no en el formulario, porque un valor que llegue por API mueve
 * dinero igual que uno tecleado.
 */
function calcularRetencion(ganancia, retencion) {
    const G = Math.max(0, Math.round(Number(ganancia) || 0));
    const v = Number(retencion?.valor);
    if (!G || !Number.isFinite(v) || v <= 0) return { retenido: 0, aRepartir: G };

    const retenido = retencion.tipo === 'porcentaje'
        ? Math.round(G * Math.min(100, v) / 100)
        : Math.min(G, Math.round(v));
    return { retenido, aRepartir: G - retenido };
}

/**
 * ── El descuento sobre la parte de un socio ─────────────────────────────────
 *
 * Distinto de la retención general: aquí la Junta descuenta a UN socio, no a
 * todos. Lo descontado se queda en el fondo, con la retención general.
 *
 * NO se reparte entre los demás socios, y esa es la decisión de fondo de esta
 * función. Repartirlo convertiría una medida sobre una persona en una ganancia
 * para sus compañeros: quien vota el descuento cobraría por votarlo, y el socio
 * afectado tendría enfrente a veinticuatro personas con un interés económico en
 * que se le descuente. Un fondo pequeño donde todos se conocen no puede
 * permitirse ese incentivo. Lo retenido va al fondo, que es de todos por igual.
 *
 * Tope en la propia parte del socio: un descuento no puede dejarle una utilidad
 * negativa, porque eso ya no sería un descuento sino un cobro, y un cobro se
 * registra donde se registran los cobros.
 */
function calcularDescuento(utilidadBruta, descuento) {
    const U = Math.max(0, Math.round(Number(utilidadBruta) || 0));
    const v = Number(descuento?.valor);
    if (!U || !Number.isFinite(v) || v <= 0) return 0;

    return descuento.tipo === 'porcentaje'
        ? Math.round(U * Math.min(100, v) / 100)
        : Math.min(U, Math.round(v));
}

module.exports = { MESES_ANIO, diaUTC, diasInclusive, fechaValorDe, pesoDeFecha, pesoDeMes, construirPeriodo, ponderarSocio, resolverBase, repartir, calcularRetencion, calcularDescuento };
