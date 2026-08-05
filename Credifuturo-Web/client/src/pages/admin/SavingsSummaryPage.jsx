import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../../config/api';
import {
    Users, PiggyBank, BarChart3, CheckCircle, CreditCard,
    AlertTriangle, Database, TrendingUp, Landmark,
    ChevronRight, ArrowUpRight, Loader2, RefreshCw, X, Search,
    Clock, ShieldAlert, Trophy, Download, Calendar, ChevronDown, Maximize2, Save
} from 'lucide-react';
import ChartExpandModal, { analyzeMonthlyTrend, analyzeSavingsComposition } from '../../components/ChartExpandModal';
import { useUi } from '../../context/UiContext';
import LoanCapacityWidget from '../../components/admin/LoanCapacityWidget';
import EstadoPrestamosSection from '../../components/EstadoPrestamosSection';
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

// ── Método de Saldo Promedio Ponderado (SFC/FIC Colombia) ─────────────────
// Idéntico al usado por Fondos de Inversión Colectiva regulados por la SFC.
// Cada aporte se pondera por los meses que estuvo invertido en el período.
// Fórmula: saldoPromedio = Σ (aporte_mes × meses_restantes_en_período / N_meses)
// Esto hace que el dinero depositado en Enero valga 12× más que el de Diciembre,
// de forma proporcional y justa — exactamente como en fondos de inversión reales.
const MESES_PERIODO = 12; // Período anual del fondo
const NOMBRES_MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Calcula el saldo promedio de un socio dado su historial de aportes mensuales
const calcSaldoPromedio = (monthlyData = []) => {
    if (!monthlyData || monthlyData.length === 0) return { saldoPromedio: 0, desgloseMes: [] };
    let saldoPromedio = 0;
    const desgloseMes = [];
    monthlyData.forEach(aporte => {
        const mes = aporte.monthInt || 12;
        const anio = aporte.year || new Date().getFullYear();
        const monto = aporte.amount || 0;
        // Meses que este aporte estuvo trabajando en el fondo durante el período
        const mesesInvertidos = Math.max(MESES_PERIODO - mes + 1, 1);
        const factor = mesesInvertidos / MESES_PERIODO; // e.g. Ene=1.0, Jun=0.583, Dic=0.083
        const contribucion = monto * factor;
        saldoPromedio += contribucion;
        desgloseMes.push({
            mes, anio,
            mesNombre: aporte.esAperturaAnual ? `Saldo inicial ${anio}` : `${NOMBRES_MES[mes] || `M${mes}`} ${anio}`,
            mesNombreCorto: aporte.esAperturaAnual ? 'Apertura' : (NOMBRES_MES[mes] || `M${mes}`),
            monto, mesesInvertidos, factor, contribucion,
            esAperturaAnual: !!aporte.esAperturaAnual,
        });
    });
    // Ordenar de más reciente a más antiguo (ej: Dic 2025 → Ene 2025)
    desgloseMes.sort((a, b) => (b.anio * 12 + b.mes) - (a.anio * 12 + a.mes));
    return { saldoPromedio, desgloseMes };
};

