import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../config/api';
import { notifyUpdate } from '../../utils/sync';
import {
    Search, RefreshCw, AlertTriangle, Inbox, Download,
    Edit, Trash2, DollarSign, Users, Hash, TrendingUp,
    ArrowUpRight, Filter, X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/excelUtils';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
    Tooltip, Cell, CartesianGrid
} from 'recharts';
import { useSortTable, SortIcon } from '../../utils/useSortTable';

// ─── Paleta corporativa ────────────────────────────────────────────────────────
const BRAND = {
    primary: '#166534',
    dark:    '#052e16',
    light:   '#84cc16',
    gold:    '#fbbf24',
    glass:   'rgba(22,101,52,0.08)',
};

// ─── Motion variants ───────────────────────────────────────────────────────────
const ease = [0.16, 1, 0.3, 1];

const fadeUp = (delay = 0) => ({
    hidden:  { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, delay, ease } },
});

const staggerList = {
    hidden:  {},
    visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const rowVariant = {
    hidden:  { opacity: 0, x: -8 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease } },
};

// ─── TABLE_COLUMNS ─────────────────────────────────────────────────────────────
const TABLE_COLUMNS = [
    { key: 'externalId',        label: 'ID',              align: 'center', minWidth: '70px',  mono: true },
    { key: 'clientCustomerId',  label: 'Cód. Socio',      align: 'center', minWidth: '90px',  mono: true },
    { key: 'clientName',        label: 'Nombre',          align: 'left',   minWidth: '120px' },
    { key: 'clientSurname',     label: 'Apellido',        align: 'left',   minWidth: '120px' },
    { key: 'status',            label: 'Estado',          align: 'center', minWidth: '100px', isStatusBadge: true },
    { key: 'date',              label: 'Fecha Pago',      align: 'center', minWidth: '110px', isDate: true },
    { key: 'year',              label: 'Año',             align: 'center', minWidth: '70px' },
    { key: 'month',             label: 'Mes',             align: 'center', minWidth: '90px' },
    { key: 'amount',            label: 'Valor',           align: 'right',  minWidth: '120px', isCurrency: true },
    { key: 'banco',             label: 'Banco',           align: 'left',   minWidth: '110px' },
    { key: 'numeroTransaccion', label: '# Transacción',   align: 'left',   minWidth: '130px', mono: true },
    { key: 'origen',            label: 'Cta. Origen',     align: 'left',   minWidth: '150px' },
    { key: 'actions',           label: '',                align: 'center', minWidth: '72px' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtCOP = (n, compact = false) => {
    const val = Number(n) || 0;
    if (compact) {
        if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
        if (val >= 1_000) return `$${Math.round(val / 1_000)}k`;
        return `$${val}`;
    }
    return `$${val.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
};

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ─── Sub-components ────────────────────────────────────────────────────────────
const StatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-300 text-xs">—</span>;
    const n = value.trim().toLowerCase();
    const ok = ['activo','active','pagado','vigente'].includes(n);
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide
            ${ok ? 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200' : 'text-gray-500 bg-gray-100 ring-1 ring-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-500 shadow-[0_0_5px_rgba(34,197,94,0.7)]' : 'bg-gray-400'}`} />
            {value}
        </span>
    );
};

const CellValue = ({ col, value, item, onDelete }) => {
    if (col.key === 'actions') return (
        <div className="flex justify-center items-center gap-1">
            <Link to={`/admin/initial-contributions/edit/${item.id}`}
                className="p-1.5 rounded-lg text-brand-primary/60 hover:text-brand-primary hover:bg-brand-primary/10 transition-all duration-150">
                <Edit className="h-3.5 w-3.5" />
            </Link>
            <button onClick={() => onDelete(item.id)}
                className="p-1.5 rounded-lg text-red-400/60 hover:text-red-600 hover:bg-red-50 transition-all duration-150">
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );
    if (col.isDate) return <span className="text-gray-500 text-xs tabular-nums">{formatDate(value)}</span>;
    if (col.isStatusBadge) return <StatusBadge value={value} />;
    if (value === null || value === undefined || value === '') return <span className="text-gray-200">—</span>;
    if (col.isCurrency) {
        const n = parseFloat(value);
        return <span className="font-bold text-gray-900 tabular-nums text-sm">{fmtCOP(n)}</span>;
    }
    if (col.mono) return <span className="text-[11px] font-mono font-semibold text-gray-700">{value}</span>;
    return <span className="text-gray-700 text-sm">{value}</span>;
};

// ─── Skeleton ──────────────────────────────────────────────────────────────────
const Skeleton = ({ className }) => (
    <div className={`rounded-xl bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 bg-[length:200%_100%] animate-[shimmer_1.4s_ease-in-out_infinite] ${className}`} />
);

