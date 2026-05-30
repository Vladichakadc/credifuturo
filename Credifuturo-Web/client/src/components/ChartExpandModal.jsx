import React, { useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, BarChart2, Lightbulb, Target, Activity, Trophy } from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v) => `$${Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;

// ─── Analysis Engines ─────────────────────────────────────────────────────────

export function analyzeMonthlyTrend(data, selectedYear, availableYears, rawSavings = [], socioInfo = {}) {
    if (!data || data.length === 0) return null;
    const showMultiple = selectedYear === 'Todos' && availableYears?.length > 0;
    const firstName = (socioInfo.name || '').split(' ')[0] || 'El socio';

    // ── Build per-year analytics from rawSavings ──────────────────────────────
    const monthlySavings = rawSavings.filter(s => s.type !== 'Aporte Inicial');

    const byYear = {};
    monthlySavings.forEach(s => {
        const yr = String(s.anioAbonado || s.year || '');
        if (!yr) return;
        if (!byYear[yr]) byYear[yr] = { records: [], penalty: 0, penaltyDays: 0, months: new Set() };
        byYear[yr].records.push(s);
        const isDescuento = s.status === 'Descuento Total Anual Penalizacion';
        // valorAPenalizar is always 0 on Descuento records; the actual amount is stored as negative amount
        byYear[yr].penalty += isDescuento
            ? Math.abs(Number(s.amount || 0))
            : Number(s.valorAPenalizar || 0);
        byYear[yr].penaltyDays += Number(s.diasPenalizacion || 0);
        // Don't count penalty deduction entries as active saving months
        if (!isDescuento) {
            const mes = Number(s.mesAbonado || s.monthInt);
            if (mes >= 1 && mes <= 12) byYear[yr].months.add(mes);
        }
    });

    const yearKeys = Object.keys(byYear).sort((a, b) => Number(a) - Number(b));
    const allYearStats = yearKeys.map(yr => {
        const { records, penalty, penaltyDays, months } = byYear[yr];
        const totalNeto = records.reduce((s, r) => s + Number(r.valorAhorrado || 0), 0);
        const totalBruto = records.reduce((s, r) => s + Number(r.amount || 0), 0);
        const avgMonthly = months.size > 0 ? totalNeto / months.size : 0;
        return { yr, totalNeto, totalBruto, penalty, penaltyDays, activeMonths: months.size, avgMonthly, months };
    }).filter(y => y.totalBruto > 0);

    const totalHistorico = allYearStats.reduce((s, y) => s + y.totalNeto, 0);
    const totalPenalidadesHistorico = allYearStats.reduce((s, y) => s + y.penalty, 0);
    const bestYear = allYearStats.length ? allYearStats.reduce((a, b) => b.totalNeto > a.totalNeto ? b : a) : null;

    // Year-over-year growth for this socio
    const lastTwo = allYearStats.slice(-2);
    const yoyGrowth = lastTwo.length === 2 && lastTwo[0].totalNeto > 0
        ? ((lastTwo[1].totalNeto - lastTwo[0].totalNeto) / lastTwo[0].totalNeto) * 100 : null;

    const currentYear = String(new Date().getFullYear());
    const currentMonth = new Date().getMonth() + 1;

    if (showMultiple) {
        // Multi-year personal view
        const narrative = (() => {
            const baseHistory = allYearStats.length > 0
                ? `${firstName} lleva ${allYearStats.length} año${allYearStats.length > 1 ? 's' : ''} de historial con un total acumulado de ${fmt(totalHistorico)} en ahorros netos. `
                : '';
            const penNote = totalPenalidadesHistorico > 0
                ? `Ha generado ${fmt(totalPenalidadesHistorico)} en penalidades a lo largo de su historial. `
                : 'No presenta penalidades históricas, lo que demuestra alta disciplina financiera. ';

            if (yoyGrowth === null)
                return baseHistory + penNote + 'Con un único año de datos, aún no es posible evaluar la tendencia interanual. Se recomienda continuar acumulando períodos para identificar patrones.';
            if (yoyGrowth > 20)
                return baseHistory + penNote + `El crecimiento interanual de ${fmtPct(yoyGrowth)} es excepcional para un socio individual. Este ritmo refleja una mejora sostenida en la capacidad de ahorro de ${firstName}. Se recomienda mantener este momentum y evaluar incrementar la cuota mensual para optimizar el crecimiento patrimonial.`;
            if (yoyGrowth > 5)
                return baseHistory + penNote + `${firstName} muestra un crecimiento positivo (${fmtPct(yoyGrowth)}) respecto al año anterior, señal de una trayectoria de ahorro saludable. Para maximizar el impacto patrimonial, considere aumentar el aporte mensual en al menos un 10%.`;
            if (yoyGrowth > -5)
                return baseHistory + penNote + `El ahorro de ${firstName} se mantiene estable entre períodos (${fmtPct(yoyGrowth)}). En un contexto inflacionario, mantener el mismo monto nominal implica una leve pérdida de poder adquisitivo del ahorro. Se recomienda revisar el monto de aporte y ajustarlo al IPC anual.`;
            return baseHistory + penNote + `${firstName} presenta una contracción del ${fmtPct(yoyGrowth)} en su ahorro respecto al período anterior. Esto puede responder a dificultades de liquidez o meses no cubiertos. Se recomienda una sesión de acompañamiento financiero para identificar la causa y diseñar un plan de recuperación.`;
        })();

        return {
            type: 'multi',
            headline: bestYear ? `Mejor año: ${bestYear.yr} · ${fmt(bestYear.totalNeto)} | Histórico: ${fmt(totalHistorico)}` : 'Sin datos comparativos',
            growth: yoyGrowth,
            yearStats: allYearStats.map(y => ({ yr: y.yr, total: y.totalNeto, activeMonths: y.activeMonths, avg: y.avgMonthly })),
            narrative,
            insights: [
                { label: 'Historial total', value: fmt(totalHistorico), icon: Target, color: 'emerald' },
                { label: 'Mejor año', value: bestYear ? `${bestYear.yr} · ${fmt(bestYear.totalNeto)}` : '—', icon: Trophy, color: 'amber' },
                { label: 'Crecimiento interanual', value: yoyGrowth !== null ? fmtPct(yoyGrowth) : 'N/A', icon: yoyGrowth >= 0 ? TrendingUp : TrendingDown, color: yoyGrowth >= 0 ? 'emerald' : 'red' },
                { label: 'Penalidades históricas', value: fmt(totalPenalidadesHistorico), icon: totalPenalidadesHistorico > 0 ? AlertTriangle : CheckCircle, color: totalPenalidadesHistorico > 0 ? 'amber' : 'emerald' },
            ]
        };
    }

    // ── Single-year personal view ─────────────────────────────────────────────
    const yrKey = String(selectedYear);
    const yearStat = byYear[yrKey] || null;

    // Fallback to chart data if rawSavings not available for this year
    const values = data.map(d => Number(d.monto || 0));
    const total = yearStat ? yearStat.totalNeto : values.reduce((a, b) => a + b, 0);
    const active = yearStat ? yearStat.activeMonths : values.filter(v => v > 0).length;
    const avg = active > 0 ? total / active : 0;
    const penalty = yearStat ? yearStat.penalty : 0;
    const penaltyDays = yearStat ? yearStat.penaltyDays : 0;

    const nonZero = values.filter(v => v > 0);
    const max = nonZero.length ? Math.max(...nonZero) : 0;
    const maxIdx = values.indexOf(max);
    const maxMonth = data[maxIdx]?.name || '—';
    const firstHalf = values.slice(0, 6).reduce((a, b) => a + b, 0);
    const secondHalf = values.slice(6).reduce((a, b) => a + b, 0);
    const trendPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
    const stdDev = nonZero.length > 1
        ? Math.sqrt(nonZero.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / nonZero.length) : 0;
    const cv = avg > 0 ? (stdDev / avg) * 100 : 0;
    const emptyMonths = values.filter(v => v === 0).length;

    // YoY comparison for this specific year vs previous
    const prevYr = String(Number(yrKey) - 1);
    const prevStat = byYear[prevYr] || null;
    const yoyThisYear = prevStat && prevStat.totalNeto > 0
        ? ((total - prevStat.totalNeto) / prevStat.totalNeto) * 100 : null;

    // Projected year-end for selected year
    const expectedMonths = yrKey === currentYear ? currentMonth : 12;
    const projYearEnd = active > 0 && expectedMonths > 0
        ? Math.round((total / active) * 12) : null;

    const trendLabel = trendPct > 10 ? 'creciente' : trendPct < -10 ? 'decreciente' : 'estable';
    const consistency = cv < 25 ? 'muy alta consistencia' : cv < 50 ? 'consistencia moderada' : 'alta variabilidad';

    const narrative = (() => {
        const penLine = penalty > 0
            ? `Registra ${fmt(penalty)} en penalidades (${penaltyDays} días de retraso acumulados). `
            : 'Sin penalidades en el período — excelente cumplimiento. ';
        const yoyLine = yoyThisYear !== null
            ? `Comparado con ${prevYr}, el ahorro ${yoyThisYear >= 0 ? 'creció' : 'cayó'} un ${fmtPct(yoyThisYear)}. `
            : '';

        if (penalty > total * 0.1)
            return `${firstName} acumuló ${fmt(total)} netos en ${active} meses activos en ${yrKey}, pero las penalidades por atrasos (${fmt(penalty)}) representan más del 10% de su ahorro bruto. ${yoyLine}Esto indica problemas de liquidez recurrentes que erosionan el patrimonio real. Se recomienda una revisión del calendario de pagos y explorar mecanismos de débito automático para evitar mora.`;
        if (emptyMonths > 3)
            return `${firstName} presenta ${emptyMonths} meses sin aporte en ${yrKey}, acumulando ${fmt(total)} en los ${active} meses activos. ${penLine}${yoyLine}La irregularidad en los aportes impacta el crecimiento patrimonial a largo plazo. Se sugiere un plan de regularización y compromisos mensuales fijos.`;
        if (trendLabel === 'creciente')
            return `${firstName} acumuló ${fmt(total)} en ${yrKey} con ${consistency} (CV: ${cv.toFixed(0)}%). ${penLine}${yoyLine}La tendencia ascendente (${fmtPct(trendPct)} segundo semestre vs primero) muestra un fortalecimiento del hábito de ahorro. Al ritmo actual, proyecta un cierre de año en ${projYearEnd ? fmt(projYearEnd) : 'cálculo pendiente'}. Se recomienda capitalizar este momentum.`;
        if (trendLabel === 'decreciente')
            return `${firstName} registró ${fmt(total)} en ${yrKey} con ${consistency}. ${penLine}${yoyLine}La desaceleración en el segundo semestre (${fmtPct(trendPct)}) sugiere posibles dificultades de liquidez o cambios en la situación financiera personal. Se recomienda una sesión de acompañamiento antes del cierre del año.`;
        return `${firstName} mantiene un ahorro estable de ${fmt(total)} en ${active} meses activos durante ${yrKey} con ${consistency} (CV: ${cv.toFixed(0)}%). ${penLine}${yoyLine}${projYearEnd ? `Proyección de cierre: ${fmt(projYearEnd)}. ` : ''}El comportamiento predecible facilita la planificación del fondo. Se recomienda explorar si ${firstName} tiene capacidad de incrementar el aporte mensual.`;
    })();

    return {
        type: 'single',
        headline: `${fmt(total)} netos en ${yrKey} · ${active} meses activos${yoyThisYear !== null ? ` · vs ${prevYr}: ${fmtPct(yoyThisYear)}` : ''}`,
        trendLabel,
        trendPct,
        emptyMonths,
        narrative,
        insights: [
            { label: `Ahorro neto ${yrKey}`, value: fmt(total), icon: Target, color: 'emerald' },
            { label: 'Mes pico', value: `${maxMonth} · ${fmt(max)}`, icon: TrendingUp, color: 'blue' },
            { label: 'Penalidades en período', value: fmt(penalty), icon: penalty > 0 ? AlertTriangle : CheckCircle, color: penalty > 0 ? 'amber' : 'emerald' },
            { label: 'Proyección cierre año', value: projYearEnd ? fmt(projYearEnd) : '—', icon: Activity, color: 'violet' },
        ]
    };
}

export function analyzeComparativeChart({ title, historic, current, projectedYearEnd, deviationPct, progressPct }) {
    const isPositive = current >= historic;
    const growth = historic > 0 ? ((current - historic) / historic) * 100 : 0;
    const projGrowth = historic > 0 ? ((projectedYearEnd - historic) / historic) * 100 : 0;

    const narrative = (() => {
        if (progressPct >= 120) return `${title} registra un crecimiento extraordinario del ${fmtPct(growth)} frente al período de referencia, superando ampliamente las expectativas históricas. En cooperativas de microfinanzas, un crecimiento de esta magnitud suele responder a factores como incorporación de nuevos socios, mayor colocación de cartera o recuperación de mora represada. Es fundamental validar si este crecimiento es estructural (nuevos socios, mayor demanda crediticia) o coyuntural (pagos concentrados, desembolsos extraordinarios), pues la respuesta define si debe convertirse en el nuevo piso de referencia para el próximo período. La proyección de cierre en ${fmt(projectedYearEnd)} (${fmtPct(projGrowth)} vs año anterior) es alcanzable y muy positiva. Recomendación: documentar los factores de crecimiento, verificar que los procesos operativos soporten este nivel de actividad y ajustar las metas del próximo año al alza con criterio conservador (+10% sobre el nuevo piso).`;
        if (progressPct >= 100) return `${title} ha alcanzado y superado el nivel de referencia del año anterior (+${fmtPct(growth)}), confirmando una ejecución eficiente y una gestión sólida del fondo. Este logro es especialmente relevante en el contexto macroeconómico colombiano, donde la inflación erosiona el poder adquisitivo real del ahorro y superar el histórico nominal representa un avance real del patrimonio. La proyección al cierre de año en ${fmt(projectedYearEnd)} (${fmtPct(projGrowth)} sobre 2025) indica que el fondo está en trayectoria de expansión sostenida. Para cooperativas de esta escala, superar el histórico dentro del año calendario es un indicador de salud operativa de primer nivel. Recomendación: aprovechar este hito como comunicación positiva para los socios y evaluar si la capacidad del fondo permite ampliar el cupo de crédito disponible.`;
        if (progressPct >= 80) return `${title} avanza al ${progressPct.toFixed(0)}% del nivel de referencia histórico, un rezago del ${fmtPct(growth)} que tiene alta probabilidad de cerrarse si se sostiene el ritmo actual. En análisis de ritmo (pace analysis), este nivel de avance es adecuado si se ha ejecutado entre el 70–85% del período fiscal; si ya superó el 85% del año, el gap podría no cerrarse sin acciones adicionales. La proyección estimada de ${fmt(projectedYearEnd)} es positiva pero sensible a variaciones en el flujo de las próximas semanas. Recomendación: revisar el ritmo semanal de ejecución, activar seguimiento quincenal de los indicadores y priorizar las gestiones que mayor impacto tienen en este indicador específico.`;
        if (progressPct >= 60) return `${title} acumula el ${progressPct.toFixed(0)}% del nivel histórico, lo que configura un rezago real del ${fmtPct(growth)} que no se cerrará sin una intervención activa. Este nivel de avance sitúa al fondo en zona ámbar: no es una situación crítica, pero requiere decisiones en las próximas semanas. Las causas más frecuentes en cooperativas de este tipo son: menor colocación de préstamos, pagos concentrados en la segunda mitad del año, o salida de socios activos. Cada semana sin corrección amplía la brecha a cerrar. Recomendación urgente: identificar la causa raíz en la próxima reunión de directivos, establecer un plan de acción con responsables y fechas concretas, y comunicar el estado del indicador a los socios si el contexto lo amerita.`;
        return `${title} exhibe un rezago significativo (${progressPct.toFixed(0)}% del histórico de referencia), con una brecha del ${fmtPct(growth)} que constituye una señal de alerta de primer nivel. En el análisis de cooperativas de microfinanzas, un indicador por debajo del 60% de su referencia histórica en este punto del año sugiere factores estructurales — no simples retrasos temporales. Las consecuencias de no actuar incluyen: menor capacidad de préstamo para los socios, reducción del patrimonio real del fondo y posibles dificultades para cumplir compromisos de distribución o rendimiento. Plan de acción recomendado: (1) convocar reunión de emergencia del comité directivo, (2) realizar diagnóstico de cartera y liquidez, (3) definir metas intermedias mensuales de recuperación, y (4) explorar mecanismos extraordinarios de recapitalización si el diagnóstico confirma una tendencia estructural.`;
    })();

    return {
        headline: `${fmt(current)} de ${fmt(historic)} · ${progressPct.toFixed(0)}%`,
        growth,
        projGrowth,
        projectedYearEnd,
        narrative,
        insights: [
            { label: '2026 acumulado', value: fmt(current), icon: BarChart2, color: 'blue' },
            { label: 'Referencia 2025', value: fmt(historic), icon: Target, color: 'gray' },
            { label: 'Variación interanual', value: fmtPct(growth), icon: isPositive ? TrendingUp : TrendingDown, color: isPositive ? 'emerald' : 'red' },
            { label: 'Proyección cierre 2026', value: fmt(projectedYearEnd), icon: Activity, color: 'violet' },
        ]
    };
}

export function analyzeSavingsComposition({ totalSavings, totalInitialContributions, totalAhorradoGeneral }) {
    const total = totalAhorradoGeneral || 0;
    const savingsPct = total > 0 ? (totalSavings / total) * 100 : 0;
    const aportePct = total > 0 ? (totalInitialContributions / total) * 100 : 0;

    const narrative = (() => {
        if (savingsPct > 75) return `El capital del socio se sustenta principalmente en ahorro mensual recurrente (${savingsPct.toFixed(0)}%), lo que demuestra un hábito de ahorro disciplinado y sostenible. Este perfil es el más robusto para el fondo, pues genera flujo predecible. Se recomienda mantener la constancia y evaluar incrementar el aporte mensual conforme mejore la capacidad del socio.`;
        if (aportePct > 60) return `El patrimonio del socio está concentrado en aportes iniciales (${aportePct.toFixed(0)}%), lo que indica alta capitalización inicial pero baja recurrencia mensual. Si bien el saldo total es saludable, la dependencia del aporte inicial reduce la previsibilidad del flujo. Se recomienda incentivar aportes mensuales regulares.`;
        return `El socio mantiene un balance saludable entre ahorro mensual (${savingsPct.toFixed(0)}%) y aportes iniciales (${aportePct.toFixed(0)}%), lo que refleja una estrategia de capitalización mixta. Esta composición diversificada es favorable para el fondo. Se sugiere mantener el equilibrio y revisar la meta anual de ahorro acumulado.`;
    })();

    return {
        headline: `Patrimonio total: ${fmt(total)}`,
        narrative,
        insights: [
            { label: 'Ahorro mensual', value: fmt(totalSavings), icon: TrendingUp, color: 'violet' },
            { label: 'Aportes iniciales', value: fmt(totalInitialContributions), icon: Target, color: 'amber' },
            { label: 'Total patrimonio', value: fmt(total), icon: CheckCircle, color: 'emerald' },
            { label: 'Peso del ahorro mensual', value: `${savingsPct.toFixed(0)}%`, icon: BarChart2, color: 'blue' },
        ]
    };
}

export function analyzeIncomeDistribution({ totalInteresesPagados, rentabilidadCajaNU, totalPenaltyValue }) {
    const total = (totalInteresesPagados || 0) + (rentabilidadCajaNU || 0) + (totalPenaltyValue || 0);
    const intPct = total > 0 ? (totalInteresesPagados / total) * 100 : 0;
    const nuPct = total > 0 ? (rentabilidadCajaNU / total) * 100 : 0;
    const moraPct = total > 0 ? (totalPenaltyValue / total) * 100 : 0;

    const narrative = (() => {
        if (intPct > 60) return `La cartera crediticia domina los ingresos con un ${intPct.toFixed(0)}% de participación — la estructura ideal para una cooperativa de microfinanzas, donde el crédito es el servicio central y la fuente de mayor retorno sobre el capital. Este modelo maximiza el aprovechamiento del capital colocado, pero también expone al fondo a riesgo de concentración: si la colocación cae o la mora sube, el impacto en ingresos es inmediato. El rendimiento NU (${nuPct.toFixed(0)}%) actúa correctamente como colchón para el capital en espera de colocación. Para cooperativas con este perfil, el rango saludable es 55–75% de ingresos por cartera; estar dentro de ese rango indica balance entre actividad crediticia y gestión eficiente de tesorería. Recomendación: mantener la dinámica de colocación, controlar la mora por debajo del 5% y diversificar hacia instrumentos de corto plazo para reducir la dependencia de un único vector sin sacrificar la rentabilidad.`;
        if (nuPct > 40) return `El rendimiento de la cuenta NU representa el ${nuPct.toFixed(0)}% de los ingresos totales, superando o acercándose al ingreso por cartera crediticia (${intPct.toFixed(0)}%). Esto es una señal de alerta operativa: en una cooperativa de crédito sana, la rentabilidad del depósito bancario debería ser complementaria (15–25% del total), no estructural. Una participación NU elevada indica capital estacionado en lugar de colocado en préstamos, lo que representa una pérdida de rentabilidad potencial. En términos de eficiencia del capital, la tasa de retorno de préstamos (18–24% EA típica en estas cooperativas) supera ampliamente el rendimiento de cuentas NU (4–6% EA): cada peso que permanece en NU en lugar de colocarse en crédito representa una diferencia de retorno de 12–20 puntos porcentuales. Recomendación prioritaria: revisar la política de aprobación, identificar si hay solicitudes represadas, y establecer una meta de colocación mensual que lleve la participación NU al rango complementario en 60–90 días.`;
        if (moraPct > 20) return `Los cobros por mora alcanzan el ${moraPct.toFixed(0)}% de los ingresos — un nivel que clasifica como alerta alta en cualquier sistema de indicadores para cooperativas de crédito. Si bien las penalidades generan ingreso contable, señalan que una proporción significativa de la cartera presenta problemas de pago, con riesgo real de deterioro y eventual castigo. En microfinanzas, un índice de mora saludable se ubica en 3–5%; cuando los cobros por mora representan este porcentaje del ingreso total, la mora real sobre la cartera activa probablemente supera el 8–10%. El impacto de no actuar es doble: el ingreso por penalidades no es recurrente ni sostenible, y el deterioro de cartera reduce el patrimonio del fondo. Plan de acción inmediato: auditar la cartera vencida por socio y monto, implementar cobro preventivo 15 días antes del vencimiento, revisar criterios de aprobación y evaluar reestructuración voluntaria para socios con capacidad de pago comprometida.`;
        return `El fondo exhibe una distribución de ingresos equilibrada: préstamos (${intPct.toFixed(0)}%), rendimiento NU (${nuPct.toFixed(0)}%) y cobros por mora (${moraPct.toFixed(0)}%). Esta composición refleja una operación madura y diversificada, característica de cooperativas con gestión financiera consolidada. El componente crediticio domina sin crear dependencia crítica, el rendimiento NU actúa como buffer eficiente de tesorería y la mora —aunque debería tender a cero— está en nivel manejable. Para optimizar esta estructura a largo plazo: incrementar los ingresos por cartera hasta el 60–65% del total mediante mayor colocación, mantener el NU como respaldo estratégico y trabajar activamente en eliminar la mora. El objetivo de largo plazo es que el 80% de los ingresos provenga de cartera productiva, con el NU como complemento y la mora como excepción residual.`;
    })();

    return {
        headline: `Ingresos totales: ${fmt(total)}`,
        narrative,
        insights: [
            { label: 'Intereses préstamos', value: `${fmt(totalInteresesPagados)} · ${intPct.toFixed(0)}%`, icon: TrendingUp, color: 'blue' },
            { label: 'Rendimiento NU', value: `${fmt(rentabilidadCajaNU)} · ${nuPct.toFixed(0)}%`, icon: Activity, color: 'violet' },
            { label: 'Cobros por mora', value: `${fmt(totalPenaltyValue)} · ${moraPct.toFixed(0)}%`, icon: moraPct > 15 ? AlertTriangle : CheckCircle, color: moraPct > 15 ? 'red' : 'emerald' },
            { label: 'Fuente dominante', value: intPct >= nuPct && intPct >= moraPct ? 'Préstamos' : nuPct >= moraPct ? 'Cta. NU' : 'Mora', icon: Target, color: 'emerald' },
        ]
    };
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
const colorMap = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    red: 'bg-red-50 border-red-100 text-red-700',
    gray: 'bg-gray-50 border-gray-100 text-gray-600',
};

const InsightCard = ({ label, value, icon: Icon, color = 'blue' }) => (
    <div className={`rounded-xl border p-3 ${colorMap[color] || colorMap.blue}`}>
        <div className="flex items-center gap-1.5 mb-1">
            <Icon className="h-3.5 w-3.5 opacity-70 flex-shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</span>
        </div>
        <p className="text-sm font-black leading-tight tabular-nums">{value}</p>
    </div>
);

// ─── Analysis Panel ───────────────────────────────────────────────────────────
const AnalysisPanel = ({ headline, insights = [], narrative, trendLabel, growth, trendPct }) => {
    const trendColor = (trendLabel === 'creciente' || growth > 0 || trendPct > 0)
        ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
        : (trendLabel === 'decreciente' || growth < 0 || trendPct < 0)
            ? 'text-red-600 bg-red-50 border-red-200'
            : 'text-amber-600 bg-amber-50 border-amber-200';
    const TrendIcon = (trendLabel === 'creciente' || growth > 0 || trendPct > 0) ? TrendingUp
        : (trendLabel === 'decreciente' || growth < 0 || trendPct < 0) ? TrendingDown : Minus;

    return (
        <div className="space-y-4">
            {/* Headline */}
            <div className="bg-gradient-to-r from-brand-primary/5 to-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                <div>
                    <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-0.5">Resumen ejecutivo</p>
                    <p className="text-base font-black text-gray-900">{headline}</p>
                </div>
                {(trendLabel || growth !== undefined || trendPct !== undefined) && (
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold flex-shrink-0 ${trendColor}`}>
                        <TrendIcon className="h-4 w-4" />
                        {trendLabel
                            ? trendLabel.charAt(0).toUpperCase() + trendLabel.slice(1)
                            : growth !== undefined ? fmtPct(growth) : fmtPct(trendPct)}
                    </div>
                )}
            </div>

            {/* Insight grid */}
            {insights.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {insights.map((ins, i) => <InsightCard key={i} {...ins} />)}
                </div>
            )}

            {/* Expert narrative */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Análisis del Experto</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{narrative}</p>
            </div>
        </div>
    );
};

// ─── Modal ────────────────────────────────────────────────────────────────────
const ChartExpandModal = ({ isOpen, onClose, title, children, analysisResult }) => {
    useEffect(() => {
        if (!isOpen) return;
        document.body.style.overflow = 'hidden';
        const esc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', esc);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <h2 className="text-base font-bold text-brand-primary">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700"
                        aria-label="Cerrar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Chart */}
                <div className="h-[300px] px-4 pt-3 pb-1 flex-shrink-0 border-b border-gray-50">
                    {children}
                </div>

                {/* Analysis */}
                <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
                    {analysisResult
                        ? <AnalysisPanel {...analysisResult} />
                        : <p className="text-center text-gray-400 py-10">Sin datos suficientes para el análisis.</p>
                    }
                </div>
            </div>
        </div>
    );
};

export default ChartExpandModal;
