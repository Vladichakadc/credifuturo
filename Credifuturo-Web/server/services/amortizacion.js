/**
 * Amortización, abonos extraordinarios a capital y reajuste de cronogramas.
 *
 * Credifuturo amortiza por SISTEMA ALEMÁN (capital constante, cuota
 * decreciente), tal como lo genera el cronograma en routes/admin.js:
 *
 *     capitalPorCuota = valorPrestado / cuotas        (constante)
 *     interés         = saldoInicial × interesMensual (sobre el saldo vivo)
 *     cuota           = capitalPorCuota + interés
 *     saldoFinal      = saldoInicial − capitalPorCuota
 *
 * y el saldo final de una cuota es el saldo inicial de la siguiente.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ──────────────────────────────────────
 *
 * Cuando un socio pagaba más que su cuota, el excedente no hacía nada: se
 * guardaba en `valorCuotaPago` y ahí terminaba. Su saldo no bajaba, sus cuotas
 * siguientes no cambiaban y seguía pagando los mismos intereses. El fondo
 * recibía un dinero que no reducía la deuda ni figuraba en el recaudo.
 *
 * Lo correcto es tratar ese excedente como un ABONO EXTRAORDINARIO A CAPITAL:
 * reduce el saldo y, con él, todos los intereses que aún no se han causado.
 *
 * ── LAS DOS POLÍTICAS ────────────────────────────────────────────────
 *
 * Reducido el saldo, hay dos formas de rehacer lo que queda, y son las dos que
 * el mercado colombiano reconoce (es lo que la Ley 1555 de 2012 obliga a
 * ofrecer en el crédito de consumo, dejando la elección al deudor):
 *
 *   REDUCIR_PLAZO  — se mantiene el capital por cuota; se necesitan menos
 *                    cuotas para terminar. Ahorra más intereses.
 *   REDUCIR_CUOTA  — se mantiene el número de cuotas; baja el capital de cada
 *                    una y con él la cuota. Alivia el flujo mensual.
 *
 * La elección es del socio, no del sistema: por eso ambas se implementan y el
 * llamador decide.
 *
 * ── LA GUARDA, QUE ES LO MÁS IMPORTANTE ──────────────────────────────
 *
 * Recalcular exige que el cronograma sea aritméticamente sano. Los préstamos
 * cargados por importación desde Excel NO lo son: sus filas repiten el mismo
 * saldo inicial, el interés declarado no corresponde al saldo por la tasa, y el
 * capital implícito no coincide con préstamo/cuotas. Aplicarles el sistema
 * alemán produciría cifras inventadas sobre deuda real de socios.
 *
 * Por eso `analizarCronograma` decide primero si el préstamo es recalculable, y
 * quien llame debe respetarlo: ante un cronograma incoherente se registra el
 * pago y se avisa, pero NO se reescribe nada.
 */

const REDUCIR_PLAZO = 'reducir-plazo';
const REDUCIR_CUOTA = 'reducir-cuota';

// Tolerancia en pesos al comparar cifras que vienen de columnas DECIMAL.
const TOLERANCIA = 1;

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

const redondear = (n) => parseFloat(num(n).toFixed(2));

/** Ordena las cuotas como corren en el tiempo: por vencimiento y, a igual fecha, por número. */
function ordenarCuotas(cuotas) {
    return [...cuotas].sort((a, b) => {
        const fa = String(a.fechaPagoMax || '');
        const fb = String(b.fechaPagoMax || '');
        if (fa !== fb) return fa < fb ? -1 : 1;
        return num(a.itemQuantity) - num(b.itemQuantity);
    });
}

/** Lo que el socio pagó por encima del valor de su cuota. Cero si pagó justo o de menos. */
function excedenteDe(cuota) {
    if (String(cuota.estado) !== 'Pago') return 0;
    const exc = num(cuota.valorCuotaPago) - num(cuota.valorCuotaVariable);
    return exc > TOLERANCIA ? redondear(exc) : 0;
}