// ─── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, sub, icon: Icon, gradient, delay }) => (
    <motion.div
        variants={fadeUp(delay)}
        initial="hidden" animate="visible"
        whileHover={{ y: -4, boxShadow: '0 20px 40px -12px rgba(22,101,52,0.18)' }}
        className="relative bg-white rounded-2xl border border-gray-100 p-6 overflow-hidden cursor-default transition-shadow duration-300 group">

        {/* Gradient blob */}
        <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-15 transition-opacity duration-300 group-hover:opacity-25"
            style={{ background: gradient }} />

        {/* Accent line top */}
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
            style={{ background: gradient }} />

        <div className="flex items-start justify-between mb-4 relative">
            <div className="p-2.5 rounded-xl" style={{ background: `${gradient}20` }}>
                <Icon className="h-5 w-5" style={{ color: BRAND.primary }} />
            </div>
        </div>

        <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-1">{title}</p>
            <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
        </div>
    </motion.div>
);

// ─── Custom Bar Tooltip ────────────────────────────────────────────────────────
const BarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white/95 backdrop-blur-sm border border-green-100 shadow-2xl shadow-green-900/10 rounded-xl px-4 py-3 pointer-events-none">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
            <p className="text-base font-black tabular-nums" style={{ color: BRAND.primary }}>{fmtCOP(payload[0].value)}</p>
        </div>
    );
};

