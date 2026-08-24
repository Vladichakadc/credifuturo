/**
 * Aplicación de abonos extraordinarios a capital sobre cronogramas ya
 * registrados: detección, reajuste, auditoría y reversión.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────
 *
 * Que un socio pague por encima de su cuota es un hecho que queda en la base
 * el día del pago, pero hasta ahora el recálculo solo se disparaba si alguien
 * volvía a guardar esa cuota desde la pantalla de pagos. Los pagos ya
 * registrados —los que se hicieron antes de que la función existiera, o los
 * que entraron por otra ruta— quedaban con su excedente sin aplicar: el socio
 * había entregado capital y seguía pagando intereses sobre él.
 *
 * Este servicio cierra ese hueco. Interroga las propias cifras del cronograma
 * para saber qué abonos siguen sin aplicar, rehace el plan de pagos completo
 * con la ley del crédito y deja registrado el estado anterior de cada fila que
 * toca, de modo que la operación sea reversible.
 *
 * ── POR QUÉ GUARDA EL ESTADO ANTERIOR ────────────────────────────────
 *
 * Reescribe la deuda registrada de personas reales, y en producción no existe
 * hoy una ruta de restauración: los respaldos son exportes .xlsx y los
 * endpoints de mantenimiento no están montados por falta de SETUP_KEY. Sin un
 * punto de retorno, un error en este código sería definitivo. Con él, cada
 * reajuste se puede deshacer fila por fila.
 */

const { Op } = require('sequelize');
const sequelize = require('../config/database');
const LoanPayment = require('../models/LoanPayment');
const AbonoAplicado = require('../models/AbonoAplicado');
// Se registra arriba, no dentro de las funciones: el modelo tiene que estar
// definido antes de que corra sequelize.sync(), o su tabla no se crea.
const AppSetting = require('../models/AppSetting');
const {
    REDUCIR_PLAZO, REDUCIR_CUOTA, TOLERANCIA,
    analizarCronograma, planificarReajuste, planificarPagoAdelantado,
    abonosSinAplicar, ordenarCuotas, excedenteDe,
} = require('./amortizacion');

// Columnas que el reajuste puede tocar. Todo lo demás —estado, lo que el socio
// pagó, la fecha— es un hecho registrado y no se reescribe.
const COLUMNAS = ['saldoInicial', 'valorInteresesAmortizados', 'valorCuotaVariable', 'saldoFinal'];

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const pesos = (n) => `$${Math.round(num(n)).toLocaleString('es-CO')}`;

/**
 * El año en Colombia, no el del reloj del servidor.
 *
 * El contenedor de producción corre en UTC mientras el fondo opera en
 * America/Bogota. Entre las 19:00 del 31 de diciembre y la medianoche, el
 * servidor ya cree que es enero: un barrido lanzado en esa franja daría por
 * cerrado el ejercicio que aún está corriendo y no aplicaría nada.
 */
function anioBogota(fecha = new Date()) {
    return parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric' }).format(fecha), 10);
}

const anioDe = (cuota) => parseInt(String(cuota.fechaPagoMax || '').slice(0, 4), 10);

const CLAVE_POLITICA = (idVm) => `abono.politica.${idVm}`;

const politicaValida = (v) => (v === REDUCIR_PLAZO || v === REDUCIR_CUOTA ? v : null);

/**
 * Qué se hace con el excedente de ESTE préstamo: bajar la cuota o acortar el plazo.
 *
 * La elección es del socio —así lo reconoce la Ley 1555 de 2012 para el crédito
 * de consumo—, pero un pago que ya está registrado no la lleva escrita. Sin
 * consultarla en algún sitio, el barrido automático le impondría a todo el
 * mundo la opción por defecto, que es justamente la que menos le ahorra.
 *
 * Se resuelve por orden de cuánto sabemos de la voluntad del socio:
 *   1. Lo que se pide en esta operación (el administrador acaba de elegirlo).
 *   2. La preferencia guardada para el préstamo, si alguien la fijó.
 *   3. La política del último reajuste que sí se aplicó a este préstamo: si el
 *      socio ya eligió una vez, no se le cambia a mitad del crédito.
 *   4. Reducir cuota, que es el defecto del fondo.
 */
