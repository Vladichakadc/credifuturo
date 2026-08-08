import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, Cell, PieChart, Pie, LabelList,
    AreaChart, Area
} from 'recharts';
import {
    Gauge, ShieldCheck, AlertTriangle, TrendingUp, Wallet, PiggyBank,
    CalendarClock, Users, Printer, CheckCircle2, Info, Landmark,
    ChevronDown, DollarSign, Database, Clock, Activity, BarChart3, Coins,
    ChevronRight, Bell, KeyRound, ClipboardList, Sparkles, UserX, RefreshCw
} from 'lucide-react';
import ChartExpandModal, { analyzeIncomeDistribution } from '../../components/ChartExpandModal';
import { computeFundProjection } from '../../utils/fundProjection';
import YearComparisonChart from '../../components/admin/YearComparisonChart';
import YearProgressCard from '../../components/admin/YearProgressCard';
import { computeFondoIndicadores, fmtVariacion } from '../../utils/fondoIndicadores';
import { JUNTA_CEDULAS_NO_ADMIN } from '../../utils/juntaAccess';
import GlosarioFondo, { TerminoAyuda } from '../../components/admin/GlosarioFondo';
import MiPosicionFondo from '../../components/admin/MiPosicionFondo';

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

const SectionTitle = ({ icon: Icon, children }) => (
    <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-brand-primary" />
        {children}
    </h2>
);

