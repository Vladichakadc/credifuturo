// Fuente ÚNICA de los indicadores comparativos del fondo (año en curso frente al
// año anterior). Extraído de DashboardHome.jsx para que el Panel Ejecutivo —que
// es el que ven los socios y la Junta— muestre exactamente las mismas cifras que
// el Panel Principal, y no dos lecturas distintas del mismo año.
//
// Es el mismo principio que ya rige utils/fundProjection.js: dos paneles que
// contradicen sus números destruyen la confianza más rápido de lo que la
// construye cualquier gráfico.
//
// Regla de medición que este módulo encapsula (y que existe por un error real
// que se corrigió en producción): NUNCA se compara el acumulado PARCIAL del año
// en curso contra el resultado COMPLETO de 12 meses del año anterior. Ese
// cociente mide el calendario, no el desempeño — con el fondo rindiendo igual
// que el año pasado marca "-40%" en agosto y solo llegaría a 0% el 31 de
// diciembre. Aquí se compara siempre contra el RITMO del año anterior: su
// resultado completo prorrateado a la fracción de calendario ya transcurrida.

import { computeFundProjection } from './fundProjection';

// Antes de que corra un mes, la fracción transcurrida es tan pequeña que
// cualquier cociente se dispara. Por debajo de este umbral no se muestra
// porcentaje: se declara que aún es pronto.
const FRACCION_MINIMA = 0.08; // ≈ un mes

/**
 * Un crecimiento muy grande se lee mejor como múltiplo que como porcentaje:
 * "11,8× lo del año pasado" comunica; "+1.083,8%" parece un error del sistema.
 * Ocurre de verdad cuando el año anterior arrancó lento y su base comparable es
 * diminuta — el cociente es correcto, pero el formato porcentual deja de servir.
 */