// ─── Main ──────────────────────────────────────────────────────────────────────
const InitialContributionsListPage = () => {
    const { toast } = useUi();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [yearFilter, setYearFilter] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await api.get('/admin/savings/list?type=Aporte Inicial');
            if (res.data?.ok) setData(res.data.data);
            else throw new Error(res.data?.error || 'Respuesta inesperada');
        } catch (e) {
            setError(e.message); setData([]);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const years = useMemo(() => [...new Set(data.map(d => d.year).filter(Boolean))].sort((a,b) => b - a), [data]);

    const filtered = useMemo(() => {
        let d = data;
        if (yearFilter) d = d.filter(i => String(i.year) === String(yearFilter));
        if (search.trim()) {
            const t = search.toLowerCase();
            d = d.filter(i =>
                i.externalId?.toLowerCase().includes(t) ||
                i.clientName?.toLowerCase().includes(t) ||
                i.clientCustomerId?.toLowerCase().includes(t) ||
                i.banco?.toLowerCase().includes(t) ||
                i.numeroTransaccion?.toLowerCase().includes(t)
            );
        }
        return d;
    }, [data, search, yearFilter]);

    const active = useMemo(() => filtered.filter(i => {
        if (!i.status) return false;
        return ['activo','active','pagado','vigente'].includes(i.status.trim().toLowerCase());
    }), [filtered]);

    const stats = useMemo(() => {
        const totalAmount = active.reduce((a, c) => a + parseFloat(c.amount || 0), 0);
        const uniqueClients = new Set(active.map(i => i.clientCustomerId).filter(Boolean)).size;
        const yearMap = {};
        active.forEach(i => {
            const yr = parseInt(i.year);
            if (!isNaN(yr)) yearMap[yr] = (yearMap[yr] || 0) + parseFloat(i.amount || 0);
        });
        const chartData = Object.entries(yearMap)
            .sort(([a],[b]) => +a - +b)
            .map(([yr, val]) => ({ yr, val }));
        return { totalAmount, uniqueClients, count: active.length, chartData };
    }, [active]);

    const { sortedData, sortConfig, handleSort } = useSortTable(filtered);

    const handleDelete = async (id) => {
        if (!window.confirm('¿Eliminar este aporte? No se puede deshacer.')) return;
        try {
            await api.delete(`/admin/savings/${id}`);
            toast.success('Aporte eliminado');
            notifyUpdate('savings');
            fetchData();
        } catch (e) { toast.error('Error: ' + (e.response?.data?.error || e.message)); }
    };

    const handleExport = () => {
        if (!filtered.length) { toast.error('Sin datos para exportar.'); return; }
        const ws = XLSX.utils.json_to_sheet(filtered.map(s => ({
            'ID': s.externalId, 'Cód. Socio': s.clientCustomerId,
            'Nombre': s.clientName, 'Apellido': s.clientSurname,
            'Estado': s.status, 'Fecha': formatDate(s.date),
            'Año': s.year, 'Mes': s.month, 'Valor ($)': s.amount,
            'Banco': s.banco, '# Transacción': s.numeroTransaccion, 'Origen': s.origen
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Aportes Iniciales');
        XLSX.writeFile(wb, `Aportes_Iniciales_${new Date().toISOString().slice(0,10)}.xlsx`);
        toast.success('Exportado correctamente');
    };

    // ── Loading state ──────────────────────────────────────────────────────────
    if (loading) return (
        <div className="space-y-6 p-1">
            {/* Hero skeleton */}
            <div className="rounded-2xl border border-gray-100 p-7 space-y-3"
                style={{ background: `linear-gradient(135deg, ${BRAND.dark} 0%, ${BRAND.primary} 100%)` }}>
                <Skeleton className="h-5 w-48 opacity-30" />
                <Skeleton className="h-8 w-72 opacity-20" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                {[0,1,2].map(i => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                        <Skeleton className="h-10 w-10 rounded-xl" />
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-7 w-32" />
                    </div>
                ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {[...Array(7)].map((_,i) => (
                    <div key={i} className={`flex items-center gap-4 px-6 py-3.5 ${i%2===0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <Skeleton className="h-3.5 w-12" />
                        <Skeleton className="h-3.5 flex-1" />
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-3.5 w-24" />
                    </div>
                ))}
            </div>
        </div>
    );

    // ── Error state ────────────────────────────────────────────────────────────
    if (error) return (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-red-400" />
            </div>
            <div className="text-center">
                <h3 className="font-bold text-gray-900">No se pudo cargar la información</h3>
                <p className="text-sm text-gray-400 mt-1 max-w-sm">{error}</p>
            </div>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={fetchData}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.dark})` }}>
                <RefreshCw className="h-4 w-4" /> Reintentar
            </motion.button>
        </motion.div>
    );

    // ── Main ───────────────────────────────────────────────────────────────────
    const BAR_COLORS = [BRAND.light, BRAND.primary, BRAND.dark, BRAND.gold, '#10b981'];

    return (
        <div className="space-y-6">

            {/* ══════════════════════════════════════════════════════
                HERO BANNER
            ══════════════════════════════════════════════════════ */}
            <motion.div variants={fadeUp(0)} initial="hidden" animate="visible"
                className="relative overflow-hidden rounded-2xl p-7 text-white"
                style={{ background: `linear-gradient(135deg, ${BRAND.dark} 0%, ${BRAND.primary} 60%, #1a7a3f 100%)` }}>

                {/* Decorative blobs */}
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl"
                    style={{ background: BRAND.light, transform: 'translate(40%, -40%)' }} />
                <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10 blur-2xl"
                    style={{ background: BRAND.gold, transform: 'translate(-30%, 40%)' }} />

                <div className="relative flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-green-300/80">
                                Credifuturo · Finanzas
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Aportes Iniciales</h1>
                        <p className="text-white/60 text-sm mt-1">
                            {stats.count} registros activos ·{' '}
                            <span className="text-green-300 font-semibold">{fmtCOP(stats.totalAmount)} en total</span>
                        </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-colors">
                            <Download className="h-4 w-4" /> Exportar
                        </motion.button>
                        <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}
                            onClick={fetchData}
                            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-colors">
                            <RefreshCw className="h-4 w-4" />
                        </motion.button>
                    </div>
                </div>

                {/* Mini stats bar */}
                <div className="relative mt-5 flex items-center gap-6 flex-wrap">
                    {[
                        { label: 'Socios únicos', val: stats.uniqueClients },
                        { label: 'Registros filtrados', val: filtered.length },
                        { label: 'Años con actividad', val: years.length },
                    ].map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className="text-lg font-black tabular-nums">{s.val}</span>
                            <span className="text-white/50 text-xs">{s.label}</span>
                            {i < 2 && <span className="text-white/20 text-xs">·</span>}
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* ══════════════════════════════════════════════════════
                STAT CARDS
            ══════════════════════════════════════════════════════ */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatCard delay={0.05} title="Total Aportes" value={fmtCOP(stats.totalAmount)}
                    sub="Suma de registros activos"
                    icon={DollarSign} gradient={`linear-gradient(135deg, ${BRAND.primary}, ${BRAND.light})`} />
                <StatCard delay={0.12} title="Socios" value={stats.uniqueClients}
                    sub="Con aportes registrados"
                    icon={Users} gradient={`linear-gradient(135deg, ${BRAND.gold}, #f97316)`} />
                <StatCard delay={0.19} title="Transacciones" value={stats.count}
                    sub="Aportes activos totales"
                    icon={Hash} gradient={`linear-gradient(135deg, #1e40af, #06b6d4)`} />
            </div>

            {/* ══════════════════════════════════════════════════════
                CHART
            ══════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {stats.chartData?.length > 0 && (
                    <motion.div variants={fadeUp(0.22)} initial="hidden" animate="visible"
                        className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        {/* Chart header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-50">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Evolución histórica</p>
                                <h3 className="font-bold text-gray-900 mt-0.5">Aportes por Año</h3>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                                style={{ background: `${BRAND.primary}12`, color: BRAND.primary }}>
                                <TrendingUp className="h-3.5 w-3.5" />
                                Solo activos
                            </div>
                        </div>

                        <div className="px-6 pb-6 pt-4" style={{ height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.chartData} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}
                                    barCategoryGap="35%">
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="yr" axisLine={false} tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }} />
                                    <YAxis axisLine={false} tickLine={false}
                                        tick={{ fill: '#d1d5db', fontSize: 10 }}
                                        tickFormatter={v => fmtCOP(v, true)} />
                                    <Tooltip content={<BarTooltip />} cursor={{ fill: '#f0fdf4', radius: 6 }} />
                                    <Bar dataKey="val" radius={[8, 8, 0, 0]}>
                                        {stats.chartData.map((_, i) => (
                                            <Cell key={i}
                                                fill={BAR_COLORS[i % BAR_COLORS.length]}
                                                opacity={0.9} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════════════════════════════════════════════════════
                FILTERS + SEARCH
            ══════════════════════════════════════════════════════ */}
            <motion.div variants={fadeUp(0.26)} initial="hidden" animate="visible"
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">

                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, ID, banco..."
                        aria-label="Buscar aporte inicial"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-sm
                                   text-gray-800 placeholder:text-gray-300 outline-none
                                   focus:bg-white focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/10
                                   transition-all duration-200"
                    />
                    {search && (
                        <button onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* Year filter */}
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                        className="py-2.5 px-3 bg-gray-50/80 border border-gray-200 rounded-xl text-sm text-gray-700 font-medium
                                   outline-none focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/10 transition-all">
                        <option value="">Todos los años</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                {/* Results badge */}
                <AnimatePresence>
                    {(search || yearFilter) && (
                        <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                            className="text-xs font-semibold text-brand-primary bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
                            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* ══════════════════════════════════════════════════════
                TABLE
            ══════════════════════════════════════════════════════ */}
            <AnimatePresence mode="wait">
                {filtered.length === 0 ? (
                    <motion.div key="empty"
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex flex-col items-center gap-4 py-20 bg-white rounded-2xl border border-gray-100">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                            style={{ background: `${BRAND.primary}10` }}>
                            <Inbox className="h-7 w-7" style={{ color: BRAND.primary }} />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-gray-700">Sin resultados</p>
                            <p className="text-sm text-gray-400 mt-0.5">Prueba con otro término de búsqueda o filtra por año</p>
                        </div>
                        {(search || yearFilter) && (
                            <button onClick={() => { setSearch(''); setYearFilter(''); }}
                                className="text-sm font-semibold text-brand-primary hover:underline">
                                Limpiar filtros
                            </button>
                        )}
                    </motion.div>
                ) : (
                    <motion.div key="table"
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">

                        {/* Table container */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                                <thead>
                                    <tr>
                                        {TABLE_COLUMNS.map((col) => (
                                            <th key={col.key}
                                                onClick={() => handleSort(col.key)}
                                                style={{ textAlign: col.align, minWidth: col.minWidth }}
                                                className="px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.1em]
                                                           text-gray-400 bg-gray-50/70 border-b border-gray-100
                                                           cursor-pointer select-none hover:text-brand-primary transition-colors first:pl-6 last:pr-6">
                                                <span className="inline-flex items-center gap-1">
                                                    {col.label}
                                                    {col.label && <SortIcon colKey={col.key} sortConfig={sortConfig} />}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <motion.tbody variants={staggerList} initial="hidden" animate="visible">
                                    {sortedData.map((item, idx) => (
                                        <motion.tr key={item.id} variants={rowVariant}
                                            className={`border-b border-gray-50 last:border-0 transition-colors duration-100 group
                                                ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                                                hover:bg-green-50/40`}>
                                            {TABLE_COLUMNS.map(col => (
                                                <td key={col.key}
                                                    style={{ textAlign: col.align, minWidth: col.minWidth }}
                                                    className="px-4 py-3 first:pl-6 last:pr-6">
                                                    <CellValue col={col} value={item[col.key]} item={item} onDelete={handleDelete} />
                                                </td>
                                            ))}
                                        </motion.tr>
                                    ))}
                                </motion.tbody>
                            </table>
                        </div>

                        {/* Table footer */}
                        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-50 bg-gray-50/40">
                            <p className="text-[11px] text-gray-400 font-medium">
                                Mostrando <span className="font-bold text-gray-700">{sortedData.length}</span> registros
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-gray-400">Total activos:</span>
                                <span className="text-sm font-black tabular-nums" style={{ color: BRAND.primary }}>
                                    {fmtCOP(stats.totalAmount)}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default InitialContributionsListPage;
