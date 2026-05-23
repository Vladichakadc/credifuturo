import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, PiggyBank, AlertTriangle, Inbox, Download, DollarSign, AlertCircle, Users, X, Calendar, ChevronDown, Activity, UserCheck, CheckCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import ListHeader from '../../components/admin/ListHeader';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { useSortTable, SortIcon } from '../../utils/useSortTable';

const FilterSelect = ({ icon: Icon, value, onChange, children, width = 'lg:w-44' }) => (
    <div className={`relative w-full ${width}`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${value ? 'bg-brand-primary/10 border-brand-primary/40' : 'bg-emerald-50 border-emerald-200'}`}>
            <Icon className={`h-4 w-4 flex-shrink-0 ${value ? 'text-brand-primary' : 'text-emerald-600'}`} />
            <select
                value={value}
                onChange={onChange}
                className="flex-1 bg-transparent text-sm font-semibold text-gray-700 appearance-none outline-none cursor-pointer truncate"
            >
                {children}
            </select>
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 pointer-events-none" />
        </div>
    </div>
);

const ClientSelect = ({ clients, value, onChange, width = 'lg:w-56' }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = clients.filter(c => {
        const term = search.toLowerCase();
        return `${c.name} ${c.cedula || ''} ${c.id || ''}`.toLowerCase().includes(term);
    });

    const selected = clients.find(c => c.id === value);

    return (
        <div className={`relative w-full ${width}`} ref={ref}>
            <button
                type="button"
                onClick={() => { setOpen(o => !o); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-left ${value ? 'bg-brand-primary/10 border-brand-primary/40' : 'bg-emerald-50 border-emerald-200'}`}
            >
                <Users className={`h-4 w-4 flex-shrink-0 ${value ? 'text-brand-primary' : 'text-emerald-600'}`} />
                <span className={`flex-1 text-sm font-semibold truncate ${value ? 'text-gray-800' : 'text-gray-500'}`}>
                    {selected ? selected.name : 'Socio: Todos'}
                </span>
                {selected && (
                    <span className="text-[10px] font-bold text-brand-primary/70 bg-brand-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {selected.id}
                    </span>
                )}
                <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[60] overflow-hidden">
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

                    <div className="max-h-64 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => { onChange(''); setOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm border-b border-gray-50 transition-colors ${!value ? 'bg-brand-primary/10 text-brand-primary font-bold' : 'text-gray-500 hover:bg-gray-50 font-medium'}`}
                        >
                            Todos los socios
                            {!value && <CheckCircle className="h-3.5 w-3.5 text-brand-primary flex-shrink-0" />}
                        </button>
                        {filtered.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-5">Sin resultados</p>
                        ) : filtered.map(c => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0 ${c.id === value ? 'bg-brand-primary/10' : 'hover:bg-gray-50'}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${c.id === value ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                                    {(c.name || '?')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-bold truncate ${c.id === value ? 'text-brand-primary' : 'text-gray-800'}`}>{c.name}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">{c.id}{c.cedula ? ` · C.C. ${c.cedula}` : ''}</p>
                                </div>
                                {c.id === value && <CheckCircle className="h-4 w-4 text-brand-primary flex-shrink-0" />}
                            </button>
                        ))}
                    </div>

                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 font-semibold">{filtered.length} socio{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatCard = ({ title, value, description, icon: Icon, color, customBg, isDark = false, textColor, onClick }) => (
    <Card
        className={`transition-all duration-200 overflow-hidden relative ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''}`}
        style={customBg ? { background: customBg, border: 'none' } : {}}
        onClick={onClick}
    >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-gray-500'}`}>{title}</CardTitle>
            <Icon className={`h-4 w-4 ${color}`} />
        </CardHeader>
        <CardContent className="relative z-10">
            <div className={`text-2xl font-bold ${textColor || (isDark ? 'text-white' : 'text-gray-900')}`}>{value}</div>
            <p className={`text-xs mt-1 ${isDark ? 'text-white/80' : 'text-gray-500'}`}>{description}</p>
        </CardContent>
    </Card>
);

const MoraModal = ({ details, onClose }) => {
    if (!details || details.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200 text-left">
                {/* Header */}
                <div className="px-6 py-4 bg-red-600 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6" />
                        <h3 className="text-xl font-bold">Detalle de Cartera en Mora</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[70vh] overflow-y-auto p-0">
                    <div className="bg-red-50 px-6 py-3 border-b border-red-100 italic text-red-700 text-sm">
                        Socios con ahorros pendientes desde el 1 de enero hasta hoy
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Socio / Cédula</th>
                                <th className="px-6 py-3 text-center">Meses Pendientes</th>
                                <th className="px-6 py-3 text-right">Penalización</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {details.map((socio) => (
                                <tr key={socio.clientId} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                                <Users className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900">{socio.nombre}</div>
                                                <div className="text-xs text-gray-500">{socio.cedula}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700 font-bold text-sm">
                                            {socio.mesesPendientes.length}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="font-bold text-red-600">
                                            ${Number(socio.penalizacion).toLocaleString('es-CO')}
                                        </div>
                                        <div className="text-[10px] text-gray-400">
                                            {socio.diasDesdeDia11} días de mora
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <Button onClick={onClose} size="lg">
                        Cerrar Detalle
                    </Button>
                </div>
            </div>
        </div>
    );
};

const PenaltyModal = ({ details, onClose }) => {
    if (!details || details.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200 text-left">
                {/* Header */}
                <div className="px-6 py-4 bg-amber-500 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <DollarSign className="h-6 w-6" />
                        <h3 className="text-xl font-bold">Detalle de Penalidades Pagadas</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[70vh] overflow-y-auto p-0">
                    <div className="bg-amber-50 px-6 py-3 border-b border-amber-100 italic text-amber-700 text-sm">
                        Registros con penalización pagada en el año actual
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Socio / Cédula</th>
                                <th className="px-6 py-3 text-center">Fecha / Mes</th>
                                <th className="px-6 py-3 text-right">Valor Penalizado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {details.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                                <Users className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900">{item.nombre}</div>
                                                <div className="text-xs text-gray-500">{item.cedula}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="text-xs font-bold text-gray-700">{item.mes}</div>
                                        <div className="text-[10px] text-gray-400 font-mono">{item.fecha}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="font-bold text-amber-600">
                                            ${Number(item.valor).toLocaleString('es-CO')}
                                        </div>
                                        <div className="text-[10px] text-gray-400">
                                            {item.dias} días de penalización
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <Button onClick={onClose} size="lg" className="bg-amber-500 hover:bg-amber-600">
                        Cerrar Detalle
                    </Button>
                </div>
            </div>
        </div>
    );
};

// Configuración de columnas — 1-orders_table_ahorro_mensual
// NOTA DE ARQUITECTURA:
//   - 'id'            → ID autoincremental interno de DB (técnico, NO usar como identificador de negocio)
//   - 'externalId'    → AM## — consecutivo funcional del ahorro (identificador del registro)
//   - 'clientCustomerId' → Customer_id del negocio (PK oficial de clientes)
const TABLE_COLUMNS = [
    { key: 'externalId', label: 'Id_VM', align: 'center', minWidth: '100px', highlight: true },
    { key: 'clientCustomerId', label: 'Customer_id', align: 'center', minWidth: '110px', highlight: true },
    { key: 'clientName', label: 'Nombre', align: 'left', minWidth: '140px' },
    { key: 'clientSurname', label: 'Apellido', align: 'left', minWidth: '140px' },
    { key: 'status', label: 'Estado', align: 'center', minWidth: '130px', isTypeBadge: true },
    { key: 'date', label: 'Fecha Pago', align: 'center', minWidth: '130px', isDate: true },
    { key: 'year', label: 'Año pago', align: 'center', minWidth: '80px', isNumber: true },
    { key: 'month', label: 'Mes pago', align: 'center', minWidth: '110px' },
    { key: 'penalizacion', label: 'Penalizacion', align: 'center', minWidth: '120px', isPenBadge: true },
    { key: 'diasPenalizacion', label: 'Dias Penalizacion', align: 'center', minWidth: '110px', isNumber: true },
    { key: 'amount', label: 'Valor Mensual', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'valorAPenalizar', label: 'Valor a Penalizar', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'valorAhorrado', label: 'Valor Ahorrado', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'mesAbonado', label: 'Mes Abonado', align: 'center', minWidth: '110px' },
    { key: 'anioAbonado', label: 'Año Abonado', align: 'center', minWidth: '110px' },
    { key: 'itemQuantity', label: 'Item_Quantity', align: 'center', minWidth: '100px', isNumber: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '140px' },
    { key: 'numeroTransaccion', label: '# Transaccion', align: 'left', minWidth: '140px' },
    { key: 'origen', label: 'Desde Cuenta de Ahorros', align: 'left', minWidth: '190px' },
    { key: 'type', label: 'Tipo de Ahorro', align: 'center', minWidth: '130px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '280px' },
    { key: 'soporte', label: 'Soporte', align: 'center', minWidth: '100px', isSoporte: true },
];


// ——— Penalización Badge ———
const PenBadge = ({ value }) => {
    if (!value) return <span className="text-gray-300 text-xs italic">—</span>;
    const isSI = value.trim().toUpperCase() === 'SI';
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${isSI ? 'bg-orange-100 text-orange-800 ring-orange-200' : 'bg-emerald-100 text-emerald-800 ring-emerald-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isSI ? 'bg-orange-500' : 'bg-emerald-500'}`} />
            {value}
        </span>
    );
};

// ——— Status Badge ———
const StatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-300 text-xs italic">—</span>;
    const normalized = value.trim().toLowerCase();
    const isActive = normalized === 'activo' || normalized === 'active' || normalized === 'pagado';
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${isActive ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-gray-100 text-gray-700 ring-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            {value}
        </span>
    );
};

// ——— Type Badge ———
const TypeBadge = ({ value }) => {
    if (!value) return <span className="text-gray-300 text-xs italic">—</span>;
    const normalized = value.trim();
    let bgClass = "bg-gray-100 text-gray-700 ring-gray-200";
    let dotClass = "bg-gray-400";

    if (normalized.toLowerCase().includes('distribucion intereses')) {
        bgClass = "bg-blue-100 text-blue-800 ring-blue-200";
        dotClass = "bg-blue-500";
    } else if (normalized.toLowerCase().includes('devolucion total')) {
        bgClass = "bg-purple-100 text-purple-800 ring-purple-200";
        dotClass = "bg-purple-500";
    } else if (normalized.toLowerCase().includes('ahorro voluntario') || normalized.toLowerCase().includes('ahorro puntual')) {
        bgClass = "bg-teal-100 text-teal-800 ring-teal-200";
        dotClass = "bg-teal-500";
    } else if (normalized.toLowerCase().includes('ahorro mensual') || normalized.toLowerCase().includes('abono')) {
        bgClass = "bg-emerald-100 text-emerald-800 ring-emerald-200";
        dotClass = "bg-emerald-500";
    } else if (normalized.toLowerCase().includes('penali')) {
        bgClass = "bg-rose-100 text-rose-800 ring-rose-200";
        dotClass = "bg-rose-500";
    }

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 whitespace-nowrap ${bgClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotClass}`} />
            {value}
        </span>
    );
};

// ——— Cell Renderer ———
const CellValue = ({ column, value }) => {
    if (column.isPenBadge) return <PenBadge value={value} />;
    if (column.isTypeBadge) return <TypeBadge value={value} />;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (column.isStatusBadge) return <StatusBadge value={value} />;
    if (value === null || value === undefined || value === '') {
        return <span className="text-gray-300 text-xs italic">—</span>;
    }
    // ID técnico de DB: mostrar en gris tenue para diferenciarlo del Customer ID
    if (column.isTechId) {
        return <span className="font-mono text-xs text-gray-400 tabular-nums">{value}</span>;
    }
    if (column.isCurrency) {
        const num = parseFloat(value);
        return <span className="font-medium text-gray-900 tabular-nums">${!isNaN(num) ? num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</span>;
    }
    if (column.isNumber) {
        return <span className="tabular-nums text-gray-700">{value}</span>;
    }
    if (column.highlight) {
        return <span className="font-semibold text-gray-900">{value}</span>;
    }
    return <span className="text-gray-700">{value}</span>;
};

// Componente Wrapper para inyectar soporteInfo y handler
const CellWrapper = ({ column, row, onDownload }) => {
    if (column.isSoporte) {
        if (!row.soporte) return <span className="text-gray-300">—</span>;
        return (
            <button
                onClick={() => onDownload(row.id, row.soporte.name)}
                className="inline-flex items-center justify-center p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-md transition-colors tooltip-trigger"
                title={`Descargar ${row.soporte.name}`}
            >
                <Download className="h-5 w-5" />
            </button>
        );
    }
    return <CellValue column={column} value={row[column.key]} />;
};

const SavingsListPage = () => {
    const { toast } = useUi();

    // States
    const [savings, setSavings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState(''); // Estado de transaccion filter
    const [clientFilter, setClientFilter] = useState(''); // Exact client filter
    const [statusClientFilter, setStatusClientFilter] = useState(''); // Estatus (Activo/Desactivado)
    const [yearFilter, setYearFilter] = useState(''); // Año pago filter
    const [filterPenalty, setFilterPenalty] = useState(''); // SI/NO filter
    const [totalFromServer, setTotalFromServer] = useState(0);
    const [dashboardStats, setDashboardStats] = useState(null);
    const [soportesInfo, setSoportesInfo] = useState({}); // { savingId: { exists: true, name: '...' } }
    const [showMoraModal, setShowMoraModal] = useState(false);
    const [showPenaltyModal, setShowPenaltyModal] = useState(false);

    const fetchSavings = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/savings/list');
            if (res.data && res.data.ok) {
                const savingsData = res.data.data;
                setSavings(savingsData);
                setTotalFromServer(res.data.total);
            } else {
                throw new Error(res.data?.error || 'Respuesta inesperada del servidor');
            }
        } catch (err) {
            console.error('Error fetching savings list:', err);
            setError(err.message || 'Error al conectar con el servidor');
            setSavings([]);
            setTotalFromServer(0);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchDashboardStats = useCallback(async () => {
        try {
            const res = await api.get('/admin/dashboard-stats');
            setDashboardStats(res.data);
        } catch (err) {
            console.error('Error fetching dashboard stats:', err);
        }
    }, []);

    useEffect(() => {
        fetchSavings();
        fetchDashboardStats();
    }, [fetchSavings, fetchDashboardStats]);

    // Client-side filtering (Search, Exact Client & Estatus)
    const filteredSavings = useMemo(() => {
        let results = savings;

        // Apply Estatus Filter
        if (statusClientFilter) {
            const term = statusClientFilter.toLowerCase();
            results = results.filter(s =>
                s.clientEstatus && s.clientEstatus.toLowerCase() === term
            );
        }

        // Apply Exact Client Filter
        if (clientFilter) {
            results = results.filter(s => s.clientCustomerId === clientFilter);
        }

        // Apply Year Filter
        if (yearFilter) {
            results = results.filter(s => s.year && s.year.toString() === yearFilter);
        }

        // Apply Status Filter
        if (statusFilter) {
            results = results.filter(s => s.status === statusFilter);
        }

        // Apply Penalty Filter
        if (filterPenalty) {
            results = results.filter(s => {
                const hasPenalty = (parseFloat(s.valorAPenalizar) || 0) > 0;
                return filterPenalty === 'SI' ? hasPenalty : !hasPenalty;
            });
        }

        return results;
    }, [savings, statusFilter, clientFilter, statusClientFilter, yearFilter, filterPenalty]);

    const { sortedData: sortedSavings, sortConfig: savingsSort, handleSort: handleSavingsSort } = useSortTable(filteredSavings);

    // Generate unique list of Statuses for the dropdown
    const uniqueStatusDropdown = useMemo(() => {
        const statuses = new Set();
        savings.forEach(s => {
            if (s.status) statuses.add(s.status);
        });
        return Array.from(statuses).sort((a, b) => a.localeCompare(b));
    }, [savings]);

    // Generate unique list of years for the dropdown
    const uniqueYearsDropdown = useMemo(() => {
        const years = new Set();
        savings.forEach(s => {
            if (s.year) years.add(s.year.toString());
        });
        return Array.from(years).sort((a, b) => b.localeCompare(a)); // Descending
    }, [savings]);

    // Generate unique list of clients for the dropdown (from the raw fetched savings)
    const uniqueClientsDropdown = useMemo(() => {
        const clientMap = new Map();
        savings.forEach(s => {
            if (s.clientCustomerId && s.clientName) {
                // Use customerId as unique key
                if (!clientMap.has(s.clientCustomerId)) {
                    clientMap.set(s.clientCustomerId, {
                        id: s.clientCustomerId,
                        name: `${s.clientName} ${s.clientSurname}`.trim(),
                        cedula: s.clientCedula
                    });
                }
            }
        });
        return Array.from(clientMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [savings]);

    const stats = useMemo(() => {
        let capitalAhorrado = 0;
        let ahorroTotalFiltro = 0;
        let diasPenalizados = 0;
        let valorPenalizado = 0;

        filteredSavings.forEach(s => {
            const amount = parseFloat(s.amount) || 0;
            const penalty = parseFloat(s.valorAPenalizar) || 0;
            const saved = parseFloat(s.valorAhorrado) || 0;

            // User requested "Capital Ahorrado (Activos)" to use "Valor Mensual" (amount)
            if (s.clientEstatus && s.clientEstatus.toLowerCase() === 'activo') {
                capitalAhorrado += amount;
            }

            ahorroTotalFiltro += amount;
            diasPenalizados += parseInt(s.diasPenalizacion) || 0;
            valorPenalizado += penalty;
        });

        const ahorroNeto = ahorroTotalFiltro - valorPenalizado;

        return { capitalAhorrado, diasPenalizados, valorPenalizado, ahorroNeto };
    }, [filteredSavings]);

    const handleDownloadSoporte = async (savingId, fileName) => {
        try {
            const res = await api.get(`/admin/savings/${savingId}/soporte`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error('Error al descargar el archivo de soporte');
            console.error('Download error:', err);
        }
    };

    const handleExport = () => {
        if (filteredSavings.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const dataToExport = filteredSavings.map(s => ({
            'Id_VM': s.externalId,
            'Customer_id': s.clientCustomerId,
            'Nombre': s.clientName,
            'Apellido': s.clientSurname,
            'Estado': s.status,
            'Fecha Pago': formatDate(s.date),
            'Año pago': s.year,
            'Mes pago': s.month,
            'Penalizacion': s.penalizacion,
            'Dias Penalizacion': s.diasPenalizacion,
            'Valor Mensual': parseFloat(s.amount || 0),
            'Valor a Penalizar': parseFloat(s.valorAPenalizar || 0),
            'Valor Ahorrado': parseFloat(s.valorAhorrado || 0),
            'Mes Abonado': s.mesAbonado,
            'Año Abonado': s.anioAbonado,
            'Item_Quantity': s.itemQuantity,
            'Banco': s.banco,
            '# Transaccion': s.numeroTransaccion,
            'Desde Cuenta de Ahorros': s.origen,
            'Tipo de Ahorro': s.type,
            'Observaciones': s.observaciones,
            'Soporte Adjunto': s.soporte ? 'Sí' : 'No'
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ahorros');
        XLSX.writeFile(wb, 'Lista_Ahorros.xlsx');
        toast.success('Reporte exportado exitosamente');
    };

    // ——— LOADING ———
    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
                    <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
                </div>
                <Card><CardContent className="p-6 space-y-4">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="flex gap-4 items-center">
                            <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                            <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                            <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
                            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                        </div>
                    ))}
                </CardContent></Card>
            </div>
        );
    }

    // ——— ERROR ———
    if (error) {
        return (
            <div className="space-y-6">
                <div><h1 className="text-2xl font-bold text-brand-dark">Lista de Ahorro</h1>
                    <p className="text-gray-500">Ahorros mensuales registrados en el sistema</p></div>
                <Card><CardContent className="p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No se pudo cargar la lista</h3>
                    <p className="text-gray-500 mb-6 max-w-md mx-auto">{error}</p>
                    <Button onClick={fetchSavings} className="bg-brand-primary hover:bg-brand-dark">
                        <RefreshCw className="h-4 w-4 mr-2" /> Reintentar
                    </Button>
                </CardContent></Card>
            </div>
        );
    }

    // ——— TABLE ———
    return (
        <div className="space-y-6">
            {/* Dynamic Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <StatCard
                    title="Cartera en Mora"
                    value={loading ? '...' : `$${Number(dashboardStats?.carteraMora || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description={`${dashboardStats?.sociosMoraCount || 0} socios con ahorro pendiente`}
                    icon={AlertTriangle}
                    color="text-red-500"
                    textColor="text-red-600"
                    onClick={() => setShowMoraModal(true)}
                />
                <StatCard
                    title="Capital Ahorrado (Activos)"
                    value={`$${stats.capitalAhorrado.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Suma bruta socias activos"
                    icon={PiggyBank}
                    color="text-emerald-500"
                />
                <StatCard
                    title="Días de Penalización"
                    value={stats.diasPenalizados}
                    description="Suma total de días"
                    icon={AlertCircle}
                    color="text-rose-500"
                    textColor={stats.diasPenalizados > 0 ? 'text-rose-600' : 'text-gray-900'}
                />
                <StatCard
                    title="Valor Penalizado"
                    value={`$${stats.valorPenalizado.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Total de recargos globales"
                    icon={DollarSign}
                    color="text-amber-500"
                    onClick={() => setShowPenaltyModal(true)}
                />
                <StatCard
                    title="Ahorro Total Neto"
                    value={`$${stats.ahorroNeto.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Total (menos penalización)"
                    icon={PiggyBank}
                    customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)"
                    isDark={false}
                />
            </div>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-brand-primary/10">
                        <PiggyBank className="h-5 w-5 text-brand-primary" />
                    </div>
                    <ListHeader
                        title="Lista de Ahorro"
                        source="1-orders_table_ahorro_mensual"
                        totalCount={savings.length}
                        filteredCount={filteredSavings.length}
                        loading={loading}
                        className="mb-0"
                    />
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto flex-wrap">
                    <FilterSelect icon={Calendar} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} width="lg:w-32">
                        <option value="">Año: Todos</option>
                        {uniqueYearsDropdown.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </FilterSelect>

                    <FilterSelect icon={UserCheck} value={statusClientFilter} onChange={(e) => setStatusClientFilter(e.target.value)} width="lg:w-44">
                        <option value="">Estatus: Todos</option>
                        <option value="Activo">Activo</option>
                        <option value="Desactivado">Desactivado</option>
                    </FilterSelect>

                    <ClientSelect clients={uniqueClientsDropdown} value={clientFilter} onChange={setClientFilter} width="lg:w-56" />

                    <FilterSelect icon={Activity} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} width="lg:w-44">
                        <option value="">Estado: Todos</option>
                        {uniqueStatusDropdown.map(st => (
                            <option key={st} value={st}>{st}</option>
                        ))}
                    </FilterSelect>

                    <FilterSelect icon={AlertCircle} value={filterPenalty} onChange={(e) => setFilterPenalty(e.target.value)} width="lg:w-40">
                        <option value="">Detrimento: Todos</option>
                        <option value="SI">Con Detrimento</option>
                        <option value="NO">Sin Detrimento</option>
                    </FilterSelect>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="secondary" onClick={handleExport} title="Exportar a Excel" className="px-3">
                            <Download className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Exportar</span>
                        </Button>
                        <Button variant="ghost" onClick={fetchSavings} title="Recargar datos" className="px-2.5">
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* EMPTY */}
            {filteredSavings.length === 0 ? (
                <Card><CardContent className="p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                        <Inbox className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Sin registros</h3>
                    <p className="text-gray-500 text-sm">
                        {'No hay ahorros registrados que coincidan con los filtros seleccionados.'}
                    </p>
                    {(statusFilter || yearFilter || statusClientFilter || clientFilter || filterPenalty) && (
                        <Button variant="ghost" onClick={() => { setStatusFilter(''); setYearFilter(''); setStatusClientFilter(''); setClientFilter(''); setFilterPenalty(''); }} className="mt-4 text-brand-primary hover:text-brand-dark">Limpiar todos los filtros</Button>
                    )}
                </CardContent></Card>
            ) : (
                <>
                    <Card className="overflow-hidden border-none shadow-none bg-transparent">
                        <div className="table-container">
                            <table className="premium-table" id="savings-list-table">
                                <thead>
                                    <tr>
                                        {TABLE_COLUMNS.map(col => (
                                            <th key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }} className="cursor-pointer select-none hover:opacity-80 transition-opacity" onClick={() => handleSavingsSort(col.key)}>
                                                <span className="inline-flex items-center gap-1">{col.label}<SortIcon colKey={col.key} sortConfig={savingsSort} /></span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedSavings.map((saving, rowIdx) => (
                                        <tr key={saving.id} className={`transition-colors duration-150 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                            {TABLE_COLUMNS.map(col => (
                                                <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }} className={col.key === 'id' ? 'font-mono text-xs' : ''}>
                                                    <CellWrapper column={col} row={saving} onDownload={handleDownloadSoporte} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Total counter */}
                    <div className="flex justify-between items-center text-sm text-gray-500 pt-1">
                        <p>
                            {(statusFilter || clientFilter || statusClientFilter || yearFilter || filterPenalty)
                                ? (<>Mostrando <span className="font-semibold text-gray-900">{filteredSavings.length}</span> de <span className="font-semibold text-gray-900">{totalFromServer}</span> registros filtrados</>)
                                : (<>Total: <span className="font-semibold text-gray-900">{totalFromServer}</span> registros</>)
                            }
                        </p>
                        {(statusFilter || clientFilter || statusClientFilter || yearFilter || filterPenalty) && (
                            <button onClick={() => { setStatusFilter(''); setYearFilter(''); setStatusClientFilter(''); setClientFilter(''); setFilterPenalty(''); }} className="text-brand-primary hover:text-brand-dark text-xs underline">Limpiar filtros</button>
                        )}
                    </div>
                </>
            )}
            {showMoraModal && <MoraModal details={dashboardStats?.detalleMora} onClose={() => setShowMoraModal(false)} />}
            {showPenaltyModal && <PenaltyModal details={dashboardStats?.detallePenalidad} onClose={() => setShowPenaltyModal(false)} />}
        </div>
    );
};

export default SavingsListPage;