/** Una cuota anulada por un abono que canceló el crédito: no participa del cálculo. */
const estaAnulada = (c) => Boolean(c.esPrepago) && num(c.valorCuotaVariable) === 0;

/**
 * ¿Se puede recalcular este cronograma sin inventar cifras?
 *
 * Comprueba cuatro cosas independientes:
 *   · ENCADENADO — el saldo final de cada cuota es el saldo inicial de la
 *     siguiente. Sin esto no hay una línea de saldo que continuar.
 *   · EXTINGUE   — la última cuota deja el saldo en cero. Un cronograma cuyo
 *     saldo nunca baja también encadena consigo mismo y pasaría por sano.
 *   · CAPITAL CONSTANTE — la ley de amortización es la alemana. En el sistema
 *     francés —cuota fija— el capital crece período a período; los dos
 *     encadenan y los dos son coherentes, así que sin esta prueba un préstamo
 *     francés se recalcularía como alemán, cambiándole al socio la ley del
 *     crédito que firmó.
 *   · COHERENTE  — el interés declarado en cada cuota corresponde a su saldo
 *     inicial por la tasa. Sin esto la tasa guardada no describe el préstamo.
 */
function analizarCronograma(cuotas) {
    const filas = ordenarCuotas(cuotas);
    if (filas.length === 0) {
        return { recalculable: false, encadenado: false, coherente: false, motivo: 'El préstamo no tiene cuotas registradas.' };
    }

    let encadenado = true;
    for (let i = 0; i < filas.length - 1; i++) {
        const desfase = num(filas[i].saldoFinal) - num(filas[i + 1].saldoInicial);
        if (Math.abs(desfase) <= TOLERANCIA) continue;
        // Un corte que vale exactamente lo que el socio pagó de más en esa misma
        // cuota no es una carga histórica incoherente: es un abono anotado en su
        // cuota y nunca propagado al resto —lo que deja el formulario de pagos,
        // que recalcula ese saldoFinal solo—. Rechazarlo dejaba el préstamo
        // marcado "sin recalcular" para siempre, que es justo el caso que hay
        // que arreglar. El resto de cortes siguen invalidando el cronograma.
        const excedente = excedenteDe(filas[i]);
        if (excedente > 0 && Math.abs(Math.abs(desfase) - excedente) <= TOLERANCIA) continue;
        encadenado = false;
        break;
    }

    let coherente = true;
    for (const c of filas) {
        if (estaAnulada(c)) continue;
        const esperado = num(c.saldoInicial) * num(c.interesMensual);
        if (Math.abs(esperado - num(c.valorInteresesAmortizados)) > TOLERANCIA) {
            coherente = false;
            break;
        }
    }

    // Un crédito tiene UNA tasa. Cuando las filas declaran tasas distintas, el
    // dato no describe un préstamo sino una corrección hecha a mano sobre
    // alguna cuota, y rehacer el cronograma impondría a todas la tasa de la
    // primera fila. Medido: en un préstamo de $8.000.000 con la cuota 1 al 1,0%
    // y el resto al 1,8%, el fondo dejaba de cobrar $367.200; con las tasas
    // invertidas, al socio se le cobraban $331.552 de más.
    const tasaRef = num(filas[0].interesMensual);
    const tasaUniforme = filas.every((c) => estaAnulada(c) || Math.abs(num(c.interesMensual) - tasaRef) < 1e-9) && tasaRef > 0;

    const ultima = filas[filas.length - 1];
    const extingue = Math.abs(num(ultima.saldoFinal)) <= TOLERANCIA;
    const capitalConstante = tieneCapitalConstante(filas);

    let motivo = null;
    if (!tasaUniforme) {
        motivo = 'Las cuotas de este préstamo no declaran todas la misma tasa mensual. '
            + 'El abono queda registrado, pero rehacer el cronograma le impondría a todas una sola tasa y cambiaría lo cobrado.';
    } else if (!encadenado) {
        motivo = 'El saldo de este préstamo no encadena entre cuotas: viene de una carga histórica y no de un cronograma calculado. '
            + 'El abono queda registrado, pero reescribir las cuotas siguientes produciría cifras que no corresponden a lo pactado.';
    } else if (!extingue) {
        motivo = 'El cronograma no cancela la deuda: la última cuota deja saldo vivo. '
            + 'El abono queda registrado, pero no hay un plan de pagos completo sobre el cual recalcular.';
    } else if (!capitalConstante) {
        motivo = 'Este préstamo no amortiza con capital constante, que es la regla con la que el fondo calcula sus cronogramas. '
            + 'El abono queda registrado; recalcularlo con otra ley de amortización le cambiaría las condiciones al socio.';
    } else if (!coherente) {
        motivo = 'El interés registrado en las cuotas no corresponde al saldo por la tasa guardada. '
            + 'El abono queda registrado, pero recalcular con esa tasa cambiaría las condiciones del crédito.';
    }

    return {
        recalculable: tasaUniforme && encadenado && extingue && capitalConstante && coherente,
        encadenado, coherente, extingue, capitalConstante, tasaUniforme, motivo,
    };
}

