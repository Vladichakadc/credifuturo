/**
 * Corrige lo que quedó escrito con el ACUMULADO del crédito donde iba el abono.
 *
 * ── QUÉ PASÓ ─────────────────────────────────────────────────────────────────
 *
 * Hasta octubre de 2026 el reajuste llamaba "excedente" a la suma de todo lo que
 * el socio había pagado de más en la vida del crédito. En el primer abono de un
 * préstamo eso coincide con lo abonado y nadie lo nota. En el segundo ya no: una
 * socia pagó $1.035.000 sobre una cuota de $746.113 —$288.887 de más— y el
 * sistema dejó escrito $510.220, que es ese abono más el de su primera cuota:
 *
 *   · en el registro del reajuste (`AbonosAplicados.excedente`), con lo que el
 *     historial de la pantalla sumaba dos veces el primer abono;
 *   · en la nota de la cuota ("Abono extraordinario de $510.220…");
 *   · en el aviso de la campana ("Los $510.220 que pagaste de más…");
 *   · y en su informe, que además se contradecía: "$510.220 abonado + $22.244
 *     de intereses = $311.131 menos por pagar".
 *
 * El cronograma estaba bien —las cuotas, los saldos y los intereses se
 * calcularon con el abono correcto—. Lo equivocado era lo que se DECÍA.
 *
 * El motor ya guarda lo que aplica cada reajuste (`amortizacion.js`). Esto
 * arregla lo que se escribió antes, y es lo único que puede hacerlo en
 * producción: no hay acceso a esa base salvo el propio servidor al arrancar.
 *
 * ── CÓMO SE SABE CUÁNTO FUE CADA UNO ─────────────────────────────────────────
 *
 * El acumulado de un reajuste menos el acumulado del que seguía vigente cuando
 * se creó (`cifrasDeRegistro`). No hace falta reinterpretar ningún pago.
 *
 * ── POR QUÉ SE PUEDE CORRER SIEMPRE ──────────────────────────────────────────
 *
 * Un reajuste ya corregido lleva `resumen.excedenteAcumulado` y no se vuelve a
 * tocar. El informe se rehace ANTES de marcar el reajuste: si algo falla a
 * mitad, el siguiente arranque lo reintenta entero en vez de dar por hecho un
 * documento que se quedó sin corregir.
 */

const { Op } = require('sequelize');
const sequelize = require('../config/database');
const LoanPayment = require('../models/LoanPayment');
const AbonoAplicado = require('../models/AbonoAplicado');
const AppSetting = require('../models/AppSetting');
const abonoCapital = require('./abonoCapital');
const informes = require('./informeAbono');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const redondear = (n) => parseFloat(num(n).toFixed(2));
const pesos = (n) => `$${Math.round(num(n)).toLocaleString('es-CO')}`;
const leerFilas = (registro) => { try { return JSON.parse(registro.estadoAnterior || '[]') || []; } catch { return []; } };

/** El informe que explica un reajuste: el que dejó anotado o, si es anterior a esa anotación, el de sus cifras. */
async function informeDe(registro, cifras) {
    const registroInformes = await informes.leerRegistroInformes();
    const anotado = abonoCapital.resumenDe(registro).informe;
    if (anotado && registroInformes[anotado]) return { nombre: anotado, meta: registroInformes[anotado] };
    const candidatas = [Math.round(cifras.propio), Math.round(cifras.acumulado)].filter((n) => n > 0);
    for (const [nombre, meta] of Object.entries(registroInformes)) {
        if (!meta || meta.idVm !== registro.idVm) continue;
        if (candidatas.includes(Number(meta.resumen && meta.resumen.excedente))) return { nombre, meta };
    }
    return null;
}

/**
 * Rehace el plan de un reajuste ya aplicado, para volver a escribir su informe.
 *
 * El "antes" de cada cuota está guardado en el propio reajuste. El "después" es
 * lo que encontró el siguiente reajuste que tocó esa cuota o, si no hubo otro,
 * lo que la cuota tiene hoy.
 */
