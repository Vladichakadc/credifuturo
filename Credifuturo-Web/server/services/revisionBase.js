/**
 * Revisión de la base — lo que hace el botón "Revisar y actualizar la base" del
 * panel principal.
 *
 * Durante mucho tiempo ese botón llamó a un endpoint que solo contaba filas: ni
 * una escritura. Quien lo pulsaba esperaba que los cálculos guardados quedaran
 * al día y no pasaba nada, porque nada lo intentaba.
 *
 * Casi todas las cifras de la aplicación se calculan al consultarlas y no
 * pueden quedar viejas. Las que SÍ se guardan, y por tanto sí pueden desfasarse,
 * son tres, y cada una ya tenía su recálculo — pero solo de noche o como efecto
 * de guardar otra cosa:
 *
 *   1. El estado de cada préstamo, y su copia en cada cuota (`estadoPrestamo`).
 *   2. Los cronogramas con un abono a capital sin propagar.
 *   3. La foto mensual de los insumos del score.
 *
 * Aquí se ejecutan los tres, ahora, y se devuelve qué cambió. No se inventa
 * ninguna corrección nueva: todo lo que escribe esta revisión es lo mismo que
 * el sistema ya escribía solo. Lo que el motor de abonos se niega a recalcular
 * —cronogramas importados, ejercicios cerrados, reajustes revertidos— se sigue
 * negando, y se devuelve nombrado con su motivo para que lo decida una persona.
 */

const { Op } = require('sequelize');
const { Client, Saving, DisbursedLoan, LoanPayment } = require('../models');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const pesos = (n) => `$${Math.round(num(n)).toLocaleString('es-CO')}`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ─────────────────────────────────────────────────────────────────────
// CONTEOS E INTEGRIDAD (solo lectura)
// ─────────────────────────────────────────────────────────────────────

async function contarTablas() {
    const sequelize = require('../config/database');
    const [
        totalClients, totalSavings, totalLoans, totalPayments,
        orphanSavings, orphanLoans, orphanPayments,
    ] = await Promise.all([
        Client.count(),
        Saving.count(),
        DisbursedLoan.count(),
        LoanPayment.count(),
        Saving.count({ where: { clientId: { [Op.notIn]: sequelize.literal('(SELECT id FROM Clients)') } } }).catch(() => 0),
        DisbursedLoan.count({ where: { clientId: { [Op.is]: null } } }).catch(() => 0),
        LoanPayment.count({ where: { clientId: { [Op.is]: null } } }).catch(() => 0),
    ]);

    // Cuotas huérfanas: idVm que no existe en ningún préstamo desembolsado.
    const idVms = (await DisbursedLoan.findAll({ attributes: ['idVm'] })).map((l) => l.idVm).filter(Boolean);
    const orphanByIdVm = idVms.length > 0
        ? await LoanPayment.count({ where: { idVm: { [Op.notIn]: idVms } } }).catch(() => 0)
        : 0;

    const fila = (table, count, problemas) => ({
        table,
        count,
        status: count > 0 && problemas.length === 0 ? 'OK' : 'WARN',
        message: count === 0 ? 'Sin registros'
            : problemas.length > 0 ? `${count} registros (${problemas.join(', ')})`
                : `${count} registros`,
    });

    const cuotas = [];
    if (orphanPayments > 0) cuotas.push(`${orphanPayments} sin socio`);
    if (orphanByIdVm > 0) cuotas.push(`${orphanByIdVm} con idVm sin préstamo padre`);

    return {
        summary: [
            fila('Socios (Clientes)', totalClients, []),
            fila('Ahorros', totalSavings, orphanSavings > 0 ? [`${orphanSavings} sin socio`] : []),
            fila('Préstamos Desembolsados', totalLoans, orphanLoans > 0 ? [`${orphanLoans} sin socio`] : []),
            fila('Estado Préstamos (Pagos)', totalPayments, cuotas),
        ],
        totals: { totalClients, totalSavings, totalLoans, totalPayments },
    };
}

// ─────────────────────────────────────────────────────────────────────
// ESTADO DE LOS PRÉSTAMOS
// ─────────────────────────────────────────────────────────────────────

/**
 * Quita los espacios sobrantes del estado de un préstamo.
 *
 * Viene de la carga desde Excel ("Vigente "). Casi todas las consultas lo
 * toleran con LIKE, pero las que comparan exacto —`estado IN ('Activo',
 * 'Vigente', …)`— dejan ese préstamo fuera sin avisar.
 */