// Tarjeta compacta del detalle operativo, con los mismos colores e interacciones
// (hover, click-through a la lista filtrada) que las StatCard del Panel Principal
const DetailCard = ({ title, value, sub, icon: Icon, tone = 'neutral', customBg, onClick }) => {
    const tones = {
        neutral: 'text-gray-900',
        ok: 'text-brand-primary',
        gold: 'text-amber-600',
        risk: 'text-red-600',
        info: 'text-blue-600',
    };
    const iconTones = {
        neutral: 'text-gray-400',
        ok: 'text-brand-primary',
        gold: 'text-amber-500',
        risk: 'text-red-500',
        info: 'text-blue-500',
    };
    return (
        <div
            onClick={onClick}
            className={`bg-white rounded-xl border border-gray-200 shadow-card p-3.5 transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-brand-primary/20 active:scale-[0.98]' : ''}`}
            style={customBg ? { background: customBg, border: 'none' } : {}}
        >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                {Icon && <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${iconTones[tone]}`} />}
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
const Collapsible = ({ icon: Icon, title, sub, children, defaultOpen = true, id }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div id={id} className="bg-gray-50/60 rounded-2xl border border-gray-200 scroll-mt-20">
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
    const navigate = useNavigate();
    // Misma página montada en dos rutas: /admin/executive (admin) y
    // /dashboard/panel-ejecutivo (socio, solo lectura) — idéntico patrón a
    // DashboardHome.jsx en /admin y /dashboard/fondo. isAdmin gatea acciones y
    // datos que no le corresponde ver a un socio (colas administrativas,
    // nombres/montos de otros socios deudores, navegación a rutas /admin/*).
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();
    const isAdmin = user.role === 'admin';
    // La Junta Administrativa NO se define por rol: la componen el gerente
    // (role='admin') MÁS dos socios sin rol admin (JUNTA_CEDULAS_NO_ADMIN, espejo
    // de JUNTA_CEDULAS en server/routes/admin.js). Antes esta página gateaba todo
    // con `isAdmin`, así que esos dos miembros —que votan las solicitudes de
    // préstamo y ejercen control sobre el fondo— recibían la vista de socio raso y
    // no veían la cola que les toca decidir. El backend sí los reconoce
    // (JUNTA_ROUTES permite GET /loan-requests), era solo el frontend el que no
    // se los mostraba.
    const esJunta = isAdmin || JUNTA_CEDULAS_NO_ADMIN.includes(user.cedula);
    const [exec, setExec] = useState(null);
    const [stats, setStats] = useState(null);
    const [evolution, setEvolution] = useState(null);
    const [pending, setPending] = useState({ loanRequests: 0, passwordResets: 0, orphanLoans: 0 });
    const [yearCmp, setYearCmp] = useState(null);
    const [yearCmpError, setYearCmpError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandIngresos, setExpandIngresos] = useState(false);

    // Mismo click-through que las StatCard del Panel Principal: navega a la lista
    // filtrada correspondiente en vez de quedarse solo como dato de consulta.
    // Todos los destinos son rutas /admin/* — un socio no tiene acceso a ellas.
    const goTo = (path, params = {}) => {
        const queryParams = new URLSearchParams(params);
        const qs = queryParams.toString();
        navigate(qs ? `${path}?${qs}` : path);
    };

    // Devuelve el handler solo si es admin; si no, undefined — el mismo `undefined`
    // que ya usa DetailCard para desactivar el cursor-pointer y el hover,
    // así un socio ve la tarjeta puramente informativa, sin una promesa de clic rota.
    const goToAdmin = (path, params = {}) => isAdmin ? () => goTo(path, params) : undefined;


    // El badge "En vivo" prometía tiempo real sobre un fetch único al montar. Ahora
    // hay refresco real: automático cada 2 minutos y manual con el botón. `ultimaCarga`
    // es lo que sostiene la promesa — se muestra la hora del dato, no un pulso decorativo.
    const [ultimaCarga, setUltimaCarga] = useState(null);
    const [refrescando, setRefrescando] = useState(false);
    // Un refresco puede fallar sin que eso invalide lo que ya está en pantalla.
    // Se avisa con un badge discreto, no vaciando el panel (ver más abajo).
    const [falloRefresco, setFalloRefresco] = useState(false);
    // Ref, no estado: fetchAll necesita saber si YA hay datos buenos pintados, y
    // meter `exec` en las deps del useCallback reiniciaría el intervalo en cada
    // carga.
    const execRef = useRef(null);

    const fetchAll = useCallback(async ({ esRefresco = false } = {}) => {
        if (esRefresco) setRefrescando(true);
        const results = await Promise.allSettled([
            api.get('/admin/executive-stats'),
            api.get('/admin/dashboard-stats'),
            api.get('/admin/savings-evolution'),
            // Las colas administrativas (solicitudes de préstamo / reset de contraseña)
            // son exclusivas del admin y de la Junta — un socio normal recibiría 403,
            // así que ni se piden si quien mira esta página no es admin.
            // Solicitudes de préstamo: las vota la JUNTA completa, no solo el
            // gerente — por eso va con `esJunta` y no con `isAdmin`. El backend
            // ya lo permite (JUNTA_ROUTES). Reset de contraseñas sí es
            // exclusivo del admin: es una acción operativa, no de control.
            esJunta ? api.get('/admin/loan-requests') : Promise.resolve({ status: 'skipped' }),
            isAdmin ? api.get('/admin/password-reset-requests') : Promise.resolve({ status: 'skipped' }),
            // Préstamos desembolsados sin clientId — solo pasa por scripts de migración
            // manuales (la importación Excel está deshabilitada y "Nuevo Desembolso"
            // siempre exige socio). Es un caso raro, así que en vez de ser una página
            // aparte que nadie recuerda revisar, se vuelve visible aquí solo cuando
            // realmente hay algo que resolver.
            isAdmin ? api.get('/admin/disbursed-loans/orphans') : Promise.resolve({ status: 'skipped' }),
            // Serie mensual por año: alimenta el comparador interanual, el mismo
            // que usa el Panel Principal, para que ambos paneles cuenten lo mismo.
            api.get('/admin/year-comparison'),
        ]);
        // Un fallo del refresco NO puede borrar un panel ya pintado.
        //
        // Antes, cualquier tropiezo de /executive-stats hacía setError(...), y la
        // guarda de render `if (error || !exec || !derived)` sustituía TODA la
        // página por "Sin datos disponibles" — incluido el encabezado, donde vive
        // el botón de reintentar, así que el usuario quedaba sin salida hasta el
        // siguiente tick (2 min) o una recarga manual. En Railway (servicio único)
        // esto se disparaba en CADA redespliegue para todo el que tuviera el panel
        // abierto. El fetch al montar sí debe poder mostrar el error: ahí no hay
        // nada que preservar.
        const okExec = results[0].status === 'fulfilled';
        if (okExec) {
            execRef.current = results[0].value.data;
            setExec(results[0].value.data);
            setError(null);
            setFalloRefresco(false);
        } else if (!execRef.current) {
            setError('No se pudieron cargar los indicadores ejecutivos.');
        } else {
            setFalloRefresco(true);
        }
        if (results[1].status === 'fulfilled') setStats(results[1].value.data);
        if (results[2].status === 'fulfilled') setEvolution(results[2].value.data);
        // Igual que arriba: si las colas fallan, se conserva el conteo anterior en
        // vez de anunciar "0 pendientes", que sería una afirmación falsa.
        setPending(prev => ({
            loanRequests: results[3].status === 'fulfilled' ? (results[3].value.data?.total || 0) : prev.loanRequests,
            passwordResets: results[4].status === 'fulfilled' ? (results[4].value.data?.total || 0) : prev.passwordResets,
            orphanLoans: results[5].status === 'fulfilled' ? (results[5].value.data?.total || 0) : prev.orphanLoans,
        }));
        if (results[6]?.status === 'fulfilled') { setYearCmp(results[6].value.data); setYearCmpError(false); }
        else setYearCmpError(true);
        // La hora solo avanza si el dato de verdad se renovó: si no, el badge
        // estaría fechando datos viejos como si fueran recién traídos.
        if (okExec) setUltimaCarga(new Date());
        setLoading(false);
        setRefrescando(false);
    }, [esJunta, isAdmin]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Refresco automático. 2 minutos: suficiente para que el dato no envejezca sin
    // convertir un panel de consulta en un poller agresivo contra la BD.
    useEffect(() => {
        const id = setInterval(() => fetchAll({ esRefresco: true }), 120000);
        return () => clearInterval(id);
    }, [fetchAll]);

    const anioActual = new Date().getFullYear();

    // ── Derivados ─────────────────────────────────────────────────────
    const derived = useMemo(() => {
        if (!exec) return null;

        const cartera = exec.cartera || {};
        // exec.concentracion (nombre/cédula/saldo por deudor) solo llega si el backend
        // determinó que quien pide es admin — para un socio viene undefined y el top3/
        // top3Pct ya calculado server-side (exec.top3/exec.top3Pct) es la única fuente.
        const conc = exec.concentracion || [];
        const top3 = exec.top3 ?? conc.slice(0, 3).reduce((s, d) => s + (d.saldo || 0), 0);
        const top3Pct = exec.top3Pct ?? (cartera.total > 0 ? (top3 / cartera.total) * 100 : 0);

        // Dona: top 5 + resto
        const top5 = conc.slice(0, 5);
        const resto = conc.slice(5).reduce((s, d) => s + (d.saldo || 0), 0);
        const donutData = [
            ...top5.map(d => ({ name: d.nombre, value: d.saldo, cedula: d.cedula })),
            ...(resto > 0 ? [{ name: 'Resto de socios', value: resto, cedula: null }] : []),
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
        // Optimista). Extraído a utils/fundProjection.js para que DashboardHome.jsx
        // use exactamente el mismo cálculo (dos paneles con cifras distintas para
        // "cuánto ganará el fondo" rompería la confianza de los socios).
        const proyeccion = computeFundProjection({ exec, stats, anioActual });

        return {
            top3, top3Pct, donutData, proyeccion,
            ahorroActual, ahorroPrevio, colocActual, colocPrevio,
            intCobradosAnio, intAgendadosAnio, intAnioPrevio,
            penPct, alertas, seriesCharts,
        };
    }, [exec, stats, anioActual]);

    // ── Indicadores comparativos del fondo ────────────────────────────────────
    // Misma fuente que el Panel Principal (utils/fondoIndicadores.js). Se calcula
    // aquí, no se replica: dos paneles con cifras distintas del mismo año destruyen
    // la confianza más rápido de lo que la construye cualquier gráfico.
    const ind = useMemo(
        () => computeFondoIndicadores({ stats, execStats: exec, yearCmp }),
        [stats, exec, yearCmp]
    );

    // ── Evolución patrimonial: acumulado mensual real de ahorro (mesAbonado/anioAbonado),
    // fondo completo (sin clientId). Deliberadamente excluye Aporte Inicial — igual que el
    // resto del panel — para no mezclar flujo recurrente con capitalización puntual.
    const evolucionSerie = useMemo(() => {
        const rows = evolution?.serieMensual || [];
        let acumulado = 0;
        return rows.map(r => {
            acumulado += Number(r.neto || 0);
            return { label: mesLabel(`${r.anio}-${String(r.mes).padStart(2, '0')}`), acumulado };
        });
    }, [evolution]);

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

    const { cartera, flujo30dias, penetracion, vencimientos } = exec;
    const disponible = (stats?.saldoEnBanco || 0) + (stats?.rentabilidadCajaNU || 0);
    // Sigue en uso pese a retirarse la tarjeta hero: es el denominador del
    // retorno sobre capital en "Rentabilidad del Fondo".
    const patrimonio = stats?.totalAhorradoGeneral || 0;
    // Delta interanual con signo, flecha y color DERIVADOS del dato. Antes cada
    // sitio hardcodeaba '+' y text-emerald-600, así que una caída se anunciaba en
    // verde con signo positivo ('+-20% vs 2025'). En un panel cuya promesa es
    // "transparencia total", ese era el defecto más grave.
    // `base` declara CONTRA QUÉ se compara, porque no todas las tarjetas comparan
    // lo mismo: las de acumulado parcial (ahorro, colocación) van contra el ritmo
    // del año anterior, mientras que Intereses ya suma cobrados + agendados —un
    // año completo— y sí se puede medir contra el año anterior completo. Rotularlas
    // igual sería mentir en una de las dos.
    const Delta = ({ pct, anio, base = 'ritmo' }) => {
        if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
        const sube = pct >= 0;
        return (
            <span className={`font-bold ${sube ? 'text-emerald-600' : 'text-red-600'}`}>
                {' · '}{sube ? '▲' : '▼'} {fmtVariacion(pct)} vs {base === 'ritmo' ? 'ritmo ' : ''}{anio}
            </span>
        );
    };

    // Comparación interanual del hero y de las tarjetas de Actividad.
    //
    // Aquí vivía el MISMO error de medición que ya costó tres correcciones en
    // producción: dividir el acumulado PARCIAL del año en curso entre el total
    // COMPLETO de 12 meses del año anterior. Con el fondo ahorrando igual que el
    // año pasado, en agosto marcaba -25,6%. Mientras estuvo hardcodeado en '▲ +'
    // se veía roto ('+-25,6%') y nadie lo creía; al derivar flecha y color del
    // signo pasó a ser una alarma ROJA creíble... 30 cm por encima de la tarjeta
    // "Ahorro de los Socios", que compara contra el RITMO y decía +21,7% en verde.
    // El mismo indicador, dos veredictos opuestos, en una pantalla cuyo encabezado
    // promete "transparencia total".
    //
    // Se comparan ahora contra el ritmo del año anterior y desde `ind`, que es la
    // fuente única compartida con las YearProgressCard: así las dos cifras no
    // pueden divergir aunque alguien toque una sola de las dos.
    const vsRitmo = (actual, totalPrev) => {
        if (!ind || ind.comparacionPrematura) return null;
        const base = ind.ritmoPrev(totalPrev);
        if (!(base > 0)) return null;
        return ((Number(actual) || 0) / base - 1) * 100;
    };
    const crecimientoAhorro = vsRitmo(ind?.ahorroActualTotal, ind?.ahorroPrevTotal);
    const crecimientoColocacion = vsRitmo(ind?.colocacionActualYtd, ind?.baselinePrestamos);

    // Compartido entre la tarjeta "¿Cuánto está ganando el fondo?" y su modal de
    // análisis experto (ChartExpandModal), para no duplicar la lógica de filtrado.
    const ingresosFondoData = [
        { name: 'Intereses de préstamos', value: Number(stats?.totalInteresesPagados || 0), color: '#166534' },
        { name: 'Rendimientos NU', value: Number(stats?.rentabilidadCajaNU || 0), color: '#84cc16' },
        { name: 'Recargos por mora', value: Number(stats?.totalPenaltyValue || 0), color: '#f59e0b' },
    ].filter(d => d.value > 0);

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
                        {isAdmin && (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Beta</span>
                        )}
                        {/* Antes decía "En vivo" con un pulso animado sobre un fetch
                            único al montar: prometía tiempo real y mostraba datos de
                            hace horas. Ahora el dato se refresca de verdad y el badge
                            dice a qué hora, que es lo que hace verificable la promesa. */}
                        {ultimaCarga && (
                            <button
                                onClick={() => fetchAll({ esRefresco: true })}
                                disabled={refrescando}
                                title={falloRefresco
                                    ? 'El último intento de actualizar falló. Los datos que ves son los de la hora indicada.'
                                    : 'Actualizar ahora'}
                                className={`print:hidden text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                                    falloRefresco
                                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                            >
                                <RefreshCw className={`h-3 w-3 ${refrescando ? 'animate-spin' : ''}`} />
                                {refrescando
                                    ? 'Actualizando…'
                                    : `${falloRefresco ? 'Sin conexión · datos' : 'Datos'} de las ${ultimaCarga.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
                            </button>
                        )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {isAdmin
                            ? 'Indicadores de riesgo, flujo y rendimiento del fondo · misma información que ven los socios'
                            : 'Transparencia total: así está la salud financiera de nuestro fondo, con datos reales y actualizados'}
                    </p>
                    {/* Varios indicadores usan vocabulario financiero. El glosario evita
                        que el socio tenga que adivinar si un 3% es bueno o malo. */}
                    <div className="mt-1"><GlosarioFondo /></div>
                </div>
                <button
                    onClick={() => window.print()}
                    className="print:hidden inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-dark text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
                >
                    <Printer className="h-4 w-4" /> {isAdmin ? 'Informe ejecutivo' : 'Descargar / imprimir'}
                </button>
            </div>

            {/* ── Veredicto del fondo ──────────────────────────────────────────
                 Traído del Panel Principal. Es la única pieza que responde en UNA
                 frase la pregunta con la que llega el socio: "¿está bien mi fondo?".
                 Convierte cinco indicadores técnicos (ahorro, mora, liquidez,
                 patrimonio, cumplimiento de meta) en un semáforo con explicación en
                 lenguaje llano, antes de pedirle que interprete un solo número. ── */}
            {ind && (() => {
                const v = ind.veredicto;
                const estilo = v.nivel === 'sano'
                    ? { fondo: 'from-emerald-600 to-emerald-800', icono: '✓' }
                    : v.nivel === 'revisar'
                        ? { fondo: 'from-amber-500 to-amber-700', icono: '▲' }
                        : { fondo: 'from-red-600 to-red-800', icono: '⚠' };
                return (
                    <div className={`bg-gradient-to-r ${estilo.fondo} rounded-2xl px-5 py-4 flex items-center justify-between gap-4 shadow-card`}>
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="bg-white/15 rounded-full w-11 h-11 flex items-center justify-center flex-shrink-0">
                                <span className="text-xl font-black text-white">{estilo.icono}</span>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg font-black text-white leading-tight">{v.titulo}</h2>
                                <p className="text-sm text-white/80 font-medium mt-0.5">{v.detalle}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="hidden sm:inline text-[10px] font-black px-3 py-1 rounded-full bg-white/20 text-white">{v.etiqueta}</span>
                            <div className="text-right">
                                <p className="text-[10px] text-white/60 font-bold uppercase tracking-wide">Señales en verde</p>
                                <p className="text-sm font-black text-white">{ind.puntaje} de 5</p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Mi posición en el fondo ──────────────────────────────────────
                 Todo lo demás en esta página es agregado: responde "¿cómo está el
                 fondo?" pero no "¿y yo qué?". El socio llega con tres preguntas
                 concretas —cuánto tengo, cuánto me tocaría, cuánto puedo pedir— y
                 sin ellas las cifras del fondo se leen como un informe ajeno. Va
                 arriba, justo después del veredicto, porque es lo que engancha al
                 socio con el resto del panel. Al gerente no se le muestra: consulta
                 su posición personal desde su propia cuenta, no desde aquí. ── */}
            {!isAdmin && (
                <div>
                    <SectionTitle icon={Sparkles}>Mi posición en el fondo</SectionTitle>
                    <MiPosicionFondo nombre={user.name} />
                </div>
            )}

            {/* La fila de cinco KPI verdes que iba aquí se retiró por decisión del
                comité: repetía cifras que el "Detalle completo del fondo" ya muestra
                más abajo —Patrimonio de Socios, Disponible Total y la cartera— y
                empujaba hacia abajo lo que de verdad importa (el veredicto y la
                posición personal del socio). Recaudo del año y Apalancamiento se
                retiran con ella; no estaban repetidos, pero se consideraron
                indicadores operativos, no información de lectura para el socio. */}

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

            {/* ── Detalle operativo/completo del fondo (siempre desplegado) ── */}
            {stats && (
                <div className="space-y-3">
                    <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-brand-primary" />
                        {isAdmin ? 'Detalle operativo' : 'Detalle completo del fondo'}
                        <span className="text-[11px] font-semibold text-gray-400">
                            {isAdmin ? 'para consulta bajo demanda' : 'el mismo detalle que consulta la administración, para tu tranquilidad'}
                        </span>
                    </h2>

                    <Collapsible defaultOpen icon={PiggyBank} title="Socios y Ahorros" sub={`${stats.activeClientsCount || 0} socios activos`}>
                        <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            <DetailCard title="Socios del Fondo" value={stats.clientsCount || 0}
                                sub={`${stats.activeClientsCount || 0} activos · ${stats.inactiveClientsCount || 0} inactivos`} icon={Users} tone="info"
                                onClick={goToAdmin('/admin/clients/list')} />
                            <DetailCard title="Ahorros Mensuales" value={fmt(stats.totalSavings)} sub="Abonos acumulados · activos" icon={PiggyBank} tone="ok"
                                onClick={goToAdmin('/admin/savings/list')} />
                            <DetailCard title="Base Patrimonial" value={fmt(stats.totalInitialContributions)} sub="Aportes iniciales" icon={Database} tone="gold"
                                onClick={goToAdmin('/admin/contributions/initial-list')} />
                            <DetailCard title="Patrimonio de Socios" value={fmt(stats.totalAhorradoGeneral)} sub="Ahorros + aportes" icon={Landmark} tone="ok"
                                onClick={goToAdmin('/admin/savings/list')} />
                            <DetailCard title="Días en Retraso" value={stats.totalPenaltyDays || 0} sub="Mora en ahorros · año en curso"
                                icon={Clock} tone={(stats.totalPenaltyDays || 0) > 0 ? 'risk' : 'neutral'}
                                onClick={goToAdmin('/admin/savings/list', { penalty: 'SI' })} />
                            <DetailCard title="Recargos por Mora" value={fmt(stats.totalPenaltyValue)} sub="Cobrados en el año" icon={DollarSign} tone="gold"
                                customBg="linear-gradient(135deg, #FEFDE8 0%, #FEF9C3 100%)"
                                onClick={goToAdmin('/admin/savings/list', { penalty: 'SI' })} />
                        </div>
                    </Collapsible>

                    <Collapsible defaultOpen icon={Activity} title="Préstamos e Intereses" sub={`${stats.totalPrestamosCount || 0} créditos entregados`}>
                        <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
                            <DetailCard title="Capital Desembolsado" value={fmt(stats.totalPrestamos)}
                                sub={`${stats.totalPrestamosCount || 0} préstamos entregados`} icon={DollarSign} tone="ok"
                                onClick={goToAdmin('/admin/disbursed-loans/list')} />
                            <DetailCard title="Cartera al Día" value={fmt(stats.carteraDia)}
                                sub={`${stats.carteraDiaCount || 0} cuotas vigentes`} icon={TrendingUp} tone="ok"
                                onClick={goToAdmin('/admin/payments/list', { estadoPrestamo: 'Vigente' })} />
                            <DetailCard title="Cuotas Recaudadas" value={fmt(stats.totalCuotasPagadas)}
                                sub={`${stats.recaudoCuotasCount || 0} pagos completados`} icon={CheckCircle2} tone="info"
                                onClick={goToAdmin('/admin/payments/list')} />
                            <DetailCard title="Mora de Cartera" value={fmt(stats.moraCarteraEP)} sub="Vencimiento superado"
                                icon={AlertTriangle} tone={(stats.moraCarteraEP || 0) > 0 ? 'risk' : 'neutral'}
                                customBg={(stats.moraCarteraEP || 0) > 0 ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' : undefined}
                                onClick={goToAdmin('/admin/payments/list', { estado: 'Mora' })} />
                            <DetailCard title="Cartera Total" value={fmt(stats.totalPrestamosMasIntereses)} sub="Capital + intereses del portafolio" icon={Activity} />
                            <DetailCard title="Intereses Proyectados" value={fmt(stats.totalIntereses)} sub="Todo el portafolio (incluye años futuros)" icon={BarChart3}
                                onClick={goToAdmin('/admin/payments/list')} />
                            <DetailCard title="Intereses Cobrados" value={fmt(stats.totalInteresesPagados)} sub="Ingreso por cartera" icon={TrendingUp} tone="ok"
                                onClick={goToAdmin('/admin/payments/list', { estado: 'Pago' })} />
                            <DetailCard title="Intereses Pendientes" value={fmt(Math.max(0, (stats.totalIntereses || 0) - (stats.totalInteresesPagados || 0)))}
                                sub="Por recaudar del portafolio" icon={Clock}
                                customBg="linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)"
                                onClick={goToAdmin('/admin/payments/list', { estado: 'Pendiente' })} />
                        </div>
                    </Collapsible>

                    <Collapsible defaultOpen icon={Activity} title="Actividad y Crecimiento" sub="penetración de crédito, intereses, préstamos y ahorro del año">
                        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                            <div
                                onClick={goToAdmin('/admin/disbursed-loans/list')}
                                className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 relative cursor-pointer transition-all duration-200 hover:shadow-md hover:border-brand-primary/20 hover:-translate-y-0.5 active:scale-[0.98] group"
                            >
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5" /> Penetración de crédito <TerminoAyuda termino="penetracion" />
                                </p>
                                <p className="text-xl font-extrabold text-gray-900 mt-1.5 tabular-nums">{derived.penPct.toFixed(0)}%</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    {penetracion.conCredito} de {penetracion.activos} socios con crédito · {penetracion.activos - penetracion.conCredito} sin crédito vigente
                                </p>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-200 group-hover:text-brand-primary/50 absolute bottom-3 right-3 transition-colors" />
                            </div>
                            <div
                                onClick={goToAdmin('/admin/payments/list', { estado: 'Pago' })}
                                className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 relative cursor-pointer transition-all duration-200 hover:shadow-md hover:border-brand-primary/20 hover:-translate-y-0.5 active:scale-[0.98] group"
                            >
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                    <TrendingUp className="h-3.5 w-3.5" /> Intereses {anioActual}
                                </p>
                                <p className="text-xl font-extrabold text-brand-primary mt-1.5 tabular-nums">
                                    {fmt(derived.intCobradosAnio + derived.intAgendadosAnio)}
                                </p>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    {fmt(derived.intCobradosAnio)} cobrados + {fmt(derived.intAgendadosAnio)} agendados
                                    {derived.intAnioPrevio > 0 && (
                                        <Delta pct={((derived.intCobradosAnio + derived.intAgendadosAnio) / derived.intAnioPrevio - 1) * 100} anio={anioActual - 1} base="total" />
                                    )}
                                </p>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-200 group-hover:text-brand-primary/50 absolute bottom-3 right-3 transition-colors" />
                            </div>
                            <div
                                onClick={goToAdmin('/admin/disbursed-loans/list')}
                                className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 relative cursor-pointer transition-all duration-200 hover:shadow-md hover:border-brand-primary/20 hover:-translate-y-0.5 active:scale-[0.98] group"
                            >
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                    <Wallet className="h-3.5 w-3.5" /> Préstamos {anioActual}
                                </p>
                                <p className="text-xl font-extrabold text-gray-900 mt-1.5 tabular-nums">
                                    {fmt(derived.colocActual?.total || 0)}
                                </p>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    {derived.colocActual?.creditos || 0} créditos
                                    {crecimientoColocacion != null && (
                                        <Delta pct={crecimientoColocacion} anio={anioActual - 1} />
                                    )}
                                </p>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-200 group-hover:text-brand-primary/50 absolute bottom-3 right-3 transition-colors" />
                            </div>
                            <div
                                onClick={goToAdmin('/admin/savings/list')}
                                className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 relative cursor-pointer transition-all duration-200 hover:shadow-md hover:border-brand-primary/20 hover:-translate-y-0.5 active:scale-[0.98] group"
                            >
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                    <PiggyBank className="h-3.5 w-3.5" /> Ahorro {anioActual}
                                </p>
                                <p className="text-xl font-extrabold text-gray-900 mt-1.5 tabular-nums">{fmt(derived.ahorroActual)}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    Mes acreditado
                                    {crecimientoAhorro != null && (
                                        <Delta pct={crecimientoAhorro} anio={anioActual - 1} />
                                    )}
                                </p>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-200 group-hover:text-brand-primary/50 absolute bottom-3 right-3 transition-colors" />
                            </div>
                        </div>
                    </Collapsible>

                    <Collapsible defaultOpen icon={Landmark} title="Saldos y Rendimientos" id="saldos-rendimientos">
                        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-3">
                            {/* NO es un saldo bancario conciliado sino una cifra
                                contable derivada. El rótulo lo dice para que nadie
                                la lea como "esto es lo que hay en el banco". */}
                            <DetailCard title="Disponible estimado (calculado)" value={fmt(stats.saldoEnBanco)} sub="Cifra contable: patrimonio − capital prestado + recaudos · no es un saldo bancario conciliado" icon={Landmark}
                                customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)" />
                            <DetailCard title="Rendimiento Cuenta NU" value={fmt(stats.rentabilidadCajaNU)}
                                sub={
                                    isAdmin
                                        ? (stats.rentabilidadCajaNUActualizada
                                            ? `Editable en Panel Principal · actualizado hace ${Math.max(0, Math.round((new Date() - new Date(stats.rentabilidadCajaNUActualizada)) / 86400000))} día(s)`
                                            : 'Editable desde el Panel Principal')
                                        : (stats.rentabilidadCajaNUActualizada
                                            ? `Intereses generados por depósitos · actualizado hace ${Math.max(0, Math.round((new Date() - new Date(stats.rentabilidadCajaNUActualizada)) / 86400000))} día(s)`
                                            : 'Intereses generados por depósitos')
                                }
                                icon={Coins} tone="gold"
                                customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)" />
                            <DetailCard title="Disponible Total" value={fmt(disponible)} sub="Caja + rendimientos consolidados" icon={Wallet} tone="ok"
                                customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)" />
                        </div>
                    </Collapsible>
                </div>
            )}

            {/* ── Acciones Pendientes: para quien ejerce control sobre el fondo.
                 Se abre a la JUNTA completa (`esJunta`), no solo al gerente: los dos
                 miembros sin rol admin votan las solicitudes de préstamo, así que
                 ocultarles la cola los dejaba sin ver aquello sobre lo que deben
                 decidir. Cada tarjeta decide aparte si es de Junta o solo de admin.
                 Un socio raso no gestiona nada aquí, así que no ve la sección. ── */}
            {esJunta && (
            <div className="space-y-2">
                <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-brand-primary" />
                    Acciones Pendientes
                </h2>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Cada rol va a SU pantalla de votación: el gerente a la vista
                        admin, los miembros de Junta sin rol admin a
                        /dashboard/junta-prestamos, que es la que sí pueden abrir. */}
                    <button
                        onClick={() => goTo(isAdmin ? '/admin/loans/approvals' : '/dashboard/junta-prestamos')}
                        className={`text-left rounded-xl border p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-md active:scale-[0.98] ${
                            pending.loanRequests > 0 ? 'bg-amber-50 border-amber-200 hover:border-amber-300' : 'bg-white border-gray-200 hover:border-brand-primary/20'
                        }`}
                    >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${pending.loanRequests > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
                            <ClipboardList className={`h-5 w-5 ${pending.loanRequests > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-extrabold text-gray-900">
                                {pending.loanRequests > 0 ? `${pending.loanRequests} solicitud${pending.loanRequests > 1 ? 'es' : ''} de préstamo` : 'Sin solicitudes pendientes'}
                            </p>
                            <p className="text-[11px] text-gray-500">
                                {pending.loanRequests > 0 ? 'Esperando aprobación de la Junta Administrativa' : 'Solicitudes de préstamo al día'}
                            </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                    </button>
                    {/* Restablecer contraseñas y reasignar préstamos huérfanos son
                        tareas operativas del gerente, no decisiones de la Junta. */}
                    {isAdmin && (
                    <button
                        onClick={goToAdmin('/admin/clients')}
                        className={`text-left rounded-xl border p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-md active:scale-[0.98] ${
                            pending.passwordResets > 0 ? 'bg-amber-50 border-amber-200 hover:border-amber-300' : 'bg-white border-gray-200 hover:border-brand-primary/20'
                        }`}
                    >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${pending.passwordResets > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
                            <KeyRound className={`h-5 w-5 ${pending.passwordResets > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-extrabold text-gray-900">
                                {pending.passwordResets > 0 ? `${pending.passwordResets} solicitud${pending.passwordResets > 1 ? 'es' : ''} de contraseña` : 'Sin solicitudes pendientes'}
                            </p>
                            <p className="text-[11px] text-gray-500">
                                {pending.passwordResets > 0 ? 'Socios esperando restablecimiento de acceso' : 'Restablecimientos de contraseña al día'}
                            </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                    </button>
                    )}
                    {/* Solo aparece si hay algo que resolver — es un caso raro (solo puede
                        pasar por un script de migración manual, la importación Excel está
                        deshabilitada), no una cola de trabajo diaria como las otras dos. */}
                    {isAdmin && pending.orphanLoans > 0 && (
                        <button
                            onClick={goToAdmin('/admin/loans/orphans')}
                            className="text-left rounded-xl border p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-md active:scale-[0.98] bg-amber-50 border-amber-200 hover:border-amber-300"
                        >
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-100">
                                <UserX className="h-5 w-5 text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-extrabold text-gray-900">
                                    {pending.orphanLoans} préstamo{pending.orphanLoans > 1 ? 's' : ''} sin socio asignado
                                </p>
                                <p className="text-[11px] text-gray-500">Quedaron sin cliente vinculado — asígnalos para incluirlos en el análisis</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                        </button>
                    )}
                </div>
            </div>
            )}

            {/* ── Evolución Patrimonial: tendencia mensual real (acumulado de ahorro
                 neto, mesAbonado/anioAbonado), no solo totales estáticos por año. ── */}
            {evolucionSerie.length > 1 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                    <div className="flex items-center justify-between mb-1">
                        <SectionTitle icon={Sparkles}>Evolución Patrimonial</SectionTitle>
                        {isAdmin && (
                            <button
                                onClick={goToAdmin('/admin/savings/evolution')}
                                className="text-[11px] font-bold text-brand-primary hover:underline flex items-center gap-1 mb-3"
                            >
                                Ver evolución completa <ChevronRight className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                    <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={evolucionSerie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="patrimonioGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#166534" stopOpacity={0.35} />
                                        <stop offset="95%" stopColor="#166534" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="label" axisLine={false} tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                                <YAxis tickFormatter={fmtCorto} axisLine={false} tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 10 }} width={48} domain={['auto', 'auto']} />
                                <RechartsTooltip formatter={(v) => [fmt(v), 'Acumulado']} />
                                <Area type="monotone" dataKey="acumulado" stroke="#166534" strokeWidth={2}
                                    fill="url(#patrimonioGradient)" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                        Acumulado de ahorro mensual neto por mes acreditado (mesAbonado/anioAbonado) · no incluye aportes iniciales · $ COP
                    </p>
                </div>
            )}

            {/* ── Comparador interanual ────────────────────────────────────────
                 Mismo componente que el Panel Principal, alimentado por el mismo
                 endpoint: el comité y la gerencia deben ver exactamente la misma
                 comparación, no dos lecturas distintas del mismo año. ── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                <SectionTitle icon={BarChart3}>Comparar con años anteriores</SectionTitle>
                <p className="text-[11px] text-gray-500 font-semibold -mt-2 mb-4 leading-snug">
                    Cada año se dibuja sobre los mismos meses, de modo que la comparación siempre
                    es entre períodos equivalentes. La marca vertical señala el mes en curso.
                </p>
                <YearComparisonChart data={yearCmp} error={yearCmpError} />
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
                                <div className="flex items-center justify-between">
                                    <SectionTitle icon={Coins}>¿Cuánto está ganando el fondo?</SectionTitle>
                                    {ingresos.length > 0 && (
                                        <button
                                            onClick={() => setExpandIngresos(true)}
                                            className="text-[11px] font-bold text-brand-primary hover:underline flex items-center gap-1 mb-3 flex-shrink-0"
                                        >
                                            Ver análisis experto <ChevronRight className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
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
                                        <div className="flex-1 min-w-0 space-y-2.5">
                                            {ingresos.map(d => (
                                                <div key={d.name} className="flex items-start gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: d.color }} />
                                                    <span className="text-xs text-gray-600 font-medium flex-1 min-w-0 leading-tight break-words">{d.name}</span>
                                                    <span className="text-xs text-gray-800 font-bold tabular-nums whitespace-nowrap">{fmtCorto(d.value)}</span>
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

                                {/* Ancla YTD real: permite comparar directamente con el Panel Principal */}
                                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-3">
                                    <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                        Ganancia real acumulada (YTD)
                                    </span>
                                    <span className="text-sm font-black text-emerald-700 tabular-nums">{fmt(derived.proyeccion.gananciaRealYtd)}</span>
                                </div>

                                <div className="space-y-2.5">
                                    {[
                                        { label: 'Intereses de préstamos', v: derived.proyeccion.intereses, color: '#166534' },
                                        { label: 'Rendimiento cuenta NU', v: derived.proyeccion.nu, color: '#84cc16' },
                                        { label: 'Recargos por mora', v: derived.proyeccion.penalidad, color: '#f59e0b' },
                                    ].map(row => (
                                        <div key={row.label} className="flex items-start gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: row.color }} />
                                            <span className="text-xs text-gray-600 font-medium flex-1 min-w-0 leading-tight break-words">{row.label}</span>
                                            <p className="text-xs font-bold text-gray-800 tabular-nums flex-shrink-0 ml-2">{fmtCorto(row.v.conservador)}</p>
                                        </div>
                                    ))}
                                    <div className="pt-2.5 mt-1.5 border-t border-gray-100">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-xs font-extrabold text-gray-900">Proyección cierre año</p>
                                            <p className="text-sm font-black text-brand-primary tabular-nums flex-shrink-0">{fmt(derived.proyeccion.total.conservador)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                );
            })()}

            {/* ── Resultados del año, indicador por indicador ───────────────────
                 Reemplaza a MiniYearBars (tres barras sin contexto) por las mismas
                 tarjetas del Panel Principal: cada una trae la cifra acumulada, el
                 veredicto contra el RITMO del año anterior con la base declarada en
                 pantalla, la barra de avance y la tabla de valores en texto. Es la
                 pieza mejor preparada para un lector no financiero. ── */}
            {ind && (
                <div className="space-y-3">
                    <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-brand-primary" />
                        Resultados del año
                        <span className="text-[11px] font-semibold text-gray-400">
                            {ind.nombreMesCorte
                                ? `cada indicador frente al ritmo de ${ind.baselineAnio}, al ${ind.nombreMesCorte}`
                                : `cada indicador frente a ${ind.baselineAnio}`}
                        </span>
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <YearProgressCard
                            title="Ahorro de los Socios"
                            subtitle="Ahorro mensual + aportes iniciales, por año"
                            anioPrev={ind.baselineAnio} anioActual={ind.baselineAnio + 1}
                            totalPrev={ind.ahorroPrevTotal} actual={ind.ahorroActualTotal}
                            fraccionAnio={ind.fraccionAnio} nota={ind.ahorroComposicionNota}
                        />
                        <YearProgressCard
                            title="Préstamos Entregados"
                            subtitle="Dinero colocado en créditos a los socios"
                            anioPrev={ind.baselineAnio} anioActual={ind.baselineAnio + 1}
                            totalPrev={ind.baselinePrestamos} actual={ind.colocacionActualYtd}
                            fraccionAnio={ind.fraccionAnio}
                        />
                        {/* El patrimonio es un SALDO a una fecha, no un acumulado del
                            período: se compara contra el cierre anterior, sin "ritmo". */}
                        <YearProgressCard
                            title="Patrimonio del Fondo"
                            subtitle="Cuánto vale el fondo hoy"
                            tipo="saldo"
                            anioPrev={ind.baselineAnio} anioActual={ind.baselineAnio + 1}
                            totalPrev={ind.baselinePatrimonio} actual={ind.total}
                            fraccionAnio={ind.fraccionAnio}
                        />
                        <YearProgressCard
                            title="Ganancias por Intereses"
                            subtitle="Lo que pagan los socios por sus préstamos"
                            anioPrev={ind.baselineAnio} anioActual={ind.baselineAnio + 1}
                            totalPrev={ind.baselineIntereses} actual={ind.interesesActualYtd}
                            proyeccion={ind.proyeccionIntereses} fraccionAnio={ind.fraccionAnio}
                        />
                        <YearProgressCard
                            title="Rendimiento Cuenta NU"
                            subtitle="Interés que genera el dinero guardado en NU"
                            anioPrev={ind.baselineAnio} anioActual={ind.baselineAnio + 1}
                            totalPrev={ind.baselineNU} actual={stats?.rentabilidadCajaNU || 0}
                            proyeccion={ind.proyeccionNU} fraccionAnio={ind.fraccionAnio}
                        />
                        {/* Mora: tono rojo y masEsMejor=false — aquí crecer es mala señal. */}
                        <YearProgressCard
                            title="Cobros por Pagos Tardíos"
                            subtitle="Recargo aplicado a socios con cuotas vencidas"
                            tono="rojo" masEsMejor={false}
                            anioPrev={ind.baselineAnio} anioActual={ind.baselineAnio + 1}
                            totalPrev={ind.baselineMora} actual={ind.moraActualYtd}
                            proyeccion={ind.proyeccionMora} fraccionAnio={ind.fraccionAnio}
                        />
                    </div>
                </div>
            )}

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

                {/* Concentración de cartera. Para el admin: detalle por deudor (nombre +
                    monto), igual que antes. Para el socio: solo el agregado — nunca el
                    nombre ni el monto pendiente de otro socio, por privacidad. */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                    <SectionTitle icon={ShieldCheck}>{isAdmin ? 'Concentración de cartera por deudor' : 'Diversificación de la cartera'}</SectionTitle>
                    {/* El estado vacío se decide por la CARTERA, no por donutData:
                        donutData se arma desde `concentracion`, que el backend solo
                        envía al admin. Al evaluarlo primero, el socio caía siempre en
                        "Sin cartera pendiente" y nunca veía el indicador anónimo de
                        diversificación que existe justo abajo, escrito para él. */}
                    {cartera.total <= 0 ? (
                        <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
                            Sin cartera pendiente
                        </div>
                    ) : !isAdmin ? (
                        <div className="flex items-center gap-5">
                            <div className="relative w-[140px] h-[140px] flex-shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={[{ value: derived.top3Pct }, { value: Math.max(0, 100 - derived.top3Pct) }]}
                                            cx="50%" cy="50%" innerRadius="65%" outerRadius="90%"
                                            dataKey="value" isAnimationActive={false} stroke="none" startAngle={90} endAngle={-270}>
                                            <Cell fill={derived.top3Pct > 60 ? '#dc2626' : derived.top3Pct > 40 ? '#f59e0b' : '#166534'} />
                                            <Cell fill="#e5e7eb" />
                                        </Pie>
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
                            <div className="flex-1 min-w-0 space-y-2">
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Los 3 socios con mayor préstamo pendiente concentran el <b className="text-gray-900">{derived.top3Pct.toFixed(0)}%</b> de
                                    la cartera activa ({fmt(derived.top3)} de {fmt(cartera.total)}). Por privacidad, no se muestran nombres ni montos individuales de otros socios.
                                </p>
                                <p className="text-[10px] text-gray-400">
                                    Umbral saludable: &lt;40% · a vigilar: 40–60% · alto: &gt;60%
                                </p>
                            </div>
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
                                    <div
                                        key={d.name}
                                        onClick={d.cedula ? goToAdmin('/admin/payments/list', { estado: 'Pendiente', search: `${d.name} (${d.cedula})` }) : undefined}
                                        className={`flex items-center gap-2 rounded-lg -mx-1.5 px-1.5 py-0.5 transition-colors ${d.cedula ? 'cursor-pointer hover:bg-gray-50 group' : ''}`}
                                    >
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                                        <span className="text-xs text-gray-600 font-medium flex-1 truncate group-hover:text-brand-primary">{d.name}</span>
                                        <span className="text-xs text-gray-800 font-bold tabular-nums">{fmtCorto(d.value)}</span>
                                        {d.cedula && <ChevronRight className="h-3 w-3 text-gray-200 group-hover:text-brand-primary/60 flex-shrink-0 transition-colors" />}
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



            <p className="text-[11px] text-gray-400 pb-2">
                Fuente: base de datos del fondo en tiempo real · generado {new Date(exec.generadoEl).toLocaleString('es-CO')}
                {isAdmin
                    ? ' · Los indicadores siguen el plan de mejora del Panel Principal (jul 2026). Baselines por año calculados dinámicamente — sin cifras fijas en el código.'
                    : ' · Cifras calculadas directamente desde los registros del fondo, sin valores fijos ni estimaciones manuales.'}
            </p>

            {/* ── Modal: análisis experto de ingresos del fondo (mismo motor que el Panel Principal) ── */}
            <ChartExpandModal
                isOpen={expandIngresos}
                onClose={() => setExpandIngresos(false)}
                title="¿Cuánto está ganando el fondo?"
                analysisResult={analyzeIncomeDistribution({
                    totalInteresesPagados: stats?.totalInteresesPagados,
                    rentabilidadCajaNU: stats?.rentabilidadCajaNU,
                    totalPenaltyValue: stats?.totalPenaltyValue,
                })}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={ingresosFondoData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%"
                            paddingAngle={3} dataKey="value" isAnimationActive={false} stroke="none">
                            {ingresosFondoData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <RechartsTooltip formatter={(v) => fmt(v)} />
                    </PieChart>
                </ResponsiveContainer>
            </ChartExpandModal>
        </div>
    );
};

export default ExecutivePanelPage;
