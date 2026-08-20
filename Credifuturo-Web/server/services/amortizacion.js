/**
 * Amortización y abonos extraordinarios a capital.
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

/**
 * ¿Se puede recalcular este cronograma sin inventar cifras?
 *
 * Comprueba dos cosas independientes:
 *   · ENCADENADO — el saldo final de cada cuota es el saldo inicial de la
 *     siguiente. Sin esto no hay una línea de saldo que continuar.
 *   · COHERENTE  — el interés declarado en cada cuota corresponde a su saldo
 *     inicial por la tasa. Sin esto la tasa guardada no describe el préstamo,
 *     y recalcular con ella daría un resultado distinto del pactado.
 */
function analizarCronograma(cuotas) {
    const filas = ordenarCuotas(cuotas);
    if (filas.length === 0) {
        return { recalculable: false, encadenado: false, coherente: false, motivo: 'El préstamo no tiene cuotas registradas.' };
    }

    let encadenado = true;
    for (let i = 0; i < filas.length - 1; i++) {
        if (Math.abs(num(filas[i].saldoFinal) - num(filas[i + 1].saldoInicial)) > TOLERANCIA) {
            encadenado = false;
            break;
        }
    }

    let coherente = true;
    for (const c of filas) {
        const esperado = num(c.saldoInicial) * num(c.interesMensual);
        if (Math.abs(esperado - num(c.valorInteresesAmortizados)) > TOLERANCIA) {
            coherente = false;
            break;
        }
    }

    // Que el saldo encadene no basta: un cronograma en el que el saldo nunca
    // baja también encadena consigo mismo y pasaría por sano. Hay que exigir
    // que el crédito de verdad se extinga.
    const ultima = filas[filas.length - 1];
    const extingue = Math.abs(num(ultima.saldoFinal)) <= TOLERANCIA;

    // Y hay que comprobar la ley de amortización, no solo la aritmética. Este
    // fondo amortiza por sistema alemán: el capital de cada cuota es constante
    // y lo que decrece es el interés. En el sistema francés —cuota fija— el
    // capital crece período a período. Los dos encadenan y los dos son
    // coherentes, así que sin esta prueba un préstamo francés pasaría el filtro
    // y se recalcularía como alemán, cambiándole al socio la ley del crédito
    // que firmó. Se excluye la última cuota, que suele amortizar un residuo.
    const capitales = filas.map((c) => num(c.saldoInicial) - num(c.saldoFinal));
    const cuerpo = capitales.length > 1 ? capitales.slice(0, -1) : capitales;
    const capitalRef = cuerpo[0];
    const capitalConstante = cuerpo.every((k) => Math.abs(k - capitalRef) <= TOLERANCIA) && capitalRef > TOLERANCIA;

    let motivo = null;
    if (!encadenado) {
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
        recalculable: encadenado && extingue && capitalConstante && coherente,
        encadenado, coherente, extingue, capitalConstante, motivo,
    };
}

/**
 * Rehace las cuotas pendientes después de aplicar un abono extraordinario.
 *
 * No toca nada de lo ya cobrado: lo pagado es un hecho consumado y su interés
 * ya se causó. Solo se reescribe lo que todavía no ha vencido.
 *
 * Devuelve las filas nuevas (sin persistir) y el resumen del efecto, para que
 * el llamador pueda mostrarlo antes de confirmar.
 */
function recalcularTrasAbono({ cuotasPendientes, saldoNuevo, capitalPorCuota, politica = REDUCIR_PLAZO }) {
    const filas = ordenarCuotas(cuotasPendientes);
    const saldoInicialNuevo = Math.max(0, redondear(saldoNuevo));

    const interesRestanteAntes = filas.reduce((s, c) => s + num(c.valorInteresesAmortizados), 0);

    // Con el saldo en cero el crédito queda cancelado: las cuotas que quedaban
    // no llegan a causar interés y se anulan en vez de recalcularse.
    if (saldoInicialNuevo <= 0) {
        return {
            cancelaElCredito: true,
            filas: filas.map((c) => ({
                id: c.id,
                saldoInicial: 0,
                valorInteresesAmortizados: 0,
                valorCuotaVariable: 0,
                saldoFinal: 0,
            })),
            resumen: {
                cuotasAntes: filas.length,
                cuotasDespues: 0,
                interesAntes: redondear(interesRestanteAntes),
                interesDespues: 0,
                ahorroInteres: redondear(interesRestanteAntes),
            },
        };
    }

    const tasa = num(filas[0].interesMensual);
    // Al reducir cuota el capital se reparte entre las mismas cuotas que
    // quedaban; al reducir plazo se conserva el capital pactado por cuota.
    const capital = politica === REDUCIR_CUOTA
        ? saldoInicialNuevo / filas.length
        : num(capitalPorCuota);

    const nuevas = [];
    let saldo = saldoInicialNuevo;

    for (const c of filas) {
        if (saldo <= 0) {
            // Sobran cuotas: el crédito termina antes (política de reducir plazo).
            nuevas.push({ id: c.id, saldoInicial: 0, valorInteresesAmortizados: 0, valorCuotaVariable: 0, saldoFinal: 0, sobra: true });
            continue;
        }
        const interes = redondear(saldo * tasa);
        // La última cuota amortiza lo que quede, para que el saldo cierre en cero
        // exacto y no en un residuo de centavos.
        const capitalCuota = Math.min(capital, saldo);
        const saldoFin = redondear(saldo - capitalCuota);
        nuevas.push({
            id: c.id,
            saldoInicial: redondear(saldo),
            valorInteresesAmortizados: interes,
            valorCuotaVariable: redondear(capitalCuota + interes),
            saldoFinal: Math.max(0, saldoFin),
            sobra: false,
        });
        saldo = saldoFin;
    }

    const vigentes = nuevas.filter((f) => !f.sobra);
    const interesDespues = vigentes.reduce((s, f) => s + num(f.valorInteresesAmortizados), 0);

    return {
        cancelaElCredito: false,
        filas: nuevas,
        resumen: {
            cuotasAntes: filas.length,
            cuotasDespues: vigentes.length,
            interesAntes: redondear(interesRestanteAntes),
            interesDespues: redondear(interesDespues),
            ahorroInteres: redondear(interesRestanteAntes - interesDespues),
        },
    };
}

module.exports = {
    REDUCIR_PLAZO,
    REDUCIR_CUOTA,
    analizarCronograma,
    recalcularTrasAbono,
    ordenarCuotas,
};
