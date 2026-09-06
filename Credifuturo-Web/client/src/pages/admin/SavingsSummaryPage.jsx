import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../../config/api';
import {
    Users, PiggyBank, BarChart3, CheckCircle, CreditCard,
    AlertTriangle, Database, TrendingUp, Landmark,
    ChevronRight, ArrowUpRight, Loader2, RefreshCw, X, Search,
    Clock, ShieldAlert, Coins, Download, Calendar, ChevronDown, Maximize2, Save
} from 'lucide-react';
import ChartExpandModal, { analyzeMonthlyTrend, analyzeSavingsComposition } from '../../components/ChartExpandModal';
import { useUi } from '../../context/UiContext';
import RepartoUtilidadesPage from '../shared/RepartoUtilidadesPage';
import LoanCapacityWidget from '../../components/admin/LoanCapacityWidget';
import EstadoPrestamosSection from '../../components/EstadoPrestamosSection';
import { computeFundProjection } from '../../utils/fundProjection';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, Cell, AreaChart, Area, LabelList, ReferenceLine,
    PieChart, Pie, Legend
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
                                aria-label="Buscar socio por nombre o cédula"
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

// El "Ranking de Ahorro" que vivía aquí —podio de tres puestos incluido— quedó
// reemplazado por la pantalla de Reparto de Utilidades (pages/shared/
// RepartoUtilidadesPage.jsx), que es lo que este cálculo siempre estuvo
// intentando ser.
//
// Se borró en vez de dejarse convivir con la nueva, y por una razón concreta:
// ponderaba cada movimiento por el MES QUE ACREDITA en lugar del día en que el
// dinero entró, así que a quien pagaba el año entero en enero le reconocía lo
// mismo que a quien pagaba esas doce cuotas en diciembre. Dos pantallas
// mostrando repartos distintos de la misma ganancia es exactamente el problema
// que este proyecto ya arrastró con la ganancia del fondo, y por el que existe
// utils/fundProjection.js. Un solo cálculo, en un solo sitio.
const RankingModal = ({ onClose }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-[#f0f4f8] w-full max-w-5xl h-[96vh] rounded-[2rem] shadow-2xl overflow-y-auto border border-white/30">
            <button onClick={onClose}
                className="sticky top-3 left-full -ml-12 z-10 bg-white/90 hover:bg-white text-gray-500 hover:text-gray-800 rounded-full p-2 shadow-md transition-colors"
                aria-label="Cerrar">
                <X className="h-4 w-4" />
            </button>
            <div className="p-4 sm:p-6 -mt-10">
                <RepartoUtilidadesPage />
            </div>
        </div>
    </div>
);

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

export const AccountSummaryChart = ({ stats }) => {
    // Solo los componentes del patrimonio: el total va en el centro de la dona
    // (mostrarlo como tercera barra duplicaba visualmente sus componentes).
    const barData = useMemo(() => [
        { name: 'Capital Ahorrado', valor: stats?.totalSavings || 0 },
        { name: 'Aportes Iniciales', valor: stats?.totalInitialContributions || 0 },
    ].filter((item) => item.valor > 0), [stats]);

    // Paleta corporativa consistente con el resto de la app: ahorro = verde, aportes = dorado
    const pieData = useMemo(() => [
        { name: 'Capital', value: stats?.totalSavings || 0, color: '#166534' },
        { name: 'Aportes', value: stats?.totalInitialContributions || 0, color: '#f59e0b' },
    ].filter(d => d.value > 0), [stats]);

    const fmtShort = (v) => {
        if (v >= 1000000) return `$${(v / 1000000).toFixed(1).replace('.', ',')}M`;
        if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
        return `$${v}`;
    };

    const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
        if (percent < 0.07) return null;
        const RADIAN = Math.PI / 180;
        const r = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + r * Math.cos(-midAngle * RADIAN);
        const y = cy + r * Math.sin(-midAngle * RADIAN);
        return (
            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
                fontSize={11} fontWeight={800} style={{ pointerEvents: 'none' }}>
                {`${Math.round(percent * 100)}%`}
            </text>
        );
    };

    if (!stats || stats.totalAhorradoGeneral === 0) return null;

    return (
        <div className="w-full h-full flex gap-2">
            <div className="flex-1 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 36, right: 10, left: 0, bottom: 8 }} barSize={56} barGap={8}>
                        <defs>
                            <linearGradient id="sBarGrad0" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22c55e" /><stop offset="100%" stopColor="#166534" />
                            </linearGradient>
                            <linearGradient id="sBarGrad1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#fcd34d" /><stop offset="100%" stopColor="#d97706" />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} dy={6} />
                        <YAxis tickFormatter={fmtShort} axisLine={false} tickLine={false}
                            tick={{ fill: '#94a3b8', fontSize: 10 }} width={55} domain={[0, 'auto']} />
                        <RechartsTooltip cursor={{ fill: 'rgba(22,101,52,0.05)', radius: 8 }}
                            content={<PowerBITooltip showLabel={false} />} />
                        <Bar dataKey="valor" radius={[10, 10, 3, 3]} isAnimationActive={false}
                            label={{ position: 'top', fill: '#1e293b', fontSize: 11, fontWeight: 800,
                                formatter: fmtShort, offset: 10 }}>
                            {barData.map((_, i) => <Cell key={i} fill={`url(#sBarGrad${i})`} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {pieData.length > 1 && (
                <div className="w-[132px] sm:w-[170px] shrink-0 flex flex-col items-center justify-center gap-2">
                    <div className="relative w-full h-[150px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius="58%" outerRadius="88%"
                                    paddingAngle={3} dataKey="value" isAnimationActive={false} stroke="none"
                                    labelLine={false} label={renderPieLabel}>
                                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Pie>
                                <RechartsTooltip content={<PowerBITooltip showLabel={false} />} />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Total del patrimonio en el centro de la dona */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">Total</span>
                            <span className="text-[11px] sm:text-xs font-black text-gray-800 tabular-nums">
                                {fmtShort(stats.totalAhorradoGeneral)}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 w-full px-2 sm:px-3">
                        {pieData.map((d) => (
                            <div key={d.name} className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                <span className="text-[11px] text-gray-500 font-semibold flex-1 truncate">{d.name}</span>
                                <span className="text-[11px] text-gray-800 font-bold tabular-nums">
                                    {Math.round((d.value / (stats?.totalAhorradoGeneral || 1)) * 100)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const MonthlySavingsTrendChart = ({ data, availableYears, selectedYear }) => {
    // El "no hay datos → null" vivía aquí arriba, por delante de los dos useMemo
    // de más abajo, así que en los renders sin datos esos hooks no llegaban a
    // llamarse y el orden cambiaba en cuanto llegaban. Ahora la salida temprana
    // está después de los hooks y estos toleran `data` vacío.
    const showMultiple = selectedYear === 'Todos' && availableYears && availableYears.length > 0;
    const sortedYears = showMultiple ? [...availableYears].sort((a, b) => Number(a) - Number(b)) : [];
    const mainYear   = sortedYears[sortedYears.length - 1];
    const otherYears = sortedYears.slice(0, -1);

    // Paleta corporativa: año en curso = verde Credifuturo; años anteriores = dorado y neutros
    const MAIN_COLOR   = '#166534';
    const OTHER_COLORS = ['#f59e0b', '#94a3b8', '#cbd5e1'];

    // Formateadores con signo: las devoluciones (negativos) se muestran, no se ocultan
    const fmtLabel = (v) => {
        if (!v || v === 0) return '';
        const abs = Math.abs(v), s = v < 0 ? '−' : '';
        if (abs >= 1000000) return `${s}$${(abs / 1000000).toFixed(1).replace('.0', '')}M`;
        if (abs >= 1000)    return `${s}$${(abs / 1000).toFixed(0)}k`;
        return `${s}$${abs}`;
    };
    const fmtTick = (v) => {
        if (!v || v === 0) return '$0';
        const abs = Math.abs(v), s = v < 0 ? '−' : '';
        if (abs >= 1000000) return `${s}$${(abs / 1000000).toFixed(1)}M`;
        return `${s}$${(abs / 1000).toFixed(0)}k`;
    };

    // Solo los meses SIN movimiento (0) pasan a null para no dibujar línea plana falsa.
    // Los negativos (retiros/devoluciones) se conservan: son eventos financieros reales.
    const processedData = useMemo(() => showMultiple
        ? (data || []).map(d => {
            const row = { name: d.name };
            sortedYears.forEach(yr => { row[yr] = d[yr] !== 0 ? d[yr] : null; });
            return row;
          })
        : (data || []),
    [data, showMultiple, sortedYears]);

    const avgOf = (key) => {
        const vals = (data || []).map(d => d[key] || 0).filter(v => v > 0);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };
    const avgValue = showMultiple ? avgOf(mainYear) : avgOf('monto');

    // Índice del máximo y del último valor con dato para labels selectivos
    const dataKey = showMultiple ? mainYear : 'monto';
    const { maxIdx, lastIdx } = useMemo(() => {
        let maxIdx = -1, lastIdx = -1, maxVal = -Infinity;
        processedData.forEach((d, i) => {
            const v = d[dataKey] || 0;
            if (v > maxVal) { maxVal = v; maxIdx = i; }
            if (v > 0) lastIdx = i;
        });
        return { maxIdx, lastIdx };
    }, [processedData, dataKey]);

    // Salida temprana, ya con todos los hooks llamados (ver el comentario de la
    // cabecera del componente).
    if (!data || data.length === 0) return null;

    const customDot = (props, isMain) => {
        const { cx, cy, index, value } = props;
        if (!value || value === 0) return null;
        const isSpecial = index === maxIdx || index === lastIdx;
        const esRetiro = value < 0; // devolución/retiro: punto rojo para que no pase inadvertido
        return (
            <circle key={`dot-${index}`} cx={cx} cy={cy}
                r={esRetiro ? 5 : isSpecial ? 5 : 3.5}
                fill={esRetiro ? '#dc2626' : isMain ? MAIN_COLOR : OTHER_COLORS[0]}
                stroke="#fff" strokeWidth={isSpecial || esRetiro ? 2 : 1.5} />
        );
    };

    const customLabel = (props) => {
        const { x, y, index, value } = props;
        if (!value || value === 0) return null;
        if (index !== maxIdx && index !== lastIdx) return null;
        if (maxIdx === lastIdx && index !== maxIdx) return null;
        return (
            <text key={`lbl-${index}`} x={x} y={y - 10} textAnchor="middle"
                fill={MAIN_COLOR} fontSize={10} fontWeight={800}>
                {fmtLabel(value)}
            </text>
        );
    };

    return (
        <div className="w-full h-full pb-2">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={processedData} margin={{ top: 32, right: 48, left: 5, bottom: 5 }}>
                    <defs>
                        <linearGradient id="pbGradMain" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"  stopColor={MAIN_COLOR} stopOpacity={0.28} />
                            <stop offset="85%" stopColor={MAIN_COLOR} stopOpacity={0.03} />
                        </linearGradient>
                        {otherYears.map((yr, i) => (
                            <linearGradient key={yr} id={`pbGrad${yr}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"  stopColor={OTHER_COLORS[i] || '#94a3b8'} stopOpacity={0.18} />
                                <stop offset="85%" stopColor={OTHER_COLORS[i] || '#94a3b8'} stopOpacity={0.02} />
                            </linearGradient>
                        ))}
                    </defs>

                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeWidth={1} />

                    <XAxis dataKey="name" axisLine={false} tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }}
                        interval={0} padding={{ left: 12, right: 12 }} />

                    <YAxis axisLine={false} tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={fmtTick}
                        domain={[(dataMin) => Math.min(0, dataMin || 0), 'auto']}
                        allowDataOverflow={false}
                        width={50} />

                    <RechartsTooltip content={<PowerBITooltip />} />

                    {showMultiple && (
                        <Legend
                            verticalAlign="top"
                            align="left"
                            height={26}
                            iconType="plainline"
                            wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingLeft: 8 }}
                        />
                    )}

                    {avgValue > 0 && (
                        <ReferenceLine y={avgValue} stroke="#94a3b8" strokeDasharray="6 4" strokeWidth={1.5}
                            label={{ value: `Prom: ${fmtLabel(avgValue)}`, position: 'insideTopRight',
                                fill: '#64748b', fontSize: 10, fontWeight: 700, dx: -4, dy: -12 }} />
                    )}

                    {showMultiple ? (
                        <>
                            {otherYears.map((year, i) => (
                                <Area key={year} type="monotone" dataKey={year} name={`Año ${year}`}
                                    stroke={OTHER_COLORS[i] || '#94a3b8'} strokeWidth={1.5}
                                    strokeDasharray="5 3"
                                    fill={`url(#pbGrad${year})`} fillOpacity={1}
                                    dot={false} activeDot={{ r: 4, fill: OTHER_COLORS[i] || '#94a3b8', stroke: '#fff', strokeWidth: 1.5 }}
                                    connectNulls={false} baseValue={0}
                                    isAnimationActive={false}
                                />
                            ))}
                            <Area type="monotone" dataKey={mainYear} name={`Año ${mainYear}`}
                                stroke={MAIN_COLOR} strokeWidth={2.5}
                                fill="url(#pbGradMain)" fillOpacity={1}
                                dot={(props) => customDot(props, true)}
                                connectNulls={false} baseValue={0}
                                activeDot={{ r: 6, fill: MAIN_COLOR, stroke: '#fff', strokeWidth: 2 }}
                                isAnimationActive={false}
                                label={customLabel}
                            />
                        </>
                    ) : (
                        <Area type="monotone" dataKey="monto" name="Ahorro Mensual"
                            stroke={MAIN_COLOR} strokeWidth={2.5}
                            fill="url(#pbGradMain)" fillOpacity={1}
                            dot={(props) => customDot(props, true)}
                            baseValue={0}
                            activeDot={{ r: 6, fill: MAIN_COLOR, stroke: '#fff', strokeWidth: 2 }}
                            isAnimationActive={false}
                            label={customLabel}
                        />
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
                    {/* Sin título propio: lo da el encabezado del layout. Queda el
                        nombre del socio consultado, que es justo lo que cambia de
                        una consulta a otra y el encabezado no puede saber. */}
                    <h1 className="text-xl font-black text-gray-900 leading-none">{!lockedSocio && user?.name ? `${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim() : (lockedSocio && lockedSocio.name ? lockedSocio.name : 'Socio')}</h1>
                    <p className="text-[11px] text-gray-400 font-semibold mt-0.5 uppercase tracking-wide">Estado de cuenta individual</p>
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
            
            {/* Hero del socio — solo en la vista de socio (hideControls) */}
            {hideControls && selectedSocio && (
                <div className="rounded-2xl overflow-hidden shadow-card print:hidden"
                     style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 70%, #14532d 100%)' }}>
                    <div className="p-5 lg:p-6 text-white">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-white/15 ring-2 ring-white/20 flex items-center justify-center font-black text-lg flex-shrink-0">
                                {(selectedSocio.name || '?')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="text-lg font-extrabold leading-tight truncate">
                                    {selectedSocio.name} {selectedSocio.surname1} {selectedSocio.surname2 || ''}
                                </p>
                                <p className="text-xs text-white/60 font-mono mt-0.5">
                                    C.C. {selectedSocio.cedula}{selectedSocio.customerId ? ` · ${selectedSocio.customerId}` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/10">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                                    {selectedYear === 'Todos' ? 'Total en el fondo' : `Total en ${selectedYear}`}
                                </p>
                                <p className="text-base lg:text-xl font-extrabold text-brand-gold tabular-nums">
                                    ${Math.round(userStats.totalAhorradoGeneral || 0).toLocaleString('es-CO')}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Ahorros mensuales</p>
                                <p className="text-base lg:text-xl font-extrabold tabular-nums">
                                    ${Math.round(userStats.totalSavings || 0).toLocaleString('es-CO')}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Aportes iniciales</p>
                                <p className="text-base lg:text-xl font-extrabold tabular-nums">
                                    ${Math.round(userStats.totalInitialContributions || 0).toLocaleString('es-CO')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Socio Selector & Year Filter Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-4 lg:p-6 rounded-2xl border border-gray-100 shadow-sm relative z-50 print:hidden">
                {!hideControls && (
                    <div className="flex-1 max-w-xl">
                        <SocioSelect clients={clients} selectedSocio={selectedSocio} onSelect={handleSelectSocio} />
                    </div>
                )}
                {hideControls && (
                    <div>
                        <p className="text-sm font-bold text-gray-700">Tu estado de cuenta</p>
                        <p className="text-xs text-gray-400">Filtra por año o descarga tu informe en PDF</p>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-3 shrink-0 print:hidden">
                    <button
                        onClick={() => window.print()}
                        className="bg-brand-primary hover:bg-brand-dark text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all active:scale-95 flex items-center gap-2 group min-h-[44px]"
                    >
                        <Download className="h-4 w-4 group-hover:-translate-y-1 transition-transform" /> Informe PDF
                    </button>
                    {!hideControls && (
                        <button
                            onClick={() => setShowRankingModal(true)}
                            className="bg-amber-400 hover:bg-amber-500 text-amber-950 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-amber-400/20 transition-all active:scale-95 flex items-center gap-2 group min-h-[44px]"
                        >
                            <Coins className="h-4 w-4 group-hover:rotate-12 transition-transform" /> Reparto
                        </button>
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
                    <button onClick={() => selectedSocio && fetchData(selectedSocio.cedula)} className="p-3.5 rounded-xl bg-brand-primary text-white hover:bg-brand-dark transition-all shadow-lg shadow-brand-primary/20 active:scale-95 min-h-[44px]"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
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
                                    <BarChart3 className="h-5 w-5" /> Composición del Patrimonio
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
                        title="Composición del Patrimonio — Capital Ahorrado vs Aportes"
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
                        <EstadoPrestamosSection
                            payments={socioPayments}
                            loans={socioLoans}
                            loading={loadingPayments}
                            socioName={`${selectedSocio?.name || ''} ${selectedSocio?.surname1 || ''}`.trim()}
                        />
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

export default SavingsSummaryPage;