async function planDesdeRegistro(registro, delPrestamo, cifras) {
    const resumen = abonoCapital.resumenDe(registro);
    const posteriores = delPrestamo.filter((r) => r.id > registro.id).sort((a, b) => a.id - b.id).map(leerFilas);

    const cambios = [];
    for (const fila of leerFilas(registro)) {
        const cuota = await LoanPayment.findByPk(fila.id);
        if (!cuota || !fila.antes) continue;
        let despues = null;
        for (const lote of posteriores) {
            const siguiente = lote.find((x) => x.id === fila.id);
            if (siguiente && siguiente.antes) { despues = siguiente.antes; break; }
        }
        if (!despues) despues = Object.fromEntries(abonoCapital.COLUMNAS.map((c) => [c, num(cuota[c])]));
        cambios.push({
            id: fila.id,
            cuota: cuota.externalId || cuota.itemQuantity,
            itemQuantity: cuota.itemQuantity,
            estado: fila.estado,
            antes: fila.antes,
            despues,
            difiere: abonoCapital.COLUMNAS.some((c) => Math.abs(num(fila.antes[c]) - num(despues[c])) > 0.005),
            cancelar: Boolean(fila.cancelada),
        });
    }

    const abonada = registro.loanPaymentId ? await LoanPayment.findByPk(registro.loanPaymentId) : null;
    const abonos = abonada ? [{
        id: abonada.id,
        cuota: abonada.externalId || abonada.itemQuantity,
        numero: abonada.itemQuantity,
        pagado: num(abonada.valorCuotaPago),
        valorCuota: num(abonada.valorCuotaVariable),
        excedente: redondear(num(abonada.valorCuotaPago) - num(abonada.valorCuotaVariable)),
    }] : [];

    return {
        idVm: registro.idVm,
        politica: registro.politica,
        cambios,
        abonos,
        resumen: {
            ...resumen,
            excedente: cifras.propio,
            excedenteAcumulado: cifras.acumulado,
            capitalAplicado: redondear(cifras.propio + num(resumen.interesReintegrado) - num(resumen.sobrante)),
        },
    };
}

/** Deja el aviso del informe con el título que el informe tiene ahora. */
async function renombrarEnElAviso(nombre, tituloViejo, tituloNuevo) {
    if (!tituloViejo || tituloViejo === tituloNuevo) return 0;
    const Notification = require('../models/Notification');
    const avisos = await Notification.findAll({ where: { type: 'informe', link: informes.enlaceDeInforme(nombre) } });
    let cambiados = 0;
    for (const aviso of avisos) {
        const texto = String(aviso.message || '');
        if (!texto.startsWith(`${tituloViejo}.`)) continue;
        await aviso.update({ message: `${tituloNuevo}${texto.slice(tituloViejo.length)}` });
        cambiados++;
    }
    return cambiados;
}

/**
 * Corrige un reajuste que guardó el acumulado: su informe, su registro, la nota
 * de la cuota y los avisos que citaban esa cifra.
 */
