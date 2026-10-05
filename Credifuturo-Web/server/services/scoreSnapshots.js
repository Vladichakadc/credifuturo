/**
 * Foto mensual de los insumos del score crediticio.
 *
 * Guarda (upsert) una fila por socio activo y por mes calendario con los datos
 * que consume calcScore() en el cliente — la fórmula NO se duplica en el
 * backend: el cliente recalcula el score histórico con la fuente única.
 *
 * Vivía dentro del bloque de arranque de server.js, alcanzable solo por el cron
 * y la semilla. Se sacó a un servicio para que la revisión de la base que lanza
 * el gerente desde el panel pueda refrescar la foto del mes sin esperar a la
 * noche.
 */

const Client = require('../models/Client');
const ScoreSnapshot = require('../models/ScoreSnapshot');

async function tomarSnapshots() {
    // Perezoso a propósito: routes/admin es quien llama a este servicio desde la
    // revisión de la base, y un require en la cabecera cerraría el círculo.
    const { getLoanCapacityAnalysis } = require('../routes/admin');
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth() + 1;
    const socios = await Client.findAll({
        where: { estatus: 'Activo', role: 'user' },
        attributes: ['id']
    });
    let ok = 0, fail = 0;
    for (const socio of socios) {
        try {
            const a = await getLoanCapacityAnalysis(socio.id);
            const datos = {
                ahorroTotal: a.ahorroTotal,
                totalDeudaPendiente: a.totalDeudaPendiente,
                enMoraActual: a.enMoraActual,
                totalCuotasMoraEP: a.totalCuotasMoraEP,
                historialMoraTotal: a.historialMoraTotal,
                pagosTardios: a.pagosTardios,
                historialPagoTotal: a.historialPagoTotal,
                mesesComoSocio: a.mesesComoSocio,
                prestamosLiquidados: a.prestamosLiquidados,
                prestamosVigentes: (a.prestamosVigentes || []).map(l => ({ enMoraEP: !!l.enMoraEP })),
                mesesConAhorroMensual: a.mesesConAhorroMensual,
                promedioAhorroMensual: a.promedioAhorroMensual,
                totalAhorrosConPenalizacion: a.totalAhorrosConPenalizacion,
                referenteConstancia: a.referenteConstancia,
            };
            const [row, created] = await ScoreSnapshot.findOrCreate({
                where: { clientId: socio.id, anio, mes },
                defaults: { datos: JSON.stringify(datos) }
            });
            if (!created) await row.update({ datos: JSON.stringify(datos) });
            ok++;
        } catch (e) {
            fail++;
            console.warn(`[SNAPSHOT] Socio ${socio.id} falló:`, e.message);
        }
    }
    console.log(`[SNAPSHOT] Score snapshots ${anio}-${String(mes).padStart(2, '0')}: ${ok} ok, ${fail} con error.`);
    return { anio, mes, ok, fail };
}

module.exports = { tomarSnapshots };