/**
 * Comprueba la ley alemana ADMITIENDO los escalones que deja un abono.
 *
 * Exigir un único capital para todo el cronograma era correcto mientras nadie
 * abonaba a capital, y dejó de serlo en cuanto se aplicó el primer abono: la
 * cuota que recibió el abono amortiza más que las demás, y con la política de
 * reducir cuota las posteriores amortizan menos. El resultado es que un
 * préstamo con un abono legítimo quedaba marcado como no recalculable para
 * siempre, y un SEGUNDO abono sobre ese mismo préstamo se rechazaba.
 *
 * Lo que de verdad distingue al sistema alemán del francés no es que el capital
 * sea el mismo de la primera cuota a la última, sino que solo cambie cuando hay
 * un motivo registrado para que cambie. Así que se admite un tramo nuevo
 * únicamente DESPUÉS de una cuota que se pagó por encima de su valor. En un
 * cronograma francés el capital crece en cada cuota sin ningún abono detrás, y
 * sigue siendo rechazado.
 */
function tieneCapitalConstante(filasOrdenadas) {
    const vivas = filasOrdenadas.filter((c) => !estaAnulada(c));
    // La última cuota amortiza el residuo y casi nunca coincide al peso.
    const cuerpo = vivas.length > 1 ? vivas.slice(0, -1) : vivas;
    if (cuerpo.length === 0) return false;

    let referencia = num(cuerpo[0].saldoInicial) - num(cuerpo[0].saldoFinal);
    if (!(referencia > TOLERANCIA)) return false;

    for (let i = 1; i < cuerpo.length; i++) {
        const capital = num(cuerpo[i].saldoInicial) - num(cuerpo[i].saldoFinal);
        if (Math.abs(capital - referencia) <= TOLERANCIA) continue;
        // Solo se admite el cambio si la cuota anterior recibió un abono.
        if (excedenteDe(cuerpo[i - 1]) > 0) {
            referencia = capital;
            if (!(referencia > TOLERANCIA)) return false;
            continue;
        }
        return false;
    }
    return true;
}

