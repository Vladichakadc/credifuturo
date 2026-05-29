import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import {
    Users, DollarSign, PiggyBank, BarChart3, CheckCircle,
    AlertTriangle, Database, TrendingUp, Landmark,
    ChevronRight, ArrowUpRight, Loader2, RefreshCw, X, FileDown
} from 'lucide-react';
import { useUi } from '../../context/UiContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, Cell, AreaChart, Area, LabelList,
    PieChart, Pie, Legend
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import AccountSummaryPDF from './AccountSummaryPDF';

// ─── Vertical Stat Card ───────────────────────────────────────────────────────
const VerticalStatCard = ({ title, value, description, icon: Icon, color, bgColor, active, onClick }) => {
    const isNubank = title === 'Total Ahorrado';
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-200 group flex items-center gap-4
            ${isNubank
                    ? `bg-gradient-to-br from-purple-50 to-white border-purple-200 hover:border-purple-300 hover:shadow-md hover:shadow-purple-500/10 ${active ? 'ring-2 ring-offset-2 ring-purple-400' : ''}`
                    : active
                        ? 'border-brand-primary bg-brand-primary/5 shadow-md shadow-brand-primary/10'
                        : 'border-gray-100 bg-white hover:border-brand-primary/30 hover:shadow-sm hover:bg-gray-50/80'
                }`}
        >
            <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors
            ${isNubank ? 'bg-purple-100 text-purple-700' : active ? 'bg-brand-primary/15' : bgColor || 'bg-gray-100'}`}>
                <Icon className={`h-5 w-5 ${isNubank ? 'text-purple-600' : active ? 'text-brand-primary' : color}`} />
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${isNubank ? 'text-purple-600' : active ? 'text-brand-primary' : 'text-gray-400'}`}>
                    {title}
                </p>
                <p className={`text-lg font-bold tabular-nums truncate leading-tight ${isNubank ? 'text-purple-950' : active ? 'text-brand-primary' : 'text-gray-800'}`}>
                    {value}
                </p>
                {description && (
                    <p className={`text-[11px] mt-0.5 truncate ${isNubank ? 'text-purple-500' : active ? 'text-brand-primary/70' : 'text-gray-400'}`}>
                        {description}
                    </p>
                )}
            </div>
            <ChevronRight className={`h-4 w-4 shrink-0 transition-all duration-200
            ${isNubank ? 'text-purple-300 group-hover:text-purple-500 translate-x-0.5' : active ? 'text-brand-primary translate-x-0.5' : 'text-gray-200 group-hover:text-brand-primary/50'}`}
            />
        </button>
    )
};

// ─── Helpers for full savings table ───────────────────────────────────────────
const fmtCur = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? '—' : `$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtVal = (v) => (v === null || v === undefined || v === '') ? <span className="text-gray-300 text-xs italic">—</span> : v;

const SAVINGS_COLS = [
    { key: 'externalId', label: 'Id_VM', minW: 100 },
    { key: 'clientCustomerId', label: 'Customer_id', minW: 110 },
    { key: 'clientName', label: 'Nombre', minW: 140 },
    { key: 'clientSurname', label: 'Apellido', minW: 140 },
    { key: 'status', label: 'Estado', minW: 110 },
    { key: 'date', label: 'Fecha Pago', minW: 120 },
    { key: 'year', label: 'Año pago', minW: 80 },
    { key: 'month', label: 'Mes pago', minW: 110 },
    { key: 'penalizacion', label: 'Penalización', minW: 110 },
    { key: 'diasPenalizacion', label: 'Días Penalización', minW: 110 },
    { key: 'amount', label: 'Valor Mensual', minW: 130, isCur: true },
    { key: 'valorAPenalizar', label: 'Valor a Penalizar', minW: 130, isCur: true },
    { key: 'valorAhorrado', label: 'Valor Ahorrado', minW: 130, isCur: true },
    { key: 'mesAbonado', label: 'Mes Abonado', minW: 110 },
    { key: 'anioAbonado', label: 'Año Abonado', minW: 100 },
    { key: 'itemQuantity', label: 'Item_Quantity', minW: 100 },
    { key: 'banco', label: 'Banco', minW: 140 },
    { key: 'numeroTransaccion', label: '# Transacción', minW: 140 },
    { key: 'origen', label: 'Desde Cuenta Ahorros', minW: 180 },
    { key: 'type', label: 'Tipo de Ahorro', minW: 130 },
    { key: 'observaciones', label: 'Observaciones', minW: 200 },
];

// ─── Helper: get authenticated user's cedula from localStorage ───────────────
const getAuthCedula = () => {
    try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return u.cedula || null;
    } catch { return null; }
};