export const RankingBox = ({ onClose = null, embedded = false }) => {
    const [ranking, setRanking] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [anomalias, setAnomalias] = useState([]);
    const [excluidosSinAhorro, setExcluidosSinAhorro] = useState(0);
    const [showAnomalias, setShowAnomalias] = useState(false);
    const [search, setSearch] = useState('');
    const [utilidadesDistribuir, setUtilidadesDistribuir] = useState('');
    const [guardandoUtilidades, setGuardandoUtilidades] = useState(false);
    const [utilidadesGuardadas, setUtilidadesGuardadas] = useState(false);
    const [gananciaRealFondo, setGananciaRealFondo] = useState(0);
    const [expandedId, setExpandedId] = useState(null);
    const [showExplainer, setShowExplainer] = useState(true);
    // Evita que "Sincronizar" pise un valor de utilidades que el comité está
    // escribiendo pero aún no ha guardado.
    const utilidadesSinGuardarRef = useRef(false);

    const fetchAll = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) setRefreshing(true); else setLoading(true);
        try {
            const [rankRes, statsRes] = await Promise.allSettled([
                api.get('/admin/savings/ranking'),
                api.get('/admin/dashboard-stats'),
            ]);

            // Ganancia real = intereses cobrados + NU + penalidades (idéntico al Executive Panel)
            let gananciaReal = 0;
            if (statsRes.status === 'fulfilled') {
                const s = statsRes.value.data;
                gananciaReal = (s.totalInteresesPagados || 0)
                    + (s.rentabilidadCajaNU || 0)
                    + (s.totalPenaltyValue || 0);
                setGananciaRealFondo(gananciaReal);
            }

            if (rankRes.status === 'fulfilled' && rankRes.value.data.ok) {
                const d = rankRes.value.data;

                // ── Saldo Promedio Ponderado (método FIC/SFC Colombia) ──
                // La distribución es proporcional al saldo promedio anual.
                // Cada aporte se pondera por: (meses invertidos / 12)
                // Enero = 12/12 = 100% del año · Julio = 6/12 = 50% · Dic = 1/12 ≈ 8%
                const processedRanking = (d.data || []).map(socio => {
                    const { saldoPromedio, desgloseMes } = calcSaldoPromedio(socio.monthlyData);
                    return {
                        ...socio,
                        saldoPromedio,
                        desgloseMes,
                        // Alias para compatibilidad con variables existentes
                        puntajeFinal: saldoPromedio,
                        ahorroPonderado: saldoPromedio,
                    };
                }).sort((a, b) => b.saldoPromedio - a.saldoPromedio);

                setRanking(processedRanking);
                setAnomalias(d.anomalias || []);
                setExcluidosSinAhorro(d.excluidosSinAhorro || 0);
                setLastUpdated(d.calculatedAt ? new Date(d.calculatedAt) : new Date());

                if (!utilidadesSinGuardarRef.current) {
                    // Prioridad: (1) valor del comité en AppSettings (siempre que NO sea el valor legacy erróneo),
                    // (2) ganancia real del fondo (fuente correcta del dashboard),
                    // (3) devoluciones históricas como último fallback.
                    const valorGuardado = Number(d.utilidadesADistribuir) || 0;
                    const esValorLegacyErroneo = valorGuardado > 0 && valorGuardado === (d.totalDevolucionIntereses || 0);

                    const sugerido = (valorGuardado > 0 && !esValorLegacyErroneo)
                        ? valorGuardado
                        : gananciaReal > 0
                            ? gananciaReal
                            : (d.totalDevolucionIntereses || 0);

                    setUtilidadesDistribuir(sugerido > 0 ? sugerido.toLocaleString('es-CO') : '');
                    setUtilidadesGuardadas(valorGuardado > 0 && !esValorLegacyErroneo);
                }
            }
        } catch (err) {
            console.error('Error fetching ranking:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchAll(false); }, [fetchAll]);


    const guardarUtilidades = async () => {
        const valor = Number(String(utilidadesDistribuir).replace(/\D/g, '')) || 0;
        if (valor <= 0) return;
        setGuardandoUtilidades(true);
        try {
            await api.put('/admin/settings/utilidadesADistribuir', { value: valor });
            setUtilidadesGuardadas(true);
            utilidadesSinGuardarRef.current = false;
        } catch (err) {
            console.error('Error guardando utilidades:', err.message);
        } finally {
            setGuardandoUtilidades(false);
        }
    };

    const MEDAL_CONFIGS = [
        { medal: '🥇', ringColor: 'ring-amber-300', avatarGrad: 'from-brand-gold to-amber-600', barGrad: 'from-brand-gold to-amber-500', podiumGrad: 'from-amber-300 to-brand-gold', labelColor: 'text-amber-700', badgeBg: 'bg-amber-100' },
        { medal: '🥈', ringColor: 'ring-slate-300', avatarGrad: 'from-slate-400 to-slate-600', barGrad: 'from-slate-400 to-slate-500', podiumGrad: 'from-slate-300 to-slate-500', labelColor: 'text-slate-600', badgeBg: 'bg-slate-100' },
        { medal: '🥉', ringColor: 'ring-orange-300', avatarGrad: 'from-orange-500 to-amber-700', barGrad: 'from-orange-500 to-amber-600', podiumGrad: 'from-orange-400 to-amber-600', labelColor: 'text-orange-700', badgeBg: 'bg-orange-100' },
    ];
    const REST_COLORS = [
        'from-brand-primary to-brand-dark', 'from-sky-400 to-blue-600',
        'from-teal-400 to-teal-600', 'from-amber-400 to-brand-gold',
        'from-emerald-400 to-emerald-700', 'from-cyan-400 to-cyan-700',
        'from-lime-500 to-green-700', 'from-blue-400 to-blue-700',
        'from-green-400 to-teal-700', 'from-slate-500 to-slate-700',
    ];

    const getInitials = (name) => name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
    const fmt = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-CO')}`;
    const fmtCorto = (v) => { const n = Number(v) || 0; if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`; if (n >= 1_000) return `$${Math.round(n / 1_000)}k`; return `$${n}`; };

    const totalAhorroNeto = ranking.reduce((sum, r) => sum + Number(r.totalNetSavings), 0);
    // totalSaldoPromedio: suma de los saldos promedio de todos los socios.
    // La participación de cada socio = su_saldoPromedio / totalSaldoPromedio
    const totalSaldoPromedio = ranking.reduce((sum, r) => sum + (r.saldoPromedio || 0), 0);
    const maxSaldo = ranking.length > 0 ? (ranking[0].saldoPromedio || 1) : 1;
    const utilidadesParsed = Number(String(utilidadesDistribuir).replace(/\D/g, '')) || 0;
    const filtered = search ? ranking.filter(r => r.fullName.toLowerCase().includes(search.toLowerCase())) : ranking;
    const top3 = ranking.slice(0, 3);
    const rest = ranking.slice(3);
    const pctDistribuido = gananciaRealFondo > 0 ? Math.round((utilidadesParsed / gananciaRealFondo) * 100) : 0;
    const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

    // Ejemplo real para la explicación del método (usa el propio historial del socio, sin inventar cifras)
    const ejemploSocio = ranking.find(r => r.fullName.trim().toLowerCase().startsWith('vladimir escobar')) || ranking[0];
    const ejemploFilas = (() => {
        if (!ejemploSocio || !ejemploSocio.desgloseMes?.length) return [];
        const porFactor = [...ejemploSocio.desgloseMes].sort((a, b) => b.factor - a.factor);
        if (porFactor.length < 3) return porFactor;
        const medio = porFactor[Math.floor(porFactor.length / 2)];
        return [porFactor[0], medio, porFactor[porFactor.length - 1]];
    })();
    const ejemploPct = (ejemploSocio && totalSaldoPromedio > 0) ? (ejemploSocio.saldoPromedio / totalSaldoPromedio) * 100 : 0;
    const ejemploUtilidad = (ejemploPct / 100) * utilidadesParsed;

    const renderRow = (entry, globalIndex) => {
        const pos = globalIndex + 1;
        const saldo = entry.saldoPromedio || 0;
        const pctFloat = totalSaldoPromedio > 0 ? saldo / totalSaldoPromedio : 0;
        const pct = (pctFloat * 100).toFixed(2);
        const barWidth = maxSaldo > 0 ? Math.round((saldo / maxSaldo) * 100) : 0;
        const gananciaEstimada = pctFloat * utilidadesParsed;
        const isTop = pos <= 3;
        const isExpanded = expandedId === entry.customerId;
        const cfg = isTop ? MEDAL_CONFIGS[pos - 1] : null;
        const avatarGrad = cfg ? cfg.avatarGrad : (REST_COLORS[(globalIndex - 3) % REST_COLORS.length]);
        const barGrad = cfg ? cfg.barGrad : 'from-emerald-400 to-emerald-600';
        const baseAhorro = Number(entry.totalNetSavings) || 0;
        const desglose = entry.desgloseMes || [];
        // Aporte más temprano y más tardío para contexto
        const primerMes = desglose.length > 0 ? desglose[0] : null;
        const eficienciaFactor = baseAhorro > 0 ? (saldo / baseAhorro) : 0; // qué fracción del año promedio estuvo el dinero

        return (
            <div key={entry.customerId} className="flex flex-col">
                {/* ── Fila principal (clickeable) ── */}
                <div
                    onClick={() => toggleExpand(entry.customerId)}
                    className={`group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 cursor-pointer select-none
                        border ${ isExpanded
                            ? 'bg-white shadow-lg shadow-emerald-500/10 border-emerald-200 rounded-b-none'
                            : isTop
                                ? 'bg-gradient-to-r from-emerald-50/60 to-transparent border-transparent hover:bg-white hover:shadow-lg hover:border-emerald-100'
                                : 'bg-gray-50/30 border-transparent hover:bg-white hover:shadow-md hover:border-gray-100'
                        }`}>
                    {isTop
                        ? <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0 ${cfg.badgeBg}`}>{cfg.medal}</div>
                        : <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-black text-gray-400 flex-shrink-0 shadow-sm">{pos}</div>
                    }
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0 shadow-md ring-2 ring-white`}>
                        {getInitials(entry.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className={`text-sm font-bold leading-tight truncate transition-colors ${isExpanded ? 'text-emerald-700' : 'text-gray-900 group-hover:text-emerald-700'}`}>
                            {entry.fullName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex-1 h-1.5 bg-gray-200/60 rounded-full overflow-hidden max-w-[120px]">
                                <div className={`h-full bg-gradient-to-r ${barGrad} rounded-full`} style={{ width: `${barWidth}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">
                                {primerMes ? `desde ${primerMes.mesNombre}` : entry.customerId}
                            </span>
                            {entry.liquidadoPreviamente && (
                                <span title={`Solicitó una Devolución Total de Intereses en ${NOMBRES_MES[entry.liquidacionMesAnio?.mes] || ''} ${entry.liquidacionMesAnio?.anio || ''}: se le devolvió lo ahorrado hasta esa fecha. Solo cuenta lo ahorrado después de esa fecha.`}
                                    className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 cursor-help flex-shrink-0">
                                    🔄 retiró ahorros previos
                                </span>
                            )}
                        </div>
                    </div>
                    {/* Columna: Ahorrado */}
                    <div className="text-right flex-shrink-0 hidden sm:flex flex-col items-end justify-center">
                        <div className="text-sm font-black text-gray-800 tabular-nums">{fmt(baseAhorro)}</div>
                    </div>
                    {/* Columna: Utilidad estimada */}
                    <div className={`flex-shrink-0 min-w-[7rem] text-right rounded-xl px-3 py-2 border ${
                        isTop ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200/60' : 'bg-white border-gray-100'
                    }`}>
                        <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Utilidad est.</div>
                        <div className={`text-sm font-black tabular-nums mt-0.5 ${isTop ? 'text-emerald-700' : 'text-gray-800'}`}>{fmt(gananciaEstimada)}</div>
                        <div className="text-[9px] text-gray-400">{pct}%</div>
                    </div>
                    <div className={`flex-shrink-0 w-5 h-5 flex items-center justify-center transition-transform duration-200 text-gray-300 ${isExpanded ? 'rotate-180 text-emerald-500' : ''}`}>
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                </div>

                {/* ── Panel de desglose (expandible) ── */}
                {isExpanded && (
                    <div className="bg-white border border-emerald-200 border-t-0 rounded-b-2xl px-5 py-5 shadow-lg shadow-emerald-500/10"
                        style={{ animation: 'rankingFadeIn 0.15s ease both' }}>
                        {/* Título y leyenda */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                <div className="w-1 h-3 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full" />
                                Método Saldo Promedio Ponderado · Estándar FIC/SFC
                            </div>
                            <div className="text-[9px] text-gray-400 italic">Igual que un fondo de inversión colombiano</div>
                        </div>

                        {/* ── Aviso de liquidación previa (Devolución Total) ── */}
                        {entry.liquidadoPreviamente && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                <p>
                                    <strong>{entry.fullName}</strong> solicitó una <strong>Devolución Total de Intereses</strong> en {NOMBRES_MES[entry.liquidacionMesAnio?.mes] || ''} {entry.liquidacionMesAnio?.anio || ''} — se le devolvió lo ahorrado hasta esa fecha (el comité ya repartió utilidades sobre eso a todos los socios, así que no se cuenta de nuevo aquí).
                                    Por eso su <strong>saldo inicial de este año</strong> es {fmt(entry.saldoAperturaAnio || 0)}: solo lo que le quedó después de esa devolución, más lo que ha ahorrado desde entonces.
                                </p>
                            </div>
                        )}

                        {/* ── EXPLICACIÓN EN LENGUAJE CLARO ── */}
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-sm text-blue-900 leading-relaxed">
                            <div className="font-black text-blue-700 mb-1.5 text-xs uppercase tracking-wider">💬 ¿Cómo se calcula tu participación en las utilidades?</div>
                            <p>
                                El fondo reparte las ganancias de forma <strong>justa y proporcional</strong>: no solo importa <em>cuánto</em> ahorraste,
                                sino <em>cuándo</em> lo hiciste. Un peso que lleva todo el año en el fondo “trabajó” más que uno que entró en diciembre,
                                exactamente como funciona en cualquier fondo de inversión real.
                            </p>
                            {desglose.length > 0 && (() => {
                                // Ordenados de más antiguo a más reciente para la explicación
                                const mej = [...desglose].sort((a, b) => (a.anio * 12 + a.mes) - (b.anio * 12 + b.mes))[0];
                                const peor = [...desglose].sort((a, b) => (b.anio * 12 + b.mes) - (a.anio * 12 + a.mes))[0];
                                const factorPct = (eficienciaFactor * 100).toFixed(0);
                                let mensaje;
                                if (eficienciaFactor >= 0.80) {
                                    mensaje = `👏 Excelente. Tu dinero estuvo disponible para el fondo el <strong>${factorPct}% del año</strong> en promedio. Eso significa que has sido un socio muy constante y tu participación en las utilidades refleja ese compromiso.`;
                                } else if (eficienciaFactor >= 0.50) {
                                    mensaje = `❤️ Buen trabajo. Tu dinero estuvo en el fondo el <strong>${factorPct}% del año</strong> en promedio. Si el próximo año empiezas a ahorrar desde enero, tu participación aumentará considerablemente.`;
                                } else {
                                    mensaje = `📅 Ingresaste al fondo más adelante en el año, por eso tu dinero solo estuvo disponible el <strong>${factorPct}% del tiempo</strong>. Eso está bien — el próximo año, si ahorras desde enero, tu participación será mayor.`;
                                }
                                return (
                                    <p className="mt-2" dangerouslySetInnerHTML={{ __html: mensaje }} />
                                );
                            })()}
                            <p className="mt-2 text-blue-600 text-xs">
                                Tu <strong>Saldo Promedio</strong> de <strong>{fmt(saldo)}</strong> es la suma de cada aporte multiplicado por su Factor (ver tabla abajo) — así se mide cuánto "pesó" tu ahorro durante el año, no solo cuánto ahorraste.
                                Tu porcentaje del fondo ({pct}%) es <em>tu Saldo Promedio dividido por el Saldo Promedio de todos los socios juntos</em>.
                            </p>
                        </div>

                        {/* Resumen de 3 KPIs */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-center">
                                <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">💰 Ahorrado</div>
                                <div className="text-sm font-black text-gray-800 tabular-nums mt-0.5">{fmt(baseAhorro)}</div>
                                <div className="text-[9px] text-gray-400">{desglose.length} aporte{desglose.length !== 1 ? 's' : ''}</div>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-center">
                                <div className="text-[9px] font-black uppercase tracking-wider text-blue-500">⚖️ Saldo Promedio</div>
                                <div className="text-sm font-black text-blue-700 tabular-nums mt-0.5">{fmt(saldo)}</div>
                                <div className="text-[9px] text-blue-400">{(eficienciaFactor * 100).toFixed(0)}% del año con dinero invertido</div>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-center">
                                <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600">💵 Utilidad</div>
                                <div className="text-sm font-black text-emerald-700 tabular-nums mt-0.5">{fmt(gananciaEstimada)}</div>
                                <div className="text-[9px] text-emerald-500">{pct}% del total</div>
                            </div>
                        </div>

                        {/* Tabla de aportes mes a mes */}
                        {desglose.length > 0 && (
                            <div className="rounded-xl overflow-hidden border border-gray-100">
                                <div className="px-3 py-1.5 text-[9px] text-gray-400 bg-gray-50/60 border-b border-gray-100 leading-relaxed">
                                    <strong className="text-gray-500">Meses inv.</strong> = meses del año que ese aporte estuvo en el fondo · <strong className="text-gray-500">Factor</strong> = Meses inv. ÷ 12 · <strong className="text-gray-500">Contribución</strong> = Aportado × Factor (esto es lo que suma a tu Saldo Promedio)
                                </div>
                                <div className="grid grid-cols-5 bg-gray-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                    <div>Mes / Año</div>
                                    <div className="text-right">Aportado</div>
                                    <div className="text-right">Meses inv.</div>
                                    <div className="text-right">Factor</div>
                                    <div className="text-right">Contribución</div>
                                </div>
                                <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                                    {desglose.map((d, i) => (
                                        <div key={i} className="grid grid-cols-5 px-3 py-1.5 text-[10px] hover:bg-blue-50/40 transition-colors">
                                            <div className="font-bold text-gray-700">{d.mesNombre}</div>
                                            <div className="text-right text-gray-600 tabular-nums">{fmt(d.monto)}</div>
                                            <div className="text-right font-bold text-blue-600">{d.mesesInvertidos} / {MESES_PERIODO}</div>
                                            <div className="text-right text-gray-500">{(d.factor * 100).toFixed(1)}%</div>
                                            <div className="text-right font-black text-blue-700 tabular-nums">{fmt(d.contribucion)}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-5 px-3 py-2 bg-blue-50 border-t border-blue-100 text-[10px]">
                                    <div className="font-black text-blue-700 col-span-1">Total</div>
                                    <div className="text-right font-black text-gray-800 tabular-nums">{fmt(baseAhorro)}</div>
                                    <div />
                                    <div />
                                    <div className="text-right font-black text-blue-700 tabular-nums">{fmt(saldo)}</div>
                                </div>
                            </div>
                        )}

                        {/* Fórmula y chip de resultado */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100">
                            <div className="text-[9px] text-gray-400 font-mono leading-relaxed">
                                Participación = {fmt(saldo)} / {fmt(totalSaldoPromedio)} = {pct}%<br/>
                                Utilidad = {pct}% × {fmt(utilidadesParsed)} = <span className="font-black text-gray-700">{fmt(gananciaEstimada)}</span>
                            </div>
                            <div className="bg-gradient-to-r from-brand-primary to-brand-dark text-white rounded-xl px-4 py-2.5 text-center shadow-md">
                                <div className="text-[9px] font-black uppercase tracking-wider opacity-80">Utilidad Estimada</div>
                                <div className="text-xl font-black tabular-nums">{fmt(gananciaEstimada)}</div>
                                <div className="text-[9px] opacity-80">{pct}% de {fmt(utilidadesParsed)}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`relative bg-[#f0f4f8] w-full rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-white/30 ${embedded ? '' : 'max-w-5xl h-[96vh]'}`}
            style={embedded ? {} : { animation: 'rankingFadeIn 0.25s ease both' }}>
            <style>{`@keyframes rankingFadeIn { from { opacity:0; transform:scale(0.97) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>

                {/* ── HEADER ── */}
                <div className="relative shrink-0 px-6 pt-6 pb-5 bg-gradient-to-br from-brand-dark via-brand-primary to-brand-dark text-white overflow-hidden z-10">
                    <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-brand-gold/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center text-3xl shadow-lg ring-1 ring-white/20 flex-shrink-0">🏆</div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tight text-white">Ranking de Ahorro</h2>
                                <p className="text-xs font-semibold text-white/70 mt-0.5 flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5 text-brand-gold flex-shrink-0" />
                                    Saldo Promedio Ponderado · Método FIC/SFC Colombia
                                </p>
                                <p className="text-[10px] text-white/50 mt-0.5">Haz clic en un socio para ver su desglose mes a mes</p>
                                {lastUpdated && (
                                    <p className="text-[10px] text-white/40 mt-0.5 flex items-center gap-1">
                                        Actualizado {lastUpdated.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        {refreshing && <span className="text-blue-300 font-semibold">· sincronizando…</span>}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-2xl border border-white/15 p-1.5 flex-shrink-0">
                            <div className="px-3 py-1">
                                <div className="text-[9px] font-black uppercase tracking-widest text-brand-gold/90 mb-0.5 flex items-center gap-1">
                                    💰 Ganancia a Distribuir
                                    {utilidadesGuardadas && <span className="text-emerald-300 normal-case tracking-normal font-bold">· del comité ✓</span>}
                                </div>
                                <input
                                    type="text"
                                    value={utilidadesDistribuir}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        setUtilidadesDistribuir(val ? Number(val).toLocaleString('es-CO') : '');
                                        setUtilidadesGuardadas(false);
                                        utilidadesSinGuardarRef.current = true;
                                    }}
                                    className="w-32 bg-transparent text-base font-black text-white outline-none placeholder:text-white/30 focus:text-brand-gold transition-colors"
                                    placeholder="0"
                                />
                                {gananciaRealFondo > 0 && (
                                    <div className={`text-[9px] leading-tight ${pctDistribuido > 100 ? 'text-red-300 font-bold' : 'text-white/50'}`}>
                                        Ganancia real: <span className="font-bold text-brand-gold">{fmtCorto(gananciaRealFondo)}</span> · {pctDistribuido}% a distribuir
                                        {pctDistribuido > 100 && ' ⚠️ supera la ganancia real'}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-1">
                                <button onClick={() => fetchAll(true)} disabled={refreshing || loading}
                                    title="Sincronizar: recalcula con los datos más recientes y revalida"
                                    className="p-2.5 rounded-xl bg-white/10 hover:bg-sky-400/20 hover:text-sky-200 text-white/70 transition-all disabled:opacity-50">
                                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                </button>
                                <button onClick={guardarUtilidades} disabled={guardandoUtilidades || utilidadesGuardadas || utilidadesParsed <= 0}
                                    title="Guardar como valor oficial del comité"
                                    className={`p-2.5 rounded-xl transition-all ${utilidadesGuardadas ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 hover:bg-brand-gold/20 hover:text-brand-gold text-white/70'} disabled:opacity-50`}>
                                    {guardandoUtilidades ? <Loader2 className="h-4 w-4 animate-spin" /> : utilidadesGuardadas ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                </button>
                                {onClose && (
                                    <button onClick={onClose} className="p-2.5 bg-white/10 hover:bg-red-400/20 hover:text-red-300 text-white/70 rounded-xl transition-all"><X className="h-4 w-4" /></button>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Aviso de validación: datos que ameritan revisión antes de repartir */}
                    {!loading && anomalias.length > 0 && (
                        <div className="relative mt-3 bg-red-500/15 border border-red-300/30 rounded-xl overflow-hidden">
                            <button onClick={() => setShowAnomalias(v => !v)}
                                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left">
                                <span className="flex items-center gap-2 text-xs font-black text-red-100">
                                    <ShieldAlert className="w-4 h-4 text-red-300 flex-shrink-0" />
                                    {anomalias.length} socio{anomalias.length !== 1 ? 's' : ''} requiere{anomalias.length === 1 ? '' : 'n'} revisión antes de repartir
                                </span>
                                <ChevronDown className={`w-4 h-4 text-red-200 flex-shrink-0 transition-transform ${showAnomalias ? 'rotate-180' : ''}`} />
                            </button>
                            {showAnomalias && (
                                <div className="px-4 pb-3 space-y-1.5" style={{ animation: 'rankingFadeIn 0.15s ease both' }}>
                                    {anomalias.map(a => (
                                        <div key={a.clientId} className="text-[11px] text-red-50 bg-red-900/20 rounded-lg px-3 py-2 leading-relaxed">
                                            <strong>{a.fullName}</strong>: {a.detalle}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {/* Strip de métricas */}
                    {!loading && ranking.length > 0 && (
                        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
                            {[
                                { label: 'Socios en ranking', value: ranking.length, sub: 'activos con ahorro', icon: '👥' },
                                { label: 'Ahorro neto total', value: fmtCorto(totalAhorroNeto), sub: 'capital depositado', icon: '💵' },
                                { label: 'A distribuir', value: fmtCorto(utilidadesParsed), sub: `${pctDistribuido}% de ganancia real`, icon: '📊' },
                                { label: 'Saldo Prom. Total', value: fmtCorto(totalSaldoPromedio), sub: 'base del reparto (FIC)', icon: '⚖️' },
                            ].map(m => (
                                <div key={m.label} className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/10 flex items-center gap-2.5 hover:bg-white/15 transition-colors">
                                    <span className="text-xl leading-none flex-shrink-0">{m.icon}</span>
                                    <div className="min-w-0">
                                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/50 truncate">{m.label}</div>
                                        <div className="text-sm font-black text-white tabular-nums">{m.value}</div>
                                        <div className="text-[9px] text-white/40 truncate">{m.sub}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── BODY ── */}
                <div className={embedded ? 'relative z-10' : 'flex-1 overflow-y-auto relative z-10'}>
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-emerald-400/20 blur-xl rounded-full animate-pulse" />
                                <Loader2 className="h-12 w-12 animate-spin text-emerald-600 relative" />
                            </div>
                            <p className="text-gray-400 font-black uppercase tracking-widest text-xs animate-pulse">Calculando posiciones...</p>
                        </div>
                    ) : ranking.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
                            <Users className="h-20 w-20 opacity-10" />
                            <p className="font-bold uppercase tracking-widest text-xs">Sin datos suficientes</p>
                        </div>
                    ) : (
                        <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
                            {/* Explicación del método de cálculo */}
                            <div className="bg-white/80 backdrop-blur-md border border-white rounded-[1.5rem] shadow-xl shadow-gray-200/40 overflow-hidden">
                                <button onClick={() => setShowExplainer(v => !v)}
                                    className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-blue-50/40 transition-colors text-left">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        <div className="w-1.5 h-4 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full" />
                                        ¿Cómo se calcula el Saldo Promedio y tu % de participación?
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showExplainer ? 'rotate-180' : ''}`} />
                                </button>
                                {showExplainer && (
                                    <div className="px-5 pb-5 pt-1 space-y-4" style={{ animation: 'rankingFadeIn 0.15s ease both' }}>
                                        <p className="text-sm text-gray-600 leading-relaxed">
                                            El fondo reparte las utilidades de forma <strong>proporcional a cuánto y por cuánto tiempo</strong> tu dinero estuvo trabajando para el fondo, no solo por el monto total que ahorraste. Un peso que entró en enero "trabajó" los 12 meses del año; uno que entró en diciembre solo trabajó 1.
                                        </p>
                                        <p className="text-sm text-gray-600 leading-relaxed">
                                            El comité ya repartió utilidades a todos los socios sobre lo ahorrado en años anteriores, así que este cálculo <strong>solo cuenta lo de este año</strong>: tu <strong>saldo de apertura</strong> (lo que ya tenías guardado y no retiraste, que cuenta a peso completo porque estuvo disponible todo el año) más lo nuevo que has ahorrado en estos meses. Por eso un socio que <strong>no</strong> pidió devolución de años anteriores empieza con más base que uno que sí la pidió.
                                        </p>

                                        {/* Glosario */}
                                        <div className="rounded-xl overflow-hidden border border-gray-100">
                                            <div className="grid grid-cols-[1fr_2fr] bg-gray-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                                <div>Término</div><div>Qué significa</div>
                                            </div>
                                            <div className="divide-y divide-gray-50">
                                                {[
                                                    ['Saldo de apertura', 'Lo que ya tenías ahorrado y NO retiraste. Cuenta a peso completo (factor 100%) porque estuvo disponible para el fondo desde el primer día del año.'],
                                                    ['Meses invertidos', 'Para lo que ahorras ESTE año: cuántos meses de este año tu dinero estuvo disponible para el fondo (enero = 12, diciembre = 1).'],
                                                    ['Factor', 'Meses invertidos ÷ 12. Es el "peso" de ese aporte específico dentro del año.'],
                                                    ['Contribución', 'Lo que aportaste ese mes × su Factor. Es lo que ese aporte suma a tu Saldo Promedio.'],
                                                    ['Saldo Promedio', 'Tu saldo de apertura + la suma de tus Contribuciones de este año. Es tu peso real dentro del fondo, para este reparto.'],
                                                    ['% de Participación', 'Tu Saldo Promedio ÷ la suma del Saldo Promedio de todos los socios activos.'],
                                                    ['Utilidad Estimada', 'Tu % de Participación × la Ganancia a Distribuir que define el comité. Es una estimación, no una promesa de pago.'],
                                                ].map(([term, desc]) => (
                                                    <div key={term} className="grid grid-cols-[1fr_2fr] px-3 py-2 gap-2 text-xs">
                                                        <div className="font-black text-gray-800">{term}</div>
                                                        <div className="text-gray-500 leading-snug">{desc}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Ejemplo real */}
                                        {ejemploSocio && ejemploFilas.length > 0 && (
                                            <div>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-2">
                                                    <div className="w-1.5 h-4 bg-gradient-to-b from-brand-primary to-brand-dark rounded-full" />
                                                    Ejemplo real: {ejemploSocio.fullName}
                                                </div>
                                                <div className="rounded-xl overflow-hidden border border-gray-100">
                                                    <div className="grid grid-cols-5 bg-gray-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                                        <div>Mes</div><div className="text-right">Aportado</div><div className="text-right">Meses inv.</div><div className="text-right">Factor</div><div className="text-right">Contribución</div>
                                                    </div>
                                                    <div className="divide-y divide-gray-50">
                                                        {ejemploFilas.map((f, i) => (
                                                            <div key={i} className="grid grid-cols-5 px-3 py-1.5 text-[11px]">
                                                                <div className="font-bold text-gray-700">{f.mesNombre}</div>
                                                                <div className="text-right text-gray-600 tabular-nums">{fmt(f.monto)}</div>
                                                                <div className="text-right font-bold text-blue-600">{f.mesesInvertidos} / {MESES_PERIODO}</div>
                                                                <div className="text-right text-gray-500">{(f.factor * 100).toFixed(1)}%</div>
                                                                <div className="text-right font-black text-blue-700 tabular-nums">{fmt(f.contribucion)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="px-3 py-1.5 text-[9px] text-gray-400 italic bg-gray-50/60 border-t border-gray-100">
                                                        ...y así con cada uno de sus {ejemploSocio.desgloseMes.length} aportes registrados hasta hoy.
                                                    </div>
                                                    <div className="grid grid-cols-5 px-3 py-2 bg-blue-50 border-t border-blue-100 text-[10px]">
                                                        <div className="font-black text-blue-700 col-span-2">Saldo Promedio total (suma de todas sus Contribuciones)</div>
                                                        <div /><div />
                                                        <div className="text-right font-black text-blue-700 tabular-nums">{fmt(ejemploSocio.saldoPromedio)}</div>
                                                    </div>
                                                </div>

                                                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[11px] font-mono text-emerald-800 leading-relaxed">
                                                    % Participación = {fmt(ejemploSocio.saldoPromedio)} ÷ {fmt(totalSaldoPromedio)} = <strong>{ejemploPct.toFixed(2)}%</strong><br />
                                                    Utilidad Estimada = {ejemploPct.toFixed(2)}% × {fmt(utilidadesParsed)} = <strong>{fmt(ejemploUtilidad)}</strong>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Podio Top 3 */}
                            {top3.length >= 3 && (
                                <div className="bg-white/70 backdrop-blur-md rounded-[1.5rem] border border-white shadow-xl shadow-gray-200/40 p-6">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-6">
                                        <div className="w-1.5 h-4 bg-gradient-to-b from-amber-400 to-yellow-600 rounded-full" />
                                        Podio — Top 3
                                    </div>
                                    <div className="flex items-end justify-center gap-3 sm:gap-8">
                                        {[1, 0, 2].map((realIdx) => {
                                            const entry = top3[realIdx];
                                            const cfg = MEDAL_CONFIGS[realIdx];
                                            const saldoEntry = entry.saldoPromedio || 0;
                                            const pctFloat = totalSaldoPromedio > 0 ? (saldoEntry / totalSaldoPromedio) : 0;
                                            const pct = (pctFloat * 100).toFixed(1);
                                            const ganancia = pctFloat * utilidadesParsed;
                                            const heights = ['h-24', 'h-16', 'h-14'];
                                            const isFirst = realIdx === 0;
                                            return (
                                                <div key={entry.customerId} className="flex flex-col items-center gap-2 group">
                                                    {isFirst && <div className="text-3xl mb-1 animate-bounce">👑</div>}
                                                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cfg.avatarGrad} flex items-center justify-center text-white ${isFirst ? 'text-lg' : 'text-sm'} font-extrabold shadow-xl ring-4 ring-white group-hover:-translate-y-2 transition-transform duration-300 z-10 relative`}>
                                                        {getInitials(entry.fullName)}
                                                    </div>
                                                    <div className="bg-white rounded-2xl shadow-md border border-gray-100/80 px-4 py-2.5 flex flex-col items-center -mt-3 pt-4 z-0 relative w-32 sm:w-36">
                                                        <div className="text-center text-xs font-black text-gray-800 leading-tight w-full" style={{ display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{entry.fullName}</div>
                                                        <div className="text-[11px] font-black text-emerald-700 mt-1 tabular-nums" title="Ahorro Neto Real">{fmt(entry.totalNetSavings)}</div>
                                                        <div className={`text-[10px] font-black px-2 py-0.5 rounded-full mt-1 ${cfg.badgeBg} ${cfg.labelColor}`}>+{fmtCorto(ganancia)}</div>
                                                        <div className="text-[9px] text-gray-400 mt-0.5">{pct}% (ponderado)</div>
                                                    </div>
                                                    <div className={`w-28 sm:w-36 rounded-t-2xl bg-gradient-to-b ${cfg.podiumGrad} ${heights[realIdx]} flex flex-col items-center justify-end pb-2 shadow-inner opacity-90`}>
                                                        <span className="text-2xl font-black text-white/50">{realIdx + 1}</span>
                                                        <span className="text-[9px] font-black text-white/70">{pct}%</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {/* Lista completa */}
                            <div className="bg-white/80 backdrop-blur-md border border-white rounded-[1.5rem] shadow-xl shadow-gray-200/40 overflow-hidden">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100/60">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                        <div className="w-1.5 h-4 bg-gradient-to-b from-brand-primary to-brand-dark rounded-full" />
                                        Clasificación completa · {ranking.length} socios
                                        {excluidosSinAhorro > 0 && (
                                            <span className="normal-case font-semibold text-gray-400">
                                                · {excluidosSinAhorro} sin ahorros este período (no aparece{excluidosSinAhorro === 1 ? '' : 'n'})
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative w-full sm:w-64">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar socio..."
                                            className="w-full pl-9 pr-4 py-2.5 text-sm border-2 border-gray-100 rounded-xl bg-gray-50 outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-400/10 transition-all font-semibold text-gray-700 placeholder:text-gray-300" />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 p-3">
                                    {search ? (
                                        filtered.length === 0
                                            ? <div className="text-center py-12 text-gray-400 text-sm font-semibold">Sin resultados para "{search}"</div>
                                            : filtered.map(entry => renderRow(entry, ranking.findIndex(r => r.customerId === entry.customerId)))
                                    ) : (
                                        <>
                                            {top3.map((entry, i) => renderRow(entry, i))}
                                            {rest.length > 0 && (
                                                <>
                                                    <div className="flex items-center gap-3 py-3 opacity-60">
                                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">Resto del ranking</span>
                                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                                                    </div>
                                                    {rest.map((entry, i) => renderRow(entry, i + 3))}
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                                {!search && utilidadesParsed > 0 && (
                                    <div className="border-t border-gray-100 px-5 py-4 bg-gradient-to-r from-emerald-50/60 to-transparent">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
                                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                                                Total a distribuir: <span className="text-emerald-700 font-black">{fmt(utilidadesParsed)}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                                                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                                Estimación, no constituye promesa de pago
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
    );
};

const RankingModal = ({ onClose }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <RankingBox onClose={onClose} />
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
    if (!data || data.length === 0) return null;

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
        ? data.map(d => {
            const row = { name: d.name };
            sortedYears.forEach(yr => { row[yr] = d[yr] !== 0 ? d[yr] : null; });
            return row;
          })
        : data,
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
                            <Trophy className="h-4 w-4 group-hover:rotate-12 transition-transform" /> Ranking
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
