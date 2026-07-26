import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../config/api';
import {
    Search, RefreshCw, CreditCard, Inbox, Download, X, Hash, TrendingUp,
    Calendar, Calculator, Wallet, Layers, ChevronLeft, ChevronRight, Activity
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell, PieChart, Pie } from 'recharts';
import EstadoPrestamosSection from '../../components/EstadoPrestamosSection';

const fmtCOP = v => `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtCorto = (v) => { const n = Number(v) || 0; if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`; if (n >= 1_000) return `$${Math.round(n / 1_000)}k`; return `$${n}`; };

const LOAN_BAR_COLORS = ['#166534', '#fbbf24', '#1a7a42', '#d97706', '#2d9652', '#f5c518', '#052e16'];

const LoanBarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
            <p className="font-bold text-gray-700 mb-1">{label}</p>
            <p className="font-semibold" style={{ color: payload[0]?.fill }}>{fmtCOP(payload[0].value)}</p>
        </div>
    );
};

const TABLE_COLUMNS = [
    { key: 'idVm', label: 'ID Crédito', align: 'center', minWidth: '100px', highlight: true },
    { key: 'estado', label: 'Estado', align: 'center', minWidth: '110px', isBadge: true },
    { key: 'fechaPrestamo', label: 'Desembolso', align: 'center', minWidth: '120px', isDate: true },
    { key: 'valorPrestado', label: 'Capital Prestado', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'saldoPendiente', label: 'Saldo Insoluto', align: 'right', minWidth: '130px', isCurrency: true, isComputed: true },
    { key: 'cuotas', label: '# Cuotas', align: 'center', minWidth: '80px', isNumber: true },
    { key: 'avance', label: '% Avance', align: 'center', minWidth: '120px', isProgress: true },
    { key: 'interesMensual', label: 'Tasa m.', align: 'right', minWidth: '90px', isPercent: true },
    { key: 'costoFinanciero', label: 'Costo Financiero', align: 'right', minWidth: '130px', isCurrency: true, isComputed: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '120px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '160px' },
];

const LoanStatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-400 text-xs italic">—</span>;
    const normalized = value.trim().toLowerCase();
    const colorMap = {
        'activo': 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        'desembolsado': 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        'pendiente': 'bg-amber-100 text-amber-800 ring-amber-200',
        'cancelado': 'bg-red-100 text-red-700 ring-red-200',
        'mora': 'bg-amber-100 text-amber-800 ring-amber-200',
    };
    const dotMap = {
        'activo': 'bg-emerald-500',
        'desembolsado': 'bg-emerald-500',
        'pendiente': 'bg-amber-500',
        'cancelado': 'bg-red-500',
        'mora': 'bg-amber-500',
    };
    const ring = colorMap[normalized] || 'bg-gray-100 text-gray-700 ring-gray-200';
    const dot = dotMap[normalized] || 'bg-gray-400';

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ring-1 ${ring}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dot}`} />
            {value}
        </span>
    );
};

const CellValue = ({ column, value }) => {
    if (column.isBadge) return <LoanStatusBadge value={value} />;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (column.isProgress) {
        const pct = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;
        const isComplete = pct >= 99.5;
        return (
            <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-[60px]">
                    <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : pct >= 50 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <span className="text-[10px] font-bold tabular-nums text-gray-600 w-9 text-right">{pct.toFixed(0)}%</span>
            </div>
        );
    }
    if (value === null || value === undefined || value === '') return <span className="text-gray-300 text-xs italic">—</span>;
    if (column.isCurrency) {
        const num = parseFloat(value);
        if (isNaN(num)) return <span className="text-gray-300 text-xs italic">—</span>;
        const isZero = num === 0;
        return <span className={`font-medium tabular-nums ${column.key === 'saldoPendiente' && num > 0 ? 'text-amber-700' : isZero ? 'text-gray-400' : 'text-gray-900'}`}>${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>;
    }
    if (column.isPercent) {
        const num = parseFloat(value);
        if (!isNaN(num)) return <span className="tabular-nums text-gray-700">{(num * 100).toFixed(2)}%</span>;
    }
    if (column.isNumber) return <span className="tabular-nums text-gray-700">{value}</span>;
    if (column.highlight) return <span className="font-bold text-emerald-800">{value}</span>;
    return <span className="text-gray-700">{value}</span>;
};

const ESTADO_COLORS = {
    'Vigente': '#166534', 'Cancelado': '#94a3b8', 'Activo': '#1a7a42',
    'Pendiente': '#fbbf24', 'Mora': '#ef4444', 'Sin estado': '#cbd5e1'
};

const TABS = [
    { key: 'prestamos', label: 'Mis Préstamos', icon: CreditCard },
    { key: 'cuotas', label: 'Estado de Cuotas', icon: Activity },
];

const MisCreditosPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();
    const nombre = !user?.name ? '' : `${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim();

    const { toast } = useUi();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') === 'cuotas' ? 'cuotas' : 'prestamos';
    const [activeTab, setActiveTab] = useState(initialTab);

    const [loans, setLoans] = useState([]);
    const [payments, setPayments] = useState([]);
    const [tasaAsignada, setTasaAsignada] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterAnio, setFilterAnio] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 25;

    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterEstado, filterAnio]);

    const changeTab = (key) => {
        setActiveTab(key);
        setSearchParams(key === 'cuotas' ? { tab: 'cuotas' } : {}, { replace: true });
    };

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [loanRes, payRes, capRes] = await Promise.allSettled([
                api.get('/admin/my/loans'),
                api.get('/admin/my/payments'),
                api.get('/admin/my/loan-capacity'),
            ]);
            if (loanRes.status === 'fulfilled' && loanRes.value.data?.ok) {
                setLoans(loanRes.value.data.data);
            } else {
                throw new Error(loanRes.value?.data?.error || 'Error del servidor al cargar préstamos');
            }
            setPayments(payRes.status === 'fulfilled' && payRes.value.data?.ok ? (payRes.value.data.data || []) : []);
            // Tasa mensual actual que el comité tiene fijada para este socio (no es un
            // promedio histórico: es la tasa vigente, la misma que usa el Simulador).
            setTasaAsignada(capRes.status === 'fulfilled' ? (capRes.value.data?.tasaAsignada ?? null) : null);
        } catch (err) {
            setError(err.message || 'Error al conectar');
            setLoans([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const estadoOptions = useMemo(() =>
        [...new Set(loans.map(l => l.estado?.trim()).filter(Boolean))].sort(),
        [loans]);

    const anioOptions = useMemo(() => {
        const years = loans
            .map(l => {
                if (!l.fechaPrestamo) return null;
                const d = new Date(l.fechaPrestamo);
                return isNaN(d.getTime()) ? null : d.getFullYear().toString();
            })
            .filter(Boolean);
        return [...new Set(years)].sort((a, b) => b - a);
    }, [loans]);

    const filteredLoans = useMemo(() => {
        let result = loans;
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            result = result.filter(l =>
                (l.idVm && l.idVm.toLowerCase().includes(term)) ||
                (l.estado && l.estado.toLowerCase().includes(term)) ||
                (l.banco && l.banco.toLowerCase().includes(term))
            );
        }
        if (filterEstado) {
            const term = filterEstado.trim().toLowerCase();
            result = result.filter(l => (l.estado || '').trim().toLowerCase() === term);
        }
        if (filterAnio) {
            result = result.filter(l => {
                if (!l.fechaPrestamo) return false;
                const d = new Date(l.fechaPrestamo);
                if (isNaN(d.getTime())) return false;
                return d.getFullYear().toString() === filterAnio;
            });
        }
        return result;
    }, [loans, searchTerm, filterEstado, filterAnio]);

    const loanStats = useMemo(() => {
        const totalPrestado = loans.reduce((acc, l) => acc + parseFloat(l.valorPrestado || 0), 0);
        const cuotasTotal = loans.reduce((acc, l) => acc + (parseInt(l.cuotas) || 0), 0);
        const vigentes = loans.filter(l => (l.estado || '').toLowerCase().includes('vigente') || (l.estado || '').toLowerCase().includes('activ'));
        const saldoPendienteAprox = vigentes.reduce((acc, l) => acc + parseFloat(l.saldoPendiente || l.valorPrestado || 0), 0);
        const ticketPromedio = loans.length > 0 ? totalPrestado / loans.length : 0;
        const plazoPromedio = loans.length > 0 ? cuotasTotal / loans.length : 0;
        const tasaPromedio = loans.length > 0
            ? loans.reduce((s, l) => s + parseFloat(l.interesMensual || 0), 0) / loans.length * 100
            : 0;
        const costoFinancieroTotal = vigentes.reduce((acc, l) => {
            const cap = parseFloat(l.valorPrestado || 0);
            const tasa = parseFloat(l.interesMensual || 0);
            const n = parseInt(l.cuotas) || 0;
            return acc + cap * tasa * ((n + 1) / 2);
        }, 0);
        const teaAprox = tasaPromedio > 0 ? (Math.pow(1 + tasaPromedio / 100, 12) - 1) * 100 : 0;

        const estadoMap = {};
        loans.forEach(l => {
            const k = (l.estado || 'Sin estado').trim() || 'Sin estado';
            estadoMap[k] = (estadoMap[k] || 0) + 1;
        });
        const estadoDonut = Object.entries(estadoMap).map(([name, value]) => ({ name, value }));

        const barData = loans
            .filter(l => l.idVm && parseFloat(l.valorPrestado || 0) > 0)
            .sort((a, b) => (a.idVm || '').localeCompare(b.idVm || '', undefined, { numeric: true }))
            .map(l => ({ id: l.idVm, valor: parseFloat(l.valorPrestado || 0), estado: l.estado || '' }));

        return { totalPrestado, count: loans.length, barData, vigentesCount: vigentes.length, saldoPendienteAprox, ticketPromedio, plazoPromedio, tasaPromedio, teaAprox, costoFinancieroTotal, estadoDonut };
    }, [loans]);

    // Resumen combinado para el hero — se ve sin importar la pestaña activa.
    const resumen = useMemo(() => {
        const carteraActiva = payments
            .filter(p => (p.estado || '').trim().toLowerCase() === 'pendiente')
            .reduce((s, p) => s + parseFloat(p.valorCuotaVariable || 0), 0);
        const totalRecaudo = payments
            .filter(p => (p.estado || '').trim().toLowerCase() === 'pago')
            .reduce((s, p) => s + parseFloat(p.valorCuotaPago || 0), 0);
        const cuotasPagadas = payments.filter(p => (p.estado || '').trim().toLowerCase() === 'pago').length;
        return { carteraActiva, totalRecaudo, cuotasPagadas, cuotasTotal: payments.length };
    }, [payments]);

    const clearFilters = () => { setSearchTerm(''); setFilterEstado(''); setFilterAnio(''); };
    const hasActiveFilters = searchTerm || filterEstado || filterAnio;

    const handleExport = () => {
        if (activeTab === 'prestamos') {
            if (filteredLoans.length === 0) { toast.error('No hay datos para exportar.'); return; }
            const dataToExport = filteredLoans.map(l => ({
                'ID_VM': l.idVm, 'Estado': l.estado, 'Fecha Préstamo': formatDate(l.fechaPrestamo),
                'Valor Prestado': l.valorPrestado, '# Cuotas': l.cuotas, 'Interés Mensual': l.interesMensual,
                'Banco': l.banco, 'Observaciones': l.observaciones
            }));
            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Mis Préstamos');
            XLSX.writeFile(wb, 'Mis_Prestamos.xlsx');
        } else {
            if (payments.length === 0) { toast.error('No hay datos para exportar.'); return; }
            const dataToExport = payments.map(p => ({
                'ID Pago': p.externalId, 'Préstamo': p.idVm, 'Cuota #': p.itemQuantity, 'Estado': p.estado,
                'Fecha Máx': formatDate(p.fechaPagoMax), 'Valor Cuota': p.valorCuotaVariable,
                'Valor Pagado': p.valorCuotaPago, 'Intereses': p.valorInteresesAmortizados, 'Saldo Final': p.saldoFinal,
            }));
            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Mis Pagos');
            XLSX.writeFile(wb, 'Mis_Pagos.xlsx');
        }
        toast.success('Exportado exitosamente');
    };

    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    const kpiContainerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
    const kpiItemVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } } };

    return (
        <div className="space-y-6">
            {/* ── HERO ── */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-3xl overflow-hidden shadow-xl bg-gradient-to-br from-brand-dark via-brand-primary to-brand-dark text-white p-6 sm:p-8"
            >
                <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-brand-gold/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center shadow-lg ring-1 ring-white/20 flex-shrink-0">
                            <CreditCard className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight leading-tight">Mis Créditos{nombre ? ` - ${nombre}` : ''}</h1>
                            <p className="text-white/60 text-sm mt-0.5">Tus préstamos y el estado de tus cuotas, en un solo lugar</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={handleExport}
                            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
                        >
                            <Download className="h-4 w-4" /> Exportar
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.92, rotate: 180 }}
                            onClick={fetchAll}
                            className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl transition-colors"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </motion.button>
                    </div>
                </div>

                {/* Resumen combinado — visible sin importar la pestaña activa */}
                {!loading && (loans.length > 0 || payments.length > 0) && (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={kpiContainerVariants}
                        className="relative grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6"
                    >
                        {[
                            { label: 'Total Desembolsado', value: fmtCorto(loanStats.totalPrestado), sub: `${loanStats.count} préstamo${loanStats.count !== 1 ? 's' : ''}`, icon: '💰' },
                            { label: 'Cartera Activa', value: fmtCorto(resumen.carteraActiva), sub: 'cuotas pendientes', icon: '📊' },
                            { label: 'Recaudo Total', value: fmtCorto(resumen.totalRecaudo), sub: 'cuotas pagadas', icon: '✅' },
                            { label: 'Cuotas', value: `${resumen.cuotasPagadas}/${resumen.cuotasTotal}`, sub: 'pagadas del total', icon: '🎯' },
                        ].map(m => (
                            <motion.div
                                key={m.label}
                                variants={kpiItemVariants}
                                whileHover={{ y: -3, backgroundColor: 'rgba(255,255,255,0.15)' }}
                                className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/10 flex items-center gap-2.5"
                            >
                                <span className="text-xl leading-none flex-shrink-0">{m.icon}</span>
                                <div className="min-w-0">
                                    <div className="text-[9px] font-bold uppercase tracking-widest text-white/50 truncate">{m.label}</div>
                                    <div className="text-sm font-black text-white tabular-nums truncate">{m.value}</div>
                                    <div className="text-[9px] text-white/40 truncate">{m.sub}</div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}

                {/* Selector de pestañas — pill deslizante (layoutId compartido entre botones) */}
                <div className="relative inline-flex bg-white/10 backdrop-blur rounded-2xl p-1 border border-white/15 mt-6">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button key={tab.key} onClick={() => changeTab(tab.key)}
                                className={`relative flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-colors duration-200 ${isActive ? 'text-brand-dark' : 'text-white/70 hover:text-white'}`}>
                                {isActive && (
                                    <motion.div
                                        layoutId="misCreditosActivePill"
                                        className="absolute inset-0 bg-white rounded-xl shadow-lg"
                                        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </motion.div>

            {/* ── CONTENIDO POR PESTAÑA ── */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                {loading ? (
                    <div className="p-12 text-center text-gray-400 animate-pulse">Cargando...</div>
                ) : activeTab === 'cuotas' ? (
                    payments.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">
                            No tienes pagos de préstamos registrados.
                        </div>
                    ) : (
                        <EstadoPrestamosSection payments={payments} loans={loans} loading={loading} socioName={nombre} />
                    )
                ) : (
                    <div className="space-y-6">
                        {/* Filtros */}
                        <div className="bg-white rounded-xl border border-ui-border shadow-sm p-4">
                            <div className="flex flex-wrap gap-3 items-end">
                                <div className="min-w-[280px] flex-1">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Buscar (Id VM, Banco)</label>
                                    <div className="relative w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            aria-label="Buscar en mis préstamos"
                                            type="text"
                                            placeholder="Buscar en mis préstamos..."
                                            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="min-w-[170px]">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                                    <select
                                        aria-label="Filtrar por estado del préstamo"
                                        value={filterEstado}
                                        onChange={e => setFilterEstado(e.target.value)}
                                        className="w-full py-2 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                    >
                                        <option value="">Todos</option>
                                        {estadoOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </div>
                                <div className="min-w-[140px]">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Año Desembolso</label>
                                    <select
                                        aria-label="Filtrar por año de desembolso"
                                        value={filterAnio}
                                        onChange={e => setFilterAnio(e.target.value)}
                                        className="w-full py-2 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                    >
                                        <option value="">Todos</option>
                                        {anioOptions.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                {hasActiveFilters && (
                                    <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-gray-500 hover:text-gray-700 self-end">
                                        <X className="h-3.5 w-3.5" /> Limpiar
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* KPI Row */}
                        {loans.length > 0 && (
                            <motion.div initial="hidden" animate="visible" variants={kpiContainerVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <motion.div variants={kpiItemVariants} whileHover={{ y: -3 }}>
                                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Saldo Pendiente</p>
                                                <Wallet className="h-4 w-4 text-amber-600" />
                                            </div>
                                            <p className="text-xl font-black text-amber-700 tabular-nums leading-tight">{fmtCOP(loanStats.saldoPendienteAprox)}</p>
                                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">Capital por amortizar en créditos vigentes</p>
                                        </div>
                                    </Card>
                                </motion.div>
                                <motion.div variants={kpiItemVariants} whileHover={{ y: -3 }}>
                                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ticket Promedio</p>
                                                <Calculator className="h-4 w-4 text-emerald-700" />
                                            </div>
                                            <p className="text-xl font-black text-emerald-800 tabular-nums leading-tight">{fmtCOP(loanStats.ticketPromedio)}</p>
                                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">Monto promedio por crédito desembolsado</p>
                                        </div>
                                    </Card>
                                </motion.div>
                                <motion.div variants={kpiItemVariants} whileHover={{ y: -3 }}>
                                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Plazo Promedio</p>
                                                <Calendar className="h-4 w-4 text-emerald-500" />
                                            </div>
                                            <p className="text-xl font-black text-emerald-600 tabular-nums leading-tight">{loanStats.plazoPromedio.toFixed(1)} <span className="text-sm font-bold">cuotas</span></p>
                                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">Duración media en meses por crédito</p>
                                        </div>
                                    </Card>
                                </motion.div>
                                <motion.div variants={kpiItemVariants} whileHover={{ y: -3 }}>
                                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{tasaAsignada != null ? 'Tasa Actual' : 'Tasa Promedio'}</p>
                                                <TrendingUp className="h-4 w-4 text-amber-500" />
                                            </div>
                                            <p className="text-xl font-black text-amber-700 tabular-nums leading-tight">{(tasaAsignada != null ? tasaAsignada : loanStats.tasaPromedio).toFixed(2)}<span className="text-sm font-bold">% m</span></p>
                                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">{tasaAsignada != null ? 'Tasa mensual vigente definida por el comité' : 'Interés mensual promedio del portafolio (sin tasa vigente definida)'}</p>
                                        </div>
                                    </Card>
                                </motion.div>
                            </motion.div>
                        )}

                        {/* Análisis económico avanzado */}
                        {loans.length > 0 && loanStats.vigentesCount > 0 && (
                            <Card className="border border-amber-200 shadow-sm bg-gradient-to-br from-amber-50/40 to-white">
                                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Costo Financiero Total Proyectado</p>
                                            <Calculator className="h-4 w-4 text-amber-500" />
                                        </div>
                                        <p className="text-2xl font-black text-amber-800 tabular-nums leading-tight">{fmtCOP(loanStats.costoFinancieroTotal)}</p>
                                        <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                            Total estimado de intereses que pagarás sobre {loanStats.vigentesCount} crédito(s) vigentes hasta su finalización (cálculo por sistema francés).
                                        </p>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-900">Tasa Efectiva Anual (aprox.)</p>
                                            <TrendingUp className="h-4 w-4 text-emerald-700" />
                                        </div>
                                        <p className="text-2xl font-black text-emerald-900 tabular-nums leading-tight">{loanStats.teaAprox.toFixed(2)}<span className="text-base">%</span></p>
                                        <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                            Capitalización mensual de tu tasa promedio ({loanStats.tasaPromedio.toFixed(2)}% m). Sirve como comparable frente a otros productos financieros.
                                        </p>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Relación Costo / Capital</p>
                                            <Layers className="h-4 w-4 text-emerald-500" />
                                        </div>
                                        <p className="text-2xl font-black text-emerald-700 tabular-nums leading-tight">
                                            {loanStats.totalPrestado > 0 ? ((loanStats.costoFinancieroTotal / loanStats.totalPrestado) * 100).toFixed(1) : '0'}<span className="text-base">%</span>
                                        </p>
                                        <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                            Por cada $100 prestados, pagas aprox. ${loanStats.totalPrestado > 0 ? ((loanStats.costoFinancieroTotal / loanStats.totalPrestado) * 100).toFixed(1) : '0'} en intereses sobre la vida del crédito.
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Donut por estado */}
                        {loans.length > 0 && loanStats.estadoDonut.length > 1 && (
                            <Card className="border border-gray-100 shadow-sm">
                                <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-emerald-600" />
                                    <h3 className="text-sm font-bold text-gray-700">Composición del Portafolio</h3>
                                </div>
                                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                    <div style={{ height: 200 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={loanStats.estadoDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                                                    {loanStats.estadoDonut.map((e, i) => <Cell key={i} fill={ESTADO_COLORS[e.name] || LOAN_BAR_COLORS[i % LOAN_BAR_COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip formatter={(v) => `${v} crédito(s)`} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="space-y-2">
                                        {loanStats.estadoDonut.map((e, i) => {
                                            const pct = ((e.value / loanStats.count) * 100).toFixed(0);
                                            return (
                                                <div key={e.name} className="flex items-center justify-between text-sm">
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-3 h-3 rounded-full" style={{ background: ESTADO_COLORS[e.name] || LOAN_BAR_COLORS[i % LOAN_BAR_COLORS.length] }} />
                                                        <span className="text-gray-700 font-medium">{e.name}</span>
                                                    </span>
                                                    <span className="text-gray-500">
                                                        <span className="font-bold text-gray-800">{e.value}</span>
                                                        <span className="text-xs ml-1">({pct}%)</span>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Total + gráfico por préstamo */}
                        {loans.length > 0 && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-1 flex flex-col gap-4">
                                    <Card className="overflow-hidden border-0 shadow-md" style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 55%, #1a7a42 100%)' }}>
                                        <div className="p-6 relative">
                                            <div className="absolute top-4 right-4 rounded-xl p-2" style={{ backgroundColor: 'rgba(251,191,36,0.2)' }}>
                                                <CreditCard className="h-6 w-6" style={{ color: '#fbbf24' }} />
                                            </div>
                                            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#86efac' }}>Total Desembolsado</p>
                                            <p className="text-3xl font-bold text-white tabular-nums leading-tight">{fmtCOP(loanStats.totalPrestado)}</p>
                                            <div className="h-px bg-white/15 my-3" />
                                            <div className="flex items-center gap-1.5 text-sm" style={{ color: '#86efac' }}>
                                                <Hash className="h-3.5 w-3.5" />
                                                {loanStats.count} {loanStats.count === 1 ? 'préstamo' : 'préstamos'} en total
                                            </div>
                                        </div>
                                    </Card>
                                    {loanStats.barData.length > 0 && (
                                        <Card className="border border-gray-100 shadow-sm">
                                            <div className="px-4 pt-4 pb-2 border-b border-gray-50">
                                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalle por Préstamo</p>
                                            </div>
                                            <div className="p-3 space-y-2">
                                                {loanStats.barData.map((d, i) => (
                                                    <div key={d.id} className="flex items-center justify-between text-sm">
                                                        <span className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: LOAN_BAR_COLORS[i % LOAN_BAR_COLORS.length] }} />
                                                            <span className="text-gray-600 font-medium">{d.id}</span>
                                                        </span>
                                                        <span className="font-semibold text-gray-800 tabular-nums">{fmtCOP(d.valor)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </Card>
                                    )}
                                </div>
                                <Card className="lg:col-span-2 border border-gray-100 shadow-sm overflow-hidden">
                                    <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4" style={{ color: '#166534' }} />
                                        <h3 className="text-sm font-bold text-gray-700">Valor Desembolsado por ID Préstamo</h3>
                                    </div>
                                    <div className="p-5">
                                        {loanStats.barData.length === 0 ? (
                                            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
                                        ) : (
                                            <div style={{ height: loanStats.barData.length <= 2 ? 160 : 220 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={loanStats.barData} margin={{ top: 30, right: 16, left: 8, bottom: 4 }} barSize={loanStats.barData.length <= 4 ? 44 : 32}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                        <XAxis dataKey="id" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }} />
                                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} width={56} />
                                                        <Tooltip content={<LoanBarTooltip />} cursor={{ fill: '#f0fdf4' }} />
                                                        <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                                                            {loanStats.barData.map((_, i) => <Cell key={i} fill={LOAN_BAR_COLORS[i % LOAN_BAR_COLORS.length]} />)}
                                                            <LabelList dataKey="valor" position="top" style={{ fill: '#374151', fontSize: 10, fontWeight: 700 }} formatter={v => fmtCOP(v)} />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* Tabla */}
                        {filteredLoans.length === 0 ? (
                            <Card><CardContent className="p-12 text-center">
                                <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-500">No tienes préstamos registrados.</p>
                            </CardContent></Card>
                        ) : (() => {
                            const enriched = filteredLoans.map(l => {
                                const cap = parseFloat(l.valorPrestado || 0);
                                const tasa = parseFloat(l.interesMensual || 0);
                                const cuotas = parseInt(l.cuotas) || 0;
                                const saldo = parseFloat(l.saldoPendiente || 0);
                                const isCancelado = (l.estado || '').toLowerCase().includes('cancel');
                                const avance = isCancelado ? 100 : (cap > 0 ? Math.max(0, Math.min(100, ((cap - saldo) / cap) * 100)) : 0);
                                const costoFinanciero = cap * tasa * ((cuotas + 1) / 2);
                                return { ...l, avance, costoFinanciero, saldoPendiente: isCancelado ? 0 : saldo };
                            });
                            const totalPages = Math.max(1, Math.ceil(enriched.length / ITEMS_PER_PAGE));
                            const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
                            const paginated = enriched.slice(startIdx, startIdx + ITEMS_PER_PAGE);
                            const totals = enriched.reduce((a, r) => ({
                                valorPrestado: a.valorPrestado + parseFloat(r.valorPrestado || 0),
                                saldoPendiente: a.saldoPendiente + parseFloat(r.saldoPendiente || 0),
                                cuotas: a.cuotas + (parseInt(r.cuotas) || 0),
                                costoFinanciero: a.costoFinanciero + r.costoFinanciero,
                            }), { valorPrestado: 0, saldoPendiente: 0, cuotas: 0, costoFinanciero: 0 });
                            const avgAvance = enriched.length > 0 ? enriched.reduce((s, r) => s + r.avance, 0) / enriched.length : 0;
                            return (
                                <Card className="overflow-hidden border border-gray-100 shadow-sm">
                                    <div className="table-container max-h-[70vh] overflow-y-auto">
                                        <table className="premium-table">
                                            <thead>
                                                <tr className="bg-emerald-700 text-white">
                                                    {TABLE_COLUMNS.map(col => (
                                                        <th key={col.key} className="sticky top-0 z-10 bg-emerald-700" style={{ textAlign: col.align, minWidth: col.minWidth }}>{col.label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginated.map((loan, idx) => {
                                                    const isCancelado = (loan.estado || '').toLowerCase().includes('cancel');
                                                    return (
                                                        <tr key={loan.id} className={`transition-colors duration-150 ${isCancelado ? 'bg-gray-50/50 opacity-75' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                                            {TABLE_COLUMNS.map(col => (
                                                                <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                                    <CellValue column={col} value={loan[col.key]} />
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-emerald-50 font-bold text-emerald-900 border-t-2 border-emerald-200">
                                                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest" colSpan={3}>Totales · {enriched.length} crédito(s)</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">${totals.valorPrestado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">${totals.saldoPendiente.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                    <td className="px-3 py-2 text-center tabular-nums">{totals.cuotas}</td>
                                                    <td className="px-3 py-2 text-center text-[10px]">prom. {avgAvance.toFixed(0)}%</td>
                                                    <td className="px-3 py-2"></td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">${totals.costoFinanciero.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                    <td className="px-3 py-2" colSpan={2}></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    {totalPages > 1 && (
                                        <div className="flex justify-between items-center gap-2 p-3 border-t border-gray-100 bg-gray-50/50">
                                            <span className="text-xs text-gray-500">Mostrando <strong className="text-emerald-700">{startIdx + 1}–{Math.min(startIdx + ITEMS_PER_PAGE, enriched.length)}</strong> de <strong>{enriched.length}</strong> crédito(s)</span>
                                            <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                                                </Button>
                                                <span className="text-xs text-gray-600 font-medium">
                                                    Página <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{currentPage}</span> de {totalPages}
                                                </span>
                                                <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                                    Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            );
                        })()}
                    </div>
                )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default MisCreditosPage;