// ─── Reusable Full List Modal ────────────────────────────────────────────────
const FullListModal = ({ title, columns, data, onClose, icon: Icon }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200 flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-6 py-4 bg-brand-primary flex items-center justify-between text-white shrink-0 shadow-md z-20">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-6 w-6 opacity-90" />}
                    <h3 className="text-xl font-bold">{title}</h3>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                    <X className="h-5 w-5" />
                </button>
            </div>
            <div className="overflow-auto flex-1 bg-gray-50/30">
                <table className="text-xs border-collapse" style={{ minWidth: `${columns.reduce((a, c) => a + c.minW, 0)}px`, width: '100%' }}>
                    <thead className="sticky top-0 z-10 bg-white border-b-2 border-gray-200 text-gray-700 shadow-sm">
                        <tr>
                            {columns.map(col => (
                                <th key={col.key} style={{ minWidth: col.minW }} className="px-4 py-3.5 text-left font-bold uppercase tracking-wider text-[10px] whitespace-nowrap">
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {data.map((row, i) => (
                            <tr key={row.id || i} className={`transition-colors hover:bg-brand-primary/5`}>
                                {columns.map(col => (
                                    <td key={col.key} style={{ minWidth: col.minW }} className="px-4 py-2.5 whitespace-nowrap border-r border-gray-50 last:border-r-0">
                                        {col.isCur ? <span className="font-semibold text-gray-800 tabular-nums">{fmtCur(row[col.key])}</span>
                                            : col.key === 'externalId' || col.key === 'clientCustomerId' ? <span className="font-semibold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">{fmtVal(row[col.key])}</span>
                                                : col.key === 'status' ? <span className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wide ${row[col.key] === 'Abono' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{row[col.key] || '—'}</span>
                                                    : <span className="text-gray-600">{fmtVal(row[col.key])}</span>}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-6 py-4 bg-white border-t border-gray-100 flex justify-between items-center shrink-0">
                <span className="text-sm text-gray-500 font-medium">Total Registros Históricos: <strong className="text-brand-primary text-base">{data.length}</strong></span>
                <button onClick={onClose} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors text-sm">
                    Cerrar Lista
                </button>
            </div>
        </div>
    </div>
);

// ─── Detail Panel: Savings ─────────────────────────────────────────────────────
const SavingsDetail = ({ data, fullData, loading }) => {
    const [showModal, setShowModal] = useState(false);

    const previewData = data.slice(0, 6);

    return (
        <>
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2">
                        <PiggyBank className="h-5 w-5" /> Capital Ahorrado
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">Mostrando los {previewData.length} ahorros más recientes</p>
                </div>
                <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-dark transition-colors bg-brand-primary/5 px-3 py-1.5 rounded-lg hover:bg-brand-primary/10">
                    Ver lista completa <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
            </div>

            {showModal && (
                <FullListModal
                    title="Historial de Ahorros Filtrado"
                    icon={PiggyBank}
                    columns={SAVINGS_COLS}
                    data={fullData}
                    onClose={() => setShowModal(false)}
                />
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary/30" />
                </div>
            ) : data.length === 0 ? (
                <div className="text-center py-16 text-gray-400">Sin registros de ahorro para este año</div>
            ) : (
                <div className="overflow-auto rounded-lg border border-gray-100" style={{ maxHeight: '500px' }}>
                    <table className="text-xs border-collapse" style={{ minWidth: `${SAVINGS_COLS.reduce((a, c) => a + c.minW, 0)}px`, width: '100%' }}>
                        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                            <tr>
                                {SAVINGS_COLS.map(col => (
                                    <th key={col.key}
                                        style={{ minWidth: col.minW }}
                                        className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px] whitespace-nowrap border-r border-gray-100 last:border-r-0">
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {previewData.map((row, i) => (
                                <tr key={row.id || i} className={`transition-colors hover:bg-brand-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}>
                                    {SAVINGS_COLS.map(col => (
                                        <td key={col.key}
                                            style={{ minWidth: col.minW }}
                                            className="px-3 py-2 whitespace-nowrap border-r border-gray-50 last:border-r-0">
                                            {col.isCur
                                                ? <span className="font-medium text-gray-800 tabular-nums">{fmtCur(row[col.key])}</span>
                                                : col.key === 'externalId' || col.key === 'clientCustomerId'
                                                    ? <span className="font-semibold text-brand-primary">{fmtVal(row[col.key])}</span>
                                                    : col.key === 'status'
                                                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${row[col.key] === 'Abono' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {row[col.key] || '—'}
                                                        </span>
                                                        : <span className="text-gray-700">{fmtVal(row[col.key])}</span>
                                            }
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
};

// ─── Aportes columns (mirrors InitialContributionsListPage) ───────────────────
const APORTES_COLS = [
    { key: 'externalId', label: 'Id_AI', minW: 80 },
    { key: 'clientCustomerId', label: 'Customer_id', minW: 100 },
    { key: 'clientName', label: 'Nombre', minW: 120 },
    { key: 'clientSurname', label: 'Apellido', minW: 120 },
    { key: 'status', label: 'Estado', minW: 100 },
    { key: 'date', label: 'Fecha Pago', minW: 110 },
    { key: 'year', label: 'Año', minW: 80 },
    { key: 'month', label: 'Mes', minW: 100 },
    { key: 'amount', label: 'Valor', minW: 120, isCur: true },
    { key: 'itemQuantity', label: 'Item_Quantity', minW: 100 },
    { key: 'banco', label: 'Banco', minW: 120 },
    { key: 'numeroTransaccion', label: '# Transacción', minW: 130 },
    { key: 'origen', label: 'Desde Cuenta de Ahorros', minW: 180 },
];

// ─── Detail Panel: Aportes Iniciales ─────────────────────────────────────────
const AportesDetail = ({ data, loading }) => {
    const { navigate } = useUi();

    return (
        <>
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2">
                        <Database className="h-5 w-5" /> Total Aportes Iniciales
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">{data.length} registros · aportes iniciales de socios</p>
                </div>
                <button onClick={() => navigate('/dashboard/contributions')}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-dark transition-colors bg-brand-primary/5 px-3 py-1.5 rounded-lg hover:bg-brand-primary/10">
                    Ver lista completa <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary/30" />
                </div>
            ) : data.length === 0 ? (
                <div className="text-center py-16 text-gray-400">Sin aportes iniciales para este periodo</div>
            ) : (
                <div className="overflow-auto rounded-lg border border-gray-100" style={{ maxHeight: '500px' }}>
                    <table className="text-xs border-collapse" style={{ minWidth: `${APORTES_COLS.reduce((a, c) => a + c.minW, 0)}px`, width: '100%' }}>
                        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                            <tr>
                                {APORTES_COLS.map(col => (
                                    <th key={col.key}
                                        style={{ minWidth: col.minW }}
                                        className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px] whitespace-nowrap border-r border-gray-100 last:border-r-0">
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {data.map((row, i) => (
                                <tr key={row.id || i} className={`transition-colors hover:bg-brand-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}>
                                    {APORTES_COLS.map(col => (
                                        <td key={col.key}
                                            style={{ minWidth: col.minW }}
                                            className="px-3 py-2 whitespace-nowrap border-r border-gray-50 last:border-r-0">
                                            {col.isCur
                                                ? <span className="font-medium text-gray-800 tabular-nums">{fmtCur(row[col.key])}</span>
                                                : col.key === 'externalId' || col.key === 'clientCustomerId'
                                                    ? <span className="font-semibold text-brand-primary">{fmtVal(row[col.key])}</span>
                                                    : col.key === 'status'
                                                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${row[col.key] === 'Abono' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {row[col.key] || '—'}
                                                        </span>
                                                        : <span className="text-gray-700">{fmtVal(row[col.key])}</span>
                                            }
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
};

// ─── Power BI Style Tooltip ──────────────────────────────────────────────────
const PowerBITooltip = ({ active, payload, label, showLabel = true }) => {
    if (!active || !payload || !payload.length) return null;
    const fmt = (v) => `$${Number(v).toLocaleString('es-CO')}`;
    return (
        <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-gray-100 overflow-hidden" style={{ minWidth: 180 }}>
            {showLabel && label && <div className="px-4 py-2 bg-gray-50 border-b border-gray-100"><p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</p></div>}
            <div className="px-4 py-3 space-y-1.5">
                {payload.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color || entry.payload?.color }} />
                            <span className="text-xs text-gray-500 font-medium">{entry.name || entry.payload?.name || entry.dataKey}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(entry.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Gráfico Permanente de Resumen (Power BI Style) ──────────────────────────
const AccountSummaryChart = ({ stats }) => {
    const barData = [
        { name: 'Capital Ahorrado', valor: stats?.totalSavings || 0, color: '#6366f1' },
        { name: 'Aportes Iniciales', valor: stats?.totalInitialContributions || 0, color: '#f59e0b' },
        { name: 'Total Ahorrado', valor: stats?.totalAhorradoGeneral || 0, color: '#8A05BE' },
    ].filter((item) => item.valor > 0);

    const pieData = [
        { name: 'Capital', value: stats?.totalSavings || 0, color: '#6366f1' },
        { name: 'Aportes', value: stats?.totalInitialContributions || 0, color: '#f59e0b' },
    ].filter(d => d.value > 0);

    const fmtShort = (v) => {
        if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
        if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
        return `$${v}`;
    };
    const fmtFull = (v) => `$${Number(v).toLocaleString('es-CO')}`;

    if (!stats || stats.totalAhorradoGeneral === 0) return null;

    return (
        <div className="w-full h-full flex gap-2">
            {/* Bar Chart */}
            <div className="flex-1 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 30, right: 10, left: 0, bottom: 8 }} barSize={44} barGap={8}>
                        <defs>
                            <linearGradient id="barGrad0" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" /><stop offset="100%" stopColor="#6366f1" /></linearGradient>
                            <linearGradient id="barGrad1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient>
                            <linearGradient id="barGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a855f7" /><stop offset="100%" stopColor="#8A05BE" /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} dy={6} />
                        <YAxis tickFormatter={fmtShort} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} width={55} />
                        <RechartsTooltip cursor={{ fill: 'rgba(99,102,241,0.04)', radius: 8 }} content={<PowerBITooltip showLabel={false} />} />
                        <Bar dataKey="valor" radius={[8, 8, 4, 4]} isAnimationActive={false}
                            label={{ position: 'top', fill: '#334155', fontSize: 11, fontWeight: 700, formatter: fmtFull, offset: 8 }}>
                            {barData.map((_, i) => <Cell key={i} fill={`url(#barGrad${i})`} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {/* Donut Chart */}
            {pieData.length > 1 && (
                <div className="w-[140px] shrink-0 flex flex-col items-center justify-center">
                    <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={4} dataKey="value" isAnimationActive={false} stroke="none">
                                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <RechartsTooltip content={<PowerBITooltip showLabel={false} />} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-1 mt-1">
                        {pieData.map((d, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                                <span className="text-[9px] text-gray-500 font-semibold">{d.name}</span>
                                <span className="text-[9px] text-gray-800 font-bold tabular-nums">{Math.round((d.value / (stats?.totalAhorradoGeneral || 1)) * 100)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Custom Dot for Area Chart ───────────────────────────────────────────────
const CustomActiveDot = (props) => {
    const { cx, cy, payload } = props;
    if (!payload?.monto || payload.monto === 0) return null;
    return (
        <g>
            <circle cx={cx} cy={cy} r={8} fill="#6366f1" opacity={0.15} />
            <circle cx={cx} cy={cy} r={4.5} fill="#fff" stroke="#6366f1" strokeWidth={2.5} />
        </g>
    );
};

// ─── Gráfico de Área: Tendencia Mensual (Power BI Style) ─────────────────────
const MonthlySavingsTrendChart = ({ data }) => {
    const fmtFull = (v) => `$${Number(v).toLocaleString('es-CO')}`;
    if (!data || data.length === 0) return null;

    return (
        <div className="w-full h-full pb-2">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 25, right: 15, left: 5, bottom: 5 }}>
                    <defs>
                        <linearGradient id="areaGradAcct" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                            <stop offset="50%" stopColor="#818cf8" stopOpacity={0.1} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600 }} interval={0} padding={{ left: 10, right: 10 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#cbd5e1', fontSize: 9 }} tickFormatter={(v) => v > 0 ? `$${(v / 1000).toFixed(0)}k` : '0'} width={45} />
                    <RechartsTooltip content={<PowerBITooltip />} />
                    <Area type="monotone" dataKey="monto" name="Ahorro Mensual" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#areaGradAcct)" isAnimationActive={false}
                        dot={(props) => {
                            const { cx, cy, payload: p } = props;
                            if (!p?.monto || p.monto === 0) return null;
                            return <circle key={props.index} cx={cx} cy={cy} r={3} fill="#fff" stroke="#6366f1" strokeWidth={2} />;
                        }}
                        activeDot={<CustomActiveDot />}>
                        <LabelList dataKey="monto" position="top" offset={12} style={{ fill: '#475569', fontSize: 9, fontWeight: 700 }}
                            formatter={(v) => v > 0 ? `$${Number(v).toLocaleString('es-CO', { maximumFractionDigits: 0 })}` : ''} />
                    </Area>
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

// ─── Default Panel (Placeholder) ────────────────────────────────────────────────
const DefaultDetail = () => (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-primary/10 flex items-center justify-center mb-4">
            <ChevronRight className="h-8 w-8 text-brand-primary/40" />
        </div>
        <h3 className="text-lg font-semibold text-gray-500 mb-2">Selecciona una tarjeta</h3>
        <p className="text-sm text-gray-400 max-w-xs">
            Haz clic en <strong>Capital Ahorrado</strong> o <strong>Total Aportes Iniciales</strong> para ver el detalle de los movimientos.
        </p>
    </div>
);

// ─── Main UserAccountDetailsPage ───────────────────────────────────────────────
const UserAccountDetailsPage = () => {
    const { toast } = useUi();
    const [activeCard, setActiveCard] = useState(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [chartImages, setChartImages] = useState({ summaryChart: null, trendChart: null });
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState('Todos');
    const [availableYears, setAvailableYears] = useState([]);

    // Raw Data from API
    const [rawSavings, setRawSavings] = useState([]);
    const [rawAportes, setRawAportes] = useState([]);
    const [fullUserData, setFullUserData] = useState(null);

    const summaryChartRef = React.useRef(null);
    const trendChartRef = React.useRef(null);
    const pdfRef = React.useRef(null);

    const [authUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
    });

    const fmt = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`;

    // ─── PDF Generation ────────────────────────────────────────────────────────
    // Strategy:
    //   STEP 1 → Capture chart images SEQUENTIALLY (not in parallel).
    //             Parallel html2canvas calls share the same canvas context and
    //             produce overlapping/blank output. Sequential capture fixes this.
    //   STEP 2 → Inject images into the <AccountSummaryPDF> component and wait
    //             300 ms for React to finish re-rendering before taking the
    //             screenshot of the header/KPIs/charts block.
    //   STEP 3 → Add the screenshot as the first page(s) of the PDF.
    //   STEP 4 → Use jspdf-autotable to append the savings table. autoTable
    //             calculates row heights natively and adds new PDF pages
    //             automatically — rows are NEVER cut across a page boundary.
    const handleGeneratePdf = async () => {
        // ── Pre-flight validation ──────────────────────────────────────────────
        if (!fullUserData) {
            toast.error('No se encontraron datos del socio. Recarga la página e intenta nuevamente.');
            return;
        }
        if (!userStats) {
            toast.error('Las estadísticas del socio no están disponibles aún.');
            return;
        }
        if (!filteredSavings || filteredSavings.length === 0) {
            toast.error('No hay movimientos de ahorro para incluir en el PDF.');
            return;
        }

        setIsGeneratingPdf(true);
        toast.info('Generando PDF… esto puede tardar unos segundos.', { duration: 8000 });

        try {
            // ── STEP 1: Capture charts sequentially ───────────────────────────
            // Each chart is captured one at a time to avoid sharing the canvas
            // rendering context, which is the root cause of chart overlapping.
            let summaryImg = null;
            let trendImg = null;

            if (summaryChartRef.current) {
                try {
                    const summaryCanvas = await html2canvas(summaryChartRef.current, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        logging: false,
                        useCORS: true,
                        allowTaint: true,
                    });
                    summaryImg = summaryCanvas.toDataURL('image/png', 1.0);
                } catch (chartErr) {
                    console.warn('No se pudo capturar el gráfico de barras:', chartErr);
                    // Non-fatal: continue without this chart image
                }
            }

            if (trendChartRef.current) {
                try {
                    const trendCanvas = await html2canvas(trendChartRef.current, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        logging: false,
                        useCORS: true,
                        allowTaint: true,
                    });
                    trendImg = trendCanvas.toDataURL('image/png', 1.0);
                } catch (chartErr) {
                    console.warn('No se pudo capturar el gráfico de tendencia:', chartErr);
                    // Non-fatal: continue without this chart image
                }
            }

            // Inject captured images into the hidden <AccountSummaryPDF> component
            const images = { summaryChart: summaryImg, trendChart: trendImg };
            setChartImages(images);

            // ── STEP 2: Wait for React to re-render with chart images ──────────
            // 300 ms gives React enough time to paint the <img> tags inside
            // <AccountSummaryPDF> before html2canvas takes the screenshot.
            // 100 ms was too short and caused blank chart boxes.
            await new Promise(resolve => setTimeout(resolve, 300));

            // ── STEP 3: Capture the header/KPIs/charts block as a PDF image ───
            if (!pdfRef.current) {
                throw new Error('El componente PDF no está disponible en el DOM. Intenta de nuevo.');
            }

            const headerCanvas = await html2canvas(pdfRef.current, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: true,
            });

            const headerImgData = headerCanvas.toDataURL('image/png', 1.0);

            // ── STEP 4: Build the PDF document ────────────────────────────────
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const PAGE_W = pdf.internal.pageSize.getWidth();  // 210 mm
            const PAGE_H = pdf.internal.pageSize.getHeight(); // 297 mm
            const MARGIN = 10; // mm on each side
            const CONTENT_W = PAGE_W - MARGIN * 2;

            // Scale the header image to fit the page width
            const headerAspect = headerCanvas.width / headerCanvas.height;
            const headerImgW = CONTENT_W;
            const headerImgH = headerImgW / headerAspect;

            // If the header is taller than one page, tile it across pages
            let yPos = MARGIN;
            let heightRemaining = headerImgH;
            let srcY = 0;

            while (heightRemaining > 0) {
                const sliceH = Math.min(PAGE_H - MARGIN * 2, heightRemaining);
                // Use addImage with sx/sy/sWidth/sHeight for slicing
                const srcH = (sliceH / headerImgH) * headerCanvas.height;

                // Create a temporary canvas slice
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = headerCanvas.width;
                sliceCanvas.height = Math.round(srcH);
                const sliceCtx = sliceCanvas.getContext('2d');
                sliceCtx.drawImage(headerCanvas, 0, srcY, headerCanvas.width, Math.round(srcH), 0, 0, headerCanvas.width, Math.round(srcH));

                const sliceData = sliceCanvas.toDataURL('image/png', 1.0);
                pdf.addImage(sliceData, 'PNG', MARGIN, yPos, headerImgW, sliceH);

                heightRemaining -= sliceH;
                srcY += Math.round(srcH);

                if (heightRemaining > 0) {
                    pdf.addPage();
                    yPos = MARGIN;
                }
            }

            // ── STEP 5: Append savings table with jspdf-autotable ─────────────
            // autoTable handles page breaks automatically — no row is ever cut
            // across a page boundary. It also respects the current PDF cursor
            // position via startY so it flows naturally after the header image.
            pdf.addPage();

            // Table title
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(13);
            pdf.setTextColor(79, 70, 229); // indigo-600
            pdf.text('Histórico de Movimientos de Ahorro', MARGIN, MARGIN + 5);

            // Subtitle with filter info
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(107, 114, 128); // gray-500
            const filterLabel = selectedYear === 'Todos' ? 'Todos los años' : `Año ${selectedYear}`;
            pdf.text(
                `Socio: ${fullUserData.name} ${fullUserData.surname1 || ''} · ${filterLabel} · ${filteredSavings.length} registros`,
                MARGIN, MARGIN + 11
            );

            // Build table rows — include ALL filtered savings records
            const tableBody = filteredSavings.map((item, idx) => [
                String(idx + 1),
                item.date ? new Date(item.date).toLocaleDateString('es-CA') : 'N/A',
                `${item.month || '—'} ${item.year || ''}`.trim(),
                item.status || '—',
                item.banco || '—',
                item.numeroTransaccion || '—',
                `$${Number(item.valorAhorrado || item.amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`,
            ]);

            autoTable(pdf, {
                startY: MARGIN + 16,
                head: [['#', 'Fecha', 'Periodo', 'Estado', 'Banco', '# Transacción', 'Valor Ahorrado']],
                body: tableBody,
                margin: { left: MARGIN, right: MARGIN },
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
                    lineColor: [229, 231, 235], // gray-200
                    lineWidth: 0.3,
                    overflow: 'linebreak',
                },
                headStyles: {
                    fillColor: [79, 70, 229], // indigo-600
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'left',
                },
                alternateRowStyles: {
                    fillColor: [249, 250, 251], // gray-50
                },
                bodyStyles: {
                    textColor: [55, 65, 81], // gray-700
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },       // #
                    1: { cellWidth: 24 },                         // Fecha
                    2: { cellWidth: 22 },                         // Periodo
                    3: { cellWidth: 28, fontStyle: 'bold' },      // Estado
                    4: { cellWidth: 'auto' },                     // Banco
                    5: { cellWidth: 'auto' },                     // Transacción
                    6: { halign: 'right', fontStyle: 'bold', cellWidth: 30 }, // Valor
                },
                // Totals footer row
                foot: [[
                    '', '', '', '', '', 'Total:',
                    `$${Number(userStats.totalSavings).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`,
                ]],
                footStyles: {
                    fillColor: [238, 242, 255], // indigo-50
                    textColor: [55, 48, 163],   // indigo-800
                    fontStyle: 'bold',
                    fontSize: 9,
                },
                // Prevent rows from being split across pages
                rowPageBreak: 'avoid',
                // Page number in footer
                didDrawPage: (data) => {
                    const pageCount = pdf.internal.getNumberOfPages();
                    const currentPage = data.pageNumber;
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(7);
                    pdf.setTextColor(156, 163, 175); // gray-400
                    pdf.text(
                        `Credifuturo · Documento Confidencial · Pág. ${currentPage} de ${pageCount}`,
                        PAGE_W / 2,
                        PAGE_H - 5,
                        { align: 'center' }
                    );
                },
            });

            // ── STEP 6: Save the PDF ──────────────────────────────────────────
            const safeId = fullUserData.customerId || fullUserData.id || 'socio';
            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = `Resumen_Cuenta_${safeId}_${dateStr}.pdf`;
            pdf.save(fileName);

            toast.success(`PDF "${fileName}" generado y descargado exitosamente.`);

        } catch (error) {
            console.error('Error generando PDF:', error);
            // Provide a helpful message depending on the error type
            if (error.message?.includes('componente PDF')) {
                toast.error(error.message);
            } else if (error.message?.includes('canvas')) {
                toast.error('Error al capturar los gráficos. Asegúrate de que estén completamente cargados e intenta de nuevo.');
            } else {
                toast.error('Ocurrió un error inesperado al generar el PDF. Revisa la consola para más detalles.');
            }
        } finally {
            setIsGeneratingPdf(false);
            // Always reset chart images to avoid stale data
            setChartImages({ summaryChart: null, trendChart: null });
        }
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resSavings, resAportes, resProfile] = await Promise.all([
                api.get('/admin/my/savings'),
                api.get('/admin/my/initial-contributions'),
                api.get('/admin/my/profile')
            ]);

            if (resProfile.data) {
                setFullUserData(resProfile.data);
            }

            const mySavings = resSavings.data?.ok && Array.isArray(resSavings.data.data) ? resSavings.data.data : [];
            const myAportes = resAportes.data?.ok && Array.isArray(resAportes.data.data) ? resAportes.data.data : [];

            setRawSavings(mySavings);
            setRawAportes(myAportes);

            // Extract unique years
            const years = new Set();
            mySavings.forEach(s => s.year && years.add(String(s.year)));
            myAportes.forEach(a => a.year && years.add(String(a.year)));
            setAvailableYears(Array.from(years).sort((a, b) => b - a));

        } catch (err) {
            toast.error('Error al cargar datos del panel');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived Filtered Data
    const filteredSavings = React.useMemo(() => {
        if (selectedYear === 'Todos') return rawSavings;
        return rawSavings.filter(s => String(s.year) === selectedYear);
    }, [rawSavings, selectedYear]);

    const filteredAportes = React.useMemo(() => {
        if (selectedYear === 'Todos') return rawAportes;
        return rawAportes.filter(a => String(a.year) === selectedYear);
    }, [rawAportes, selectedYear]);

    // Calculate dynamic stats
    const userStats = React.useMemo(() => {
        const sumAmt = (arr) => arr.reduce((acc, s) => acc + parseFloat(s.amount || 0), 0);
        const sumSav = (arr) => arr.reduce((acc, s) => acc + parseFloat(s.valorAhorrado || s.amount || 0), 0);

        const totalSavings = sumSav(filteredSavings);
        const totalInitialContributions = sumAmt(filteredAportes);

        // Agregación dinámica por estados
        const statusMap = {};
        const processStatus = (arr) => arr.forEach(item => {
            const st = item.status || 'Sin Estado';
            const amt = parseFloat(item.amount || 0);
            statusMap[st] = (statusMap[st] || 0) + amt;
        });
        processStatus(filteredSavings);
        processStatus(filteredAportes);

        // Agregación de Tendencia Mensual (Enero - Diciembre)
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const monthlyTrend = monthNames.map((name, i) => ({ name, monto: 0, monthInt: i + 1 }));

        filteredSavings.forEach(s => {
            const mi = s.monthInt || (s.date ? new Date(s.date).getUTCMonth() + 1 : null);
            if (mi >= 1 && mi <= 12) {
                monthlyTrend[mi - 1].monto += parseFloat(s.amount || 0);
            }
        });

        return {
            totalSavings,
            totalInitialContributions,
            totalAhorradoGeneral: totalSavings + totalInitialContributions,
            monthlyTrend,
            statusMap
        };
    }, [filteredSavings, filteredAportes]);

    const cards = [
        {
            id: 'savings', title: 'Capital Ahorrado',
            value: loading ? '…' : fmt(userStats.totalSavings),
            description: 'Clic para ver detalle de ahorros',
            icon: PiggyBank, color: 'text-green-500', bgColor: 'bg-green-50', panel: 'savings'
        },
        {
            id: 'aportes', title: 'Total Aportes Iniciales',
            value: loading ? '…' : fmt(userStats.totalInitialContributions),
            description: 'Clic para ver detalle de aportes',
            icon: Database, color: 'text-amber-500', bgColor: 'bg-amber-50', panel: 'aportes'
        },
        {
            id: 'totalAhorrado', title: 'Total Ahorrado',
            value: loading ? '…' : fmt(userStats.totalAhorradoGeneral),
            description: 'Aportes Iniciales + Ahorro Mensual',
            icon: PiggyBank, color: 'text-emerald-600', bgColor: 'bg-emerald-50'
        },
    ];

    const statusCards = Object.keys(userStats.statusMap || {})
        .filter(stName => stName !== 'Activo') // Excluir estado "Activo" genérico
        .map(stName => {
            const value = userStats.statusMap[stName];

            // Estilos inteligentes por nombre de estado
            let style = { icon: AlertTriangle, color: 'text-slate-500', bgColor: 'bg-slate-50' };

            if (stName === 'Abono' || stName === 'Activo') {
                style = { icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50' };
            } else if (stName === 'Distribucion Intereses Ahorros Mensuales') {
                style = { icon: Landmark, color: 'text-amber-700', bgColor: 'bg-amber-50' };
            }

            return {
                title: stName,
                value: loading ? '…' : fmt(value),
                description: selectedYear === 'Todos' ? 'Histórico total' : `Año: ${selectedYear}`,
                ...style
            };
        }).sort((a, b) => b.title === 'Abono' ? 1 : -1);

    const renderDetail = () => {
        if (activeCard === 'savings') return <SavingsDetail data={filteredSavings} fullData={filteredSavings} loading={loading} />;
        if (activeCard === 'aportes') return <AportesDetail data={filteredAportes} loading={loading} />;
        return <DefaultDetail />;
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <h1 className="text-2xl font-bold text-brand-primary">Detalle de la Cuenta {!user?.name ? '' : `- ${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim()}</h1>
                    <span className="hidden sm:block text-brand-primary/30 text-2xl">|</span>
                    {(fullUserData || authUser).name ? (
                        <h2 className="text-2xl font-bold text-brand-primary">
                            Socio: {fullUserData
                                ? `${fullUserData.name} ${fullUserData.surname1 || ''} ${fullUserData.surname2 || ''}`.trim()
                                : authUser.name
                            }
                        </h2>
                    ) : (
                        <p className="text-gray-400 text-sm mt-1 sm:mt-0">
                            Selecciona una tarjeta para ver el detalle de movimientos.
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleGeneratePdf}
                        disabled={isGeneratingPdf}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-wait"
                        title="Descargar Resumen en PDF"
                    >
                        {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                        <span className="text-sm font-bold">{isGeneratingPdf ? 'Generando...' : 'PDF'}</span>
                    </button>

                    {/* Filtro de Año */}
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
                        <TrendingUp className="h-4 w-4 text-brand-primary opacity-60" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Año:</span>
                        <select
                            aria-label="Filtrar por año"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="text-sm font-bold text-brand-primary bg-transparent border-none focus:ring-0 cursor-pointer outline-none"
                        >
                            <option value="Todos">Todos los años</option>
                            {availableYears.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={fetchData}
                        className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-400 hover:text-brand-primary transition-colors shadow-sm"
                        title="Actualizar datos"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Permanent Chart Section (DUAL) */}
            {userStats.totalAhorradoGeneral > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full">
                    {/* BARRAS */}
                    <div ref={summaryChartRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 w-full flex flex-col">
                        <h2 className="text-lg font-bold text-brand-primary mb-2 flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" /> Evolución de Ahorros Consolidados
                        </h2>
                        <div className="w-full h-[220px]">
                            <AccountSummaryChart stats={userStats} />
                        </div>
                    </div>

                    {/* TENDENCIA MENSUAL */}
                    <div ref={trendChartRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 w-full flex flex-col">
                        <h2 className="text-lg font-bold text-brand-primary mb-2 flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" /> Evolución Mensual de Aportes
                        </h2>
                        <div className="w-full h-[220px]">
                            <MonthlySavingsTrendChart data={userStats.monthlyTrend} />
                        </div>
                    </div>
                </div>
            )}

            {/* Two-panel layout */}
            <div className="flex gap-5" style={{ minHeight: '580px' }}>
                {/* LEFT: Vertical cards */}
                <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: '640px' }}>
                    {cards.map(card => (
                        <VerticalStatCard
                            key={card.id || card.title}
                            title={card.title}
                            value={card.value}
                            description={card.description}
                            icon={card.icon}
                            color={card.color}
                            bgColor={card.bgColor}
                            active={activeCard === card.panel}
                            onClick={() => card.panel ? setActiveCard(activeCard === card.panel ? null : card.panel) : null}
                        />
                    ))}

                    <div className="mt-4 mb-2 flex items-center gap-2 px-1">
                        <div className="h-px bg-gray-100 flex-1" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Resumen Histórico del Socio</span>
                        <div className="h-px bg-gray-100 flex-1" />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {statusCards.map((card, i) => (
                            <VerticalStatCard
                                key={i}
                                title={card.title}
                                value={card.value}
                                icon={card.icon}
                                color={card.color}
                                bgColor={card.bgColor}
                                active={false}
                                onClick={null}
                            />
                        ))}
                    </div>
                </div>

                {/* RIGHT: Detail panel */}
                <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-y-auto" style={{ maxHeight: '640px' }}>
                    {renderDetail()}
                </div>
            </div>

            {/* Componente oculto para la generación del PDF */}
            {isGeneratingPdf && (
                <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
                    <AccountSummaryPDF
                        ref={pdfRef}
                        user={fullUserData}
                        stats={userStats}
                        savings={filteredSavings}
                        charts={chartImages}
                        generationDate={new Date()}
                    />
                </div>
            )}
        </div>
    );
};

export default UserAccountDetailsPage;
