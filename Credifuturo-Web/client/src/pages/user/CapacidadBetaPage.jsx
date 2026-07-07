import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';
import { calcVerdict, calcScore, colorMap } from '../../utils/loanCapacity';
import { useUi } from '../../context/UiContext';
import {
    Scale,
    Loader2,
    PiggyBank,
    CreditCard,
    Award,
    TrendingUp,
    Calculator,
    Sparkles,
    CalendarClock,
    CheckCircle,
    AlertTriangle,
    Lock,
    ChevronDown,
    ChevronRight,
    Target,
    Info,
    Vote
} from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtFecha = (d) => d ? `${d.getDate()} ${MESES_ABR[d.getMonth()]} ${d.getFullYear()}` : '—';

// Respaldo si el backend no envía tasas: las vigentes en los créditos activos del fondo.
// El valor oficial vive en AppSettings (tasasInteresVigentes) y llega en el análisis.
const TASAS_FALLBACK = [1.4, 1.6];

// ── Gauge semicircular del score (0-100) ─────────────────────────────
const ScoreGauge = ({ score, nivel, color }) => {
    const C = 219.9; // longitud del arco semicircular r=70
    const filled = Math.max(0, Math.min(100, score)) / 100 * C;
    const strokeColor = { green: '#059669', emerald: '#10b981', yellow: '#eab308', amber: '#f59e0b', red: '#dc2626' }[color] || '#059669';
    return (
        <div className="relative w-full max-w-[240px] mx-auto">
            <svg viewBox="0 0 180 100" className="w-full">
                <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="#f1f5f9" strokeWidth="14" strokeLinecap="round" />
                <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke={strokeColor} strokeWidth="14" strokeLinecap="round"
                    strokeDasharray={`${filled} ${C}`} style={{ transition: 'stroke-dasharray .8s ease' }} />
            </svg>
            <div className="absolute inset-x-0 bottom-0 text-center">
                <p className="text-4xl font-black leading-none" style={{ color: strokeColor }}>{score}</p>
                <p className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{ color: strokeColor }}>{nivel}</p>
            </div>
        </div>
    );
};

// ── Acciones del coach por componente del score ──────────────────────
const accionCoach = (comp, a) => {
    switch (comp.key) {
        case 'capacidad':
            return a.totalDeudaPendiente > 0
                ? 'Cada cuota que pagas libera cupo; también puedes subir tu ahorro para ampliar el techo 3×.'
                : 'Aumenta tu ahorro acumulado: cada peso ahorrado suma $3 a tu cupo máximo.';
        case 'cumplimiento':
            return a.enMoraActual
                ? 'Regulariza tus cuotas vencidas: al quedar al día recuperas este componente completo.'
                : 'Paga cada cuota en o antes de la fecha límite para conservar tu historial limpio.';
        case 'antiguedad':
            return `Este puntaje crece solo con el tiempo: +0,42 pts por mes hasta los 24 meses de permanencia.`;
        case 'lealtad':
            return 'Termina de pagar tu(s) crédito(s) a satisfacción: cada crédito saldado suma 2 pts (máximo 3 créditos).';
        case 'constancia':
            return `Ahorra todos los meses y acerca tu promedio (${fmt(a.promedioAhorroMensual || 0)}) al referente de ${fmt(a.referenteConstancia || 200000)} definido por el comité.`;
        case 'penalizaciones':
            return 'Consigna tu ahorro mensual antes de la fecha límite: los recargos por atraso restan puntos.';
        default:
            return '';
    }
};

