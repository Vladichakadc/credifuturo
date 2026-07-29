// Modelo único de "estimado al cierre del año" para las 3 fuentes de ingreso del
// fondo (intereses, rendimiento cuenta NU, recargos por mora). Extraído de
// ExecutivePanelPage.jsx para que DashboardHome.jsx (Panel Principal) use
// exactamente el mismo cálculo — dos paneles mostrando cifras distintas para
// "cuánto ganará el fondo este año" rompería la confianza de los socios.
//
// Principio rector: cada proyección debe basarse en datos de ESTE año en curso,
// nunca en filtros de UI ajenos (p. ej. el selector de años de la tabla de cuotas)
// ni en sumatorias que abarquen años futuros por accidente.
//
// Devuelve, para cada fuente, un rango { base, conservador, optimista } en vez de
// un solo número: comunica honestamente la incertidumbre en vez de falsa precisión.

/**
 * @param {object} exec  Respuesta de GET /admin/executive-stats
 * @param {object} stats Respuesta de GET /admin/dashboard-stats
 * @param {number} anioActual Año calendario en curso
 */
export function computeFundProjection({ exec, stats, anioActual }) {
    if (!exec) return null;

    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    const remainingDays = Math.max(0, Math.ceil((endOfYear - today) / 86400000));
    const currentDayOfYear = Math.max(1, Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / 86400000));
    const mesesTranscurridos = Math.max(0.5, currentDayOfYear / 30.44);
    const mesesRestantes = remainingDays / 30.44;

    // Intereses: cobrado + pendiente del año en curso (nunca años futuros, nunca
    // acoplado al filtro de años de otras tablas de la app).
    const intRows = exec.series?.interesesPorAnio || [];
    const intCobradosAnio = intRows
        .filter(r => Number(r.anio) === anioActual && (r.estado === 'Pago' || r.estado === 'Abono'))
        .reduce((s, r) => s + (r.intereses || 0), 0);
    const intAgendadosAnio = intRows
        .filter(r => Number(r.anio) === anioActual && r.estado === 'Pendiente')
        .reduce((s, r) => s + (r.intereses || 0), 0);

    const coloc = exec.series?.colocacionPorAnio || [];
    const colocActual = coloc.find(c => Number(c.anio) === anioActual);

    // Escenario BASE: cobrado + pendiente × tasa de recaudo real observada.
    // CONSERVADOR: recaudo −15pp. OPTIMISTA: recaudo +10pp más el interés que
    // generaría nueva colocación al ritmo histórico del año en curso.
    const recaudoBase = (exec.recaudoYtd?.eficienciaPct ?? 85) / 100;
    const recaudoConservador = Math.max(0.5, recaudoBase - 0.15);
    const recaudoOptimista = Math.min(1, recaudoBase + 0.10);
    const colocacionMensualProm = (colocActual?.total || 0) / mesesTranscurridos;
    const tasaMensualVigente = 0.015; // tasa típica del fondo (1.4%–1.6%)
    const interesesPorNuevaColocacion = (monto) => monto * tasaMensualVigente * (mesesRestantes / 2);

    const proyeccionInteresesBase = intCobradosAnio + intAgendadosAnio * recaudoBase;
    const proyeccionInteresesConservador = intCobradosAnio + intAgendadosAnio * recaudoConservador;
    const proyeccionInteresesOptimista = intCobradosAnio
        + intAgendadosAnio * recaudoOptimista
        + interesesPorNuevaColocacion(colocacionMensualProm * 1.5 * mesesRestantes);

    // NU: extrapolación lineal del ritmo diario observado — único método viable
    // sin serie histórica por año (el saldo se edita manualmente, esporádico).
    const dailyNURate = (stats?.rentabilidadCajaNU || 0) / currentDayOfYear;
    const proyeccionCajaNUBase = (stats?.rentabilidadCajaNU || 0) + dailyNURate * remainingDays;
    const proyeccionCajaNUConservador = proyeccionCajaNUBase * 0.85;
    const proyeccionCajaNUOptimista = proyeccionCajaNUBase * 1.05;

    // Mora: por decisión explícita (el fondo prefiere no proyectar el "Descuento
    // Total Anual Penalizacion" de fin de año — un evento real pero incierto en
    // fecha/monto exacto) el estimado usa SOLO el escenario conservador: el
    // recargo mensual extrapolado al ritmo real observado en lo que va del año.
    // Si el evento de fin de año YA ocurrió este año, sí se cuenta — eso ya es un
    // hecho, no una proyección.
    const mensualPenalidadBase = ((stats?.totalPenaltyValue || 0) / currentDayOfYear) * 365;
    const descuentoAnualVigente = Number(stats?.descuentoAnualVigente) || 0;
    const descuentoAnualEstimado = Number(stats?.baselines?.mora) || 0; // solo informativo, no se proyecta

    const proyeccionPenalidadBase = mensualPenalidadBase + descuentoAnualVigente;
    const proyeccionPenalidadConservador = proyeccionPenalidadBase;
    const proyeccionPenalidadOptimista = proyeccionPenalidadBase;

    // Mora YTD real: si el Descuento de este año ya se aplicó, cuenta como
    // ganancia ya realizada, no como proyección futura.
    const moraYtdReal = (stats?.totalPenaltyValue || 0) + descuentoAnualVigente;

    const gananciaRealYtd = intCobradosAnio
        + (stats?.rentabilidadCajaNU || 0)
        + moraYtdReal;

    return {
        intCobradosAnio,
        intAgendadosAnio,
        moraYtdReal,
        descuentoAnualVigente,
        descuentoAnualEstimado,
        intereses: { base: proyeccionInteresesBase, conservador: proyeccionInteresesConservador, optimista: proyeccionInteresesOptimista },
        nu: { base: proyeccionCajaNUBase, conservador: proyeccionCajaNUConservador, optimista: proyeccionCajaNUOptimista },
        penalidad: { base: proyeccionPenalidadBase, conservador: proyeccionPenalidadConservador, optimista: proyeccionPenalidadOptimista },
        total: {
            base: proyeccionInteresesBase + proyeccionCajaNUBase + proyeccionPenalidadBase,
            conservador: proyeccionInteresesConservador + proyeccionCajaNUConservador + proyeccionPenalidadConservador,
            optimista: proyeccionInteresesOptimista + proyeccionCajaNUOptimista + proyeccionPenalidadOptimista,
        },
        gananciaRealYtd,
        recaudoBasePct: Math.round(recaudoBase * 100),
        colocacionMensualProm,
    };
}