async function corregirUno(registro, delPrestamo, cifras) {
    const hecho = {
        id: registro.id, idVm: registro.idVm, antes: cifras.acumulado, ahora: cifras.propio,
        informe: null, notas: 0, avisos: 0,
    };
    const vieja = abonoCapital.notaDeAbono(cifras.acumulado, registro.politica);
    const resumen = abonoCapital.resumenDe(registro);

    // 1. El informe, primero. Solo si el reajuste sigue en pie: el de uno
    //    revertido ya está retirado y no hay nada que explicarle al socio.
    const informe = registro.revertidoEn ? null : await informeDe(registro, cifras);
    if (informe && !informe.meta.retiradoEl && informe.nombre.endsWith('.md')) {
        const Client = require('../models/Client');
        const socio = registro.clientId ? await Client.findByPk(registro.clientId) : null;
        const plan = await planDesdeRegistro(registro, delPrestamo, cifras);
        const publicado = socio ? await informes.publicarInforme({
            plan, socio, idVm: registro.idVm,
            // La fecha del abono, no la de la corrección: el documento explica
            // lo que pasó ese día. Y su mismo nombre, que es a donde lleva el
            // aviso que el socio ya tiene.
            fecha: new Date(registro.createdAt),
            nombre: informe.nombre,
            notificar: false,
            generadoEl: informe.meta.generadoEl || null,
        }) : null;
        if (!publicado) throw new Error(`no se pudo reescribir el informe ${informe.nombre}`);
        hecho.informe = informe.nombre;
        hecho.avisos += await renombrarEnElAviso(informe.nombre, informe.meta.titulo, informes.tituloDe(registro.idVm, plan));
    }

    // 2. El registro, la nota y los avisos: todo o nada.
    const t = await sequelize.transaction({ type: 'IMMEDIATE' });
    try {
        await registro.update({
            excedente: cifras.propio,
            resumen: JSON.stringify({
                ...resumen,
                excedente: cifras.propio,
                excedenteAcumulado: cifras.acumulado,
                ...(hecho.informe ? { informe: hecho.informe } : {}),
            }),
        }, { transaction: t });

        if (!registro.revertidoEn && registro.loanPaymentId) {
            const cuota = await LoanPayment.findByPk(registro.loanPaymentId, { transaction: t });
            const obs = String((cuota && cuota.observaciones) || '');
            if (cuota && obs.startsWith(vieja)) {
                // La nota va sobre la cuota: lleva lo pagado de más en ella.
                const deLaCuota = num(cuota.valorCuotaPago) - num(cuota.valorCuotaVariable);
                const nueva = abonoCapital.notaDeAbono(deLaCuota > 1 ? deLaCuota : cifras.propio, registro.politica);
                await cuota.update({ observaciones: `${nueva}${obs.slice(vieja.length)}` }, { transaction: t });
                hecho.notas++;
            }
        }
        for (const fila of leerFilas(registro).filter((f) => f.cancelada)) {
            const cuota = await LoanPayment.findByPk(fila.id, { transaction: t });
            if (cuota && cuota.observaciones === `Cancelada por abono extraordinario a capital de ${pesos(cifras.acumulado)}.`) {
                await cuota.update({ observaciones: `Cancelada por abono extraordinario a capital de ${pesos(cifras.propio)}.` }, { transaction: t });
                hecho.notas++;
            }
        }

        if (registro.clientId) {
            // Solo los avisos que salieron con ESE reajuste: mismo socio, en la
            // hora siguiente, y citando exactamente la cifra equivocada.
            const Notification = require('../models/Notification');
            const creado = new Date(registro.createdAt).getTime();
            const avisos = await Notification.findAll({
                where: {
                    clientId: registro.clientId,
                    type: { [Op.in]: ['payment_registered', 'abono_capital'] },
                    createdAt: { [Op.between]: [new Date(creado - 60 * 1000), new Date(creado + 60 * 60 * 1000)] },
                },
                transaction: t,
            });
            const dicho = `Los ${pesos(cifras.acumulado)} que pagaste`;
            for (const aviso of avisos) {
                const texto = String(aviso.message || '');
                if (!texto.includes(dicho)) continue;
                await aviso.update({ message: texto.replace(dicho, `Los ${pesos(cifras.propio)} que pagaste`) }, { transaction: t });
                hecho.avisos++;
            }
        }
        await t.commit();
    } catch (err) {
        await t.rollback();
        throw err;
    }
    return hecho;
}

/**
 * Que el informe de cada reajuste diga a qué cuota corresponde.
 *
 * Con un solo abono por crédito el título "Tu abono a capital — crédito SOL30"
 * bastaba. Con dos, la socia tiene en su lista dos documentos con el mismo
 * título y cifras distintas.
 */
