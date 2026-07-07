import React, { useState, useEffect, useMemo } from 'react';
import api from '../../config/api';
import {
    ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip as RechartsTooltip, Cell, ReferenceLine, PieChart, Pie
} from 'recharts';
import { TrendingUp, Activity, PieChart as PieIcon, AlertTriangle, Users, Info } from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtCorto = (n) => {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
    return `${sign}$${abs}`;
};
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const SavingsEvolutionPage = () => {
    const [data, setData] = useState(null);
    const [clients, setClients] = useState([]);
    const [clientId, setClientId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.get('/admin/clients')
            .then(res => setClients((res.data || [])
                .filter(c => c.role === 'user')
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))))
            .catch(() => {});
    }, []);

    useEffect(() => {
        setLoading(true);
        setError(null);
        api.get('/admin/savings-evolution', { params: clientId ? { clientId } : {} })
            .then(res => setData(res.data))
            .catch(() => setError('No se pudo cargar la serie de evolución.'))
            .finally(() => setLoading(false));
    }, [clientId]);

    const hoyKey = useMemo(() => {
        const d = new Date();
        return d.getFullYear() * 12 + d.getMonth();
    }, []);

    const derived = useMemo(() => {
        if (!data?.serieMensual?.length) return null;

        // Serie continua mes a mes (meses sin abono = flujo 0, acumulado plano)
        const porKey = {};
        data.serieMensual.forEach(r => {
            const k = Number(r.anio) * 12 + (Number(r.mes) - 1);
            porKey[k] = { neto: Number(r.neto) || 0, bruto: Number(r.bruto) || 0 };
        });
        const keys = Object.keys(porKey).map(Number);
        const minK = Math.min(...keys);
        const maxK = Math.max(...keys);

        const serie = [];
        let acum = 0;
        for (let k = minK; k <= maxK; k++) {
            const flujo = porKey[k]?.neto || 0;
            acum += flujo;
            const esFuturo = k > hoyKey;
            const esBorde = k === hoyKey || (k === minK && minK > hoyKey);
            serie.push({
                key: k,
                label: `${MESES[k % 12]} ${String(Math.floor(k / 12)).slice(2)}`,
                flujo,
                // Dos series para el área: causado (sólido) y futuro/prepagos (punteado).
                // El mes actual pertenece a ambas para que la línea conecte sin salto.
                acumCausado: !esFuturo ? acum : null,
                acumFuturo: esFuturo || esBorde ? acum : null,
                esFuturo,
            });
        }

        const mesesNegativos = serie.filter(s => s.flujo < 0);
        const acumHoy = [...serie].reverse().find(s => !s.esFuturo)?.acumCausado ?? acum;
        const totalNeto = serie.reduce((s, r) => s + r.flujo, 0);
        const aportes = Number(data.aportes?.total) || 0;
        const composicion = [
            { name: 'Ahorros netos', value: Math.max(0, totalNeto), color: '#166534' },
            { name: 'Aportes iniciales', value: aportes, color: '#f59e0b' },
        ].filter(d => d.value > 0);
        const patrimonio = Math.max(0, totalNeto) + aportes;
        const tienePrepagos = serie.some(s => s.esFuturo && s.flujo !== 0);

        return { serie, mesesNegativos, acumHoy, totalNeto, aportes, composicion, patrimonio, tienePrepagos };
    }, [data, hoyKey]);

    const socioSel = clients.find(c => String(c.id) === String(clientId));
    const titulo = socioSel ? `${socioSel.name} ${socioSel.apellido1 || socioSel.surname1 || ''}`.trim() : 'Todo el fondo';

    const TooltipStock = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        const p = payload.find(x => x.value != null);
        if (!p) return null;
        const esFuturo = p.payload?.esFuturo;
        return (
            <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg text-xs">
                <p className="font-bold text-gray-800 mb-1">{label}{esFuturo ? ' · prepagado' : ''}</p>
                <p className="text-gray-700">Saldo acumulado: <b className="text-brand-primary">{fmt(p.value)}</b></p>
                {p.payload?.flujo !== 0 && (
                    <p className={p.payload.flujo < 0 ? 'text-red-600' : 'text-gray-500'}>
                        Movimiento del mes: {fmt(p.payload.flujo)}
                    </p>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-5 max-w-6xl mx-auto animate-fade-in">
            {/* Encabezado */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Evolución de Ahorros</h1>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Beta</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Stock · Flujo · Composición — con devoluciones visibles y prepagos diferenciados
                    </p>
                </div>
                {/* Selector de socio */}
                <label className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 min-h-[44px]">
                    <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <select
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        className="text-sm font-semibold text-gray-700 bg-transparent focus:outline-none py-2 max-w-[220px]"
                    >
                        <option value="">Todo el fondo</option>
                        {clients.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name} {c.apellido1 || c.surname1 || ''}{c.estatus !== 'Activo' ? ' (inactivo)' : ''}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {loading ? (
                <div className="space-y-4">
                    <div className="h-72 bg-gray-100 rounded-2xl animate-pulse" />
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="h-60 bg-gray-100 rounded-2xl animate-pulse" />
                        <div className="h-60 bg-gray-100 rounded-2xl animate-pulse" />
                    </div>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center min-h-[240px] gap-3 bg-white rounded-2xl border border-gray-200">
                    <AlertTriangle className="h-8 w-8 text-amber-400" />
                    <p className="text-sm text-gray-500">{error}</p>
                </div>
            ) : !derived ? (
                <div className="flex flex-col items-center justify-center min-h-[240px] gap-2 bg-white rounded-2xl border border-gray-200">
                    <Info className="h-8 w-8 text-gray-300" />
                    <p className="text-sm text-gray-500">Sin movimientos de ahorro registrados para {titulo}.</p>
                </div>
            ) : (
                <>
                    {/* Aviso de devoluciones (los negativos se muestran, no se ocultan) */}
                    {derived.mesesNegativos.length > 0 && (
                        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
                            <p>
                                {derived.mesesNegativos.length === 1 ? 'Mes con retiro/devolución: ' : 'Meses con retiros/devoluciones: '}
                                {derived.mesesNegativos.map(m => `${m.label} (${fmtCorto(m.flujo)})`).join(' · ')}
                                {' '}— visibles en las gráficas como caídas y barras rojas.
                            </p>
                        </div>
                    )}

                    {/* ── 1 · STOCK: saldo acumulado ── */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
                            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-brand-primary" />
                                Saldo acumulado · {titulo}
                            </h2>
                            <p className="text-sm font-extrabold text-brand-primary tabular-nums">
                                Hoy: {fmt(derived.acumHoy)}
                            </p>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-3">
                            Ahorro mensual neto de penalizaciones, acumulado por mes acreditado ($ COP)
                        </p>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={derived.serie} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="evoGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#166534" stopOpacity={0.25} />
                                            <stop offset="90%" stopColor="#166534" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} minTickGap={18} />
                                    <YAxis axisLine={false} tickLine={false} tickFormatter={fmtCorto}
                                        tick={{ fill: '#94a3b8', fontSize: 10 }} width={52}
                                        domain={[(dataMin) => Math.min(0, dataMin), 'auto']} />
                                    <RechartsTooltip content={<TooltipStock />} />
                                    <Area type="monotone" dataKey="acumCausado" name="Saldo causado"
                                        stroke="#166534" strokeWidth={2.5} fill="url(#evoGrad)"
                                        dot={false} activeDot={{ r: 5, fill: '#166534', stroke: '#fff', strokeWidth: 2 }}
                                        connectNulls={false} isAnimationActive={false} />
                                    <Area type="monotone" dataKey="acumFuturo" name="Prepagos futuros"
                                        stroke="#166534" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.45}
                                        fill="none" dot={false}
                                        activeDot={{ r: 4, fill: '#84cc16', stroke: '#fff', strokeWidth: 1.5 }}
                                        connectNulls={false} isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        {derived.tienePrepagos && (
                            <p className="text-[11px] text-gray-400 mt-1.5">
                                Tramo punteado: meses futuros ya abonados por adelantado (prepagos) — aún no causados.
                            </p>
                        )}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        {/* ── 2 · FLUJO: movimiento mensual con negativos ── */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-1">
                                <Activity className="h-4 w-4 text-brand-primary" />
                                Movimiento mensual
                            </h2>
                            <p className="text-[11px] text-gray-400 mb-3">
                                Abonos en verde · retiros y devoluciones en rojo, hacia abajo ($ COP)
                            </p>
                            <div className="h-[230px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={derived.serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false}
                                            tick={{ fill: '#94a3b8', fontSize: 9.5, fontWeight: 600 }} minTickGap={14} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={fmtCorto}
                                            tick={{ fill: '#94a3b8', fontSize: 10 }} width={52} />
                                        <RechartsTooltip
                                            formatter={(v) => [fmt(v), v < 0 ? 'Retiro / devolución' : 'Abono del mes']}
                                        />
                                        <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
                                        <Bar dataKey="flujo" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                                            {derived.serie.map((s, i) => (
                                                <Cell key={i} fill={s.flujo < 0 ? '#dc2626' : s.esFuturo ? '#a7d3b7' : '#166534'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* ── 3 · COMPOSICIÓN del patrimonio ── */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-1">
                                <PieIcon className="h-4 w-4 text-brand-primary" />
                                Composición del Patrimonio
                            </h2>
                            <p className="text-[11px] text-gray-400 mb-3">
                                Ahorros netos acumulados + aportes iniciales ($ COP)
                            </p>
                            {derived.composicion.length === 0 ? (
                                <div className="h-[230px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
                            ) : (
                                <div className="flex items-center gap-4 h-[230px]">
                                    <div className="relative w-[180px] h-full flex-shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={derived.composicion} cx="50%" cy="50%"
                                                    innerRadius="58%" outerRadius="86%" paddingAngle={3}
                                                    dataKey="value" isAnimationActive={false} stroke="none">
                                                    {derived.composicion.map((d, i) => <Cell key={i} fill={d.color} />)}
                                                </Pie>
                                                <RechartsTooltip formatter={(v) => fmt(v)} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Patrimonio</span>
                                            <span className="text-sm font-black text-gray-800 tabular-nums">{fmtCorto(derived.patrimonio)}</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2.5">
                                        {derived.composicion.map(d => (
                                            <div key={d.name}>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                                    <span className="text-xs text-gray-600 font-medium flex-1 truncate">{d.name}</span>
                                                    <span className="text-xs text-gray-800 font-bold tabular-nums">{fmtCorto(d.value)}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-400 ml-4.5 pl-0.5">
                                                    {derived.patrimonio > 0 ? `${Math.round((d.value / derived.patrimonio) * 100)}% del patrimonio` : ''}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className="text-[11px] text-gray-400 pb-2">
                        Definiciones: ahorro <b>neto</b> = valor acreditado tras penalizaciones · serie por <b>mes acreditado</b> (mesAbonado/anioAbonado), no por fecha de pago ·
                        los meses sin abono mantienen el acumulado plano · retiros y devoluciones se muestran siempre (regla de gobernanza de gráficas).
                    </p>
                </>
            )}
        </div>
    );
};

export default SavingsEvolutionPage;
