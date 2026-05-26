import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../config/api';
import {
    Users, DollarSign, PiggyBank, BarChart3, CheckCircle, CreditCard,
    AlertTriangle, Database, TrendingUp, Landmark, Activity,
    ChevronRight, ArrowUpRight, Loader2, RefreshCw, X, Search,
    Clock, ShieldAlert, Trophy, Download, Calendar, ChevronDown, Maximize2
} from 'lucide-react';
import ChartExpandModal, { analyzeMonthlyTrend, analyzeSavingsComposition } from '../../components/ChartExpandModal';
import { useUi } from '../../context/UiContext';
import LoanCapacityWidget from '../../components/admin/LoanCapacityWidget';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, Cell, AreaChart, Area, LabelList, ReferenceLine,
    PieChart, Pie
} from 'recharts';
import { useLocation } from 'react-router-dom';
const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ─── Shared Components ───────────────────────────────────────────────────────

const VerticalStatCard = ({ title, value, description, icon: Icon, color, bgColor, active, onClick }) => {
    const isNubank = title === 'Total Ahorrado';
    return (
    <button
        onClick={onClick}
        className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-200 group flex items-center gap-4 print:break-inside-avoid
            ${isNubank
                ? `bg-gradient-to-r from-[#F4EDFC] to-[#F9F6FE] border-purple-100/50 hover:border-purple-200 hover:shadow-md hover:shadow-purple-500/5 ${active ? 'ring-2 ring-offset-2 ring-[#8A05BE]/40' : ''}`
                : active
                ? 'border-brand-primary bg-brand-primary/5 shadow-md shadow-brand-primary/10'
                : 'border-gray-100 bg-white hover:border-brand-primary/30 hover:shadow-sm hover:bg-gray-50/80 border-2'
            }`}
    >
        <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors
            ${isNubank ? 'bg-white shadow-sm' : active ? 'bg-brand-primary/15' : bgColor || 'bg-gray-100'}`}>
            <Icon className={`h-5 w-5 ${isNubank ? 'text-[#8A05BE]' : active ? 'text-brand-primary' : color}`} />
        </div>
        <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${isNubank ? 'text-slate-500' : active ? 'text-brand-primary' : 'text-gray-400'}`}>
                {title}
            </p>
            <p className={`text-lg font-bold tabular-nums truncate leading-tight ${isNubank ? 'text-slate-900 tracking-tight' : active ? 'text-brand-primary' : 'text-gray-800'}`}>
                {value}
            </p>
            {description && (
                <p className={`text-[11px] mt-0.5 truncate ${isNubank ? 'text-slate-400' : active ? 'text-brand-primary/70' : 'text-gray-400'}`}>
                    {description}
                </p>
            )}
        </div>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-all duration-200
            ${isNubank ? 'text-purple-300 group-hover:text-[#8A05BE] translate-x-0.5' : active ? 'text-brand-primary translate-x-0.5' : 'text-gray-200 group-hover:text-brand-primary/50'}`}
        />
    </button>
)};