async function normalizarEstados() {
    const prestamos = await DisbursedLoan.findAll({ attributes: ['id', 'idVm', 'estado'] });
    const tocados = [];
    for (const p of prestamos) {
        if (typeof p.estado !== 'string' || p.estado === p.estado.trim()) continue;
        await p.update({ estado: p.estado.trim() });
        tocados.push(p.idVm || `#${p.id}`);
    }
    return tocados;
}

/**
 * Marca como Cancelado el préstamo cuyas cuotas están todas pagas.
 *
 * Es la misma regla que ya se aplica al registrar o editar un pago; aquí
 * devuelve cuáles cerró en vez de solo cuántos.
 */
async function cerrarPrestamosPagados() {
    const prestamos = await DisbursedLoan.findAll({ attributes: ['id', 'idVm', 'estado'] });
    const cerrados = [];
    for (const loan of prestamos) {
        if (!loan.idVm) continue;
        if ((loan.estado || '').trim() === 'Cancelado') continue;
        const total = await LoanPayment.count({ where: { idVm: loan.idVm } });
        if (total === 0) continue;
        const paid = await LoanPayment.count({ where: { idVm: loan.idVm, estado: 'Pago' } });
        if (paid !== total) continue;
        await loan.update({ estado: 'Cancelado' });
        await LoanPayment.update({ estadoPrestamo: 'Cancelado' }, { where: { idVm: loan.idVm } });
        cerrados.push(loan.idVm);
        console.log(`✅ Préstamo ${loan.idVm} marcado como Cancelado (${paid}/${total} cuotas pagadas)`);
    }
    return cerrados;
}

/**
 * Lleva a cada cuota el estado real de su préstamo.
 *
 * `estadoPrestamo` es una copia, y las copias se desfasan: durante un tiempo fue
 * un desplegable que se llenaba a mano en el formulario de pagos, y hay cuotas
 * de esa época que dicen «Pendiente» —un estado de cuota, no de préstamo— sobre
 * créditos que están Vigentes. La lista de pagos lo disimula leyendo el estado
 * vivo del préstamo, pero el respaldo en Excel y los filtros del servidor leen
 * la columna guardada.
 */
async function sincronizarEstadoEnCuotas() {
    const prestamos = await DisbursedLoan.findAll({ attributes: ['idVm', 'estado'] });
    const corregidos = [];
    for (const loan of prestamos) {
        const estado = (loan.estado || '').trim();
        if (!loan.idVm || !estado) continue;
        const desfasadas = {
            idVm: loan.idVm,
            [Op.or]: [{ estadoPrestamo: { [Op.ne]: estado } }, { estadoPrestamo: null }],
        };
        const antes = await LoanPayment.findAll({ attributes: ['estadoPrestamo'], where: desfasadas, raw: true });
        if (antes.length === 0) continue;
        await LoanPayment.update({ estadoPrestamo: estado }, { where: desfasadas });
        const decian = [...new Set(antes.map((c) => (c.estadoPrestamo || '').trim() || 'vacío'))].join(' / ');
        corregidos.push({ idVm: loan.idVm, cuotas: antes.length, decian, estado });
    }
    return corregidos;
}

// ─────────────────────────────────────────────────────────────────────
// LA REVISIÓN
// ─────────────────────────────────────────────────────────────────────

/**
 * Cada paso devuelve { clave, titulo, estado, resumen, detalle[] }, con estado:
 *   'actualizado' — escribió algo;   'al-dia'    — revisó y no había nada;
 *   'pendiente'   — no se toca solo; 'error'     — el paso falló.
 * Un paso que falla no detiene a los demás: quedarse sin refrescar el score no
 * es motivo para no aplicar un abono.
 */
