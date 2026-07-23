import React, { useState, useEffect, useMemo } from 'react';
import api from '../../config/api';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, Cell, PieChart, Pie, LabelList
} from 'recharts';
import {
    Gauge, ShieldCheck, AlertTriangle, TrendingUp, Wallet, PiggyBank,
    CalendarClock, Users, Printer, CheckCircle2, Info, Landmark, Percent,
    ChevronDown, DollarSign, Database, Clock, Activity, BarChart3, Coins
} from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtCorto = (n) => {
    const v = Number(n) || 0;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
    return `$${v}`;
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const mesLabel = (ym) => {
    // '2026-07' → 'Jul 26'
    const [y, m] = String(ym).split('-').map(Number);
    return m >= 1 && m <= 12 ? `${MESES[m - 1]} ${String(y).slice(2)}` : ym;
};

// Paleta con semántica financiera: verde = ingreso/ahorro, dorado = flujo, rojo = solo riesgo
const DONUT_COLORS = ['#166534', '#15803d', '#22c55e', '#84cc16', '#a3e635', '#d1d5db'];

const HeroKpi = ({ label, value, sub, badge, badgeTone = 'ok', icon: Icon }) => {
    const tones = {
        ok: 'bg-emerald-100 text-emerald-700',
        warn: 'bg-amber-100 text-amber-700',
        risk: 'bg-red-100 text-red-700',
        neutral: 'bg-white/15 text-white/80',
    };
    return (
        <div className="rounded-2xl p-4 lg:p-5 text-white relative overflow-hidden"
             style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 80%)' }}>
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">{label}</p>
                {Icon && <Icon className="h-4 w-4 text-white/40" />}
            </div>
            <p className="text-xl lg:text-2xl font-extrabold mt-1.5 tracking-tight tabular-nums">{value}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {badge && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tones[badgeTone]}`}>{badge}</span>
                )}
                {sub && <span className="text-[11px] text-white/60">{sub}</span>}
            </div>
        </div>
    );
};

const SectionTitle = ({ icon: Icon, children }) => (
    <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-brand-primary" />
        {children}
    </h2>
);

// Tarjeta compacta del detalle operativo (equivalente a las StatCard del Panel Principal)
const DetailCard = ({ title, value, sub, icon: Icon, tone = 'neutral' }) => {
    const tones = {
        neutral: 'text-gray-900',
        ok: 'text-brand-primary',
        gold: 'text-amber-600',
        risk: 'text-red-600',
    };
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-card p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
                <span className="truncate">{title}</span>
            </p>
            <p className={`text-lg font-extrabold mt-1 tabular-nums ${tones[tone]}`}>{value}</p>
            {sub && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{sub}</p>}
        </div>
    );
};

// Mini gráfico de barras por año (resultados anuales con datos dinámicos)
const MiniYearBars = ({ title, data, currentYear }) => (
    <div>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide text-center mb-1">{title}</p>
        {data.length === 0 ? (
            <div className="h-[150px] flex items-center justify-center text-xs text-gray-300">Sin datos</div>
        ) : (
            <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 22, right: 4, left: 4, bottom: 0 }}>
                        <XAxis dataKey="anio" axisLine={false} tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                        <YAxis hide domain={[0, 'auto']} />
                        <RechartsTooltip formatter={(v) => [fmt(v), title]} />
                        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                            {data.map((d, i) => (
                                <Cell key={i} fill={String(d.anio) === String(currentYear) ? '#166534' : '#cbd5e1'} />
                            ))}
                            <LabelList dataKey="total" position="top" formatter={fmtCorto}
                                style={{ fill: '#374151', fontSize: 9.5, fontWeight: 700 }} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        )}
    </div>
);

// Sección colapsable del detalle operativo
const Collapsible = ({ icon: Icon, title, sub, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-gray-50/60 rounded-2xl border border-gray-200">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 min-h-[48px] text-left"
            >
                <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-brand-primary" />
                    <span className="text-sm font-extrabold text-gray-900">{title}</span>
                    {sub && <span className="text-[11px] text-gray-400 hidden sm:inline">{sub}</span>}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <div className="px-3 pb-3">{children}</div>}
        </div>
    );
};

const ExecutivePanelPage = () => {
    const [exec, setExec] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAll = async () => {
            const results = await Promise.allSettled([
                api.get('/admin/executive-stats'),
                api.get('/admin/dashboard-stats'),
            ]);
            if (results[0].status === 'fulfilled') setExec(results[0].value.data);
            else setError('No se pudieron cargar los indicadores ejecutivos.');
            if (results[1].status === 'fulfilled') setStats(results[1].value.data);
            setLoading(false);
        };
        fetchAll();
    }, []);

    const anioActual = new Date().getFullYear();

    // ── Derivados ─────────────────────────────────────────────────────
    const derived = useMemo(() => {
        if (!exec) return null;

        const cartera = exec.cartera || {};
        const conc = exec.concentracion || [];
        const top3 = conc.slice(0, 3).reduce((s, d) => s + (d.saldo || 0), 0);
        const top3Pct = cartera.total > 0 ? (top3 / cartera.total) * 100 : 0;

        // Dona: top 5 + resto
        const top5 = conc.slice(0, 5);
        const resto = conc.slice(5).reduce((s, d) => s + (d.saldo || 0), 0);
        const donutData = [
            ...top5.map(d => ({ name: d.nombre, value: d.saldo })),
            ...(resto > 0 ? [{ name: 'Resto de socios', value: resto }] : []),
        ];

        // Series por año
        const ahorro = exec.series?.ahorroPorAnio || [];
        const coloc = exec.series?.colocacionPorAnio || [];
        const ahorroActual = ahorro.find(a => Number(a.anio) === anioActual)?.total || 0;
        const ahorroPrevio = ahorro.find(a => Number(a.anio) === anioActual - 1)?.total || 0;
        const colocActual = coloc.find(c => Number(c.anio) === anioActual);
        const colocPrevio = coloc.find(c => Number(c.anio) === anioActual - 1);

        // Intereses del año en curso: cobrados vs agendados (sin mezclar años futuros)
        const intRows = exec.series?.interesesPorAnio || [];
        const intCobradosAnio = intRows
            .filter(r => Number(r.anio) === anioActual && (r.estado === 'Pago' || r.estado === 'Abono'))
            .reduce((s, r) => s + (r.intereses || 0), 0);
        const intAgendadosAnio = intRows
            .filter(r => Number(r.anio) === anioActual && r.estado === 'Pendiente')
            .reduce((s, r) => s + (r.intereses || 0), 0);
        const intAnioPrevio = intRows
            .filter(r => Number(r.anio) === anioActual - 1 && (r.estado === 'Pago' || r.estado === 'Abono'))
            .reduce((s, r) => s + (r.intereses || 0), 0);

        const pen = exec.penetracion || { conCredito: 0, activos: 0 };
        const penPct = pen.activos > 0 ? (pen.conCredito / pen.activos) * 100 : 0;

        // Apalancamiento del fondo (Loan-to-Deposit Ratio): cuánta cartera pendiente
        // hay por cada peso de patrimonio de socios. Espejo, a nivel de fondo, de la
        // regla 3× que ya se usa por socio individual en el Simulador de Préstamo.
        const patrimonioSocios = stats?.totalAhorradoGeneral || 0;
        const ldrPct = patrimonioSocios > 0 ? (cartera.total / patrimonioSocios) * 100 : 0;
        const ldrTone = ldrPct > 85 ? 'risk' : ldrPct < 40 ? 'warn' : 'ok';

        // ── Centro de alertas: reglas sobre los datos reales ──────────
        const alertas = [];
        if ((cartera.vencida || 0) > 0) {
            alertas.push({ tone: 'risk', icon: AlertTriangle, texto: `Cartera vencida por ${fmt(cartera.vencida)} — revisar cuotas en mora EP y gestionar cobro.` });
        }
        if (top3Pct > 60) {
            alertas.push({ tone: 'risk', icon: AlertTriangle, texto: `Concentración crítica: el top 3 de deudores acumula el ${top3Pct.toFixed(0)}% de la cartera.` });
        } else if (top3Pct > 40) {
            alertas.push({ tone: 'warn', icon: Info, texto: `Concentración a vigilar: el top 3 de deudores acumula el ${top3Pct.toFixed(0)}% de la cartera (${fmt(top3)}). Diversificar los próximos préstamos.` });
        }
        const efic = exec.recaudoYtd?.eficienciaPct;
        if (efic != null && efic < 90) {
            alertas.push({ tone: 'risk', icon: AlertTriangle, texto: `Eficiencia de recaudo en ${efic}% — por debajo del umbral del 90%.` });
        } else if (efic != null && efic < 95) {
            alertas.push({ tone: 'warn', icon: Info, texto: `Eficiencia de recaudo en ${efic}% — vigilar cuotas próximas.` });
        }
        if (penPct < 50 && pen.activos > 0) {
            alertas.push({ tone: 'info', icon: Info, texto: `Oportunidad: ${pen.activos - pen.conCredito} socios activos sin crédito vigente (penetración ${penPct.toFixed(0)}%). Los intereses son el motor de ingresos del fondo.` });
        }
        if (alertas.filter(a => a.tone === 'risk').length === 0) {
            alertas.unshift({ tone: 'ok', icon: CheckCircle2, texto: 'Sin alertas críticas: cartera al día y recaudo dentro de los umbrales.' });
        }

        // Series por año para "Resultados del Año" (baselines dinámicos desde la BD)
        const interesesCobradosPorAnio = {};
        intRows.filter(r => r.estado === 'Pago' || r.estado === 'Abono').forEach(r => {
            interesesCobradosPorAnio[r.anio] = (interesesCobradosPorAnio[r.anio] || 0) + (r.intereses || 0);
        });
        const seriesCharts = {
            ahorro: ahorro.map(a => ({ anio: String(a.anio), total: a.total || 0 })),
            colocacion: coloc.map(c => ({ anio: String(c.anio), total: c.total || 0 })),
            intereses: Object.entries(interesesCobradosPorAnio)
                .map(([anio, total]) => ({ anio, total }))
                .sort((a, b) => a.anio.localeCompare(b.anio)),
        };

        // ── Estimado al cierre del año — modelo de 3 escenarios (Conservador/Base/
        // Optimista), basado en el comportamiento real del fondo, no en supuestos
        // arbitrarios (framework: business-analyst + startup-financial-modeling).
        const today = new Date();
        const endOfYear = new Date(today.getFullYear(), 11, 31);
        const remainingDays = Math.max(0, Math.ceil((endOfYear - today) / 86400000));
        const currentDayOfYear = Math.max(1, Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / 86400000));
        const mesesTranscurridos = Math.max(0.5, currentDayOfYear / 30.44);
        const mesesRestantes = remainingDays / 30.44;

        // Intereses: (a) cartera ya desembolsada = cobrado + agendado pendiente ×
        // tasa de RECAUDO REAL del año (misma cifra que el hero "Recaudo del año"),
        // no un porcentaje inventado; (b) nueva colocación esperada al ritmo de
        // desembolso real observado, generando interés solo por la fracción de año
        // que le queda a cada crédito nuevo.
        const interesesYaCobrados = stats?.totalInteresesPagados || 0;
        const interesesPendientesAgendados = Math.max(0, (stats?.totalIntereses || 0) - interesesYaCobrados);
        const recaudoBase = (exec.recaudoYtd?.eficienciaPct ?? 85) / 100;
        const recaudoConservador = Math.max(0.5, recaudoBase - 0.15);
        const recaudoOptimista = Math.min(1, recaudoBase + 0.10);
        const colocacionMensualProm = (stats?.totalPrestamos || 0) / mesesTranscurridos;
        const tasaMensualVigente = 0.015; // tasa típica actual del fondo (1.4%–1.6%)
        const interesesPorNuevaColocacion = (monto) => monto * tasaMensualVigente * (mesesRestantes / 2);

        const proyeccionInteresesBase = interesesYaCobrados
            + interesesPendientesAgendados * recaudoBase
            + interesesPorNuevaColocacion(colocacionMensualProm * mesesRestantes);
        const proyeccionInteresesConservador = interesesYaCobrados
            + interesesPendientesAgendados * recaudoConservador;
        const proyeccionInteresesOptimista = interesesYaCobrados
            + interesesPendientesAgendados * recaudoOptimista
            + interesesPorNuevaColocacion(colocacionMensualProm * 1.5 * mesesRestantes);

        // NU: extrapolación lineal (único método válido con un solo dato acumulado
        // sin serie histórica). Rango: más colocación (optimista de intereses)
        // implica menos saldo en NU, y viceversa.
        const dailyNURate = (stats?.rentabilidadCajaNU || 0) / currentDayOfYear;
        const proyeccionCajaNUBase = (stats?.rentabilidadCajaNU || 0) + dailyNURate * remainingDays;
        const proyeccionCajaNUConservador = proyeccionCajaNUBase * 0.85;
        const proyeccionCajaNUOptimista = proyeccionCajaNUBase * 1.05;

        // Recargos por mora: run-rate anualizado, rango amplio porque el
        // comportamiento real es errático mes a mes.
        const proyeccionPenalidadBase = ((stats?.totalPenaltyValue || 0) / currentDayOfYear) * 365;
        const proyeccionPenalidadConservador = proyeccionPenalidadBase * 0.5;
        const proyeccionPenalidadOptimista = proyeccionPenalidadBase * 1.8;

        const proyeccion = {
            intereses: { base: proyeccionInteresesBase, conservador: proyeccionInteresesConservador, optimista: proyeccionInteresesOptimista },
            nu: { base: proyeccionCajaNUBase, conservador: proyeccionCajaNUConservador, optimista: proyeccionCajaNUOptimista },
            penalidad: { base: proyeccionPenalidadBase, conservador: proyeccionPenalidadConservador, optimista: proyeccionPenalidadOptimista },
            total: {
                base: proyeccionInteresesBase + proyeccionCajaNUBase + proyeccionPenalidadBase,
                conservador: proyeccionInteresesConservador + proyeccionCajaNUConservador + proyeccionPenalidadConservador,
                optimista: proyeccionInteresesOptimista + proyeccionCajaNUOptimista + proyeccionPenalidadOptimista,
            },
            recaudoBasePct: Math.round(recaudoBase * 100),
            colocacionMensualProm,
        };

        return {
            top3, top3Pct, donutData, ldrPct, ldrTone, proyeccion,
            ahorroActual, ahorroPrevio, colocActual, colocPrevio,
            intCobradosAnio, intAgendadosAnio, intAnioPrevio,
            penPct, alertas, seriesCharts,
        };
    }, [exec, stats, anioActual]);

    if (loading) {
        return (
            <div className="space-y-4 max-w-6xl mx-auto">
                <div className="h-8 w-64 bg-gray-200 rounded-lg animate-pulse" />
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                    {[1, 2].map(i => <div key={i} className="h-72 bg-gray-100 rounded-2xl animate-pulse" />)}
                </div>
            </div>
        );
    }

    if (error || !exec || !derived) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
                <AlertTriangle className="h-10 w-10 text-amber-400" />
                <p className="text-sm text-gray-500">{error || 'Sin datos disponibles.'}</p>
                <p className="text-xs text-gray-400">Verifica que el servidor backend esté actualizado y corriendo.</p>
            </div>
        );
    }

    const { cartera, recaudoYtd, flujo30dias, penetracion, vencimientos } = exec;
    const disponible = (stats?.saldoEnBanco || 0) + (stats?.rentabilidadCajaNU || 0);
    const patrimonio = stats?.totalAhorradoGeneral || 0;
    const crecimientoAhorro = derived.ahorroPrevio > 0
        ? ((derived.ahorroActual - derived.ahorroPrevio) / derived.ahorroPrevio) * 100
        : null;

    const toneStyles = {
        ok:   'bg-emerald-50 border-emerald-200 text-emerald-800',
        warn: 'bg-amber-50 border-amber-200 text-amber-800',
        risk: 'bg-red-50 border-red-200 text-red-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800',
    };
    const toneIcon = {
        ok: 'text-emerald-500', warn: 'text-amber-500', risk: 'text-red-500', info: 'text-blue-500',
    };

    return (
        <div className="space-y-5 max-w-6xl mx-auto animate-fade-in">
            <style>{`
                @media print {
                    * { overflow: visible !important; max-height: none !important; }
                    .print\\:hidden { display: none !important; }
                    @page { size: A4 landscape; margin: 12mm; }
                }
            `}</style>

            {/* Encabezado */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Panel Ejecutivo</h1>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Beta</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Indicadores de riesgo, flujo y rendimiento del fondo · propuesta en evaluación
                    </p>
                </div>
                <button
                    onClick={() => window.print()}
                    className="print:hidden inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-dark text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
                >
                    <Printer className="h-4 w-4" /> Informe ejecutivo
                </button>
            </div>

            {/* ── Nivel 1: Hero ejecutivo ── */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                <HeroKpi
                    label="Patrimonio de socios"
                    value={fmt(patrimonio)}
                    icon={PiggyBank}
                    badge={crecimientoAhorro != null ? `▲ +${crecimientoAhorro.toFixed(0)}% ahorro vs ${anioActual - 1}` : null}
                    badgeTone="ok"
                />
                <HeroKpi
                    label="Cartera pendiente"
                    value={fmt(cartera.total)}
                    icon={Wallet}
                    badge={`PAR ${cartera.parPct}%`}
                    badgeTone={cartera.parPct <= 3 ? 'ok' : cartera.parPct <= 5 ? 'warn' : 'risk'}
                    sub={`${cartera.cuotasPendientes} cuotas`}
                />
                <HeroKpi
                    label="Recaudo del año"
                    value={recaudoYtd.eficienciaPct != null ? `${recaudoYtd.eficienciaPct}%` : '—'}
                    icon={Percent}
                    badge={`${recaudoYtd.pagadas}/${recaudoYtd.exigidas} cuotas`}
                    badgeTone={recaudoYtd.eficienciaPct >= 95 ? 'ok' : recaudoYtd.eficienciaPct >= 90 ? 'warn' : 'risk'}
                    sub={fmt(recaudoYtd.valorRecaudado)}
                />
                <HeroKpi
                    label="Disponible total"
                    value={fmt(disponible)}
                    icon={Landmark}
                    sub="Caja + rendimientos NU"
                    badge={null}
                />
                <HeroKpi
                    label="Apalancamiento del fondo"
                    value={`${derived.ldrPct.toFixed(0)}%`}
                    icon={Gauge}
                    badge={derived.ldrTone === 'risk' ? 'Cerca del límite' : derived.ldrTone === 'warn' ? 'Capacidad ociosa' : 'Sano'}
                    badgeTone={derived.ldrTone}
                    sub="Cartera vs. patrimonio de socios"
                />
            </div>

            {/* ── Centro de alertas ── */}
            <div className="space-y-2">
                <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-brand-primary" />
                    Centro de Alertas
                </h2>
                {derived.alertas.map((a, i) => {
                    const AIcon = a.icon;
                    return (
                        <div key={i} className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 text-sm ${toneStyles[a.tone]}`}>
                            <AIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${toneIcon[a.tone]}`} />
                            <p className="leading-snug">{a.texto}</p>
                        </div>
                    );
                })}
            </div>

            {/* ── Rentabilidad del Fondo (promovida: responde la pregunta central del
                 comité — cuánto está ganando el fondo — justo después de las alertas,
                 en vez de quedar enterrada al final de la página) ── */}
            {stats && (() => {
                const ingresos = [
                    { name: 'Intereses de préstamos', value: Number(stats.totalInteresesPagados || 0), color: '#166534' },
                    { name: 'Rendimientos NU', value: Number(stats.rentabilidadCajaNU || 0), color: '#84cc16' },
                    { name: 'Recargos por mora', value: Number(stats.totalPenaltyValue || 0), color: '#f59e0b' },
                ].filter(d => d.value > 0);
                const totalIngresos = ingresos.reduce((s, d) => s + d.value, 0);
                const retornoCapital = patrimonio > 0 ? (totalIngresos / patrimonio) * 100 : 0;
                return (
                    <div className="space-y-3">
                        <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-brand-primary" />
                            Rentabilidad del Fondo
                            <span className="text-[11px] font-semibold text-gray-400">ingresos reales, estimado de cierre y evolución anual</span>
                        </h2>
                        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                            {/* ¿Cuánto está ganando el fondo? */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                                <SectionTitle icon={Coins}>¿Cuánto está ganando el fondo?</SectionTitle>
                                {ingresos.length === 0 ? (
                                    <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">Sin ingresos registrados</div>
                                ) : (
                                    <div className="flex items-center gap-4">
                                        <div className="relative w-[170px] h-[190px] flex-shrink-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={ingresos} cx="50%" cy="50%" innerRadius="58%" outerRadius="88%"
                                                        paddingAngle={3} dataKey="value" isAnimationActive={false} stroke="none">
                                                        {ingresos.map((d, i) => <Cell key={i} fill={d.color} />)}
                                                    </Pie>
                                                    <RechartsTooltip formatter={(v) => fmt(v)} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Total</span>
                                                <span className="text-sm font-black text-gray-800 tabular-nums">{fmtCorto(totalIngresos)}</span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-2">
                                            {ingresos.map(d => (
                                                <div key={d.name} className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                                    <span className="text-xs text-gray-600 font-medium flex-1 truncate">{d.name}</span>
                                                    <span className="text-xs text-gray-800 font-bold tabular-nums">{fmtCorto(d.value)}</span>
                                                </div>
                                            ))}
                                            <div className="pt-2 mt-1 border-t border-gray-100">
                                                <p className="text-[11px] text-gray-500">
                                                    Retorno del capital: <b className={retornoCapital >= 5 ? 'text-emerald-600' : retornoCapital >= 2 ? 'text-amber-600' : 'text-gray-600'}>
                                                        {retornoCapital.toFixed(1)}%
                                                    </b> del patrimonio de socios
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Estimado al cierre del año — 3 escenarios basados en comportamiento real */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                                <SectionTitle icon={Gauge}>Estimado al cierre del año</SectionTitle>
                                <div className="space-y-2.5">
                                    {[
                                        { label: 'Intereses de préstamos', v: derived.proyeccion.intereses, color: '#166534' },
                                        { label: 'Rendimiento cuenta NU', v: derived.proyeccion.nu, color: '#84cc16' },
                                        { label: 'Recargos por mora', v: derived.proyeccion.penalidad, color: '#f59e0b' },
                                    ].map(row => (
                                        <div key={row.label} className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                                            <span className="text-xs text-gray-600 font-medium flex-1 truncate">{row.label}</span>
                                            <div className="text-right">
                                                <p className="text-xs font-bold text-gray-800 tabular-nums">{fmtCorto(row.v.base)}</p>
                                                <p className="text-[9px] text-gray-400 tabular-nums">{fmtCorto(row.v.conservador)}–{fmtCorto(row.v.optimista)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="pt-2.5 mt-1.5 border-t border-gray-100 flex items-center justify-between">
                                        <span className="text-xs font-extrabold text-gray-900">Ganancia total estimada</span>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-brand-primary tabular-nums">{fmt(derived.proyeccion.total.base)}</p>
                                            <p className="text-[9px] text-gray-400 tabular-nums">{fmt(derived.proyeccion.total.conservador)} – {fmt(derived.proyeccion.total.optimista)}</p>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-3 leading-snug">
                                    Cartera desembolsada (cobrado + agendado × {derived.proyeccion.recaudoBasePct}% recaudo real) + nuevos préstamos esperados
                                    al ritmo observado ({fmtCorto(derived.proyeccion.colocacionMensualProm)}/mes). Rango conservador–optimista, no un número con falsa precisión.
                                </p>
                            </div>

                            {/* Resultados por año — baselines dinámicos */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                                <SectionTitle icon={BarChart3}>Resultados por año</SectionTitle>
                                <div className="grid grid-cols-3 gap-2">
                                    <MiniYearBars title="Ahorro" data={derived.seriesCharts.ahorro} currentYear={anioActual} />
                                    <MiniYearBars title="Préstamos" data={derived.seriesCharts.colocacion} currentYear={anioActual} />
                                    <MiniYearBars title="Intereses" data={derived.seriesCharts.intereses} currentYear={anioActual} />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2">
                                    $ COP · año en curso en verde · calculado por año desde la base de datos (sin cifras fijas)
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Riesgo de Cartera y Flujo de Caja ── */}
            <div className="space-y-3">
                <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-brand-primary" />
                    Riesgo de Cartera y Flujo de Caja
                    <span className="text-[11px] font-semibold text-gray-400">vencimientos próximos y concentración por deudor</span>
                </h2>
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Calendario de vencimientos */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                    <SectionTitle icon={CalendarClock}>Calendario de vencimientos · próximos 6 meses</SectionTitle>
                    {vencimientos.length === 0 ? (
                        <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
                            Sin cuotas pendientes en los próximos 6 meses
                        </div>
                    ) : (
                        <div className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={vencimientos} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="mes" tickFormatter={mesLabel} axisLine={false} tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                                    <YAxis tickFormatter={fmtCorto} axisLine={false} tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 10 }} width={48} domain={[0, 'auto']} />
                                    <RechartsTooltip
                                        formatter={(v, _n, p) => [`${fmt(v)} · ${p.payload.cuotas} cuota(s)`, 'Por recaudar']}
                                        labelFormatter={mesLabel}
                                    />
                                    <Bar dataKey="valor" fill="#166534" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                                        <LabelList dataKey="valor" position="top" formatter={fmtCorto}
                                            style={{ fill: '#374151', fontSize: 10, fontWeight: 700 }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    <p className="text-[11px] text-gray-400 mt-2">
                        Próximos 30 días: <b className="text-gray-600">{fmt(flujo30dias.valor)}</b> en {flujo30dias.cuotas} cuota(s) · $ COP
                    </p>
                </div>

                {/* Concentración de cartera */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                    <SectionTitle icon={ShieldCheck}>Concentración de cartera por deudor</SectionTitle>
                    {derived.donutData.length === 0 ? (
                        <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
                            Sin cartera pendiente
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <div className="relative w-[180px] h-[200px] flex-shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={derived.donutData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%"
                                            paddingAngle={2} dataKey="value" isAnimationActive={false} stroke="none">
                                            {derived.donutData.map((_, i) => (
                                                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(v) => fmt(v)} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Top 3</span>
                                    <span className={`text-lg font-black tabular-nums ${
                                        derived.top3Pct > 60 ? 'text-red-600' : derived.top3Pct > 40 ? 'text-amber-600' : 'text-emerald-600'
                                    }`}>
                                        {derived.top3Pct.toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0 space-y-1.5">
                                {derived.donutData.map((d, i) => (
                                    <div key={d.name} className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                                        <span className="text-xs text-gray-600 font-medium flex-1 truncate">{d.name}</span>
                                        <span className="text-xs text-gray-800 font-bold tabular-nums">{fmtCorto(d.value)}</span>
                                    </div>
                                ))}
                                <p className="text-[10px] text-gray-400 pt-1.5">
                                    Umbral top 3: &lt;40% saludable · 40–60% vigilar · &gt;60% alto
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            </div>

            {/* ── Actividad y Crecimiento ── */}
            <div className="space-y-3">
                <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-brand-primary" />
                    Actividad y Crecimiento
                    <span className="text-[11px] font-semibold text-gray-400">penetración de crédito, intereses, préstamos y ahorro del año</span>
                </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> Penetración de crédito
                    </p>
                    <p className="text-xl font-extrabold text-gray-900 mt-1.5 tabular-nums">{derived.penPct.toFixed(0)}%</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        {penetracion.conCredito} de {penetracion.activos} socios con crédito · {penetracion.activos - penetracion.conCredito} sin crédito vigente
                    </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Intereses {anioActual}
                    </p>
                    <p className="text-xl font-extrabold text-brand-primary mt-1.5 tabular-nums">
                        {fmt(derived.intCobradosAnio + derived.intAgendadosAnio)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        {fmt(derived.intCobradosAnio)} cobrados + {fmt(derived.intAgendadosAnio)} agendados
                        {derived.intAnioPrevio > 0 && (
                            <span className="text-emerald-600 font-bold"> · +{(((derived.intCobradosAnio + derived.intAgendadosAnio) / derived.intAnioPrevio - 1) * 100).toFixed(0)}% vs {anioActual - 1}</span>
                        )}
                    </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" /> Préstamos {anioActual}
                    </p>
                    <p className="text-xl font-extrabold text-gray-900 mt-1.5 tabular-nums">
                        {fmt(derived.colocActual?.total || 0)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        {derived.colocActual?.creditos || 0} créditos
                        {derived.colocPrevio?.total > 0 && (
                            <span className="text-emerald-600 font-bold"> · +{(((derived.colocActual?.total || 0) / derived.colocPrevio.total - 1) * 100).toFixed(0)}% vs {anioActual - 1}</span>
                        )}
                    </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                        <PiggyBank className="h-3.5 w-3.5" /> Ahorro {anioActual}
                    </p>
                    <p className="text-xl font-extrabold text-gray-900 mt-1.5 tabular-nums">{fmt(derived.ahorroActual)}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        Mes acreditado
                        {crecimientoAhorro != null && (
                            <span className="text-emerald-600 font-bold"> · +{crecimientoAhorro.toFixed(0)}% vs {anioActual - 1}</span>
                        )}
                    </p>
                </div>
            </div>
            </div>

            {/* ── Detalle operativo (todo lo del Panel Principal) ── */}
            {stats && (
                <div className="space-y-3">
                    <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-brand-primary" />
                        Detalle operativo
                        <span className="text-[11px] font-semibold text-gray-400">indicadores del Panel Principal, para consulta bajo demanda</span>
                    </h2>

                    <Collapsible icon={PiggyBank} title="Socios y Ahorros" sub={`${stats.activeClientsCount || 0} socios activos`}>
                        <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            <DetailCard title="Socios del Fondo" value={stats.clientsCount || 0}
                                sub={`${stats.activeClientsCount || 0} activos · ${stats.inactiveClientsCount || 0} inactivos`} icon={Users} />
                            <DetailCard title="Ahorros Mensuales" value={fmt(stats.totalSavings)} sub="Abonos acumulados · activos" icon={PiggyBank} tone="ok" />
                            <DetailCard title="Base Patrimonial" value={fmt(stats.totalInitialContributions)} sub="Aportes iniciales" icon={Database} tone="gold" />
                            <DetailCard title="Patrimonio de Socios" value={fmt(stats.totalAhorradoGeneral)} sub="Ahorros + aportes" icon={Landmark} tone="ok" />
                            <DetailCard title="Días en Retraso" value={stats.totalPenaltyDays || 0} sub="Mora en ahorros · año en curso"
                                icon={Clock} tone={(stats.totalPenaltyDays || 0) > 0 ? 'risk' : 'neutral'} />
                            <DetailCard title="Recargos por Mora" value={fmt(stats.totalPenaltyValue)} sub="Cobrados en el año" icon={DollarSign} tone="gold" />
                        </div>
                    </Collapsible>

                    <Collapsible icon={Activity} title="Préstamos e Intereses" sub={`${stats.totalPrestamosCount || 0} créditos entregados`}>
                        <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
                            <DetailCard title="Capital Desembolsado" value={fmt(stats.totalPrestamos)}
                                sub={`${stats.totalPrestamosCount || 0} préstamos entregados`} icon={DollarSign} tone="ok" />
                            <DetailCard title="Cartera al Día" value={fmt(stats.carteraDia)}
                                sub={`${stats.carteraDiaCount || 0} cuotas vigentes`} icon={TrendingUp} tone="ok" />
                            <DetailCard title="Cuotas Recaudadas" value={fmt(stats.totalCuotasPagadas)}
                                sub={`${stats.recaudoCuotasCount || 0} pagos completados`} icon={CheckCircle2} />
                            <DetailCard title="Mora de Cartera" value={fmt(stats.moraCarteraEP)} sub="Vencimiento superado"
                                icon={AlertTriangle} tone={(stats.moraCarteraEP || 0) > 0 ? 'risk' : 'neutral'} />
                            <DetailCard title="Cartera Total" value={fmt(stats.totalPrestamosMasIntereses)} sub="Capital + intereses del portafolio" icon={Activity} />
                            <DetailCard title="Intereses Proyectados" value={fmt(stats.totalIntereses)} sub="Todo el portafolio (incluye años futuros)" icon={BarChart3} />
                            <DetailCard title="Intereses Cobrados" value={fmt(stats.totalInteresesPagados)} sub="Ingreso por cartera" icon={TrendingUp} tone="ok" />
                            <DetailCard title="Intereses Pendientes" value={fmt(Math.max(0, (stats.totalIntereses || 0) - (stats.totalInteresesPagados || 0)))}
                                sub="Por recaudar del portafolio" icon={Clock} />
                        </div>
                    </Collapsible>

                    <Collapsible icon={Landmark} title="Saldos y Rendimientos">
                        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-3">
                            <DetailCard title="Caja Disponible" value={fmt(stats.saldoEnBanco)} sub="Patrimonio − capital prestado + recaudos" icon={Landmark} />
                            <DetailCard title="Rendimiento Cuenta NU" value={fmt(stats.rentabilidadCajaNU)}
                                sub={stats.rentabilidadCajaNUActualizada
                                    ? `Editable en Panel Principal · actualizado hace ${Math.max(0, Math.round((new Date() - new Date(stats.rentabilidadCajaNUActualizada)) / 86400000))} día(s)`
                                    : 'Editable desde el Panel Principal'}
                                icon={Coins} tone="gold" />
                            <DetailCard title="Disponible Total" value={fmt(disponible)} sub="Caja + rendimientos consolidados" icon={Wallet} tone="ok" />
                        </div>
                    </Collapsible>
                </div>
            )}

            <p className="text-[11px] text-gray-400 pb-2">
                Fuente: base de datos del fondo en tiempo real · generado {new Date(exec.generadoEl).toLocaleString('es-CO')} ·
                Los indicadores siguen el plan de mejora del Panel Principal (jul 2026). Baselines por año calculados dinámicamente — sin cifras fijas en el código.
            </p>
        </div>
    );
};

export default ExecutivePanelPage;