export const fmtVariacion = (pct) => {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
    if (pct >= 200) return `${(1 + pct / 100).toFixed(1).replace('.', ',')}×`;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`;
};

/**
 * @param {object} stats     Respuesta de GET /admin/dashboard-stats
 * @param {object} execStats Respuesta de GET /admin/executive-stats
 * @param {object} yearCmp   Respuesta de GET /admin/year-comparison
 * @returns {object|null} Todos los derivados comparativos, o null si falta `stats`.
 */
export function computeFondoIndicadores({ stats, execStats, yearCmp }) {
    if (!stats) return null;

    // ── Capital y riesgo ──────────────────────────────────────────────────────
    const disponible = (stats.saldoEnBanco || 0) + (stats.rentabilidadCajaNU || 0);
    const mora = stats.moraCarteraEP || 0;
    const prestadoVigente = stats.carteraDia || 0;
    const total = disponible + prestadoVigente;
    const riskIndex = total > 0 ? (mora / total) * 100 : 0;
    const liquidity = total > 0 ? (disponible / total) * 100 : 0;

    // ── Baselines del año anterior (calculados por el backend desde la BD) ────
    const baselineAnio = stats?.baselines?.anio || new Date().getFullYear() - 1;
    const baselinePrestamos = Number(stats?.baselines?.prestamos) || 0;
    const baselinePatrimonio = Number(stats?.baselines?.patrimonio) || 0;
    const baselineIntereses = Number(stats?.baselines?.intereses) || 0;
    const baselineNU = Number(stats?.baselines?.nu) || 0;
    const baselineMora = Number(stats?.baselines?.mora) || 0;
    // Ganancia REAL del año anterior = suma de sus tres fuentes. Distinto, a
    // propósito, de `metaGanancia`, que es la META del comité para el año EN
    // CURSO — mezclarlas hacía que el total no coincidiera con la suma de sus filas.
    const gananciaAnioPrev = baselineIntereses + baselineNU + baselineMora;

    // ── Ganancia acumulada del año en curso ───────────────────────────────────
    const anioActual = new Date().getFullYear();
    const proyeccion = computeFundProjection({ exec: execStats, stats, anioActual });
    const gananciaYtd = proyeccion?.gananciaRealYtd
        ?? ((stats.totalInteresesPagados || 0) + (stats.rentabilidadCajaNU || 0)
            + (stats.totalPenaltyValue || 0) + (stats.descuentoAnualVigente || 0));

    // ── Corte del calendario ──────────────────────────────────────────────────
    const corte = yearCmp?.corte || null;
    const fraccionAnio = corte?.fraccionAnio ?? null;
    const nombreMesCorte = corte
        ? new Date(corte.anioActual, corte.mes - 1, corte.dia)
            .toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
        : null;

    const seriePrev = yearCmp?.series?.find(s => Number(s.anio) === Number(baselineAnio)) || null;
    const serieActual = yearCmp?.series?.find(s => s.esAnioEnCurso) || null;

    // ── Base de comparación: el RITMO del año anterior ────────────────────────
    // Se usa el total del año anterior prorrateado, no su tramo medido: cuando ese
    // tramo es pequeño (un año de arranque estacional) el porcentaje se dispara.
    const ritmoPrev = (totalAnterior) =>
        (fraccionAnio > 0 ? (Number(totalAnterior) || 0) * fraccionAnio : (Number(totalAnterior) || 0));
    const gananciaPrevRitmo = (gananciaAnioPrev > 0 && fraccionAnio !== null)
        ? gananciaAnioPrev * fraccionAnio
        : null;

    const comparacionPrematura = fraccionAnio !== null && fraccionAnio < FRACCION_MINIMA;
    const baseValida = gananciaPrevRitmo !== null && gananciaPrevRitmo > 0 && !comparacionPrematura;
    const crecimientoVsRitmo = baseValida
        ? ((gananciaYtd / gananciaPrevRitmo) * 100 - 100)
        : null;
    const diferenciaVsRitmo = gananciaPrevRitmo !== null ? gananciaYtd - gananciaPrevRitmo : null;

    // Avance sobre el año anterior completo: dato útil ("llevamos el 65% de lo que
    // se ganó en todo el año pasado"), pero es progreso, nunca una caída.
    const avanceSobreAnioPrev = gananciaAnioPrev > 0 ? (gananciaYtd / gananciaAnioPrev) * 100 : null;

    // ── Valores por fuente, al mismo corte en ambos lados ─────────────────────
    const interesesActualYtd = serieActual?.ytdAlCorte.intereses
        ?? proyeccion?.intCobradosAnio
        ?? (stats.totalInteresesPagados || 0);
    const moraActualYtd = serieActual?.ytdAlCorte.mora
        ?? proyeccion?.moraYtdReal
        ?? (stats.totalPenaltyValue || 0);
    const colocacionActualYtd = serieActual?.ytdAlCorte.colocacion ?? (stats.totalPrestamos || 0);

    // Ahorro: ahorroPorAnio ya viene cerrado por año, sin necesidad de corte extra.
    const ahorroPorAnio = stats.ahorroPorAnio || [];
    const ahorroFilaPrev = ahorroPorAnio.find(a => Number(a.anio) === baselineAnio);
    const ahorroFilaActual = ahorroPorAnio.find(a => Number(a.anio) === baselineAnio + 1);
    const ahorroPrevTotal = ahorroFilaPrev?.total || 0;
    const ahorroActualTotal = ahorroFilaActual?.total || 0;
    const ahorroComposicionNota = (() => {
        if (!ahorroFilaActual || !ahorroFilaActual.total) return null;
        const mensualPct = Math.round((ahorroFilaActual.mensual / ahorroFilaActual.total) * 100);
        const aportesPct = 100 - mensualPct;
        return aportesPct > 0
            ? `${mensualPct}% es ahorro mensual recurrente y ${aportesPct}% son aportes iniciales de socios nuevos.`
            : 'El 100% proviene del ahorro mensual recurrente de los socios — la señal más sana de disciplina de ahorro.';
    })();

    // ── Meta anual y proyecciones al cierre ───────────────────────────────────
    const metaGanancia = Number(stats?.baselines?.metaGanancia) || 0;
    const cumplimientoMeta = metaGanancia > 0 ? (gananciaYtd / metaGanancia) * 100 : null;
    const proyeccionIntereses = proyeccion?.intereses?.conservador ?? 0;
    const proyeccionNU = proyeccion?.nu?.conservador ?? 0;
    const proyeccionMora = proyeccion?.penalidad?.conservador ?? 0;
    const proyeccionTotal = proyeccion?.total?.conservador ?? 0;

    // ── Veredicto global del fondo ────────────────────────────────────────────
    // Cinco señales independientes; el semáforo es el conteo de las que están en
    // verde. Responde en una frase la pregunta que trae el socio: "¿está bien mi
    // fondo?" — sin obligarlo a interpretar cinco indicadores técnicos.
    const ahorroSano = ahorroPrevTotal > 0 ? (ahorroActualTotal / ahorroPrevTotal) >= 0.85 : true;
    const senales = [
        ahorroSano,
        riskIndex <= 5,
        liquidity >= 30,
        baselinePatrimonio > 0 ? total >= baselinePatrimonio * 0.85 : true,
        cumplimientoMeta === null || cumplimientoMeta >= 80,
    ];
    const puntaje = senales.filter(Boolean).length;
    const veredicto = puntaje >= 4
        ? { nivel: 'sano', titulo: 'Fondo Saludable', detalle: 'Los indicadores clave están en zona positiva. El fondo opera con normalidad.', etiqueta: 'ESTADO NORMAL' }
        : puntaje >= 3
            ? { nivel: 'revisar', titulo: 'Requiere Revisión', detalle: 'Algunos indicadores están fuera del rango óptimo. Conviene revisar cartera y liquidez.', etiqueta: 'ATENCIÓN' }
            : { nivel: 'alerta', titulo: 'Alerta Operativa', detalle: 'Varios indicadores requieren atención. Es recomendable una revisión del comité.', etiqueta: 'CRÍTICO' };

    return {
        // capital y riesgo
        disponible, mora, prestadoVigente, total, riskIndex, liquidity,
        // baselines
        baselineAnio, baselinePrestamos, baselinePatrimonio, baselineIntereses,
        baselineNU, baselineMora, gananciaAnioPrev,
        // año en curso
        anioActual, gananciaYtd, proyeccion,
        // corte y comparación
        corte, fraccionAnio, nombreMesCorte, seriePrev, serieActual,
        ritmoPrev, gananciaPrevRitmo, crecimientoVsRitmo, diferenciaVsRitmo,
        avanceSobreAnioPrev, comparacionPrematura,
        // por fuente
        interesesActualYtd, moraActualYtd, colocacionActualYtd,
        ahorroPrevTotal, ahorroActualTotal, ahorroComposicionNota,
        // meta y proyecciones
        metaGanancia, cumplimientoMeta,
        proyeccionIntereses, proyeccionNU, proyeccionMora, proyeccionTotal,
        // veredicto
        veredicto, puntaje, ahorroSano,
    };
}
