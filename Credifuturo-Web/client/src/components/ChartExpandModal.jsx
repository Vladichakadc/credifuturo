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
        if (progressPct >= 120) return `${title} supera ampliamente el nivel del año anterior con un crecimiento del ${fmtPct(growth)}. Este desempeño excepcional posiciona al fondo en una trayectoria de expansión acelerada. Se recomienda revisar si el incremento es sostenible estructuralmente o responde a factores puntuales, para calibrar las metas del próximo período.`;
        if (progressPct >= 100) return `${title} ha superado el nivel histórico de referencia (+${fmtPct(growth)}), señal de gestión eficiente y cumplimiento de objetivos. Al ritmo actual se proyecta cerrar el año en ${fmt(projectedYearEnd)} (${fmtPct(projGrowth)} vs año anterior). Se recomienda mantener la disciplina y anticipar necesidades de liquidez adicional.`;
        if (progressPct >= 80) return `${title} avanza a buen ritmo (${progressPct.toFixed(0)}% del nivel de referencia). La proyección al cierre de ${fmt(projectedYearEnd)} es positiva aunque requiere sostener el ritmo actual. Monitorear los próximos 60 días será crítico para confirmar la tendencia de cierre.`;
        if (progressPct >= 60) return `${title} muestra un rezago moderado respecto al período de referencia. Con ${progressPct.toFixed(0)}% alcanzado, se requiere acelerar el ritmo en el período restante. Se recomienda identificar los factores de retraso y activar medidas correctivas antes del cierre del año.`;
        return `${title} presenta un rezago significativo (${progressPct.toFixed(0)}% del nivel histórico), lo que constituye una señal de alerta para la dirección del fondo. Se requiere un plan de acción inmediato: revisión de causas raíz, ajuste de metas y comunicación clara con los socios sobre el impacto en los indicadores del fondo.`;
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
        if (intPct > 60) return `La cartera de préstamos es el motor dominante del fondo (${intPct.toFixed(0)}% del ingreso total), señal de operación activa y demanda crediticia saludable. Esta estructura es la más deseable en una cooperativa de crédito. El riesgo principal es la concentración: si la colocación cae, el ingreso total cae proporcionalmente. Se recomienda diversificar con instrumentos financieros complementarios.`;
        if (nuPct > 40) return `El rendimiento de la cuenta NU representa el ${nuPct.toFixed(0)}% del ingreso, superando o igualando la cartera crediticia. Esto puede indicar subutilización del capital disponible para préstamos. Se recomienda revisar la política de colocación y evaluar si existen barreras que impidan aumentar la cartera activa.`;
        if (moraPct > 20) return `Los cobros por mora alcanzan el ${moraPct.toFixed(0)}% de los ingresos, una señal de alerta sobre la calidad de la cartera. Depender de penalidades como fuente de ingreso es insostenible y perjudica la relación con los socios. Se recomienda implementar un protocolo de cobro preventivo y revisar los criterios de aprobación de préstamos.`;
        return `El fondo presenta una distribución de ingresos equilibrada entre préstamos (${intPct.toFixed(0)}%), rendimiento NU (${nuPct.toFixed(0)}%) y cobros por mora (${moraPct.toFixed(0)}%). Esta diversificación es positiva aunque la mora debería tender a cero. Se recomienda priorizar el crecimiento del componente crediticio.`;
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