const CapacidadBetaPage = () => {
    const { toast } = useUi();
    const [analysis, setAnalysis] = useState(null);
    const [scoreHistory, setScoreHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [montoRaw, setMontoRaw] = useState('');
    const [plazo, setPlazo] = useState(6);
    const [tasa, setTasa] = useState(TASAS_FALLBACK[0]);
    const [expandedVm, setExpandedVm] = useState(null);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [capRes, histRes] = await Promise.allSettled([
                    api.get('/admin/my/loan-capacity'),
                    api.get('/admin/my/score-history'),
                ]);
                if (capRes.status === 'fulfilled') {
                    setAnalysis(capRes.value.data);
                    if (Array.isArray(capRes.value.data?.tasasVigentes) && capRes.value.data.tasasVigentes.length > 0) {
                        setTasa(capRes.value.data.tasasVigentes[0]);
                    }
                } else {
                    toast.error('Error al cargar tu análisis de capacidad.');
                }
                if (histRes.status === 'fulfilled') {
                    setScoreHistory(histRes.value.data?.data || []);
                }
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [toast]);

    const hoy = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }, []);

    const v = useMemo(() => analysis ? calcVerdict(analysis, { audience: 'user' }) : null, [analysis]);

    // Tasas del comité (AppSettings vía backend); respaldo local si no llegan
    const tasas = useMemo(() => (
        Array.isArray(analysis?.tasasVigentes) && analysis.tasasVigentes.length > 0
            ? analysis.tasasVigentes
            : TASAS_FALLBACK
    ), [analysis]);

    // Evolución del score: cada snapshot guarda los INSUMOS y acá se recalcula
    // con calcScore (misma fórmula que el score actual — fuente única)
    const evolucion = useMemo(() => {
        const puntos = scoreHistory
            .map(h => {
                const s = calcScore(h.datos);
                return s ? { anio: h.anio, mes: h.mes, score: s.score, color: s.color } : null;
            })
            .filter(Boolean);
        return puntos;
    }, [scoreHistory]);

    // ── Simulación: sistema del fondo = abono fijo a capital + interés sobre saldo ──
    const sim = useMemo(() => {
        const monto = Number(String(montoRaw).replace(/\D/g, '')) || 0;
        if (!v || monto <= 0) return null;
        const n = plazo;
        const t = tasa / 100;
        const abono = monto / n;
        const primeraCuota = abono + monto * t;
        const ultimaCuota = abono + abono * t;
        const totalIntereses = monto * t * (n + 1) / 2;
        const fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + n, hoy.getDate());
        const nuevaDeuda = (analysis.totalDeudaPendiente || 0) + monto;
        const nuevoDisponible = v.montoMaxSinVotacion - nuevaDeuda;
        const nuevoApalancamiento = analysis.ahorroTotal > 0 ? (nuevaDeuda / analysis.ahorroTotal) * 100 : 0;
        const cruzaFinAnio = fechaFin > new Date(hoy.getFullYear(), 11, 31);
        const compromisoNoRetiro = n > 12 && cruzaFinAnio;

        let estado, titulo, detalle;
        if (analysis.enMoraActual) {
            estado = 'mora';
            titulo = 'No viable: tienes cuotas en mora';
            detalle = 'Ningún nuevo desembolso es posible con mora EP activa. Regulariza tus pagos primero.';
        } else if (monto > Math.max(0, v.capacidadDisponible)) {
            estado = 'votacion';
            titulo = 'Requiere votación del fondo';
            detalle = `El monto supera tu cupo disponible (${fmt(Math.max(0, v.capacidadDisponible))}). La asamblea debe aprobarlo caso a caso.`;
        } else {
            estado = 'ok';
            titulo = 'Dentro de tu cupo: aprobación directa';
            detalle = `El monto cabe en tu capacidad disponible (${fmt(v.capacidadDisponible)}) y no necesita votación.`;
        }
        return {
            monto, n, abono, primeraCuota, ultimaCuota, totalIntereses,
            totalPagar: monto + totalIntereses, fechaFin,
            nuevaDeuda, nuevoDisponible, nuevoApalancamiento,
            compromisoNoRetiro, estado, titulo, detalle,
        };
    }, [montoRaw, plazo, tasa, v, analysis, hoy]);

    // ── Coach: componentes con puntos por ganar, ordenados por potencial ──
    const coach = useMemo(() => {
        if (!v?.score) return [];
        return v.score.componentes
            .map(c => ({
                ...c,
                potencial: c.key === 'penalizaciones' ? Math.abs(Math.min(0, c.pts)) : Math.max(0, c.max - c.pts),
            }))
            .filter(c => c.potencial >= 0.5)
            .sort((a, b) => b.potencial - a.potencial);
    }, [v]);

    // ── Proyección de cupo a 3/6/12 meses ────────────────────────────
    const proyeccion = useMemo(() => {
        if (!analysis || !v) return null;
        const prom = Number(analysis.promedioAhorroMensual || 0);
        if (prom <= 0) return null;
        return [3, 6, 12].map(m => {
            const cupoFuturo = (analysis.ahorroTotal + m * prom) * 3 - analysis.totalDeudaPendiente;
            return { meses: m, cupo: Math.max(0, cupoFuturo), delta: cupoFuturo - v.capacidadDisponible };
        });
    }, [analysis, v]);

    const c = v ? (colorMap[v.color] || colorMap.green) : null;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-brand-primary/40" />
                <p className="text-sm text-gray-400 font-semibold animate-pulse uppercase tracking-widest">Analizando tu perfil...</p>
            </div>
        );
    }

    if (!analysis || !v) {
        return (
            <div className="text-center py-16 text-gray-400">
                <Scale className="h-12 w-12 mx-auto mb-3 opacity-25" />
                <p className="text-sm font-medium">No se pudo cargar el análisis de capacidad.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Encabezado */}
            <div>
                <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                    <Scale className="h-6 w-6 text-emerald-600" />
                    Mi Capacidad de Préstamo
                    <span className="text-[10px] font-black uppercase tracking-widest bg-lime-100 text-lime-700 px-2 py-0.5 rounded-full">Beta</span>
                </h1>
                <p className="text-gray-600 text-sm mt-1">
                    Simula tu próximo crédito y descubre cómo crecer tu cupo · regla 3× del fondo · datos al {fmtFecha(hoy)}
                </p>
            </div>

            {/* Score + KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center justify-center">
                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2">Score crediticio</p>
                    {v.score && <ScoreGauge score={v.score.score} nivel={v.score.nivel} color={v.score.color} />}
                    <p className="text-[11px] text-gray-400 mt-3 text-center">de 100 puntos · 6 componentes</p>
                    {evolucion.length > 0 && (
                        <div className="w-full mt-4 pt-3 border-t border-gray-50">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 text-center">Evolución mensual</p>
                            <div className="flex items-end justify-center gap-1.5 h-14">
                                {evolucion.map((p, i) => (
                                    <div key={`${p.anio}-${p.mes}`} className="flex flex-col items-center gap-1" title={`${MESES_ABR[p.mes - 1]} ${p.anio}: ${p.score} pts`}>
                                        <div
                                            className={`w-4 rounded-t transition-all ${i === evolucion.length - 1 ? 'bg-emerald-500' : 'bg-emerald-200'}`}
                                            style={{ height: `${Math.max(6, (p.score / 100) * 44)}px` }}
                                        />
                                        <span className="text-[8px] font-bold text-gray-400">{MESES_ABR[p.mes - 1]}</span>
                                    </div>
                                ))}
                            </div>
                            {evolucion.length < 3 && (
                                <p className="text-[10px] text-gray-300 text-center mt-1.5">El historial se construye mes a mes con la foto de las 8:10 PM</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-2 grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-1.5 mb-1"><PiggyBank className="h-3.5 w-3.5 text-emerald-600" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Ahorro acumulado</span></div>
                        <p className="text-lg font-black text-emerald-600 tabular-nums">{fmt(analysis.ahorroTotal)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Neto de recargos · base del cupo</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-1.5 mb-1"><CreditCard className={`h-3.5 w-3.5 ${analysis.enMoraActual ? 'text-red-600' : 'text-gray-500'}`} /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Deuda pendiente</span></div>
                        <p className={`text-lg font-black tabular-nums ${analysis.enMoraActual ? 'text-red-600' : analysis.totalDeudaPendiente > 0 ? 'text-orange-600' : 'text-gray-600'}`}>{fmt(analysis.totalDeudaPendiente)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{analysis.enMoraActual ? '⚠ Con mora vigente' : 'Capital por amortizar'}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-1.5 mb-1"><Award className="h-3.5 w-3.5 text-blue-600" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cupo máximo (3×)</span></div>
                        <p className="text-lg font-black text-blue-600 tabular-nums">{fmt(v.montoMaxSinVotacion)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">3 veces tu ahorro acreditado</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-1.5 mb-1"><TrendingUp className={`h-3.5 w-3.5 ${v.capacidadDisponible > 0 ? 'text-emerald-600' : 'text-red-500'}`} /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cupo disponible</span></div>
                        <p className={`text-lg font-black tabular-nums ${v.capacidadDisponible > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(Math.max(0, v.capacidadDisponible))}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{v.capacidadDisponible > 0 ? 'Sin necesidad de votación' : 'Cupo agotado · requiere asamblea'}</p>
                    </div>
                </div>
            </div>

            {/* Simulador */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-brand-primary to-emerald-700 px-5 py-4 flex items-center gap-3">
                    <div className="bg-white/20 rounded-xl p-2"><Calculator className="h-5 w-5 text-white" /></div>
                    <div>
                        <h2 className="text-white font-bold text-base">Simulador de crédito</h2>
                        <p className="text-emerald-200 text-xs">Sistema del fondo: abono fijo a capital + interés sobre saldo (la cuota baja cada mes)</p>
                    </div>
                </div>

                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Entradas */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-[11px] font-black uppercase tracking-widest text-gray-500">¿Cuánto necesitas?</label>
                            <div className="mt-1.5 relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={montoRaw ? Number(String(montoRaw).replace(/\D/g, '') || 0).toLocaleString('es-CO') : ''}
                                    onChange={e => setMontoRaw(e.target.value.replace(/\D/g, ''))}
                                    placeholder="0"
                                    className="w-full h-12 pl-8 pr-4 rounded-xl border-2 border-gray-200 focus:border-brand-primary focus:outline-none text-lg font-black text-gray-800 tabular-nums"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {[500000, 1000000, 2000000].map(m => (
                                    <button key={m} onClick={() => setMontoRaw(String(m))}
                                        className="px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">
                                        {fmt(m)}
                                    </button>
                                ))}
                                {v.capacidadDisponible > 0 && (
                                    <button onClick={() => setMontoRaw(String(Math.floor(v.capacidadDisponible)))}
                                        className="px-3 py-1.5 rounded-full bg-emerald-100 hover:bg-emerald-200 text-xs font-bold text-emerald-700 transition-colors">
                                        Todo mi cupo
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-baseline">
                                <label className="text-[11px] font-black uppercase tracking-widest text-gray-500">Plazo</label>
                                <span className="text-sm font-black text-brand-primary">{plazo} cuota(s) mensuales</span>
                            </div>
                            <input
                                type="range" min="1" max="24" value={plazo}
                                onChange={e => setPlazo(Number(e.target.value))}
                                className="w-full mt-2 accent-emerald-600"
                            />
                            <div className="flex justify-between text-[10px] text-gray-400"><span>1</span><span>12</span><span>24</span></div>
                        </div>

                        <div>
                            <label className="text-[11px] font-black uppercase tracking-widest text-gray-500">Tasa mensual</label>
                            <div className="flex gap-2 mt-1.5">
                                {tasas.map(t => (
                                    <button key={t} onClick={() => setTasa(t)}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all min-h-[44px] ${
                                            tasa === t ? 'bg-brand-primary text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                        }`}>
                                        {t.toFixed(1).replace('.', ',')}% mensual
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1.5">Tasas definidas por el comité. La tasa definitiva se fija al aprobar cada crédito.</p>
                        </div>
                    </div>

                    {/* Resultados */}
                    <div>
                        {!sim ? (
                            <div className="h-full flex flex-col items-center justify-center text-center py-10 text-gray-300">
                                <Calculator className="h-10 w-10 mb-3 opacity-40" />
                                <p className="text-sm font-medium text-gray-400">Ingresa un monto para ver tu simulación</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Primera cuota (la más alta)</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{fmt(sim.primeraCuota)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Última cuota</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{fmt(sim.ultimaCuota)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total intereses</p>
                                        <p className="text-base font-black text-amber-600 tabular-nums">{fmt(sim.totalIntereses)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total a pagar</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{fmt(sim.totalPagar)}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                    Última cuota estimada: <b className="text-gray-700">{fmtFecha(sim.fechaFin)}</b>
                                </div>

                                {/* Impacto en capacidad */}
                                <div className="border border-gray-100 rounded-xl p-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Impacto en tu capacidad</p>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-gray-500">Apalancamiento con este crédito</span>
                                        <span className={`font-black ${sim.nuevoApalancamiento > 200 ? 'text-red-600' : sim.nuevoApalancamiento > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                            {sim.nuevoApalancamiento.toFixed(0)}% <span className="font-normal text-gray-400">(límite 300%)</span>
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div className={`h-2 rounded-full transition-all duration-500 ${sim.nuevoApalancamiento > 200 ? 'bg-red-500' : sim.nuevoApalancamiento > 100 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                            style={{ width: `${Math.min(100, sim.nuevoApalancamiento / 3)}%` }} />
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1.5">
                                        Cupo restante después del desembolso: <b className={sim.nuevoDisponible >= 0 ? 'text-emerald-700' : 'text-red-600'}>{fmt(Math.max(0, sim.nuevoDisponible))}</b>
                                    </p>
                                </div>

                                {/* Veredicto de la simulación */}
                                <div className={`rounded-xl border-2 p-3 flex items-start gap-2.5 ${
                                    sim.estado === 'ok' ? 'bg-emerald-50 border-emerald-200' : sim.estado === 'votacion' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
                                }`}>
                                    {sim.estado === 'ok' && <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
                                    {sim.estado === 'votacion' && <Vote className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />}
                                    {sim.estado === 'mora' && <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
                                    <div>
                                        <p className={`text-xs font-black ${sim.estado === 'ok' ? 'text-emerald-800' : sim.estado === 'votacion' ? 'text-amber-800' : 'text-red-800'}`}>{sim.titulo}</p>
                                        <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">{sim.detalle}</p>
                                    </div>
                                </div>

                                {sim.compromisoNoRetiro && (
                                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
                                        <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                        <p className="text-[11px] text-amber-800 leading-snug">
                                            <b>Compromiso de no retiro (Primer Informe 2026):</b> con más de 12 cuotas y vencimiento después del 31 de diciembre, no podrás retirar tus ahorros mientras el crédito esté vigente.
                                        </p>
                                    </div>
                                )}

                                <p className="text-[10px] text-gray-400 italic">
                                    Simulación informativa — no constituye aprobación. Los valores definitivos los establece el comité al estudiar la solicitud.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Coach del score + Proyección */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        <h2 className="text-sm font-bold text-gray-800">Cómo subir tu score</h2>
                    </div>
                    {coach.length === 0 ? (
                        <p className="text-xs text-gray-500">¡Score perfecto! No hay puntos por recuperar — mantén tus hábitos.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {coach.map(comp => (
                                <div key={comp.key} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                                    <span className="shrink-0 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full px-2 py-0.5 mt-0.5 whitespace-nowrap">
                                        +{comp.potencial.toFixed(comp.potencial % 1 === 0 ? 0 : 1)} pts
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-700">{comp.label} <span className="font-normal text-gray-400">({comp.pts} / {comp.max || '−'})</span></p>
                                        <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{accionCoach(comp, analysis)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <Target className="h-4 w-4 text-brand-primary" />
                        <h2 className="text-sm font-bold text-gray-800">Proyección de tu cupo</h2>
                    </div>
                    {!proyeccion ? (
                        <p className="text-xs text-gray-500">Aún no hay historial de ahorro mensual suficiente para proyectar tu cupo.</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-3 gap-2">
                                {proyeccion.map(p => (
                                    <div key={p.meses} className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-xl p-3 text-center">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">En {p.meses} meses</p>
                                        <p className="text-sm font-black text-gray-800 tabular-nums mt-1">{fmt(p.cupo)}</p>
                                        <p className="text-[10px] text-emerald-600 font-bold mt-0.5">+{fmt(Math.max(0, p.delta))}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-3 leading-snug">
                                Si mantienes tu ahorro promedio de <b>{fmt(analysis.promedioAhorroMensual)}/mes</b>, cada peso ahorrado suma $3 de cupo.
                                Cálculo conservador: asume tu deuda actual sin cambios — como tus cuotas la van bajando, el cupo real será igual o mayor.
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* Préstamos vigentes con cronograma expandible */}
            {analysis.prestamosVigentes?.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <h2 className="text-sm font-bold text-gray-800">Mis créditos vigentes</h2>
                        <p className="text-[11px] text-gray-400">Toca un crédito para ver el cronograma de sus cuotas pendientes</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {analysis.prestamosVigentes.map(loan => {
                            const abierto = expandedVm === loan.idVm;
                            const cuotasOrdenadas = [...(loan.cuotasDetalle || [])].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
                            return (
                                <div key={loan.idVm}>
                                    <button
                                        onClick={() => setExpandedVm(abierto ? null : loan.idVm)}
                                        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left min-h-[44px]"
                                    >
                                        {abierto ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-gray-800">{loan.idVm}
                                                {loan.enMoraEP && <span className="ml-2 text-[10px] font-black uppercase bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Mora ×{loan.cuotasMoraEPCount}</span>}
                                            </p>
                                            <p className="text-[11px] text-gray-400">
                                                {loan.cuotasPendientesCount + loan.cuotasMoraEPCount} cuota(s) pendiente(s){loan.cuotas ? ` de ${loan.cuotas}` : ''}
                                                {loan.interesMensual > 0 ? ` · ${loan.interesMensual.toFixed(2).replace('.', ',')}% mensual` : ''}
                                                {loan.fechaUltimaCuota ? ` · termina ${loan.fechaUltimaCuota}` : ''}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-black text-gray-800 tabular-nums">{fmt(loan.saldoPendiente)}</p>
                                            <p className="text-[10px] text-gray-400">saldo pendiente</p>
                                        </div>
                                    </button>
                                    {abierto && (
                                        <div className="px-5 pb-4 bg-gray-50/60">
                                            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                                                {cuotasOrdenadas.map((q, i) => (
                                                    <div key={i} className={`flex items-center gap-3 px-4 py-2 text-xs ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${q.esMora ? 'bg-red-500' : 'bg-amber-400'}`} />
                                                        <span className="text-gray-600 capitalize">{q.mes || '—'}</span>
                                                        <span className="text-gray-400">{q.fecha ? String(q.fecha).split('T')[0] : ''}</span>
                                                        <span className={`ml-auto font-bold tabular-nums ${q.esMora ? 'text-red-600' : 'text-gray-700'}`}>{fmt(q.valor)}</span>
                                                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${q.esMora ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                                                            {q.esMora ? 'Vencida' : 'Por vencer'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Definiciones */}
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
                <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                    <b className="text-gray-600">Definiciones:</b> el <b>cupo máximo</b> es 3× tu ahorro acreditado (regla del fondo); el <b>cupo disponible</b> descuenta tu deuda vigente.
                    La simulación usa el sistema real del fondo: abono fijo a capital más interés sobre el saldo, por eso la primera cuota es la más alta y baja cada mes.
                    Versión beta en evaluación — el análisis completo actual sigue en <Link to="/dashboard/loan-capacity" className="text-brand-primary font-semibold underline">Analizador de Capacidad</Link>,
                    y tu extracto en <Link to="/dashboard/account-statement" className="text-brand-primary font-semibold underline">Detalle de Cuenta (beta)</Link>.
                </p>
            </div>
        </div>
    );
};

export default CapacidadBetaPage;