/**
 * Rehace el cronograma completo aplicando los pagos realmente hechos.
 *
 * ── POR QUÉ SE REHACE TODO Y NO SOLO LA COLA ─────────────────────────
 *
 * La primera versión derivaba el saldo nuevo del `saldoInicial` de la cuota
 * abonada y reencadenaba desde ahí las cuotas pendientes. Eso es correcto
 * cuando la cuota del abono es la última pagada, y catastrófico cuando no lo
 * es: si el socio pagó de más en la cuota 1 y después pagó normalmente las
 * cuotas 2 y 3, el reencadenado ignora el capital amortizado en 2 y 3 y
 * devuelve al saldo un dinero que el socio ya entregó. Medido sobre un
 * préstamo real de $8.000.000: la cuota 4 arrancaba en $7.112.000 en vez de
 * $5.778.666,67 — $1.333.333,33 de deuda inventada.
 *
 * La forma correcta es recorrer el cronograma entero desde el principio
 * aplicando la ley del crédito sobre los pagos que de verdad ocurrieron:
 *
 *     interés  = saldo × tasa
 *     capital  = lo pagado − interés          (en las cuotas ya pagadas)
 *     capital  = el que dicte la política      (en las pendientes)
 *     saldo   -= capital
 *
 * Al recalcular así, el interés de las cuotas pagadas DESPUÉS del abono baja
 * —porque se liquida sobre un saldo menor— y la diferencia que el socio pagó de
 * más se convierte en capital amortizado. Es el mismo dinero: cambia el reparto
 * entre interés y capital, a favor del socio, que es exactamente lo que habría
 * ocurrido si el abono se hubiera aplicado el día del pago.
 *
 * No toca los ejercicios cerrados: quien llama restringe el alcance al año en
 * curso antes de invocar esta función.
 */