async function revisarBase({ quien = 'admin' } = {}) {
    const pasos = [];
    const paso = async (clave, titulo, fn) => {
        try {
            for (const p of [].concat(await fn())) pasos.push({ clave, titulo, detalle: [], ...p });
        } catch (err) {
            console.error(`[REVISION] Falló el paso "${clave}":`, err);
            pasos.push({ clave, titulo, estado: 'error', resumen: 'No se pudo completar este paso.', detalle: [err.message] });
        }
    };

    const tablas = await contarTablas();

    // El espacio sobrante se quita ANTES del barrido: lo que venga después tiene
    // que leer ya el estado limpio.
    let espacios = [];
    try { espacios = await normalizarEstados(); }
    catch (err) { console.error('[REVISION] No se pudieron normalizar los estados:', err); }

    await paso('abonos', 'Abonos a capital', async () => {
        const abonoCapital = require('./abonoCapital');
        const informe = await abonoCapital.barridoProgramado({ origen: 'manual', aplicadoPor: quien });
        if (informe.omitido) {
            return { estado: 'pendiente', resumen: 'Ya hay otra revisión de abonos en curso. Vuelve a intentarlo en unos minutos.' };
        }
        const salida = [];
        const aplicados = informe.aplicados || [];
        const errores = informe.errores || [];
        if (aplicados.length > 0) {
            salida.push({
                estado: 'actualizado',
                resumen: `Se recalcularon ${aplicados.length} préstamo(s): ${pesos(aplicados.reduce((s, p) => s + num(p.resumen && p.resumen.excedente), 0))} pasaron a capital. Cada socio recibió su aviso.`,
                detalle: aplicados.map((p) => `${p.idVm} — ${pesos(p.resumen && p.resumen.excedente)} a capital`),
            });
        } else if (errores.length === 0) {
            salida.push({ estado: 'al-dia', resumen: `${informe.revisados} préstamo(s) con pagos sobre la cuota revisados; ninguno tenía un abono sin aplicar.` });
        }
        if (errores.length > 0) {
            salida.push({
                estado: 'error',
                resumen: `${errores.length} préstamo(s) no se pudieron recalcular.`,
                detalle: errores.map((e) => `${e.idVm} — ${e.error}`),
            });
        }
        const bloqueados = informe.bloqueados || [];
        if (bloqueados.length > 0) {
            salida.push({
                clave: 'abonos-bloqueados',
                titulo: 'Abonos que requieren tu decisión',
                estado: 'pendiente',
                resumen: `${bloqueados.length} préstamo(s) tienen un pago por encima de la cuota que no se aplica solo. Se revisan en Pagos → Abonos a capital.`,
                detalle: bloqueados.map((b) => `${b.idVm} — excedente ${pesos(b.excedente)} — ${b.motivo}`),
            });
        }
        return salida;
    });

    // Después del barrido: un abono puede dejar un crédito con todo pago.
    await paso('estados', 'Estado de los préstamos', async () => {
        const cerrados = await cerrarPrestamosPagados();
        const cuotas = await sincronizarEstadoEnCuotas();
        const detalle = [
            ...espacios.map((idVm) => `${idVm} — se quitó un espacio sobrante del estado`),
            ...cerrados.map((idVm) => `${idVm} — marcado Cancelado: todas sus cuotas están pagas`),
            ...cuotas.map((c) => `${c.idVm} — ${c.cuotas} cuota(s) decían «${c.decian}» y su préstamo está ${c.estado}`),
        ];
        if (detalle.length === 0) {
            return { estado: 'al-dia', resumen: 'El estado de cada préstamo coincide con sus cuotas.' };
        }
        return { estado: 'actualizado', resumen: `Se corrigieron ${detalle.length} desfase(s) entre préstamos y cuotas.`, detalle };
    });

    await paso('score', 'Historial de score', async () => {
        const { tomarSnapshots } = require('./scoreSnapshots');
        const r = await tomarSnapshots();
        const periodo = `${MESES[r.mes - 1]} de ${r.anio}`;
        if (r.fail > 0) {
            return { estado: 'error', resumen: `Se actualizó la foto de ${periodo} para ${r.ok} socio(s); ${r.fail} fallaron.` };
        }
        return { estado: 'actualizado', resumen: `Se actualizó la foto de ${periodo} para ${r.ok} socio(s).` };
    });

    const hayError = pasos.some((p) => p.estado === 'error');
    return {
        ok: !hayError,
        hasWarnings: tablas.summary.some((t) => t.status === 'WARN'),
        timestamp: new Date().toISOString(),
        summary: tablas.summary,
        totals: tablas.totals,
        pasos,
        // El score se reescribe siempre; lo que cuenta como "corrección" es lo demás.
        correcciones: pasos.filter((p) => p.estado === 'actualizado' && p.clave !== 'score').length,
        pendientes: pasos.filter((p) => p.estado === 'pendiente').length,
    };
}

module.exports = {
    revisarBase,
    contarTablas,
    normalizarEstados,
    cerrarPrestamosPagados,
    sincronizarEstadoEnCuotas,
};