async function resolverPolitica(idVm, pedida) {
    const explicita = politicaValida(pedida);
    if (explicita) return { politica: explicita, origen: 'pedida' };

    const guardada = await AppSetting.findOne({ where: { key: CLAVE_POLITICA(idVm) } });
    const preferida = politicaValida(guardada && guardada.value);
    if (preferida) return { politica: preferida, origen: 'preferencia' };

    const previo = await AbonoAplicado.findOne({
        where: { idVm, revertidoEn: null },
        order: [['createdAt', 'DESC']],
    });
    const heredada = politicaValida(previo && previo.politica);
    if (heredada) return { politica: heredada, origen: 'abono-anterior' };

    return { politica: REDUCIR_CUOTA, origen: 'defecto' };
}

/** Deja registrada la elección del socio para los abonos siguientes del préstamo. */
async function guardarPolitica(idVm, politica) {
    const elegida = politicaValida(politica);
    if (!elegida || !idVm) return null;
    const [fila] = await AppSetting.findOrCreate({
        where: { key: CLAVE_POLITICA(idVm) },
        defaults: { value: elegida },
    });
    if (fila.value !== elegida) await fila.update({ value: elegida });
    return elegida;
}

/**
 * Analiza un préstamo y devuelve qué haría el reajuste, SIN escribir nada.
 *
 * Es el mismo cálculo que usa la aplicación real, así que lo que muestra el
 * diagnóstico es exactamente lo que quedará registrado si se confirma.
 */