async function ponerCuotaEnElTitulo(registro, cifras) {
    if (registro.revertidoEn || !registro.loanPaymentId) return null;
    const informe = await informeDe(registro, cifras);
    if (!informe || informe.meta.retiradoEl) return null;
    const cuota = await LoanPayment.findByPk(registro.loanPaymentId, { attributes: ['itemQuantity'] });
    if (!cuota || cuota.itemQuantity === null || cuota.itemQuantity === undefined) return null;
    const titulo = informes.tituloDe(registro.idVm, { abonos: [{ numero: cuota.itemQuantity }] });
    if (informe.meta.titulo === titulo) return null;

    const registroInformes = await informes.leerRegistroInformes();
    registroInformes[informe.nombre] = { ...registroInformes[informe.nombre], titulo };
    await AppSetting.upsert({ key: informes.CLAVE_INFORMES_SOCIO, value: JSON.stringify(registroInformes) });
    await renombrarEnElAviso(informe.nombre, informe.meta.titulo, titulo);
    return { nombre: informe.nombre, titulo };
}

/**
 * La pasada completa. Devuelve qué corrigió, para que el arranque lo diga en el
 * log con nombres y cifras: una corrección sobre el dinero de alguien que no
 * deja rastro legible no se puede auditar después.
 */
async function corregirExcedentesAcumulados() {
    const todos = await AbonoAplicado.findAll({
        where: { politica: { [Op.ne]: 'pago-adelantado' } },
        order: [['id', 'ASC']],
    });
    const porPrestamo = new Map();
    for (const r of todos) {
        if (!porPrestamo.has(r.idVm)) porPrestamo.set(r.idVm, []);
        porPrestamo.get(r.idVm).push(r);
    }

    const resultado = { revisados: todos.length, corregidos: [], titulos: [], errores: [] };
    for (const [idVm, delPrestamo] of porPrestamo) {
        // En orden: el acumulado de cada uno se mide contra el del anterior.
        for (const registro of delPrestamo) {
            try {
                const cifras = abonoCapital.cifrasDeRegistro(registro, delPrestamo);
                if (cifras.legado) {
                    if (Math.abs(cifras.propio - cifras.acumulado) > 1) {
                        resultado.corregidos.push(await corregirUno(registro, delPrestamo, cifras));
                    } else {
                        // Primer abono del crédito: su cifra ya era la suya.
                        // Solo se deja en el formato nuevo.
                        await registro.update({
                            resumen: JSON.stringify({ ...abonoCapital.resumenDe(registro), excedenteAcumulado: cifras.acumulado }),
                        });
                    }
                }
                const titulo = await ponerCuotaEnElTitulo(registro, abonoCapital.cifrasDeRegistro(registro, delPrestamo));
                if (titulo) resultado.titulos.push(titulo);
            } catch (err) {
                resultado.errores.push({ idVm, id: registro.id, error: err.message });
            }
        }
    }
    return resultado;
}

/** Lo que pasó, en frases para el log de arranque. */
function bitacora(resultado) {
    const lineas = [];
    for (const c of resultado.corregidos) {
        lineas.push(`Reajuste #${c.id} de ${c.idVm}: guardaba el acumulado del crédito (${pesos(c.antes)}); lo que aplicó fueron ${pesos(c.ahora)}.`
            + (c.informe ? ` Informe ${c.informe} reescrito.` : '')
            + (c.notas ? ` ${c.notas} nota(s) de cuota corregida(s).` : '')
            + (c.avisos ? ` ${c.avisos} aviso(s) al socio corregido(s).` : ''));
    }
    for (const t of resultado.titulos) lineas.push(`Informe ${t.nombre}: su título ahora dice a qué cuota corresponde ("${t.titulo}").`);
    for (const e of resultado.errores) lineas.push(`No se pudo corregir el reajuste #${e.id} de ${e.idVm}: ${e.error}. Se reintenta en el próximo arranque.`);
    return lineas;
}

module.exports = { corregirExcedentesAcumulados, bitacora, planDesdeRegistro };
