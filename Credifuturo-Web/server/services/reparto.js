/**
 * Reparto de utilidades — la aritmética, sin base de datos.
 *
 * El fondo reparte su ganancia entre los socios en proporción al CAPITAL-TIEMPO
 * que cada uno aportó: no cuánto ahorró, sino cuánto dinero suyo estuvo
 * disponible para prestar, y durante cuántos días.
 *
 * Todo lo que hay aquí son funciones puras sobre números y fechas. La ruta que
 * las usa vive en routes/admin.js (GET /savings/ranking) y el cliente vuelve a
 * aplicar solo la parte de política (resolverBase + repartir) para poder
 * simular; la parte frágil —la que decide QUÉ DÍA entró cada peso— tiene una
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
//                             existe para corregir: le cobraba al socio puntual
//                             como si su dinero hubiera ido entrando mes a mes.
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
// Cuando `date` falta o no se puede leer se cae al período acreditado a mitad de
// mes (día 15). Es un respaldo declarado, no un silencio: cada movimiento sale
// con `origenFecha` y la pantalla informa cuántos cayeron en cada nivel — una
// celda vacía por dato malo es indistinguible de un socio que no ahorró, y esa
// confusión es la peor falla posible en una pantalla de control.

const DIA_MS = 24 * 60 * 60 * 1000;

/** Un día calendario a medianoche UTC, a partir de 'YYYY-MM-DD' o de un Date. */
function diaUTC(valor) {
    if (valor instanceof Date) {
        if (isNaN(valor.getTime())) return null;
        return new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
    }
    const texto = String(valor || '').trim();
    const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [, a, mes, d] = m;
    const anio = Number(a), mm = Number(mes), dd = Number(d);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const fecha = new Date(Date.UTC(anio, mm - 1, dd));
    // Rechaza un 31 de febrero: Date lo desborda al mes siguiente en silencio.
    if (fecha.getUTCMonth() !== mm - 1) return null;
    return fecha;
}