async function planificarPrestamo({ idVm, politica, anio = anioBogota(), cuotas = null, respetarReversion = true }) {
    const filas = ordenarCuotas(cuotas || await LoanPayment.findAll({ where: { idVm } }));
    if (filas.length === 0) return { idVm, aplicable: false, motivo: 'El préstamo no tiene cuotas registradas.' };

    const sinAplicar = abonosSinAplicar(filas);
    if (sinAplicar.length === 0) {
        return { idVm, aplicable: false, yaAlDia: true, motivo: 'No hay abonos pendientes de aplicar en este préstamo.' };
    }

    // Los ejercicios cerrados ya repartieron sus intereses entre los socios y
    // se rindieron a la Junta. Un abono viejo no se reescribe hacia atrás.
    const primerAbono = sinAplicar[0];
    const anioAbono = anioDe(primerAbono.cuota);
    if (Number.isFinite(anioAbono) && anioAbono < anio) {
        return {
            idVm, aplicable: false, fueraDePeriodo: true,
            excedente: sinAplicar.reduce((s, x) => s + x.excedente, 0),
            motivo: `El abono más antiguo sin aplicar es de ${anioAbono} y el ajuste solo opera sobre ${anio} en adelante. `
                + 'Los ejercicios cerrados ya repartieron sus intereses entre los socios.',
        };
    }

    // Si un administrador revirtió un reajuste sobre esta misma cuota, fue
    // porque el resultado no le servía. El barrido nocturno no puede
    // deshacerle la decisión cada noche: solo vuelve a aplicarlo quien lo pida
    // expresamente desde la pantalla.
    if (respetarReversion) {
        const revertido = await AbonoAplicado.findOne({
            where: { idVm, revertidoEn: { [Op.ne]: null } },
            order: [['revertidoEn', 'DESC']],
        });
        if (revertido) {
            return {
                idVm, aplicable: false, revertido: true,
                excedente: sinAplicar.reduce((s, x) => s + x.excedente, 0),
                motivo: `Un administrador revirtió el reajuste de este préstamo el ${new Date(revertido.revertidoEn).toLocaleDateString('es-CO')}. `
                    + 'No se vuelve a aplicar solo; hay que pedirlo desde la pantalla de pagos.',
            };
        }
    }

    const diagnostico = analizarCronograma(filas);
    if (!diagnostico.recalculable) {
        return {
            idVm, aplicable: false, diagnostico,
            excedente: sinAplicar.reduce((s, x) => s + x.excedente, 0),
            motivo: diagnostico.motivo,
        };
    }

    const elegida = await resolverPolitica(idVm, politica);

    // El capital por cuota lo dicta el cronograma vigente, no DisbursedLoan:
    // ese registro puede declarar un número de cuotas distinto del de filas
    // reales, y dividir por él anula cuotas que el socio sí debe.
    const plan = planificarReajuste({ cuotas: filas, politica: elegida.politica });
    if (!plan.ok) return { idVm, aplicable: false, motivo: plan.motivo };

    // Salvaguarda: nada anterior al primer abono puede moverse. Si el plan
    // cambia una cuota previa, es que el cronograma no era el que dice ser y
    // se prefiere no tocarlo a escribir cifras que no cuadran.
    const idsPrevios = new Set();
    for (const f of filas) {
        if (f.id === primerAbono.cuota.id) break;
        idsPrevios.add(f.id);
    }
    for (const nueva of plan.filas) {
        if (!idsPrevios.has(nueva.id)) continue;
        const original = filas.find((f) => f.id === nueva.id);
        for (const col of COLUMNAS) {
            if (Math.abs(num(nueva[col]) - num(original[col])) > TOLERANCIA) {
                return {
                    idVm, aplicable: false,
                    motivo: 'El reajuste alteraría cuotas anteriores al abono, lo que indica que el cronograma guardado no corresponde a sus condiciones. Requiere revisión manual.',
                };
            }
        }
    }

    const cambios = plan.filas
        .filter((nueva) => !idsPrevios.has(nueva.id))
        .map((nueva) => {
            const original = filas.find((f) => f.id === nueva.id);
            const antes = {}; const despues = {};
            let difiere = false;
            for (const col of COLUMNAS) {
                antes[col] = num(original[col]);
                despues[col] = num(nueva[col]);
                if (Math.abs(antes[col] - despues[col]) > 0.005) difiere = true;
            }
            return {
                id: nueva.id, cuota: original.externalId || original.itemQuantity,
                itemQuantity: original.itemQuantity, estado: original.estado,
                antes, despues, difiere,
                cancelar: Boolean(nueva.sobra) && !original.esPrepago,
            };
        })
        .filter((c) => c.difiere || c.cancelar);

    if (cambios.length === 0) {
        return { idVm, aplicable: false, yaAlDia: true, motivo: 'El cronograma ya refleja el abono.' };
    }

    return {
        idVm,
        aplicable: true,
        clientId: filas[0].clientId,
        politica: plan.resumen.politica,
        // De dónde salió la política, para que la pantalla pueda decir si es la
        // que eligió el socio o simplemente la que el fondo aplica por defecto.
        origenPolitica: elegida.origen,
        cuotaAbonada: primerAbono.cuota.externalId || primerAbono.cuota.itemQuantity,
        loanPaymentId: primerAbono.cuota.id,
        abonos: sinAplicar.map((x) => ({ cuota: x.cuota.externalId || x.cuota.itemQuantity, excedente: x.excedente })),
        resumen: plan.resumen,
        cancelaElCredito: plan.cancelaElCredito,
        cambios,
    };
}

/**
 * Persiste un plan ya calculado, dejando registro de cómo estaba antes.
 *
 * Toma una transacción IMMEDIATE: en SQLite una transacción diferida que
 * primero lee y después escribe falla con SQLITE_BUSY al subir el bloqueo, sin
 * respetar el busy timeout. Pedir el bloqueo de escritura desde el principio
 * hace que, si hay contención, falle limpio y de inmediato en vez de a mitad.
 */