function planificarReajuste({ cuotas, capitalPactado = null, politica = REDUCIR_CUOTA }) {
    const filas = ordenarCuotas(cuotas);
    if (filas.length === 0) return { ok: false, motivo: 'El préstamo no tiene cuotas registradas.' };

    const tasa = num(filas[0].interesMensual);
    if (!(tasa > 0)) return { ok: false, motivo: 'El préstamo no tiene una tasa utilizable.' };

    // Una cuota en mora causó intereses por el tiempo que lleva vencida.
    // Recalcularla sobre el saldo nuevo se los condonaría, y una mora se cobra
    // o se negocia aparte, no se borra porque el socio haya abonado a otra.
    if (filas.some((c) => String(c.estado) === 'Mora')) {
        return { ok: false, motivo: 'El préstamo tiene cuotas en mora. El interés de una mora ya se causó y no se recalcula automáticamente.' };
    }

    // Una cuota marcada como pagada pero con un importe por debajo de su valor
    // deja al préstamo con más saldo del que dice el cronograma. Rehacerlo sobre
    // ese dato no es aplicar un abono: es repartir una deuda mayor entre las
    // cuotas que quedan, subiéndolas. Medido: la cuota del socio pasaba de
    // $750.666 a $794.421 y el aviso le anunciaba un ahorro NEGATIVO. Un pago
    // incompleto se resuelve con una persona, no con un barrido nocturno.
    const incompleta = filas.find((c) => String(c.estado) === 'Pago' && !estaAnulada(c)
        && num(c.valorCuotaPago) + TOLERANCIA < num(c.valorCuotaVariable));
    if (incompleta) {
        return {
            ok: false,
            motivo: `La cuota ${incompleta.externalId || incompleta.itemQuantity} figura como pagada por debajo de su valor. `
                + 'Un pago incompleto requiere revisión manual antes de recalcular.',
        };
    }

    const excedenteTotal = filas.reduce((s, c) => s + excedenteDe(c), 0);
    if (excedenteTotal <= 0) return { ok: false, motivo: 'Ninguna cuota se pagó por encima de su valor.' };

    const pendientes = filas.filter((c) => String(c.estado) === 'Pendiente' && !estaAnulada(c));
    if (pendientes.length === 0) {
        return { ok: false, motivo: 'No quedan cuotas pendientes que recalcular.' };
    }

    const interesAntes = filas.reduce((s, c) => s + num(c.valorInteresesAmortizados), 0);
    const interesPendienteAntes = pendientes.reduce((s, c) => s + num(c.valorInteresesAmortizados), 0);

    // Con la política de reducir cuota, el capital se reparte entre las cuotas
    // que siguen pendientes; con la de reducir plazo se conserva el pactado y
    // sobran cuotas al final.
    let saldo = num(filas[0].saldoInicial);
    // El capital por cuota se lee del cronograma vigente, no de
    // DisbursedLoan.cuotas: cuando ese campo no coincide con el número de filas
    // —préstamos migrados, retanqueos mal cerrados— el capital sale al doble y
    // el reajuste anula cuotas que el socio sí debía. Medido: un préstamo de 12
    // filas cuyo DisbursedLoan declaraba 6 cuotas perdía 5 cuotas enteras.
    let capitalObjetivo = num(capitalPactado);
    if (!(capitalObjetivo > 0)) {
        const referencia = pendientes[0] || filas[0];
        capitalObjetivo = num(referencia.saldoInicial) - num(referencia.saldoFinal);
    }
    if (politica === REDUCIR_CUOTA) {
        // Se necesita el saldo que quedará cuando empiecen las pendientes, y
        // eso exige una primera pasada sobre las ya pagadas.
        let s = saldo;
        for (const c of filas) {
            if (String(c.estado) !== 'Pago' || estaAnulada(c)) break;
            const interes = redondear(s * tasa);
            s = redondear(s - (num(c.valorCuotaPago) - interes));
        }
        capitalObjetivo = Math.max(0, s) / pendientes.length;
    }

    const nuevas = [];
    let indicePendiente = 0;
    let interesCobradoDeMas = 0;
    let sobrante = 0;

    for (const c of filas) {
        if (estaAnulada(c)) {
            nuevas.push({ id: c.id, saldoInicial: 0, valorInteresesAmortizados: 0, valorCuotaVariable: 0, saldoFinal: 0, anulada: true });
            continue;
        }

        const interes = redondear(Math.max(0, saldo) * tasa);

        if (String(c.estado) === 'Pago') {
            const pagado = num(c.valorCuotaPago);
            // Un pago que ni siquiera cubre el interés del período dejaría
            // capital negativo, es decir deuda creciente. No se automatiza.
            if (pagado + TOLERANCIA < interes) {
                return { ok: false, motivo: `La cuota ${c.externalId || c.itemQuantity} pagó menos que el interés del período; el reajuste requiere revisión manual.` };
            }
            const capitalPagado = redondear(pagado - interes);
            // Si el pago supera lo que quedaba de deuda, el resto no amortiza
            // nada: es dinero del socio en poder del fondo. Se contabiliza
            // aparte para que alguien se lo devuelva; el saldo no baja de cero.
            const capital = Math.min(capitalPagado, saldo);
            sobrante += Math.max(0, redondear(capitalPagado - saldo));
            const saldoFin = Math.max(0, redondear(saldo - capital));
            interesCobradoDeMas += num(c.valorInteresesAmortizados) - interes;
            nuevas.push({
                id: c.id,
                saldoInicial: redondear(saldo),
                valorInteresesAmortizados: interes,
                // El valor nominal de una cuota ya pagada no se reescribe: es lo
                // que se le cobró y lo que él pagó. Lo que cambia es el reparto
                // interno entre interés y capital, que va en las otras columnas.
                valorCuotaVariable: redondear(num(c.valorCuotaVariable)),
                saldoFinal: saldoFin,
                yaPagada: true,
            });
            saldo = saldoFin;
            continue;
        }

        // Cuota pendiente.
        if (saldo <= TOLERANCIA) {
            nuevas.push({ id: c.id, saldoInicial: 0, valorInteresesAmortizados: 0, valorCuotaVariable: 0, saldoFinal: 0, sobra: true });
            indicePendiente++;
            continue;
        }
        const esUltimaPendiente = indicePendiente === pendientes.length - 1;
        // La última cuota amortiza lo que quede, para que el saldo cierre en
        // cero exacto y no en un residuo de centavos.
        const capital = esUltimaPendiente ? saldo : Math.min(capitalObjetivo, saldo);
        const saldoFin = Math.max(0, redondear(saldo - capital));
        nuevas.push({
            id: c.id,
            saldoInicial: redondear(saldo),
            valorInteresesAmortizados: interes,
            valorCuotaVariable: redondear(capital + interes),
            saldoFinal: saldoFin,
            sobra: false,
        });
        saldo = saldoFin;
        indicePendiente++;
    }

    const vigentes = nuevas.filter((f) => !f.sobra && !f.anulada);
    const pendientesDespues = nuevas.filter((f) => !f.sobra && !f.anulada && !f.yaPagada);
    const interesDespues = vigentes.reduce((s, f) => s + num(f.valorInteresesAmortizados), 0);
    const interesPendienteDespues = pendientesDespues.reduce((s, f) => s + num(f.valorInteresesAmortizados), 0);

    return {
        ok: true,
        filas: nuevas,
        cancelaElCredito: pendientesDespues.length === 0,
        resumen: {
            excedente: redondear(excedenteTotal),
            politica,
            cuotasAntes: pendientes.length,
            cuotasDespues: pendientesDespues.length,
            interesAntes: redondear(interesPendienteAntes),
            interesDespues: redondear(interesPendienteDespues),
            ahorroInteres: redondear(interesPendienteAntes - interesPendienteDespues),
            // Dinero del socio que ya no amortiza nada porque la deuda quedó en
            // cero. No se le devuelve solo: se informa para que alguien lo haga.
            sobrante: redondear(sobrante),
            // Interés que ya se le cobró al socio sobre capital que él ya había
            // entregado, y que este reajuste le devuelve en forma de capital.
            interesReintegrado: redondear(Math.max(0, interesCobradoDeMas)),
            interesTotalAntes: redondear(interesAntes),
            interesTotalDespues: redondear(interesDespues),
        },
    };
}