function diasEntre(desde, hasta) {
    return Math.round((hasta.getTime() - desde.getTime()) / DIA_MS);
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
 * El período sobre el que se reparte.
 *
 * En un año cerrado va del 1 de enero al 31 de diciembre. En el año en curso
 * el corte es HOY, no el 31 de diciembre: ponderar contra un cierre que todavía
 * no llegó haría que el dinero de enero valiera 1,0 y el de hoy 0,0 sobre un
 * año que aún no ha pasado, y todas las participaciones se moverían solas cada
 * día por una razón que nadie escribió. Con el corte en hoy, el resultado es el
 * SALDO PROMEDIO de lo que va corrido, que es una cifra estable y explicable.
 *
 * `hoy` se recibe como 'YYYY-MM-DD' para que la función siga siendo pura y
 * las pruebas puedan fijar el día.
 */
function construirPeriodo(anio, hoy) {
    const inicio = new Date(Date.UTC(anio, 0, 1));
    const finAnio = new Date(Date.UTC(anio, 11, 31));
    const diaHoy = diaUTC(hoy) || finAnio;

    let corte;
    if (diaHoy < inicio) corte = inicio;          // un año futuro: período de un día
    else if (diaHoy > finAnio) corte = finAnio;   // un año cerrado
    else corte = diaHoy;                          // el año en curso

    // +1 porque el propio día del corte cuenta: un período que empieza y termina
    // el 1 de enero dura un día, no cero (y dividir por cero anularía el reparto).
    const dias = diasEntre(inicio, corte) + 1;
    return { anio, inicio, corte, dias, cerrado: diaHoy > finAnio };
}

/**
 * El capital-tiempo de un socio dentro del período.
 *
 * saldoPromedio = Σ ( importe × días que ese importe estuvo dentro del período ) / días del período
 *
 * Que es, literalmente, el promedio de dinero que el socio tuvo en el fondo
 * durante el período. Un abono de enero pesa 1,0; uno de hoy, casi 0. Un retiro
 * entra con importe negativo y su propia fecha, así que quien sacó su dinero en
 * marzo deja de contarlo desde marzo — no basta con restarle el monto, porque
 * hasta marzo ese dinero sí estuvo trabajando.
 *
 * Lo anterior al período se colapsa en el saldo de apertura, que pesa 1,0
 * completo: estuvo ahí desde el primer día.
 */
function ponderarSocio(movimientos, periodo) {
    const { inicio, corte, dias } = periodo;

    let saldoApertura = 0;      // caja del socio en el fondo al abrir el período
    let saldoPromedio = 0;      // el capital-tiempo del período
    let abonosPeriodo = 0;      // solo lo que consignó el socio
    let retirosPeriodo = 0;     // solo lo que salió (negativo)
    let netoPeriodo = 0;
    const detalle = [];
    const conteoOrigen = { pago: 0, periodo: 0, sin: 0 };

    for (const mov of movimientos) {
        const valor = Number(mov.valor) || 0;
        const { fecha, origen } = fechaValorDe(mov);
        conteoOrigen[origen] += 1;

        if (!fecha) {
            // Sin fecha utilizable no se puede ponderar. No se inventa una: se
            // deja fuera del cálculo y se reporta, que es lo que permite
            // arreglarlo. Meterlo con una fecha supuesta movería dinero real.
            detalle.push({ ...mov, valor, fecha: null, origenFecha: origen, dentroPeriodo: false, dias: 0, factor: 0, aporte: 0 });
            continue;
        }

        if (fecha < inicio) {
            saldoApertura += valor;
            detalle.push({ ...mov, valor, fecha: fecha.toISOString().slice(0, 10), origenFecha: origen, dentroPeriodo: false, previo: true, dias: dias, factor: 1, aporte: valor });
            continue;
        }

        if (fecha > corte) {
            // Posterior al corte: todavía no ha trabajado ni un día. Se registra
            // para que el socio vea que su abono llegó, con aporte cero.
            detalle.push({ ...mov, valor, fecha: fecha.toISOString().slice(0, 10), origenFecha: origen, dentroPeriodo: false, futuro: true, dias: 0, factor: 0, aporte: 0 });
            continue;
        }

        const diasActivos = diasEntre(fecha, corte) + 1;
        const factor = diasActivos / dias;
        const aporte = valor * factor;
        saldoPromedio += aporte;
        netoPeriodo += valor;
        if (valor >= 0) abonosPeriodo += valor; else retirosPeriodo += valor;

        detalle.push({ ...mov, valor, fecha: fecha.toISOString().slice(0, 10), origenFecha: origen, dentroPeriodo: true, dias: diasActivos, factor, aporte });
    }

    // El saldo de apertura pesa el período entero.
    const aperturaPositiva = Math.max(saldoApertura, 0);
    saldoPromedio += aperturaPositiva;

    const saldoCierre = aperturaPositiva + netoPeriodo;

    return {
        saldoApertura: aperturaPositiva,
        saldoAperturaCrudo: saldoApertura,
        saldoCierre,
        saldoPromedio,
        abonosPeriodo,
        retirosPeriodo,
        netoPeriodo,
        // La parte del saldo de apertura que REALMENTE permaneció hasta el corte.
        // Es la única que puede llevar premio de permanencia: quien abrió el año
        // con $5.000.000 y los retiró en marzo no conservó nada, y premiarlo por
        // un saldo que ya no está convertiría el incentivo en su contrario.
        aperturaPermanente: Math.max(0, Math.min(aperturaPositiva, saldoCierre)),
        detalle,
        conteoOrigen,
    };
}

/**
 * La base de reparto: el hecho aritmético más la decisión de política.
 *
 * saldoPromedio es lo que el socio aportó en capital-tiempo, y no se discute.
 * El factor de permanencia es una decisión de la Junta: cuánto quiere premiar a
 * quien NO retiró sus ahorros del año anterior. Se aplica solo sobre el saldo de
 * apertura que permaneció, nunca sobre el ahorro nuevo del año.
 *
 * Se mantienen separados a propósito, y la pantalla los muestra por separado:
 * mezclarlos haría imposible responder "¿cuánto de esto es mi ahorro y cuánto
 * es el premio?", que es justo la pregunta que se hace en una asamblea.
 *
 * factor = 1 deja el reparto en el puro hecho aritmético.
 */
function resolverBase(agg, factorPermanencia = 1) {
    const f = Number(factorPermanencia);
    const factor = Number.isFinite(f) && f >= 1 ? f : 1;
    const premio = (agg.aperturaPermanente || 0) * (factor - 1);
    const base = Math.max(0, (agg.saldoPromedio || 0) + premio);
    return { base, premioPermanencia: premio, factorAplicado: factor };
}

/**
 * Reparte un monto entero entre las bases, sin perder ni un peso.
 *
 * Método del resto mayor (Hare): a cada quien su parte entera, y los pesos que
 * sobran por el redondeo van uno a uno a quienes tenían el resto decimal más
 * alto. Repartir con Math.round por separado deja un descuadre de unos pocos
 * pesos entre lo repartido y lo que la Junta aprobó, y en un acta ese descuadre
 * hay que explicarlo. Aquí la suma cuadra siempre, por construcción.
 */
function repartir(bases, monto) {
    const total = bases.reduce((s, b) => s + Math.max(0, Number(b) || 0), 0);
    const M = Math.round(Number(monto) || 0);

    if (!(total > 0) || M <= 0) {
        return bases.map(() => ({ participacion: 0, utilidad: 0 }));
    }

    const exactos = bases.map(b => (Math.max(0, Number(b) || 0) / total) * M);
    const enteros = exactos.map(v => Math.floor(v));
    let sobrante = M - enteros.reduce((s, v) => s + v, 0);

    const porResto = exactos
        .map((v, i) => ({ i, resto: v - Math.floor(v) }))
        .sort((a, b) => b.resto - a.resto || a.i - b.i);

    for (let k = 0; k < porResto.length && sobrante > 0; k++, sobrante--) {
        enteros[porResto[k].i] += 1;
    }

    return bases.map((b, i) => ({
        participacion: Math.max(0, Number(b) || 0) / total,
        utilidad: enteros[i],
    }));
}

module.exports = { diaUTC, diasEntre, fechaValorDe, construirPeriodo, ponderarSocio, resolverBase, repartir };