const PillSelect = ({ icon: Icon, value, onChange, options, width = 'w-44' }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const isActive = value && value !== 'Todos' && value !== '';
    const selected = options.find(o => o.value === value);

    return (
        <div className={`relative ${width}`} ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${isActive ? 'bg-brand-primary/10 border-brand-primary/40' : 'bg-emerald-50 border-emerald-200'}`}
            >
                <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-brand-primary' : 'text-emerald-600'}`} />
                <span className={`flex-1 text-sm font-semibold truncate ${isActive ? 'text-gray-800' : 'text-gray-500'}`}>
                    {selected?.label || options[0]?.label}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[60] overflow-hidden">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm border-b border-gray-50 last:border-0 transition-colors ${opt.value === value ? 'bg-brand-primary/10 text-brand-primary font-bold' : 'text-gray-700 hover:bg-gray-50 font-medium'}`}
                        >
                            {opt.label}
                            {opt.value === value && <CheckCircle className="h-3.5 w-3.5 text-brand-primary flex-shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const SocioSelect = ({ clients, selectedSocio, onSelect }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = clients
        .filter(c => c.estatus === 'Activo')
        .filter(c => {
            const full = `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''} ${c.cedula || ''} ${c.customerId || ''}`.toLowerCase();
            return full.includes(search.toLowerCase());
        });

    const label = selectedSocio
        ? `${selectedSocio.name} ${selectedSocio.surname1} ${selectedSocio.surname2 || ''}`.trim()
        : 'Socio: Seleccionar...';

    return (
        <div className="relative w-full" ref={ref}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => { setOpen(o => !o); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-left ${selectedSocio ? 'bg-brand-primary/10 border-brand-primary/40' : 'bg-emerald-50 border-emerald-200'}`}
            >
                <Users className={`h-4 w-4 flex-shrink-0 ${selectedSocio ? 'text-brand-primary' : 'text-emerald-600'}`} />
                <span className={`flex-1 text-sm font-semibold truncate ${selectedSocio ? 'text-gray-800' : 'text-gray-500'}`}>{label}</span>
                {selectedSocio && (
                    <span className="text-[10px] font-bold text-brand-primary/70 bg-brand-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {selectedSocio.customerId || selectedSocio.cedula}
                    </span>
                )}
                <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[60] overflow-hidden">
                    {/* Buscador */}
                    <div className="p-3 border-b border-gray-100">
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                            <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Buscar por nombre o cédula..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Lista */}
                    <div className="max-h-64 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-6">Sin resultados</p>
                        ) : filtered.map(c => {
                            const fullName = `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.trim();
                            const isSelected = selectedSocio?.id === c.id;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { onSelect(c); setOpen(false); setSearch(''); }}
                                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0 ${isSelected ? 'bg-brand-primary/8' : 'hover:bg-gray-50'}`}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${isSelected ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                                        {(c.name || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-bold truncate ${isSelected ? 'text-brand-primary' : 'text-gray-800'}`}>{fullName}</p>
                                        <p className="text-[10px] text-gray-400 font-mono">{c.customerId || ''}{c.cedula ? ` · C.C. ${c.cedula}` : ''}</p>
                                    </div>
                                    {isSelected && <CheckCircle className="h-4 w-4 text-brand-primary flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer con conteo */}
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 font-semibold">{filtered.length} socio{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const fmtCur = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? '—' : `$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtVal = (v) => (v === null || v === undefined || v === '') ? <span className="text-gray-300 text-xs italic">—</span> : v;

const SAVINGS_COLS = [
    { key: 'externalId',         label: 'Id_VM',                  minW: 100 },
    { key: 'status',             label: 'Estado',                 minW: 110 },
    { key: 'date',               label: 'Fecha Pago',             minW: 120 },
    { key: 'year',               label: 'Año pago',               minW: 80  },
    { key: 'month',              label: 'Mes pago',               minW: 110 },
    { key: 'penalizacion',       label: 'Penalización',           minW: 110 },
    { key: 'diasPenalizacion',   label: 'Días Penalización',      minW: 110 },
    { key: 'amount',             label: 'Valor Mensual',          minW: 130, isCur: true },
    { key: 'valorAPenalizar',    label: 'Valor a Penalizar',      minW: 130, isCur: true },
    { key: 'valorAhorrado',      label: 'Valor Ahorrado',         minW: 130, isCur: true },
    { key: 'banco',              label: 'Banco',                  minW: 140 },
    { key: 'numeroTransaccion',  label: '# Transacción',          minW: 140 },
    { key: 'origen',             label: 'Desde Cuenta Ahorros',   minW: 180 },
    { key: 'type',               label: 'Tipo de Ahorro',         minW: 130 },
    { key: 'observaciones',      label: 'Observaciones',          minW: 200 },
    { key: 'soporte',            label: 'Soporte',                minW: 100 },
];

const APORTES_COLS = [
    { key: 'externalId',        label: 'Id_AI',                  minW: 80  },
    { key: 'clientCustomerId',  label: 'Customer_id',            minW: 100 },
    { key: 'clientName',        label: 'Nombre',                 minW: 120 },
    { key: 'clientSurname',     label: 'Apellido',               minW: 120 },
    { key: 'status',            label: 'Estado',                 minW: 100 },
    { key: 'date',              label: 'Fecha Pago',             minW: 110 },
    { key: 'year',              label: 'Año',                    minW: 80  },
    { key: 'month',             label: 'Mes',                    minW: 100 },
    { key: 'amount',            label: 'Valor',                  minW: 120, isCur: true },
    { key: 'itemQuantity',      label: 'Item_Quantity',          minW: 100 },
    { key: 'banco',             label: 'Banco',                  minW: 120 },
    { key: 'numeroTransaccion', label: '# Transacción',          minW: 130 },
    { key: 'origen',            label: 'Desde Cuenta de Ahorros', minW: 180 },
];

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
                        {data.map((row, i) => {
                            let rowClass = 'transition-colors hover:bg-brand-primary/5';
                            if (row.status === 'Distribucion Intereses Ahorros Mensuales') rowClass = 'transition-colors bg-brand-primary/10 hover:bg-brand-primary/20';
                            else if (row.status === 'Descuento Total Anual Penalizacion') rowClass = 'transition-colors bg-amber-100 hover:bg-amber-200';
                            else if (row.status?.trim() === 'Devolucion Total Intereses Ahorros Mensuales' || row.status?.includes('Devolucion Total Intereses')) rowClass = 'transition-colors bg-purple-100 hover:bg-purple-200';
                            
                            return (
                            <tr key={row.id || i} className={rowClass}>
                                {columns.map(col => (
                                    <td key={col.key} style={{ minWidth: col.minW }} className="px-4 py-2.5 whitespace-nowrap border-r border-gray-50 last:border-r-0">
                                        {col.isCur ? <span className="font-semibold text-gray-800 tabular-nums">{fmtCur(row[col.key])}</span> :
                                         col.key === 'soporte' ? (
                                             row.soporte ? (
                                                 <a href={`${api.defaults.baseURL}/admin/savings/${row.id}/soporte`} target="_blank" rel="noreferrer" title={`Descargar soporte`} className="inline-flex items-center gap-1 text-brand-primary hover:text-brand-dark transition-colors font-medium tooltip-trigger">
                                                     <Download className="h-4 w-4" /> Ver
                                                 </a>
                                             ) : <span className="text-gray-300 italic text-xs">—</span>
                                         ) :
                                         col.key === 'externalId' || col.key === 'clientCustomerId' ? <span className="font-semibold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">{fmtVal(row[col.key])}</span> :
                                         col.key === 'status' ? <span className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wide ${row[col.key] === 'Abono' ? 'bg-emerald-100 text-emerald-800' : row[col.key] === 'Distribucion Intereses Ahorros Mensuales' ? 'bg-brand-primary/20 text-brand-dark' : row[col.key] === 'Descuento Total Anual Penalizacion' ? 'bg-amber-200 text-amber-900' : (row[col.key]?.trim() === 'Devolucion Total Intereses Ahorros Mensuales' || row[col.key]?.includes('Devolucion Total Intereses')) ? 'bg-purple-200 text-purple-900' : 'bg-amber-100 text-amber-800'}`}>{row[col.key] || '—'}</span> :
                                         <span className="text-gray-600">{fmtVal(row[col.key])}</span>}
                                    </td>
                                ))}
                            </tr>
                            );
                        })}
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

const RankingModal = ({ onClose }) => {
    const [ranking, setRanking] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const fetchRanking = async () => {
            try {
                const res = await api.get('/admin/savings/ranking');
                if (res.data.ok && Array.isArray(res.data.data)) setRanking(res.data.data);
            } catch (err) {
                console.error('Error fetching ranking:', err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchRanking();
    }, []);

    const AVATAR_COLORS = [
        'from-amber-400 to-yellow-600',
        'from-slate-400 to-slate-600',
        'from-amber-700 to-orange-900',
        'from-green-500 to-emerald-700',
        'from-sky-400 to-blue-600',
        'from-violet-500 to-purple-700',
        'from-pink-400 to-rose-600',
        'from-orange-400 to-orange-600',
        'from-teal-400 to-teal-600',
        'from-slate-500 to-slate-700',
    ];
    const BAR_COLORS = [
        'from-amber-400 to-yellow-500',
        'from-slate-400 to-slate-500',
        'from-orange-600 to-amber-700',
        'from-green-500 to-emerald-400',
        'from-sky-500 to-blue-400',
        'from-violet-500 to-purple-400',
        'from-pink-500 to-rose-400',
        'from-orange-400 to-orange-300',
        'from-teal-500 to-teal-300',
        'from-gray-400 to-gray-300',
    ];
    const MEDALS = ['🥇', '🥈', '🥉'];

    const getInitials = (name) => name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
    const fmt = (v) => `$${Number(v).toLocaleString('es-CO')}`;

    const total = ranking.reduce((sum, r) => sum + Number(r.totalNetSavings), 0);

    const maxVal = ranking.length > 0 ? Number(ranking[0].totalNetSavings) : 1;

    const filtered = search
        ? ranking.filter(r => r.fullName.toLowerCase().includes(search.toLowerCase()))
        : ranking;

    const top3 = ranking.slice(0, 3);
    const midEnd = Math.min(Math.max(3, Math.ceil(ranking.length * 0.6)), ranking.length);
    const middleGroup = ranking.slice(3, midEnd);
    const baseGroup = ranking.slice(midEnd);

    const brechaTop = top3.length > 0 && middleGroup.length > 0
        ? Math.round((1 - Number(middleGroup[0].totalNetSavings) / Number(top3[top3.length - 1].totalNetSavings)) * 100)
        : 0;
    const brechaBase = middleGroup.length > 0 && baseGroup.length > 0
        ? Math.round((1 - Number(baseGroup[0].totalNetSavings) / Number(middleGroup[middleGroup.length - 1].totalNetSavings)) * 100)
        : 0;

    const renderRow = (entry, globalIndex) => {
        const pos = globalIndex + 1;
        const pct = total > 0 ? ((Number(entry.totalNetSavings) / total) * 100).toFixed(1) : '0.0';
        const barWidth = maxVal > 0 ? Math.round((Number(entry.totalNetSavings) / maxVal) * 100) : 0;
        const avatarColor = AVATAR_COLORS[globalIndex] || AVATAR_COLORS[AVATAR_COLORS.length - 1];
        const barColor = BAR_COLORS[globalIndex] || BAR_COLORS[BAR_COLORS.length - 1];

        const posEl = pos <= 3
            ? <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0 ${['bg-amber-100','bg-slate-100','bg-orange-100'][pos-1]}`}>{MEDALS[pos-1]}</div>
            : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">{pos}</div>;

        return (
            <div key={entry.customerId} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-gray-50 ${pos <= 3 ? 'bg-green-50/60' : ''}`}>
                {posEl}
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0 shadow-sm`}>
                    {getInitials(entry.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-gray-800 leading-tight">{entry.fullName}</div>
                    <div className="text-xs text-gray-400 font-semibold">{entry.customerId}</div>
                </div>
                <div className="w-24 flex-shrink-0">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${barColor} rounded-full`} style={{ width: `${barWidth}%` }} />
                    </div>
                </div>
                <div className="text-right flex-shrink-0 w-28">
                    <div className="text-sm font-black text-gray-900">{fmt(entry.totalNetSavings)}</div>
                    <div className="text-xs text-gray-400 font-semibold">{pct}% del total</div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-brand-dark/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">

                {/* Header */}
                <div className="px-7 py-5 bg-gradient-to-r from-green-900 via-green-700 to-green-500 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center text-2xl">🏆</div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight">Ranking de Ahorro Mensual</h2>
                            <p className="text-white/65 text-xs font-semibold mt-0.5 uppercase tracking-wider">Consolidado · Excluye aportes iniciales</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="h-5 w-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-24">
                            <Loader2 className="h-12 w-12 animate-spin text-brand-primary/20" />
                            <p className="text-gray-400 font-bold animate-pulse uppercase tracking-widest text-xs">Calculando Posiciones...</p>
                        </div>
                    ) : ranking.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-24 text-gray-400 font-bold uppercase tracking-widest">
                            <Users className="h-16 w-16 opacity-20" />
                            No hay datos suficientes para el ranking
                        </div>
                    ) : (
                        <div className="p-6 flex flex-col gap-4">

                            {/* KPI Cards — 2 tarjetas + análisis comportamiento */}
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { icon: '👥', label: 'Socios activos', value: ranking.length, sub: 'con ahorro registrado', bg: 'bg-green-50' },
                                    { icon: '💰', label: 'Total acumulado', value: fmt(total), sub: 'fondo total ahorros', bg: 'bg-blue-50' },
                                ].map(kpi => (
                                    <div key={kpi.label} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                                        <div className={`w-10 h-10 ${kpi.bg} rounded-xl flex items-center justify-center text-lg flex-shrink-0`}>{kpi.icon}</div>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{kpi.label}</div>
                                            <div className="text-base font-black text-gray-900 leading-tight truncate">{kpi.value}</div>
                                            <div className="text-[10px] text-gray-400">{kpi.sub}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Panel de análisis profundo */}
                            {(() => {
                                const now = new Date();
                                const curY = now.getFullYear();
                                const curM = now.getMonth() + 1;

                                const getMomentum = (months) => {
                                    if (!months?.length) return 0;
                                    const recent = months.slice(-6).reduce((s, m) => s + m.amount, 0);
                                    const prev   = months.slice(-12, -6).reduce((s, m) => s + m.amount, 0);
                                    return prev > 0 ? Math.round(((recent - prev) / prev) * 100) : 0;
                                };

                                const hasAnalysis = ranking.some(r => r.monthlyData?.length > 0);

                                // Highlights
                                const bestMomentum = [...ranking].sort((a,b) => getMomentum(b.monthlyData) - getMomentum(a.monthlyData))[0];
                                const momentumVal  = bestMomentum ? getMomentum(bestMomentum.monthlyData) : 0;

                                // Comparativo año anterior vs año actual (mismo período ene–mes actual)
                                const prevYear = curY - 1;
                                const yearComparison = ranking.map(r => {
                                    const thisYearTotal = r.monthlyData?.filter(m => m.year === curY  && m.monthInt <= curM).reduce((s, m) => s + m.amount, 0) || 0;
                                    const lastYearTotal = r.monthlyData?.filter(m => m.year === prevYear && m.monthInt <= curM).reduce((s, m) => s + m.amount, 0) || 0;
                                    if (lastYearTotal === 0 && thisYearTotal === 0) return null;
                                    const diff = thisYearTotal - lastYearTotal;
                                    const pct  = lastYearTotal > 0 ? Math.round((diff / lastYearTotal) * 100) : 100;
                                    return { ...r, thisYearTotal, lastYearTotal, diff, pct };
                                }).filter(Boolean);
                                const decliners = yearComparison.filter(r => r.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 2);
                                const risers    = yearComparison.filter(r => r.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 2);
                                // Campeón del mes: mayor aporte en el mes más reciente (actual o anterior)
                                const lastM = curM === 1 ? 12 : curM - 1;
                                const lastY = curM === 1 ? curY - 1 : curY;
                                const championData = ranking.map(r => {
                                    const cur  = r.monthlyData?.find(m => m.year === curY && m.monthInt === curM);
                                    const prev = r.monthlyData?.find(m => m.year === lastY && m.monthInt === lastM);
                                    const amt  = cur?.amount || prev?.amount || 0;
                                    const period = cur  ? `${monthNames[curM - 1]} ${curY}`
                                                 : prev ? `${monthNames[lastM - 1]} ${lastY}` : null;
                                    return { ...r, champAmt: amt, champPeriod: period };
                                }).filter(r => r.champAmt > 0).sort((a, b) => b.champAmt - a.champAmt);
                                const monthChampion = championData[0];

                                // Mayor esfuerzo: mayor incremento absoluto (pesos) promedio mensual en últimos 3 vs anteriores 3
                                const getEffort = (months) => {
                                    if (!months?.length) return 0;
                                    const recentAvg = months.slice(-3).reduce((s, m) => s + m.amount, 0) / Math.max(1, Math.min(3, months.slice(-3).length));
                                    const prevAvg   = months.slice(-6, -3).reduce((s, m) => s + m.amount, 0) / Math.max(1, Math.min(3, months.slice(-6, -3).length));
                                    return Math.round(recentAvg - prevAvg);
                                };
                                const biggestEffort = [...ranking]
                                    .map(r => ({ ...r, effort: getEffort(r.monthlyData) }))
                                    .filter(r => r.effort > 0)
                                    .sort((a, b) => b.effort - a.effort)[0];

                                // Concentración del fondo


                                return (
                                    <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                            🧠 Análisis de comportamiento
                                            <div className="flex-1 h-px bg-gray-100" />
                                        </div>

                                        {!hasAnalysis && (
                                            <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-amber-700">
                                                <span className="text-base flex-shrink-0">⚠️</span>
                                                Reinicia el servidor backend para activar el análisis mensual por socio.
                                            </div>
                                        )}

                                        {/* Highlights */}
                                        <div className="flex flex-col gap-2">
                                            {decliners.length > 0 && (
                                                <div className="flex flex-col gap-2">
                                                    <div className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-2">
                                                        📉 Bajaron el ahorro vs. {prevYear}
                                                        <div className="flex-1 h-px bg-orange-100" />
                                                    </div>
                                                    {decliners.map((r, i) => (
                                                        <div key={r.customerId} className="flex items-start gap-2.5 bg-orange-50 border border-orange-100 rounded-xl px-3.5 py-2.5">
                                                            <span className="text-base mt-0.5 flex-shrink-0">{i === 0 ? '🔻' : '📉'}</span>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-bold text-gray-800">{r.fullName}</div>
                                                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                                    <span className="text-[10px] text-gray-500 font-semibold">{prevYear}: <strong className="text-gray-700">{fmt(r.lastYearTotal)}</strong></span>
                                                                    <span className="text-[10px] text-gray-400">→</span>
                                                                    <span className="text-[10px] text-gray-500 font-semibold">{curY}: <strong className="text-orange-700">{fmt(r.thisYearTotal)}</strong></span>
                                                                    <span className="text-[10px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">{r.pct}%</span>
                                                                </div>
                                                                <div className="text-[10px] text-orange-600 font-semibold mt-0.5">Dejó de aportar {fmt(Math.abs(r.diff))} menos que el año pasado</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {risers.length > 0 && (
                                                <div className="flex flex-col gap-2">
                                                    <div className="text-[10px] font-black text-green-700 uppercase tracking-widest flex items-center gap-2">
                                                        📈 Más aportaron vs. {prevYear}
                                                        <div className="flex-1 h-px bg-green-100" />
                                                    </div>
                                                    {risers.map((r, i) => (
                                                        <div key={r.customerId} className="flex items-start gap-2.5 bg-green-50 border border-green-100 rounded-xl px-3.5 py-2.5">
                                                            <span className="text-base mt-0.5 flex-shrink-0">{i === 0 ? '🥇' : '🥈'}</span>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-bold text-gray-800">{r.fullName}</div>
                                                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                                    <span className="text-[10px] text-gray-500 font-semibold">{prevYear}: <strong className="text-gray-700">{fmt(r.lastYearTotal)}</strong></span>
                                                                    <span className="text-[10px] text-gray-400">→</span>
                                                                    <span className="text-[10px] text-gray-500 font-semibold">{curY}: <strong className="text-green-700">{fmt(r.thisYearTotal)}</strong></span>
                                                                    <span className="text-[10px] font-black text-green-700 bg-green-200 px-1.5 py-0.5 rounded-full">+{r.pct}%</span>
                                                                </div>
                                                                <div className="text-[10px] text-green-600 font-semibold mt-0.5">Aportó {fmt(r.diff)} más que el año pasado</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {bestMomentum && momentumVal > 0 && (
                                                <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
                                                    <span className="text-base mt-0.5 flex-shrink-0">🚀</span>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-black text-blue-700 uppercase tracking-wide">Mejor momentum (últimos 6 meses)</div>
                                                        <div className="text-sm font-bold text-gray-800">{bestMomentum.fullName}</div>
                                                        <div className="text-[10px] text-blue-600 font-semibold">
                                                            +{momentumVal}% vs semestre anterior · Prom. {fmt(bestMomentum.avgMonthly ?? 0)}/mes
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {monthChampion && (
                                                <div className="flex items-start gap-2.5 bg-yellow-50 border border-yellow-100 rounded-xl px-3.5 py-2.5">
                                                    <span className="text-base mt-0.5 flex-shrink-0">🏆</span>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-black text-yellow-700 uppercase tracking-wide">Campeón del mes · {monthChampion.champPeriod}</div>
                                                        <div className="text-sm font-bold text-gray-800">{monthChampion.fullName}</div>
                                                        <div className="text-[10px] text-yellow-600 font-semibold">
                                                            Aportó {fmt(monthChampion.champAmt)} — el mayor aporte individual del período
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {biggestEffort && (
                                                <div className="flex items-start gap-2.5 bg-purple-50 border border-purple-100 rounded-xl px-3.5 py-2.5">
                                                    <span className="text-base mt-0.5 flex-shrink-0">💪</span>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-black text-purple-700 uppercase tracking-wide">Mayor esfuerzo reciente</div>
                                                        <div className="text-sm font-bold text-gray-800">{biggestEffort.fullName}</div>
                                                        <div className="text-[10px] text-purple-600 font-semibold">
                                                            Incrementó +{fmt(biggestEffort.effort)}/mes en promedio vs. trimestre anterior
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                );
                            })()}

                            {/* Podium Top 3 */}
                            {top3.length >= 3 && (
                                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                                        🥇 Podio — Top 3 del fondo
                                        <div className="flex-1 h-px bg-gray-100" />
                                    </div>
                                    <div className="flex items-end justify-center gap-6">
                                        {[1, 0, 2].map((realIdx) => {
                                            const entry = top3[realIdx];
                                            const isFirst = realIdx === 0;
                                            const blockH = ['h-20', 'h-14', 'h-11'][realIdx];
                                            const blockGrad = ['from-amber-200 to-yellow-400', 'from-slate-200 to-slate-300', 'from-orange-200 to-amber-500'][realIdx];
                                            const avGrad = AVATAR_COLORS[realIdx];
                                            return (
                                                <div key={entry.customerId} className="flex flex-col items-center gap-1.5">
                                                    <span className={isFirst ? 'text-2xl' : 'text-xl'}>{MEDALS[realIdx]}</span>
                                                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avGrad} flex items-center justify-center text-white text-sm font-extrabold shadow-md`}>
                                                        {getInitials(entry.fullName)}
                                                    </div>
                                                    <div className={`text-center w-28 leading-tight font-bold text-gray-700 ${isFirst ? 'text-sm font-black' : 'text-xs'}`}>{entry.fullName}</div>
                                                    <div className={`font-black text-brand-primary ${isFirst ? 'text-sm' : 'text-xs'}`}>{fmt(entry.totalNetSavings)}</div>
                                                    <div className={`w-24 rounded-t-xl bg-gradient-to-b ${blockGrad} ${blockH} flex items-end justify-center pb-1`}>
                                                        <span className="text-xl font-black text-white/60">{realIdx + 1}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Full Ranking List */}
                            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">📋 Clasificación completa</div>

                                {/* Search */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Buscar socio..."
                                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 transition-all font-medium"
                                    />
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    {search ? (
                                        filtered.length === 0
                                            ? <div className="text-center py-8 text-gray-400 text-sm font-semibold">Sin resultados para "{search}"</div>
                                            : filtered.map(entry => renderRow(entry, ranking.findIndex(r => r.customerId === entry.customerId)))
                                    ) : (
                                        <>
                                            {top3.map((entry, i) => renderRow(entry, i))}

                                            {middleGroup.length > 0 && (
                                                <>
                                                    {brechaTop > 10 && (
                                                        <div className="flex items-center gap-2 py-1">
                                                            <div className="flex-1 h-px bg-red-100" />
                                                            <span className="bg-red-50 border border-red-200 rounded-lg px-3 py-0.5 text-[10px] font-black text-red-700">
                                                                ⚡ Brecha del {brechaTop}% hasta el siguiente grupo
                                                            </span>
                                                            <div className="flex-1 h-px bg-red-100" />
                                                        </div>
                                                    )}
                                                    {middleGroup.map((entry, i) => renderRow(entry, i + top3.length))}
                                                </>
                                            )}

                                            {baseGroup.length > 0 && (
                                                <>
                                                    {brechaBase > 10 && (
                                                        <div className="flex items-center gap-2 py-1">
                                                            <div className="flex-1 h-px bg-red-100" />
                                                            <span className="bg-red-50 border border-red-200 rounded-lg px-3 py-0.5 text-[10px] font-black text-red-700">
                                                                ⚠️ Brecha del {brechaBase}% — oportunidad de mejora
                                                            </span>
                                                            <div className="flex-1 h-px bg-red-100" />
                                                        </div>
                                                    )}
                                                    {baseGroup.map((entry, i) => renderRow(entry, i + top3.length + middleGroup.length))}
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Legend */}
                                <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-100">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary bg-green-50 border border-green-200 px-2 py-0.5 rounded-md">● Top 3</span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">⚡ Brecha de rendimiento</span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md">% = proporción del fondo</span>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const SavingsDetail = ({ title, icon: Icon, data, fullData, loading, emptyMsg }) => {
    const [showModal, setShowModal] = useState(false);
    return (
        <>
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2">
                        <Icon className="h-5 w-5" /> {title}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">Mostrando todos los registros ({data.length}) para el periodo seleccionado</p>
                </div>
                <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-dark transition-colors bg-brand-primary/5 px-3 py-1.5 rounded-lg hover:bg-brand-primary/10 print:hidden">
                    Ver lista completa <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
            </div>
            {showModal && <FullListModal title={`${title} - Lista Completa`} icon={Icon} columns={SAVINGS_COLS} data={fullData} onClose={() => setShowModal(false)} />}
            {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-primary/30" /></div> : data.length === 0 ? <div className="text-center py-16 text-gray-400">{emptyMsg || 'Sin registros para mostrar'}</div> : (
                <div className="overflow-auto print:overflow-visible rounded-lg border border-gray-100 print:border-0 max-h-[500px] print:max-h-none">
                    <table className="text-xs border-collapse w-full" style={{ minWidth: `100%` }}>
                        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                            <tr>{SAVINGS_COLS.map(col => <th key={col.key} style={{ minWidth: col.minW }} className="px-3 py-2.5 whitespace-nowrap border-r border-gray-100 last:border-r-0">{col.label}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {data.map((row, i) => {
                                let rowClass = `transition-colors hover:bg-brand-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`;
                                if (row.status === 'Distribucion Intereses Ahorros Mensuales') rowClass = 'transition-colors bg-brand-primary/10 hover:bg-brand-primary/20';
                                else if (row.status === 'Descuento Total Anual Penalizacion') rowClass = 'transition-colors bg-amber-100 hover:bg-amber-200';
                                else if (row.status?.trim() === 'Devolucion Total Intereses Ahorros Mensuales' || row.status?.includes('Devolucion Total Intereses')) rowClass = 'transition-colors bg-purple-100 hover:bg-purple-200';

                                return (
                                <tr key={row.id || i} className={rowClass}>
                                    {SAVINGS_COLS.map(col => (
                                        <td key={col.key} style={{ minWidth: col.minW }} className="px-3 py-2 whitespace-nowrap border-r border-gray-50 last:border-r-0">
                                            {col.isCur ? <span className="font-medium text-gray-800 tabular-nums">{fmtCur(row[col.key])}</span> : 
                                             col.key === 'soporte' ? (
                                                 row.soporte ? (
                                                     <a href={`${api.defaults.baseURL}/admin/savings/${row.id}/soporte`} target="_blank" rel="noreferrer" title={`Descargar soporte`} className="inline-flex items-center gap-1 text-brand-primary hover:text-brand-dark transition-colors font-medium tooltip-trigger">
                                                         <Download className="h-4 w-4" /> Ver
                                                     </a>
                                                 ) : <span className="text-gray-300 italic text-xs">—</span>
                                             ) :
                                             col.key === 'externalId' || col.key === 'clientCustomerId' ? <span className="font-semibold text-brand-primary">{fmtVal(row[col.key])}</span> : col.key === 'status' ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${row[col.key] === 'Abono' ? 'bg-green-100 text-green-700' : row[col.key] === 'Distribucion Intereses Ahorros Mensuales' ? 'bg-brand-primary/20 text-brand-dark' : row[col.key] === 'Descuento Total Anual Penalizacion' ? 'bg-amber-200 text-amber-900' : (row[col.key]?.trim() === 'Devolucion Total Intereses Ahorros Mensuales' || row[col.key]?.includes('Devolucion Total Intereses')) ? 'bg-purple-200 text-purple-900' : 'bg-amber-100 text-amber-700'}`}>{row[col.key] || '—'}</span> : <span className="text-gray-700">{fmtVal(row[col.key])}</span>}
                                        </td>
                                    ))}
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
};

const AportesDetail = ({ data, loading }) => {
    return (
        <>
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2"><Database className="h-5 w-5" /> Total Aportes Iniciales</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{data.length} registros · aportes iniciales detectados</p>
                </div>
            </div>
            {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-primary/30" /></div> : data.length === 0 ? <div className="text-center py-16 text-gray-400">Sin aportes iniciales para este socio</div> : (
                <div className="overflow-auto print:overflow-visible rounded-lg border border-gray-100 print:border-0 max-h-[500px] print:max-h-none">
                    <table className="text-xs border-collapse w-full" style={{ minWidth: `100%` }}>
                        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                            <tr>{APORTES_COLS.map(col => <th key={col.key} style={{ minWidth: col.minW }} className="px-3 py-2.5 whitespace-nowrap border-r border-gray-100 last:border-r-0">{col.label}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {data.map((row, i) => (
                                <tr key={row.id || i} className={`transition-colors hover:bg-brand-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}>
                                    {APORTES_COLS.map(col => (
                                        <td key={col.key} style={{ minWidth: col.minW }} className="px-3 py-2 whitespace-nowrap border-r border-gray-50 last:border-r-0">
                                            {col.isCur ? <span className="font-medium text-gray-800 tabular-nums">{fmtCur(row[col.key])}</span> : col.key === 'externalId' || col.key === 'clientCustomerId' ? <span className="font-semibold text-brand-primary">{fmtVal(row[col.key])}</span> : col.key === 'status' ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${row[col.key] === 'Abono' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{row[col.key] || '—'}</span> : <span className="text-gray-700">{fmtVal(row[col.key])}</span>}
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
            <div className="flex-1 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 30, right: 10, left: 0, bottom: 8 }} barSize={44} barGap={8}>
                        <defs>
                            <linearGradient id="sBarGrad0" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" /><stop offset="100%" stopColor="#6366f1" /></linearGradient>
                            <linearGradient id="sBarGrad1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient>
                            <linearGradient id="sBarGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a855f7" /><stop offset="100%" stopColor="#8A05BE" /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} dy={6} />
                        <YAxis tickFormatter={fmtShort} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} width={55} />
                        <RechartsTooltip cursor={{ fill: 'rgba(99,102,241,0.04)', radius: 8 }} content={<PowerBITooltip showLabel={false} />} />
                        <Bar dataKey="valor" radius={[8, 8, 4, 4]} isAnimationActive={false}
                            label={{ position: 'top', fill: '#334155', fontSize: 11, fontWeight: 700, formatter: fmtFull, offset: 8 }}>
                            {barData.map((_, i) => <Cell key={i} fill={`url(#sBarGrad${i})`} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
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

const MonthlySavingsTrendChart = ({ data, availableYears, selectedYear }) => {
    if (!data || data.length === 0) return null;

    const showMultiple = selectedYear === 'Todos' && availableYears && availableYears.length > 0;
    const sortedYears = showMultiple ? [...availableYears].sort((a, b) => Number(a) - Number(b)) : [];
    const mainYear   = sortedYears[sortedYears.length - 1];
    const otherYears = sortedYears.slice(0, -1);

    const MAIN_COLOR   = '#1e40af';
    const OTHER_COLORS = ['#94a3b8', '#60a5fa', '#a5b4fc'];

    const fmtLabel = (v) => {
        if (!v || v === 0) return '';
        if (v >= 1000000) return `$${(v / 1000000).toFixed(1).replace('.0', '')}M`;
        if (v >= 1000)    return `$${(v / 1000).toFixed(0)}k`;
        return `$${v}`;
    };

    // Convierte 0 → null para que el spline no extrapole por debajo de cero
    const processedData = showMultiple
        ? data.map(d => {
            const row = { name: d.name };
            sortedYears.forEach(yr => { row[yr] = d[yr] > 0 ? d[yr] : null; });
            return row;
          })
        : data;

    const avgOf = (key) => {
        const vals = data.map(d => d[key] || 0).filter(v => v > 0);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };
    const avgValue = showMultiple ? avgOf(mainYear) : avgOf('monto');

    return (
        <div className="w-full h-full pb-2">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={processedData} margin={{ top: 38, right: 48, left: 5, bottom: 5 }}>
                    <defs>
                        <linearGradient id="pbGradMain" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={MAIN_COLOR} stopOpacity={0.22} />
                            <stop offset="90%" stopColor={MAIN_COLOR} stopOpacity={0.02} />
                        </linearGradient>
                        {otherYears.map((yr, i) => (
                            <linearGradient key={yr} id={`pbGrad${yr}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={OTHER_COLORS[i] || '#94a3b8'} stopOpacity={0.15} />
                                <stop offset="90%" stopColor={OTHER_COLORS[i] || '#94a3b8'} stopOpacity={0.02} />
                            </linearGradient>
                        ))}
                    </defs>

                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#e8edf2" strokeWidth={1} />

                    <XAxis dataKey="name" axisLine={false} tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }}
                        interval={0} padding={{ left: 12, right: 12 }} />

                    {/* domain=[0,'auto'] + allowDataOverflow=false evitan que el eje baje de cero */}
                    <YAxis axisLine={false} tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={(v) => v > 0 ? `$${(v / 1000).toFixed(0)}k` : '0'}
                        domain={[0, 'auto']}
                        allowDataOverflow={false}
                        width={50} />

                    <RechartsTooltip content={<PowerBITooltip />} />

                    {/* Línea de promedio — etiqueta en la derecha para no solapar labels de datos */}
                    {avgValue > 0 && (
                        <ReferenceLine y={avgValue} stroke="#94a3b8" strokeDasharray="7 4" strokeWidth={1.5}
                            label={{ value: `Prom: ${fmtLabel(avgValue)}`, position: 'insideTopRight',
                                fill: '#64748b', fontSize: 10, fontWeight: 700, dx: -4, dy: -14 }} />
                    )}

                    {showMultiple ? (
                        <>
                            {otherYears.map((year, i) => (
                                <Area key={year} type="monotone" dataKey={year} name={`Año ${year}`}
                                    stroke={OTHER_COLORS[i] || '#94a3b8'} strokeWidth={1.5}
                                    fill={`url(#pbGrad${year})`} fillOpacity={1}
                                    dot={false} activeDot={false}
                                    connectNulls={false} baseValue={0}
                                    isAnimationActive={false}
                                />
                            ))}
                            <Area type="monotone" dataKey={mainYear} name={`Año ${mainYear}`}
                                stroke={MAIN_COLOR} strokeWidth={2.5}
                                fill="url(#pbGradMain)" fillOpacity={1}
                                dot={false}
                                connectNulls={false} baseValue={0}
                                activeDot={{ r: 5, fill: MAIN_COLOR, stroke: '#fff', strokeWidth: 2 }}
                                isAnimationActive={false}
                            >
                                <LabelList dataKey={mainYear} position="top" offset={8}
                                    style={{ fill: MAIN_COLOR, fontSize: 9, fontWeight: 700 }}
                                    formatter={fmtLabel} />
                            </Area>
                        </>
                    ) : (
                        <Area type="monotone" dataKey="monto" name="Ahorro Mensual"
                            stroke={MAIN_COLOR} strokeWidth={2.5}
                            fill="url(#pbGradMain)" fillOpacity={1}
                            dot={false} baseValue={0}
                            activeDot={{ r: 5, fill: MAIN_COLOR, stroke: '#fff', strokeWidth: 2 }}
                            isAnimationActive={false}
                        >
                            <LabelList dataKey="monto" position="top" offset={8}
                                style={{ fill: MAIN_COLOR, fontSize: 9, fontWeight: 700 }}
                                formatter={fmtLabel} />
                        </Area>
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

const DefaultDetail = () => (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-primary/10 flex items-center justify-center mb-4"><ChevronRight className="h-8 w-8 text-brand-primary/40" /></div>
        <h3 className="text-lg font-semibold text-gray-500 mb-2">Análisis de Ahorros</h3>
        <p className="text-sm text-gray-400 max-w-xs">Selecciona un socio para ver su resumen financiero completo.</p>
    </div>
);

// ─── Main SavingsSummaryPage ───────────────────────────────────────────────────

const SavingsSummaryPage = ({ lockedSocio = null, hideControls = false, preloadedData = null }) => {
    const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
    const { toast } = useUi();
    const [activeCard, setActiveCard] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedYear, setSelectedYear] = useState('Todos');
    const [availableYears, setAvailableYears] = useState([]);
    const location = useLocation();
    const isTotalView = new URLSearchParams(location.search).get('view') === 'total' || hideControls;
    
    // Partner Selection
    const [clients, setClients] = useState([]);
    const [selectedSocio, setSelectedSocio] = useState(null);
    const [socioSearch, setSocioSearch] = useState('');
    const [showSocioList, setShowSocioList] = useState(false);

    const [rawSavings, setRawSavings] = useState([]);
    const [rawAportes, setRawAportes] = useState([]);
    const [socioLoans, setSocioLoans] = useState([]);
    const [loadingLoans, setLoadingLoans] = useState(false);
    const [socioPayments, setSocioPayments] = useState([]);
    const [loadingPayments, setLoadingPayments] = useState(false);
    
    // Loan Analysis State
    const [loanAnalysis, setLoanAnalysis] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    // Payment Filters
    const [paymentYearFilter, setPaymentYearFilter] = useState('Todos');
    const [paymentStatusFilter, setPaymentStatusFilter] = useState('Todos');
    const [paymentLoanStatusFilter, setPaymentLoanStatusFilter] = useState('Todos');
    const [paymentSortConfig, setPaymentSortConfig] = useState({ key: 'idVm', dir: 'desc' });

    const [showRankingModal, setShowRankingModal] = useState(false);
    const [expandAccountChart, setExpandAccountChart] = useState(false);
    const [expandTrendChart, setExpandTrendChart] = useState(false);
    const currentYear = new Date().getFullYear();

    const fmt = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`;

    // Load initial client list (skip if socio is locked)
    useEffect(() => {
        if (hideControls) return;
        const fetchClients = async () => {
            try {
                const res = await api.get('/admin/clients/list');
                if (res.data?.ok && Array.isArray(res.data.data)) setClients(res.data.data.filter(c => c.estatus === 'Activo'));
            } catch (err) { console.error('Error fetching clients:', err.message); }
        };
        fetchClients();
    }, [hideControls]);


    // Fetch data for selected socio
    const fetchData = useCallback(async (cedula) => {
        if (!cedula) return;
        setLoading(true);
        try {
            let mySavings, myAportes;

            if (preloadedData) {
                // Use preloaded data directly (for authenticated user view)
                mySavings = preloadedData.savings || [];
                myAportes = preloadedData.aportes || [];
            } else {
                const [resSavings, resAportes] = await Promise.all([
                    api.get('/admin/savings/list'),
                    api.get('/admin/savings/list?type=Aporte Inicial')
                ]);

                const allSavings = resSavings.data?.ok && Array.isArray(resSavings.data.data) ? resSavings.data.data : [];
                const allAportes = resAportes.data?.ok && Array.isArray(resAportes.data.data) ? resAportes.data.data : [];

                const socioFilter = (arr) => arr.filter(s => 
                    String(s.clientCedula) === String(cedula) || 
                    String(s.clientCustomerId) === String(cedula)
                );

                mySavings = socioFilter(allSavings.filter(s => s.type !== 'Aporte Inicial'));
                myAportes = socioFilter(allAportes);
            }

            setRawSavings(mySavings);
            setRawAportes(myAportes);

            const years = new Set();
            mySavings.forEach(s => s.year && years.add(String(s.year)));
            myAportes.forEach(a => a.year && years.add(String(a.year)));
            setAvailableYears(Array.from(years).sort((a, b) => b - a));
        } catch (err) {
            toast.error('Error al cargar datos del socio');
            console.error('Error fetching socio data:', err.message);
        } finally {
            setLoading(false);
        }
    }, [toast, preloadedData]);

    const handleSelectSocio = ( socio ) => {
        setSelectedSocio(socio);
        setSocioSearch(`${socio.name} ${socio.surname1} ${socio.surname2 || ''}`.trim());
        setShowSocioList(false);
        setSelectedYear('Todos');
        setActiveCard('savings');
        fetchData(socio.cedula);

        if (preloadedData) {
            // Use preloaded loans and payments from the user-accessible endpoints
            setSocioLoans(preloadedData.loans || []);
            setSocioPayments(preloadedData.payments || []);
            setLoadingLoans(false);
            setLoadingPayments(false);
        } else {
            // Fetch loans for this socio (admin endpoints)
            setSocioLoans([]);
            setLoadingLoans(true);
            api.get('/admin/disbursed-loans/list')
                .then(res => {
                    const all = res.data?.ok && Array.isArray(res.data.data) ? res.data.data : [];
                    setSocioLoans(all.filter(l => l.clientId === socio.id || String(l.clientCedula) === String(socio.cedula)));
                })
                .catch(() => {})
                .finally(() => setLoadingLoans(false));

            // Fetch loan payments for this socio
            setSocioPayments([]);
            setLoadingPayments(true);
            api.get(`/admin/payments/list?clientId=${socio.id}`)
                .then(res => {
                    const all = res.data?.ok && Array.isArray(res.data.data) ? res.data.data : [];
                    setSocioPayments(all.filter(p => p.clientId === socio.id || String(p.clientCedula) === String(socio.cedula)));
                })
                .catch(() => {})
                .finally(() => setLoadingPayments(false));
        }

        // Fetch loan capacity analysis
        setLoanAnalysis(null);
        setLoadingAnalysis(true);
        api.get(`/admin/clients/${socio.id}/loan-capacity`)
            .then(res => setLoanAnalysis(res.data))
            .catch(() => {})
            .finally(() => setLoadingAnalysis(false));
    };

    // Auto-select locked socio on mount (must be after handleSelectSocio is defined)
    useEffect(() => {
        if (lockedSocio && lockedSocio.cedula) {
            handleSelectSocio(lockedSocio);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lockedSocio?.cedula]);

    const filteredClients = clients.filter(c => {
        const fullName = `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.toLowerCase();
        const search = socioSearch.toLowerCase();
        return fullName.includes(search) || (c.cedula && c.cedula.includes(search));
    });

    // Derived Logic (Same as AccountDetail)
    const filteredSavings = React.useMemo(() => {
        let result = [...rawSavings];
        if (selectedYear !== 'Todos') {
            result = result.filter(s => String(s.year) === selectedYear);
        }
        
        return result.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            if (dateB !== dateA) return dateB - dateA;
            
            const yearA = parseInt(a.year || 0, 10);
            const yearB = parseInt(b.year || 0, 10);
            if (yearB !== yearA) return yearB - yearA;
            
            const getMonthInt = (s) => {
                if (s.monthInt) return parseInt(s.monthInt, 10);
                if (s.month) {
                    const mStr = String(s.month).toLowerCase();
                    const idx = monthNames.findIndex(m => mStr.startsWith(m.toLowerCase()));
                    if (idx !== -1) return idx + 1;
                }
                return 0;
            };
            
            const monthA = getMonthInt(a);
            const monthB = getMonthInt(b);
            
            return monthB - monthA;
        });
    }, [rawSavings, selectedYear]);

    const filteredAportes = React.useMemo(() => {
        if (selectedYear === 'Todos') return rawAportes;
        return rawAportes.filter(a => String(a.year) === selectedYear);
    }, [rawAportes, selectedYear]);

    const userStats = React.useMemo(() => {
        // (existing savings/aportes stats logic)
        const sumAmt = (arr) => arr.reduce((acc, s) => acc + parseFloat(s.amount || 0), 0);
        const sumSav = (arr) => arr.reduce((acc, s) => acc + parseFloat(s.valorAhorrado || s.amount || 0), 0);
        const totalSavings = sumSav(filteredSavings);
        const totalInitialContributions = sumAmt(filteredAportes);
        const statusMap = {};
        filteredSavings.forEach(item => {
            const st = item.status || 'Sin Estado';
            statusMap[st] = (statusMap[st] || 0) + parseFloat(item.amount || 0);
            
            const penalty = parseFloat(item.valorAPenalizar || 0);
            if (penalty > 0) {
                statusMap['Descuento Total Anual Penalizacion'] = (statusMap['Descuento Total Anual Penalizacion'] || 0) - penalty;
            }
        });
        filteredAportes.forEach(item => {
            const st = item.status || 'Sin Estado';
            statusMap[st] = (statusMap[st] || 0) + parseFloat(item.amount || 0);

            const penalty = parseFloat(item.valorAPenalizar || 0);
            if (penalty > 0) {
                statusMap['Descuento Total Anual Penalizacion'] = (statusMap['Descuento Total Anual Penalizacion'] || 0) - penalty;
            }
        });
        // Penalties logic
        let totalDiasPenalizacion = 0;
        let totalValorPenalizarAnual = 0;

        // Respect filtered context for days - now restricted to matchYear logic
        rawSavings.forEach(s => {
            const matchYear = selectedYear === 'Todos' ? String(currentYear) : selectedYear;
            if (String(s.year) === matchYear) {
                totalDiasPenalizacion += parseInt(s.diasPenalizacion || 0);
            }
        });

        // Calculate values for penalization
        rawSavings.forEach(s => {
            const matchYear = selectedYear === 'Todos' ? String(currentYear) : selectedYear;
            if (String(s.year) === matchYear) {
                totalValorPenalizarAnual += parseFloat(s.valorAPenalizar || 0);
            }
        });

        const monthlyTrend = monthNames.map((name, i) => {
            const base = { name, monthInt: i + 1, monto: 0 };
            availableYears.forEach(y => base[y] = 0);
            return base;
        });

        filteredSavings.forEach(s => {
            // Only include Monthly savings in the trend chart (exclude Initial Contributions)
            if (s.type === 'Mensual' || !s.type) {
                // Prioritize mesAbonado (The month the saving belongs to) over transaction date
                const mi = s.mesAbonado || s.monthInt || (s.date ? new Date(s.date).getUTCMonth() + 1 : null);
                const yr = String(s.anioAbonado || s.year || (s.date ? new Date(s.date).getUTCFullYear() : null));
                
                if (mi >= 1 && mi <= 12) {
                    monthlyTrend[mi - 1].monto += parseFloat(s.valorAhorrado || 0);
                    if (yr && monthlyTrend[mi - 1][yr] !== undefined) {
                        monthlyTrend[mi - 1][yr] += parseFloat(s.valorAhorrado || 0);
                    }
                }
            }
        });

        return { 
            totalSavings, 
            totalInitialContributions, 
            totalAhorradoGeneral: totalSavings + totalInitialContributions, 
            monthlyTrend, 
            statusMap,
            totalDiasPenalizacion,
            totalValorPenalizarAnual
        };
    }, [filteredSavings, filteredAportes, rawSavings]);

    // Altura dinámica del gráfico de tendencia: crece con más años y con picos más altos
    const trendChartHeight = React.useMemo(() => {
        const trend = userStats?.monthlyTrend;
        if (!trend?.length) return 340;

        const nYears = selectedYear === 'Todos' ? availableYears.length : 1;
        const maxVal = trend.reduce((max, d) => {
            const v = selectedYear === 'Todos'
                ? availableYears.reduce((m, yr) => Math.max(m, d[yr] || 0), 0)
                : (d.monto || 0);
            return Math.max(max, v);
        }, 0);

        let h = 300;
        if (nYears >= 2) h += (nYears - 1) * 55;  // espacio extra por serie adicional
        if (maxVal > 300000)  h += 50;              // picos altos necesitan más eje Y
        if (maxVal > 800000)  h += 60;
        if (maxVal > 1500000) h += 40;

        return Math.min(Math.max(h, 300), 620);     // entre 300px y 620px
    }, [userStats?.monthlyTrend, availableYears, selectedYear]);

    const fullMonthsLower = React.useMemo(() => ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"], []);

    const safeParseDate = React.useCallback((dateVal, mesRef) => {
        if (!dateVal) return null;
        let dateStr = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal);
        if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];

        const parts = dateStr.split('-');
        if (parts.length !== 3) return new Date(dateStr + 'T00:00:00');

        const [p1, p2, p3] = parts.map(Number);
        if (String(parts[0]).length === 4) {
            const y = p1, m = p2, d = p3;
            if (mesRef) {
                const targetIdx = fullMonthsLower.indexOf(mesRef.toLowerCase().trim()) + 1;
                if (targetIdx > 0) {
                    if (m === targetIdx) return new Date(y, m - 1, d);
                    if (d === targetIdx) return new Date(y, d - 1, m);
                }
            }
            return new Date(y, m - 1, d);
        }
        return new Date(dateStr + 'T00:00:00');
    }, [fullMonthsLower]);

    // --- Payment Stats Logic ---
    const availablePaymentYears = React.useMemo(() => {
        const years = new Set();
        socioPayments.forEach(p => {
            if (p.fechaPagoMax) {
                years.add(p.fechaPagoMax.split('-')[0]);
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [socioPayments]);

    const filteredSocioPayments = React.useMemo(() => {
        return socioPayments.filter(p => {
            if (paymentYearFilter !== 'Todos') {
                const y = p.fechaPagoMax ? p.fechaPagoMax.split('-')[0] : '';
                if (y !== paymentYearFilter) return false;
            }
            if (paymentStatusFilter !== 'Todos') {
                if ((p.estado || '').trim().toLowerCase() !== paymentStatusFilter.toLowerCase()) return false;
            }
            if (paymentLoanStatusFilter !== 'Todos') {
                // Find corresponding loan to check its state, or fallback if loan missing
                const loan = socioLoans.find(l => String(l.idVm) === String(p.idVm));
                if (loan) {
                    if ((loan.estado || '').trim().toLowerCase() !== paymentLoanStatusFilter.toLowerCase()) return false;
                } else {
                    return false; // If we can't determine loan state, exclude if filtering
                }
            }
            return true;
        });
    }, [socioPayments, paymentYearFilter, paymentStatusFilter, paymentLoanStatusFilter, socioLoans]);

    const sortedSocioPayments = React.useMemo(() => {
        const { key, dir } = paymentSortConfig;
        const extractNum = (val) => parseInt((val || '').replace(/\D/g, '') || '0');
        const numericPrefixKeys = ['externalId', 'idVm'];
        const numericKeys = ['itemQuantity', 'valorCuotaVariable', 'valorCuotaPago', 'saldoFinal'];
        const dateKeys = ['fechaPagoMax'];

        return [...filteredSocioPayments].sort((a, b) => {
            let av = a[key], bv = b[key];
            let cmp = 0;
            if (numericPrefixKeys.includes(key)) {
                cmp = extractNum(av) - extractNum(bv);
            } else if (numericKeys.includes(key)) {
                cmp = (parseFloat(av) || 0) - (parseFloat(bv) || 0);
            } else if (dateKeys.includes(key)) {
                cmp = new Date(av || 0) - new Date(bv || 0);
            } else {
                cmp = (av || '').toString().localeCompare((bv || '').toString(), 'es');
            }
            return dir === 'asc' ? cmp : -cmp;
        });
    }, [filteredSocioPayments, paymentSortConfig]);

    const handlePaymentSort = (key) => {
        setPaymentSortConfig(prev =>
            prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        );
    };

    const paymentStats = React.useMemo(() => {
        const today = new Date();
        const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        return filteredSocioPayments.reduce((acc, curr) => {
            acc.totalIntereses += parseFloat(curr.valorInteresesAmortizados || 0);
            acc.totalCuotas++;
            
            const valCuota = parseFloat(curr.valorCuotaVariable || 0);
            const valPago = parseFloat(curr.valorCuotaPago || 0);
            
            // Sum loan amounts once per idVm
            if (curr.idVm && !acc.loanIdsRef.has(curr.idVm)) {
                acc.loanIdsRef.add(curr.idVm);
                const loan = socioLoans.find(l => String(l.idVm) === String(curr.idVm));
                acc.totalValorPrestado += loan ? parseFloat(loan.valorPrestado || 0) : 0;
            }

            const isPago = (curr.estado || '').trim().toLowerCase() === 'pago';
            const isPendiente = (curr.estado || '').trim().toLowerCase() === 'pendiente';
            
            if (isPago) {
                acc.cuotasPagadas++;
                acc.totalRecaudo += valPago;
            } else if (isPendiente) {
                acc.carteraActiva += valCuota;
                const dueDate = safeParseDate(curr.fechaPagoMax, curr.mesPago);
                if (dueDate && dueDate < todayLocal) {
                    acc.moraCartera += valCuota;
                }
            }
            return acc;
        }, {
            totalIntereses: 0,
            totalValorPrestado: 0,
            totalCuotas: 0,
            cuotasPagadas: 0,
            totalRecaudo: 0,
            carteraActiva: 0,
            moraCartera: 0,
            loanIdsRef: new Set()
        });
    }, [filteredSocioPayments, socioLoans, safeParseDate]);


    const cards = [
        { id: 'savings', title: 'Capital Ahorrado', value: loading ? '…' : fmt(userStats.totalSavings), icon: PiggyBank, color: 'text-green-500', bgColor: 'bg-green-50', panel: 'savings' },
        { id: 'aportes', title: 'Total Aportes Iniciales', value: loading ? '…' : fmt(userStats.totalInitialContributions), icon: Database, color: 'text-amber-500', bgColor: 'bg-amber-50', panel: 'aportes' },
        { id: 'totalAhorrado', title: 'Total Ahorrado', value: loading ? '…' : fmt(userStats.totalAhorradoGeneral), icon: PiggyBank, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
        { id: 'diasPenalizacion', title: `Días Penalización ${selectedYear === 'Todos' ? currentYear : selectedYear}`, value: loading ? '…' : `${userStats.totalDiasPenalizacion} días`, description: selectedYear === 'Todos' ? 'Días de mora del año actual' : `Días de mora del año ${selectedYear}`, icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', panel: 'diasPenalizacion' },
        { id: 'valorPenalizacion', title: `Penalización ${selectedYear === 'Todos' ? currentYear : selectedYear}`, value: loading ? '…' : fmt(userStats.totalValorPenalizarAnual), description: selectedYear === 'Todos' ? 'Monto a penalizar año actual' : `Monto a penalizar año ${selectedYear}`, icon: ShieldAlert, color: 'text-rose-600', bgColor: 'bg-rose-50', panel: 'valorPenalizacion' },
    ];

    const statusCards = Object.keys(userStats.statusMap || {}).filter(n => n !== 'Activo').map(stName => {
        let style = { icon: AlertTriangle, color: 'text-slate-500', bgColor: 'bg-slate-50' };
        if (stName === 'Abono') style = { icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50' };
        else if (stName === 'Distribucion Intereses Ahorros Mensuales') style = { icon: Landmark, color: 'text-amber-700', bgColor: 'bg-amber-50' };
        return { 
            id: `status-${stName}`,
            panel: `status-${stName}`,
            title: stName, 
            value: fmt(userStats.statusMap[stName]), 
            description: selectedYear === 'Todos' ? 'Histórico total' : `Año: ${selectedYear}`,
            ...style 
        };
    }).sort((a,b) => b.title === 'Abono' ? 1 : -1);

    const renderDetail = () => {
        if (!selectedSocio) return <DefaultDetail />;
        
        if (activeCard === 'savings') {
            return <SavingsDetail title="Capital Ahorrado" icon={PiggyBank} data={filteredSavings} fullData={filteredSavings} loading={loading} emptyMsg="Sin registros de ahorro para este socio" />;
        }
        
        if (activeCard === 'aportes') {
            return <AportesDetail data={filteredAportes} loading={loading} />;
        }

        if (activeCard === 'diasPenalizacion' || activeCard === 'valorPenalizacion') {
            const recordsWithPenalty = filteredSavings.filter(s => 
                (parseInt(s.diasPenalizacion) > 0) || (parseFloat(s.valorAPenalizar) > 0)
            );
            const title = activeCard === 'diasPenalizacion' ? 'Detalle de Días Penalizados' : 'Detalle de Valores Penalizados';
            const icon = activeCard === 'diasPenalizacion' ? Clock : ShieldAlert;

            return (
                <SavingsDetail 
                    title={title} 
                    icon={icon} 
                    data={recordsWithPenalty} 
                    fullData={recordsWithPenalty} 
                    loading={loading} 
                    emptyMsg="No hay registros con penalizaciones en este periodo" 
                />
            );
        }

        if (activeCard && activeCard.startsWith('status-')) {
            const stName = activeCard.replace('status-', '');
            // Merge both datasets to find records with this status
            const allRecords = [...filteredSavings, ...filteredAportes];
            let recordsWithStatus = allRecords.filter(r => r.status === stName);
            
            // Regla especial para "Descuento Total Anual Penalizacion": incluir también los registros con penalización='SI'
            if (stName === 'Descuento Total Anual Penalizacion') {
                const penaltyRecords = allRecords.filter(r => r.penalizacion === 'SI' && r.status !== stName);
                recordsWithStatus = [...recordsWithStatus, ...penaltyRecords];
            }
            const style = statusCards.find(c => c.title === stName) || { icon: AlertTriangle };

            return (
                <SavingsDetail 
                    title={`Detalle: ${stName}`} 
                    icon={style.icon} 
                    data={recordsWithStatus} 
                    fullData={recordsWithStatus} 
                    loading={loading} 
                    emptyMsg={`No hay registros con estado "${stName}"`} 
                />
            );
        }

        return <DefaultDetail />;
    };

    return (
        <div className="space-y-5">
            {/* Título de página */}
            <div className="flex items-center gap-3 print:hidden">
                <div className="p-2 bg-brand-primary rounded-xl shadow-sm shadow-brand-primary/20">
                    <PiggyBank className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-black text-gray-900 leading-none">Detalle de la Cuenta {!lockedSocio && user?.name ? `- ${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim() : (lockedSocio && lockedSocio.name ? `- ${lockedSocio.name}` : '')}</h1>
                    <p className="text-[11px] text-gray-400 font-semibold mt-0.5 uppercase tracking-wide">Estado de cuenta individual por socio</p>
                </div>
            </div>
            <style>{`
                @media print {
                    @page { size: A4 landscape; margin: 12mm 15mm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; font-family: 'Inter', sans-serif !important; }

                    /* ── Hide UI ── */
                    .print\\:hidden { display: none !important; }

                    /* ── Layout: remove specific overflow/height clipping ONLY for main scrolling containers ── */
                    .overflow-y-auto, .overflow-auto, .max-h-\\[640px\\], .max-h-\\[500px\\], .max-h-\\[480px\\] {
                        overflow: visible !important; 
                        max-height: none !important; 
                    }
                    main, main > div { max-width: none !important; width: 100% !important; }

                    /* ── Spacing: collapse margins/paddings for density ── */
                    .space-y-5 > * + * { margin-top: 12px !important; }
                    .mt-5 { margin-top: 12px !important; }
                    .mt-4 { margin-top: 8px !important; }
                    .mb-4 { margin-bottom: 8px !important; }
                    .mb-6 { margin-bottom: 12px !important; }
                    .p-6  { padding: 12px !important; }
                    .p-5  { padding: 10px !important; }
                    .py-4 { padding-top: 8px !important; padding-bottom: 8px !important; }
                    .gap-5 { gap: 12px !important; }
                    .gap-4 { gap: 8px !important; }
                    .gap-3 { gap: 6px !important; }

                    /* ── Charts: fixed compact height ── */
                    .recharts-responsive-container { width: 100% !important; min-width: auto !important; }
                    .h-\\[320px\\], .print\\:h-\\[300px\\] { height: 220px !important; }

                    /* ── Typography & Elements ── */
                    .text-lg { font-size: 14px !important; }
                    .text-base { font-size: 13px !important; }
                    .text-sm { font-size: 12px !important; }
                    .text-xs { font-size: 11px !important; }
                    .text-\\[11px\\] { font-size: 10px !important; }
                    .text-\\[10px\\] { font-size: 9px !important; }
                    
                    /* ── Modern Borders & Cards ── */
                    .border { border-color: #e2e8f0 !important; }
                    .rounded-2xl, .rounded-xl, .rounded-lg { border-radius: 8px !important; }
                    .shadow-sm, .shadow-md, .shadow-lg { box-shadow: none !important; }
                    .bg-white { background: white !important; }
                    .bg-gray-50 { background: #f8fafc !important; }

                    /* ── Tables: Executive styling ── */
                    table { width: 100% !important; border-collapse: collapse !important; }
                    thead { display: table-header-group !important; }
                    th { background-color: #f1f5f9 !important; color: #334155 !important; font-weight: 700 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 6px 8px !important; }
                    td { padding: 6px 8px !important; border-bottom: 1px solid #f1f5f9 !important; color: #475569 !important; }
                    tr { page-break-inside: avoid !important; }
                    tr:nth-child(even) td { background-color: #f8fafc !important; }

                    /* ── Avoid Page Breaks inside Cards ── */
                    .rounded-2xl { page-break-inside: avoid !important; }
                    .print\\:break-inside-avoid { page-break-inside: avoid !important; }

                    /* ── Colors ── */
                    .bg-brand-primary { background-color: #14532d !important; color: white !important; }
                    .text-brand-primary { color: #14532d !important; }
                }
            `}</style>
            
            {/* INFORME HEADER - SOLO PARA IMPRESIÓN */}
            <div className="hidden print:flex justify-between items-end mb-6 pb-4 border-b-4 border-brand-primary break-inside-avoid">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-brand-primary mb-1">Informe de Estado de Cuenta</h1>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Credifuturo - Resumen Financiero Ejecutivo</p>
                </div>
                {selectedSocio && (
                    <div className="text-right">
                        <h2 className="text-xl font-bold text-gray-900 flex items-center justify-end gap-2">
                            <Users className="h-5 w-5 text-brand-primary" />
                            {selectedSocio.name} {selectedSocio.surname1} {selectedSocio.surname2 || ''}
                        </h2>
                        <p className="text-gray-500 font-mono text-sm font-semibold mt-1">C.C. {selectedSocio.cedula}</p>
                    </div>
                )}
            </div>
            
            {/* Socio Selector & Year Filter Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative z-50 print:hidden">
                {!hideControls && (
                    <div className="flex-1 max-w-xl">
                        <SocioSelect clients={clients} selectedSocio={selectedSocio} onSelect={handleSelectSocio} />
                    </div>
                )}
                {hideControls && selectedSocio && (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center font-black text-brand-primary text-sm">
                            {(selectedSocio.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 text-sm">{selectedSocio.name} {selectedSocio.surname1} {selectedSocio.surname2 || ''}</p>
                            <p className="text-xs text-gray-400 font-mono">C.C. {selectedSocio.cedula} · {selectedSocio.customerId}</p>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3 shrink-0 print:hidden">
                    {!hideControls && (
                        <>
                            <button 
                                onClick={() => window.print()}
                                className="bg-brand-primary hover:bg-brand-dark text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all active:scale-95 flex items-center gap-2 group"
                            >
                                <Download className="h-4 w-4 group-hover:-translate-y-1 transition-transform" /> Informe PDF
                            </button>
                            <button 
                                onClick={() => setShowRankingModal(true)}
                                className="bg-amber-400 hover:bg-amber-500 text-amber-950 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-amber-400/20 transition-all active:scale-95 flex items-center gap-2 group"
                            >
                                <Trophy className="h-4 w-4 group-hover:rotate-12 transition-transform" /> Ranking
                            </button>
                        </>
                    )}

                    <PillSelect
                        icon={Calendar}
                        value={selectedYear}
                        onChange={setSelectedYear}
                        width="w-40"
                        options={[
                            { value: 'Todos', label: 'Año: Todos' },
                            ...availableYears.map(y => ({ value: y, label: String(y) }))
                        ]}
                    />
                    <button onClick={() => selectedSocio && fetchData(selectedSocio.cedula)} className="p-3.5 rounded-xl bg-brand-primary text-white hover:bg-brand-dark transition-all shadow-lg shadow-brand-primary/20 active:scale-95"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
                </div>
            </div>

            {!selectedSocio ? (
                <Card className="py-20"><DefaultDetail /></Card>
            ) : (
                <>
                    {userStats.totalAhorradoGeneral > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 print:grid-cols-2 gap-5 w-full print:break-inside-avoid">
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col print:h-[300px] print:shadow-none print:border-gray-200 transition-all duration-500"
                                style={{ height: Math.max(trendChartHeight * 0.65, 280) }}>
                                <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5" /> Evolución de Ahorros
                                    <button onClick={() => setExpandAccountChart(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-primary to-blue-600 text-white text-xs font-bold shadow-md shadow-brand-primary/30 hover:shadow-lg hover:shadow-brand-primary/40 hover:scale-105 active:scale-95 transition-all duration-200 print:hidden" title="Ampliar y analizar">
                                        <Maximize2 className="h-3.5 w-3.5" />
                                        <span>Ampliar y analizar</span>
                                    </button>
                                </h2>
                                <div className="flex-1 min-h-[200px]"><AccountSummaryChart stats={userStats} /></div>
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col print:h-[400px] print:shadow-none print:border-gray-200 transition-all duration-500"
                                style={{ height: trendChartHeight }}>
                                <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5" /> Mes Consignado
                                    <button onClick={() => setExpandTrendChart(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-primary to-blue-600 text-white text-xs font-bold shadow-md shadow-brand-primary/30 hover:shadow-lg hover:shadow-brand-primary/40 hover:scale-105 active:scale-95 transition-all duration-200 print:hidden" title="Ampliar y analizar">
                                        <Maximize2 className="h-3.5 w-3.5" />
                                        <span>Ampliar y analizar</span>
                                    </button>
                                </h2>
                                <div className="flex-1 min-h-[300px]"><MonthlySavingsTrendChart data={userStats.monthlyTrend} availableYears={availableYears} selectedYear={selectedYear} /></div>
                            </div>
                        </div>
                    )}
                    <ChartExpandModal
                        isOpen={expandAccountChart}
                        onClose={() => setExpandAccountChart(false)}
                        title="Evolución de Ahorros — Composición del Patrimonio"
                        analysisResult={analyzeSavingsComposition({ totalSavings: userStats.totalSavings, totalInitialContributions: userStats.totalInitialContributions, totalAhorradoGeneral: userStats.totalAhorradoGeneral })}
                    >
                        <AccountSummaryChart stats={userStats} />
                    </ChartExpandModal>
                    <ChartExpandModal
                        isOpen={expandTrendChart}
                        onClose={() => setExpandTrendChart(false)}
                        title="Ahorro Mensual — Tendencia por Mes Consignado"
                        analysisResult={analyzeMonthlyTrend(
                            userStats.monthlyTrend,
                            selectedYear,
                            availableYears,
                            rawSavings,
                            { name: `${selectedSocio?.name || ''} ${selectedSocio?.surname1 || ''}`.trim(), customerId: selectedSocio?.customerId }
                        )}
                    >
                        <MonthlySavingsTrendChart data={userStats.monthlyTrend} availableYears={availableYears} selectedYear={selectedYear} />
                    </ChartExpandModal>

                    <div className="flex flex-col lg:flex-row print:block items-start gap-5 min-h-[580px] print:min-h-0 w-full mt-4">
                        <div className="w-full lg:w-72 print:w-full shrink-0 flex flex-col print:block gap-3">
                            <div className="space-y-3 print:space-y-0 print:grid print:grid-cols-3 print:gap-4 print:mb-6">
                                {cards.map(card => (
                                    <VerticalStatCard key={card.id} {...card} active={activeCard === card.panel} onClick={() => card.panel && (activeCard === card.panel ? setActiveCard(null) : setActiveCard(card.panel))} />
                                ))}
                            </div>
                            <div className="mt-4 mb-2 flex items-center gap-2 px-1 print:mt-6 print:mb-4"><div className="h-px bg-gray-100 print:bg-gray-300 flex-1" /><span className="text-[10px] font-bold text-gray-400 print:text-gray-600 uppercase tracking-widest whitespace-nowrap">Resumen Histórico del Socio</span><div className="h-px bg-gray-100 print:bg-gray-300 flex-1" /></div>
                            <div className="grid grid-cols-1 print:grid-cols-3 gap-3 print:gap-4">
                                {statusCards.map((card, i) => (
                                    <VerticalStatCard 
                                        key={i} 
                                        {...card} 
                                        active={activeCard === card.panel} 
                                        onClick={() => activeCard === card.panel ? setActiveCard(null) : setActiveCard(card.panel)} 
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-y-auto print:hidden max-h-[640px]">{renderDetail()}</div>
                    </div>

                    {/* ── Préstamos del Socio ──────────────────────────────── */}
                    {isTotalView && (loadingLoans || socioLoans.length > 0) && (
                        <div className="w-full mt-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2">
                                        <CreditCard className="h-5 w-5" /> Préstamos del Socio
                                    </h2>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {socioLoans.length} préstamo{socioLoans.length !== 1 ? 's' : ''} registrado{socioLoans.length !== 1 ? 's' : ''} · {selectedSocio?.name} {selectedSocio?.surname1}
                                    </p>
                                </div>
                            </div>
                            {loadingLoans ? (
                                <div className="flex items-center justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-brand-primary/30" /></div>
                            ) : (
                                <div className="overflow-auto rounded-lg border border-gray-100 max-h-[480px] print:overflow-visible print:max-h-none print:border-gray-200">
                                    <table className="text-xs border-collapse w-full">
                                        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-left font-bold text-gray-500 uppercase tracking-wide text-[10px]">
                                            <tr>
                                                <th className="px-3 py-2.5 whitespace-nowrap">ID</th>
                                                <th className="px-3 py-2.5 whitespace-nowrap">Estado</th>
                                                <th className="px-3 py-2.5 whitespace-nowrap">Fecha Desembolso</th>
                                                <th className="px-3 py-2.5 whitespace-nowrap">Año</th>
                                                <th className="px-3 py-2.5 whitespace-nowrap text-right">Valor Prestado</th>
                                                <th className="px-3 py-2.5 whitespace-nowrap text-center">Cuotas</th>
                                                <th className="px-3 py-2.5 whitespace-nowrap text-center">Interés</th>
                                                <th className="px-3 py-2.5 whitespace-nowrap">Banco</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {socioLoans.map((loan, i) => {
                                                const isActive = loan.estado === 'Activo' || loan.estado === 'Vigente';
                                                const isCanceled = loan.estado === 'Cancelado' || loan.estado === 'Pagado';
                                                return (
                                                    <tr key={loan.id || i} className={`transition-colors hover:bg-brand-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                                            <span className="font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded text-[11px]">{loan.idVm || loan.externalId || `#${loan.id}`}</span>
                                                        </td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                isActive ? 'bg-emerald-100 text-emerald-700' :
                                                                isCanceled ? 'bg-gray-100 text-gray-500' :
                                                                'bg-amber-100 text-amber-700'
                                                            }`}>{loan.estado || '—'}</span>
                                                        </td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{loan.fechaPrestamo || loan.fechaDesembolso || loan.date || '—'}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 font-mono">{loan.anioDesembolso || '—'}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-right font-bold text-gray-800 tabular-nums">
                                                            {loan.valorPrestado ? `$${Number(loan.valorPrestado).toLocaleString('es-CO')}` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-center text-gray-600">{loan.numeroCuotas || loan.cuotas || '—'}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-center text-gray-600">
                                                            {loan.interesMensual !== null && loan.interesMensual !== undefined ? `${parseFloat((Number(loan.interesMensual) * 100).toFixed(2))}%` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{loan.banco || loan.modalidad || '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-gray-100 border-t-2 border-gray-200">
                                                <td colSpan={4} className="px-3 py-2 text-[10px] font-black text-gray-600 uppercase">Total desembolsado</td>
                                                <td className="px-3 py-2 text-right font-black text-brand-primary tabular-nums text-sm">
                                                    ${socioLoans.reduce((s, l) => s + parseFloat(l.valorPrestado || 0), 0).toLocaleString('es-CO')}
                                                </td>
                                                <td colSpan={3}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Estado de Préstamos (Cuotas) ────────────────────────── */}
                    {isTotalView && (loadingPayments || socioPayments.length > 0) && (
                        <div className="w-full mt-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <div className="flex flex-col mb-4">
                                <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2 mb-1">
                                    <Activity className="h-5 w-5" /> Lista Estado Préstamos (Cuotas)
                                </h2>
                                <p className="text-xs text-gray-400">
                                    {socioPayments.length} cuota{socioPayments.length !== 1 ? 's' : ''} registrada{socioPayments.length !== 1 ? 's' : ''} · {selectedSocio?.name} {selectedSocio?.surname1}
                                </p>
                            </div>
                            
                            {/* KPI Cards (Row 1) */}
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-4">
                                <PaymentStatCard title="Total Valor Prestado" value={`$${paymentStats.totalValorPrestado.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Suma bruta de préstamos" icon={DollarSign} color="text-emerald-500" />
                                <PaymentStatCard title="Cartera Activa + intereses" value={`$${paymentStats.carteraActiva.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Suma cuotas pendientes" icon={Activity} color="text-emerald-700" />
                                <PaymentStatCard title="Total Recaudo + intereses" value={`$${paymentStats.totalRecaudo.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Suma cuotas pagadas" icon={CheckCircle} color="text-blue-600" />
                                <PaymentStatCard title="Total Intereses" value={`$${paymentStats.totalIntereses.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Intereses amortizados" icon={BarChart3} color="text-amber-500" />
                                <PaymentStatCard title="Cartera en Mora EP" value={`$${paymentStats.moraCartera.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Pendiente con fecha vencida" icon={AlertTriangle} color="text-red-500" customBg="linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)" />
                            </div>

                            {/* KPI Cards (Row 2) */}
                            <div className="grid gap-4 md:grid-cols-3 mb-6">
                                <PaymentStatCard title="Cuotas Totales" value={paymentStats.totalCuotas} description="Registros actuales" icon={PieChart} color="text-gray-500" />
                                <PaymentStatCard title="Cuotas Pagadas" value={paymentStats.cuotasPagadas} description="Estado 'Pago'" icon={CheckCircle} color="text-green-600" />
                                <PaymentStatCard title="Cuotas Pendientes" value={paymentStats.totalCuotas - paymentStats.cuotasPagadas} description="Estado 'Pendiente'" icon={Clock} color="text-amber-600" />
                            </div>

                            {/* Filters */}
                            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50/50 border border-gray-100 rounded-xl print:hidden">
                                <PillSelect icon={Calendar} value={paymentYearFilter} onChange={setPaymentYearFilter} options={[{ value: 'Todos', label: 'Año: Todos' }, ...availablePaymentYears.map(y => ({ value: y, label: String(y) }))]} />
                                <PillSelect icon={CheckCircle} value={paymentStatusFilter} onChange={setPaymentStatusFilter} width="w-48" options={[{ value: 'Todos', label: 'Estado Pago (Todos)' }, { value: 'pago', label: 'Pago' }, { value: 'pendiente', label: 'Pendiente' }, { value: 'mora', label: 'Mora' }]} />
                                <PillSelect icon={Activity} value={paymentLoanStatusFilter} onChange={setPaymentLoanStatusFilter} width="w-56" options={[{ value: 'Todos', label: 'Estado Préstamo (Todos)' }, { value: 'vigente', label: 'Vigente' }, { value: 'activo', label: 'Activo' }, { value: 'cancelado', label: 'Cancelado' }]} />
                            </div>

                            {loadingPayments ? (
                                <div className="flex items-center justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-brand-primary/30" /></div>
                            ) : (
                                <div className="overflow-auto rounded-lg border border-gray-100 max-h-[480px] print:overflow-visible print:max-h-none print:border-gray-200">
                                    <table className="text-xs border-collapse w-full">
                                        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-left font-bold text-gray-500 uppercase tracking-wide text-[10px]">
                                            <tr>
                                                {[
                                                    { key: 'externalId',          label: 'ID Pago',      align: '' },
                                                    { key: 'idVm',                label: 'Préstamo',     align: '' },
                                                    { key: 'itemQuantity',        label: 'Cuota #',      align: 'text-center' },
                                                    { key: 'estado',              label: 'Estado',       align: '' },
                                                    { key: 'fechaPagoMax',        label: 'Fecha Máx',    align: '' },
                                                    { key: 'valorCuotaVariable',  label: 'Valor Cuota',  align: 'text-right' },
                                                    { key: 'valorCuotaPago',      label: 'Valor Pagado', align: 'text-right' },
                                                    { key: 'saldoFinal',          label: 'Saldo Final',  align: 'text-right' },
                                                ].map(col => (
                                                    <th
                                                        key={col.key}
                                                        className={`px-3 py-2.5 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${col.align}`}
                                                        onClick={() => handlePaymentSort(col.key)}
                                                    >
                                                        <span className="inline-flex items-center gap-1">
                                                            {col.label}
                                                            <span className="text-[9px] leading-none">
                                                                {paymentSortConfig.key === col.key
                                                                    ? (paymentSortConfig.dir === 'asc' ? '▲' : '▼')
                                                                    : <span className="text-gray-300">⇅</span>}
                                                            </span>
                                                        </span>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {sortedSocioPayments.map((payment, i) => {
                                                const isPaid = payment.estado === 'Pago';
                                                
                                                // Check Mora intelligently using safeParseDate
                                                const fechaMax = safeParseDate(payment.fechaPagoMax, payment.mesPago);
                                                const todayThreshold = new Date();
                                                todayThreshold.setHours(0, 0, 0, 0);
                                                const isMora = !isPaid && fechaMax && (fechaMax < todayThreshold);
                                                
                                                const isLate = payment.estado?.toLowerCase().includes('mora') || isMora;
                                                const isPending = !isLate && (payment.estado === 'Pendiente' || payment.estado === 'Vigente');
                                                
                                                return (
                                                    <tr key={payment.id || i} className={`transition-colors hover:bg-brand-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                                            <span className="font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded text-[11px]">{payment.externalId || `#${payment.id}`}</span>
                                                        </td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 font-bold">{payment.idVm || '—'}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-center text-gray-600 font-mono">{payment.itemQuantity || '—'} / {payment.cuotasPrestamo || '—'}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                isPaid ? 'bg-emerald-100 text-emerald-700' :
                                                                isLate ? 'bg-rose-100 text-rose-700' :
                                                                isPending ? 'bg-amber-100 text-amber-700' :
                                                                'bg-gray-100 text-gray-500'
                                                            }`}>{payment.estado || '—'}</span>
                                                        </td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{payment.fechaPagoMax || payment.date || '—'}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-right font-bold text-gray-800 tabular-nums">
                                                            {payment.valorCuotaVariable ? `$${Math.round(Number(payment.valorCuotaVariable)).toLocaleString('es-CO')}` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-right font-bold text-emerald-600 tabular-nums">
                                                            {payment.valorCuotaPago && Number(payment.valorCuotaPago) > 0 ? `$${Math.round(Number(payment.valorCuotaPago)).toLocaleString('es-CO')}` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-right font-bold text-gray-600 tabular-nums">
                                                            {payment.saldoFinal !== null && payment.saldoFinal !== undefined ? `$${Math.round(Number(payment.saldoFinal)).toLocaleString('es-CO')}` : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SOLO IMPRESIÓN: Tabla forzada de Capital Ahorrado que abarca todo el ancho necesario */}
                    <div className="hidden print:block w-full mt-8 break-before-auto">
                        <div className="bg-white rounded-2xl print:border-none print:shadow-none">
                            <SavingsDetail
                                title="Capital Ahorrado - Lista Completa"
                                icon={PiggyBank}
                                data={filteredSavings}
                                fullData={filteredSavings}
                                loading={loading}
                                emptyMsg="Sin registros de ahorro para este socio"
                            />
                        </div>
                    </div>


                    {/* Analizador de Capacidad de Préstamo */}
                    {(loadingAnalysis || loanAnalysis) && (
                        <LoanCapacityWidget analysis={loanAnalysis} loading={loadingAnalysis} />
                    )}

                </>
            )}
            {showRankingModal && <RankingModal onClose={() => setShowRankingModal(false)} />}
        </div>
    );
};

const Card = ({ children, className = '', style }) => <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 ${className}`} style={style}>{children}</div>;

const PaymentStatCard = ({ title, value, description, icon: Icon, color, customBg }) => (
    <Card className="transition-all duration-200 overflow-hidden relative !p-5" style={customBg ? { background: customBg, border: 'none' } : {}}>
        <div className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <h3 className="text-[11px] font-bold text-gray-500 tracking-wide uppercase">{title}</h3>
            <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="relative z-10">
            <div className={`text-xl font-black ${customBg ? 'text-gray-900' : 'text-gray-900'}`}>{value}</div>
            <p className="text-[10px] mt-1 text-gray-400 font-medium">{description}</p>
        </div>
    </Card>
);

export default SavingsSummaryPage;