async function aplicarPlan(plan, { origen = 'barrido', aplicadoPor = 'sistema' } = {}) {
    if (!plan.aplicable) return { ...plan, aplicado: false };

    // Si la política vino pedida en esta operación, es una elección deliberada:
    // se guarda para que el barrido nocturno la respete en los abonos que
    // vengan después, en vez de volver al defecto del fondo.
    if (plan.origenPolitica === 'pedida') await guardarPolitica(plan.idVm, plan.politica);

    const t = await sequelize.transaction({ type: 'IMMEDIATE' });
    try {
        const nota = `Abono extraordinario de ${pesos(plan.resumen.excedente)} a capital · `
            + `${plan.politica === REDUCIR_CUOTA ? 'reducción de cuota' : 'reducción de plazo'}.`;

        for (const cambio of plan.cambios) {
            const destino = await LoanPayment.findByPk(cambio.id, { transaction: t });
            if (!destino) continue;
            const datos = { ...cambio.despues };
            if (cambio.cancelar) {
                // Las cuotas que sobran tras un abono grande se marcan canceladas
                // por prepago: es el mismo tratamiento que ya usa la
                // refinanciación, y las deja fuera del cálculo de rentabilidad.
                datos.estado = 'Pago';
                datos.valorCuotaPago = 0;
                datos.esPrepago = true;
                datos.observaciones = `Cancelada por abono extraordinario a capital de ${pesos(plan.resumen.excedente)}.`;
            }
            await destino.update(datos, { transaction: t });
        }

        // La nota queda en la cuota que recibió el abono, antepuesta a lo que
        // hubiera escrito el administrador. Es informativa: la marca de que el
        // abono está aplicado son las cifras, no este texto.
        const abonada = await LoanPayment.findByPk(plan.loanPaymentId, { transaction: t });
        if (abonada && !String(abonada.observaciones || '').includes('Abono extraordinario')) {
            const previas = String(abonada.observaciones || '').trim();
            await abonada.update({ observaciones: previas ? `${nota} ${previas}` : nota }, { transaction: t });
        }

        const registro = await AbonoAplicado.create({
            idVm: plan.idVm,
            clientId: plan.clientId,
            loanPaymentId: plan.loanPaymentId,
            excedente: plan.resumen.excedente,
            politica: plan.politica,
            origen,
            aplicadoPor: String(aplicadoPor || 'sistema'),
            estadoAnterior: JSON.stringify(plan.cambios.map((c) => ({ id: c.id, antes: c.antes, estado: c.estado, cancelada: c.cancelar }))),
            resumen: JSON.stringify(plan.resumen),
        }, { transaction: t });

        await t.commit();
        return { ...plan, aplicado: true, registroId: registro.id };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}


// ─────────────────────────────────────────────────────────────────────
// PAGO ADELANTADO DE CUOTAS
// ─────────────────────────────────────────────────────────────────────

/**
 * Qué cuotas quedarían saldadas al repartir un pago que cubre varias.
 *
 * No escribe nada. Es el previo del reparto, y se lee igual que el del abono:
 * lo que muestra es exactamente lo que quedará registrado si se confirma.
 */
async function planificarReparto({ idVm, anio = anioBogota() }) {
    const filas = ordenarCuotas(await LoanPayment.findAll({ where: { idVm } }));
    if (filas.length === 0) return { idVm, aplicable: false, motivo: 'El préstamo no tiene cuotas registradas.' };

    // El reparto y el abono a capital se disputan el mismo dinero: si el abono
    // ya se aplicó, repartir ahora contaría dos veces el excedente. Hay que
    // revertirlo primero, que para eso existe el registro.
    const aplicado = await AbonoAplicado.findOne({
        where: { idVm, revertidoEn: null },
        order: [['createdAt', 'DESC']],
    });
    if (aplicado) {
        return {
            idVm, aplicable: false, requiereRevertir: true, registroId: aplicado.id,
            motivo: `El excedente de este préstamo ya se aplicó a capital el ${new Date(aplicado.createdAt).toLocaleDateString('es-CO')}. `
                + 'Para repartirlo entre las cuotas siguientes hay que revertir antes ese reajuste.',
        };
    }

    const plan = planificarPagoAdelantado({ cuotas: filas });
    if (!plan.ok) return { idVm, aplicable: false, motivo: plan.motivo };

    const primera = filas.find((c) => excedenteDe(c) > 0);
    const anioCuota = anioDe(primera);
    if (Number.isFinite(anioCuota) && anioCuota < anio) {
        return {
            idVm, aplicable: false, fueraDePeriodo: true,
            motivo: `El pago es de ${anioCuota} y el ajuste solo opera sobre ${anio} en adelante.`,
        };
    }

    return {
        idVm, aplicable: true, clientId: filas[0].clientId,
        ...plan,
    };
}

/** Persiste el reparto, guardando cómo estaba cada cuota antes. */
async function aplicarReparto(plan, { origen = 'manual', aplicadoPor = 'sistema' } = {}) {
    if (!plan.aplicable) return { ...plan, aplicado: false };

    const t = await sequelize.transaction({ type: 'IMMEDIATE' });
    try {
        const antes = [];
        const cuotaOrigen = await LoanPayment.findByPk(plan.origen.id, { transaction: t });
        antes.push({ id: cuotaOrigen.id, antes: { valorCuotaPago: num(cuotaOrigen.valorCuotaPago) }, estado: cuotaOrigen.estado });
        await cuotaOrigen.update({ valorCuotaPago: plan.pagoOrigen }, { transaction: t });

        for (const s2 of plan.saldadas) {
            const c = await LoanPayment.findByPk(s2.id, { transaction: t });
            if (!c) continue;
            antes.push({ id: c.id, antes: { valorCuotaPago: num(c.valorCuotaPago) }, estado: c.estado });
            await c.update({
                estado: 'Pago',
                valorCuotaPago: s2.valor,
                observaciones: `Cubierta por el pago adelantado registrado en la cuota ${plan.origen.cuota}.`,
            }, { transaction: t });
        }

        const registro = await AbonoAplicado.create({
            idVm: plan.idVm,
            clientId: plan.clientId,
            loanPaymentId: plan.origen.id,
            excedente: plan.resumen.excedente,
            politica: 'pago-adelantado',
            origen,
            aplicadoPor: String(aplicadoPor || 'sistema'),
            estadoAnterior: JSON.stringify(antes),
            resumen: JSON.stringify(plan.resumen),
        }, { transaction: t });

        await t.commit();
        return { ...plan, aplicado: true, registroId: registro.id };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

/** Deshace un reajuste devolviendo cada cuota a como estaba. */
async function revertir(registroId, { revertidoPor = 'sistema' } = {}) {
    const registro = await AbonoAplicado.findByPk(registroId);
    if (!registro) return { ok: false, motivo: 'No existe ese registro de abono.' };
    if (registro.revertidoEn) return { ok: false, motivo: 'Ese reajuste ya se revirtió.' };

    const filas = JSON.parse(registro.estadoAnterior || '[]');
    const t = await sequelize.transaction({ type: 'IMMEDIATE' });
    try {
        for (const fila of filas) {
            const destino = await LoanPayment.findByPk(fila.id, { transaction: t });
            if (!destino) continue;
            const datos = { ...fila.antes };
            if (fila.cancelada) {
                datos.estado = fila.estado;
                datos.esPrepago = false;
                datos.observaciones = null;
            } else if (registro.politica === 'pago-adelantado') {
                // Un reparto no cancela cuotas: las salda. Al revertirlo hay que
                // devolverlas al estado que tenían, o quedarían pagadas sin dinero.
                datos.estado = fila.estado;
                datos.observaciones = null;
            }
            await destino.update(datos, { transaction: t });
        }
        await registro.update({ revertidoEn: new Date(), revertidoPor: String(revertidoPor) }, { transaction: t });
        await t.commit();
        return { ok: true, cuotas: filas.length, idVm: registro.idVm };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

/**
 * Recorre la cartera buscando abonos sin aplicar.
 *
 * En modo diagnóstico (`aplicar: false`) no escribe una sola fila: calcula lo
 * que haría y lo devuelve, que es como conviene mirarlo la primera vez.
 */
async function barrer({ anio = anioBogota(), aplicar = false, origen = 'barrido', aplicadoPor = 'sistema', limite = 500 } = {}) {
    // Solo entran préstamos con al menos una cuota pagada por encima de su
    // valor: el resto de la cartera ni se carga en memoria.
    const candidatos = await LoanPayment.findAll({
        attributes: ['idVm'],
        where: {
            estado: 'Pago',
            idVm: { [Op.ne]: null },
            valorCuotaPago: { [Op.gt]: sequelize.literal('COALESCE(valor_cuota_variable, 0) + ' + TOLERANCIA) },
        },
        group: ['idVm'],
        raw: true,
    });

    const resultado = {
        anio, aplicar, revisados: candidatos.length,
        aplicados: [], pendientes: [], bloqueados: [], alDia: 0, errores: [],
    };

    for (const { idVm } of candidatos.slice(0, limite)) {
        try {
            const plan = await planificarPrestamo({ idVm, anio });
            if (!plan.aplicable) {
                if (plan.yaAlDia) resultado.alDia++;
                else resultado.bloqueados.push({ idVm, motivo: plan.motivo, excedente: plan.excedente || 0 });
                continue;
            }
            if (!aplicar) { resultado.pendientes.push(plan); continue; }
            resultado.aplicados.push(await aplicarPlan(plan, { origen, aplicadoPor }));
        } catch (err) {
            resultado.errores.push({ idVm, error: err.message });
        }
    }

    return resultado;
}

// ─────────────────────────────────────────────────────────────────────
// BARRIDO PROGRAMADO
// ─────────────────────────────────────────────────────────────────────

const CLAVE_LOCK = 'barridoAbonos.lock';
const LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Toma un cerrojo persistente para que dos ejecuciones no se pisen.
 *
 * Una variable de módulo no serviría: el vector real no es otro hilo sino otro
 * proceso —un reinicio en bucle tras un fallo, o un segundo contenedor si
 * alguien sube las réplicas—. La transacción IMMEDIATE hace que la lectura y la
 * escritura del cerrojo sean atómicas también entre procesos.
 */
async function tomarCerrojo(instancia) {
    const t = await sequelize.transaction({ type: 'IMMEDIATE' });
    try {
        const fila = await AppSetting.findOne({ where: { key: CLAVE_LOCK }, transaction: t });
        const ahora = Date.now();
        if (fila) {
            let previo = {};
            try { previo = JSON.parse(fila.value || '{}'); } catch { previo = {}; }
            // Un cerrojo huérfano —el proceso murió sin soltarlo— caduca solo.
            if (previo.hasta && previo.hasta > ahora) { await t.rollback(); return false; }
            await fila.update({ value: JSON.stringify({ instancia, desde: ahora, hasta: ahora + LOCK_TTL_MS }) }, { transaction: t });
        } else {
            await AppSetting.create({ key: CLAVE_LOCK, value: JSON.stringify({ instancia, desde: ahora, hasta: ahora + LOCK_TTL_MS }) }, { transaction: t });
        }
        await t.commit();
        return true;
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

async function soltarCerrojo() {
    await AppSetting.update({ value: JSON.stringify({ hasta: 0 }) }, { where: { key: CLAVE_LOCK } }).catch(() => { });
}

/**
 * Copia el archivo de la base antes de tocar nada.
 *
 * Los respaldos diarios son exportes .xlsx: sirven para consultar, no para
 * restaurar. Y en producción los endpoints de mantenimiento no están montados,
 * así que no hay forma remota de subir una base recuperada. Una copia byte a
 * byte del .sqlite es barata y es la única red real que existe hoy.
 */
function copiaDeSeguridad() {
    const fs = require('fs');
    const path = require('path');
    const origen = sequelize.options.storage;
    if (!origen || !fs.existsSync(origen)) return null;
    const carpeta = path.join(path.dirname(origen), 'Backups');
    fs.mkdirSync(carpeta, { recursive: true });
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    const destino = path.join(carpeta, `pre-abonos-${sello}.sqlite`);
    fs.copyFileSync(origen, destino);
    // Se conservan las tres últimas: el volumen de producción es pequeño.
    const viejas = fs.readdirSync(carpeta).filter((f) => f.startsWith('pre-abonos-')).sort().reverse().slice(3);
    for (const f of viejas) { try { fs.unlinkSync(path.join(carpeta, f)); } catch { /* da igual */ } }
    return destino;
}

/**
 * Lo que se le cuenta al socio. El ahorro solo se menciona cuando lo hay: un
 * aviso que anuncie un ahorro negativo es peor que no decir nada.
 */
function mensajeParaElSocio(plan) {
    const monto = (n) => `$${Math.round(num(n)).toLocaleString('es-CO')}`;
    const abonado = `Los ${monto(plan.resumen.excedente)} que pagaste por encima de tu cuota abonaron a capital`;
    if (plan.cancelaElCredito) {
        return plan.resumen.sobrante > 0
            ? `${abonado} y cancelaron tu crédito. Quedaron ${monto(plan.resumen.sobrante)} a tu favor: el fondo se comunicará contigo para devolvértelos.`
            : `${abonado} y cancelaron tu crédito.`;
    }
    return plan.resumen.ahorroInteres > 0
        ? `${abonado} y te ahorran ${monto(plan.resumen.ahorroInteres)} en intereses.`
        : `${abonado} y tus cuotas siguientes ya se recalcularon sobre el saldo nuevo.`;
}

/**
 * La pasada automática: revisa, aplica lo que sea inequívoco y avisa.
 *
 * Lo que no es inequívoco —cronogramas importados, préstamos en mora, abonos de
 * ejercicios cerrados— no se toca: queda listado para que un administrador lo
 * mire. Cada reajuste guarda su estado anterior, así que cualquiera de ellos se
 * puede deshacer desde la pantalla de pagos.
 */
async function barridoProgramado({ anio = anioBogota() } = {}) {
    const instancia = `${process.pid}@${new Date().toISOString()}`;
    if (!await tomarCerrojo(instancia)) {
        console.log('[ABONOS] Otro proceso está corriendo el barrido; esta pasada se omite.');
        return { omitido: true };
    }

    try {
        const previo = await barrer({ anio, aplicar: false });
        if (previo.pendientes.length === 0) {
            console.log(`[ABONOS] Sin abonos pendientes de aplicar (${previo.revisados} préstamo(s) con sobrepago revisados, ${previo.bloqueados.length} requieren revisión manual).`);
            return { ...previo, aplicados: [] };
        }

        const copia = copiaDeSeguridad();
        console.log(`[ABONOS] ${previo.pendientes.length} préstamo(s) con abono sin aplicar. Copia previa: ${copia || 'no disponible'}`);

        const informe = await barrer({ anio, aplicar: true, origen: 'barrido', aplicadoPor: 'sistema' });

        const { createNotification, notifyAdmins } = require('./NotificationService');
        const pesosDe = (n) => `$${Math.round(num(n)).toLocaleString('es-CO')}`;
        for (const plan of informe.aplicados) {
            if (!plan.clientId) continue;
            await createNotification({
                clientId: plan.clientId,
                type: 'abono_capital',
                title: 'Se aplicó a capital lo que pagaste de más',
                message: mensajeParaElSocio(plan),
                link: '/dashboard/mis-creditos?tab=cuotas',
            }).catch((e) => console.warn('[ABONOS] Aviso al socio no enviado:', e.message));
        }

        if (informe.aplicados.length > 0) {
            const capital = informe.aplicados.reduce((s, p) => s + num(p.resumen.excedente), 0);
            await notifyAdmins({
                type: 'abono_capital',
                title: 'Se aplicaron abonos a capital',
                message: `Se recalcularon ${informe.aplicados.length} préstamo(s) por pagos sobre la cuota, `
                    + `${pesosDe(capital)} abonados a capital.`
                    + (informe.bloqueados.length ? ` Quedan ${informe.bloqueados.length} que requieren revisión manual.` : ''),
                link: '/admin/payments',
            }).catch((e) => console.warn('[ABONOS] Aviso a administradores no enviado:', e.message));
        }

        console.log(`[ABONOS] Barrido terminado: ${informe.aplicados.length} aplicados, ${informe.bloqueados.length} bloqueados, ${informe.errores.length} con error.`);
        return { ...informe, copia };
    } finally {
        await soltarCerrojo();
    }
}

module.exports = {
    anioBogota,
    planificarReparto,
    aplicarReparto,
    mensajeParaElSocio,
    resolverPolitica,
    guardarPolitica,
    planificarPrestamo,
    aplicarPlan,
    revertir,
    barrer,
    barridoProgramado,
    REDUCIR_CUOTA,
    REDUCIR_PLAZO,
};