/**
 * ¿El cronograma ya refleja los abonos que registran sus cuotas?
 *
 * No se pregunta a las observaciones —que un administrador puede editar o
 * borrar desde la UI— sino a las propias cifras: si el saldo final de la cuota
 * abonada ya descuenta lo que el socio pagó de más, el abono está aplicado.
 * Es una marca que no se puede perder ni falsificar por accidente, y hace que
 * volver a pasar el barrido sea inofensivo.
 */
function abonosSinAplicar(cuotas) {
    const filas = ordenarCuotas(cuotas);
    const tasa = num(filas[0] && filas[0].interesMensual);
    const sinAplicar = [];
    for (let i = 0; i < filas.length; i++) {
        const c = filas[i];
        const exc = excedenteDe(c);
        if (exc <= 0) continue;
        const interes = redondear(num(c.saldoInicial) * tasa);
        // El saldo no baja de cero: cuando el pago supera la deuda, el sobrante
        // no amortiza nada. Sin este tope, un crédito ya cancelado por un abono
        // seguiría apareciendo como pendiente en cada barrido nocturno.
        const saldoEsperado = Math.max(0, redondear(num(c.saldoInicial) - (num(c.valorCuotaPago) - interes)));
        if (Math.abs(num(c.saldoFinal) - saldoEsperado) > TOLERANCIA) {
            sinAplicar.push({ cuota: c, excedente: exc });
            continue;
        }
        // Que la cuota abonada muestre el saldo ya rebajado NO significa que el
        // abono esté aplicado. El formulario de pagos calcula ese saldoFinal por
        // su cuenta mientras el administrador escribe el importe, así que la
        // cuota queda rebajada aunque el resto del cronograma no se haya tocado
        // nunca. Visto en producción: la cuota 1 cerraba en $7.112.000 y la
        // cuota 2 seguía arrancando en $7.333.333. El abono está aplicado solo
        // si la rebaja continúa en la cuota siguiente.
        const siguiente = filas[i + 1];
        if (siguiente && Math.abs(num(siguiente.saldoInicial) - saldoEsperado) > TOLERANCIA) {
            sinAplicar.push({ cuota: c, excedente: exc, soloEnLaCuota: true });
        }
    }
    return sinAplicar;
}

module.exports = {
    REDUCIR_PLAZO,
    REDUCIR_CUOTA,
    TOLERANCIA,
    analizarCronograma,
    planificarReajuste,
    abonosSinAplicar,
    excedenteDe,
    ordenarCuotas,
};
