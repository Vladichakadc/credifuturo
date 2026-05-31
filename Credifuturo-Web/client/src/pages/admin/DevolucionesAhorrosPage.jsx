import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../../config/api';
import {
    RefreshCw, Inbox, Download, Search, DollarSign, Users,
    ChevronDown, Calendar, UserCheck, TrendingUp, Banknote,
    BarChart3, Hash, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { useSortTable, SortIcon } from '../../utils/useSortTable';

const STATUS_DEVOLUCION = 'Devolucion Total Intereses Ahorros Mensuales';

const fmtCOP = v => `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const StatCard = ({ title, value, description, icon: Icon, accentColor = '#166534', gradient }) => (
    <Card className="overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        style={gradient ? { background: gradient, border: 'none' } : { borderTop: `3px solid ${accentColor}` }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={`text-sm font-semibold ${gradient ? 'text-white/90' : 'text-gray-600'}`}>{title}</CardTitle>
            <Icon className="h-4 w-4" style={{ color: gradient ? 'rgba(255,255,255,0.8)' : accentColor }} />
        </CardHeader>
        <CardContent>
            <p className={`text-2xl font-black tabular-nums ${gradient ? 'text-white' : 'text-gray-900'}`}>{value}</p>
            <p className={`text-xs mt-1 ${gradient ? 'text-white/80' : 'text-gray-500'}`}>{description}</p>
        </CardContent>
    </Card>
);

const FilterSelect = ({ icon: Icon, value, onChange, children, ariaLabel, width = 'w-44' }) => (
    <div className={`relative ${width}`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${value ? 'bg-emerald-700/10 border-emerald-700/40' : 'bg-emerald-50 border-emerald-200'}`}>
            <Icon className={`h-4 w-4 flex-shrink-0 ${value ? 'text-emerald-800' : 'text-emerald-600'}`} />
            <select aria-label={ariaLabel} value={value} onChange={onChange}
                className="flex-1 bg-transparent text-sm font-semibold text-gray-700 appearance-none outline-none cursor-pointer truncate">
                {children}
            </select>
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 pointer-events-none" />
        </div>
    </div>
);

const StatusBadge = () => (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        {STATUS_DEVOLUCION}
    </span>
);

const TABLE_COLS = [
    { key: 'externalId',       label: 'ID_VM',          align: 'left',   minW: 90  },
    { key: 'clientCustomerId', label: 'Customer ID',    align: 'center', minW: 100 },
    { key: 'clientName',       label: 'Nombre',         align: 'left',   minW: 130 },
    { key: 'clientSurname',    label: 'Apellido',       align: 'left',   minW: 130 },
    { key: 'date',             label: 'Fecha Pago',     align: 'center', minW: 110, isDate: true },
    { key: 'year',             label: 'Año',            align: 'center', minW: 70  },
    { key: 'month',            label: 'Mes',            align: 'center', minW: 100 },
    { key: 'amount',           label: 'Valor Devuelto', align: 'right',  minW: 130, isCur: true },
    { key: 'valorAhorrado',    label: 'Valor Neto',     align: 'right',  minW: 120, isCur: true },
    { key: 'banco',            label: 'Banco',          align: 'left',   minW: 120 },
    { key: 'numeroTransaccion',label: '# Transacción',  align: 'left',   minW: 120 },
    { key: 'clientEstatus',    label: 'Estatus Socio',  align: 'center', minW: 110, isEstatus: true },
];

const ITEMS_PER_PAGE = 25;

const DevolucionesAhorrosPage = () => {
    const { toast } = useUi();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [yearFilter, setYearFilter] = useState('');
    const [estatusFilter, setEstatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const { sortedData, sortConfig, handleSort } = useSortTable(data);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/savings/list', {
                params: { status: STATUS_DEVOLUCION, type: 'Todos' }
            });
            setData(res.data?.data || []);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Error de conexión');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { setCurrentPage(1); }, [yearFilter, estatusFilter, search]);

    const years = useMemo(() => [...new Set(data.map(s => s.year).filter(Boolean))].sort((a, b) => b - a), [data]);

    const filtered = useMemo(() => {
        let result = sortedData;
        if (yearFilter) result = result.filter(s => String(s.year) === String(yearFilter));
        if (estatusFilter) result = result.filter(s => (s.clientEstatus || '').toLowerCase() === estatusFilter.toLowerCase());
        if (search.trim()) {
            const t = search.toLowerCase();
            result = result.filter(s =>
                (s.clientName || '').toLowerCase().includes(t) ||
                (s.clientSurname || '').toLowerCase().includes(t) ||
                (s.externalId || '').toLowerCase().includes(t) ||
                (s.clientCustomerId || '').toString().includes(t)
            );
        }
        return result;
    }, [sortedData, yearFilter, estatusFilter, search]);

    const stats = useMemo(() => {
        const totalDevuelto = filtered.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const totalNeto = filtered.reduce((s, r) => s + parseFloat(r.valorAhorrado || r.amount || 0), 0);
        const socios = new Set(filtered.map(r => r.clientCustomerId).filter(Boolean)).size;
        const maxSocio = {};
        filtered.forEach(r => {
            const k = r.clientCustomerId;
            if (k) maxSocio[k] = (maxSocio[k] || 0) + parseFloat(r.amount || 0);
        });
        const topEntry = Object.entries(maxSocio).sort(([, a], [, b]) => b - a)[0];
        const topSocio = topEntry ? filtered.find(r => r.clientCustomerId == topEntry[0]) : null;
        const promedio = socios > 0 ? totalDevuelto / socios : 0;
        return { totalDevuelto, totalNeto, socios, promedio, topSocio, topMonto: topEntry?.[1] || 0 };
    }, [filtered]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    const handleExport = () => {
        if (!filtered.length) { toast.error('No hay datos para exportar.'); return; }
        const ws = XLSX.utils.json_to_sheet(filtered.map(s => ({
            'ID_VM': s.externalId,
            'Customer ID': s.clientCustomerId,
            'Nombre': s.clientName,
            'Apellido': s.clientSurname,
            'Estado': s.status,
            'Fecha Pago': formatDate(s.date),
            'Año': s.year,
            'Mes': s.month,
            'Valor Devuelto': parseFloat(s.amount || 0),
            'Valor Neto': parseFloat(s.valorAhorrado || 0),
            'Banco': s.banco,
            '# Transacción': s.numeroTransaccion,
            'Estatus Socio': s.clientEstatus,
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Devoluciones');
        XLSX.writeFile(wb, 'Devoluciones_Ahorros.xlsx');
        toast.success('Exportado exitosamente');
    };

    if (loading) return (
        <div className="flex items-center justify-center py-24 gap-3 text-emerald-700">
            <Loader2 className="h-7 w-7 animate-spin" />
            <span className="text-base font-medium">Cargando devoluciones...</span>
        </div>
    );

    if (error) return (
        <div className="p-8 text-center text-red-500">
            <p className="font-semibold mb-2">Error al cargar las devoluciones</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <Button onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Reintentar</Button>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-emerald-800 flex items-center gap-2">
                        <Banknote className="h-6 w-6 text-emerald-600" />
                        Devoluciones de Ahorros
                    </h1>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs text-gray-500">Filtro activo:</span>
                        <StatusBadge />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />Exportar Excel
                    </Button>
                    <Button variant="ghost" onClick={fetchData}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title="Total Devuelto"
                    value={fmtCOP(stats.totalDevuelto)}
                    description={`${filtered.length} registros filtrados`}
                    icon={TrendingUp}
                    gradient="linear-gradient(135deg, #052e16 0%, #166534 60%, #1a7a42 100%)"
                />
                <StatCard
                    title="Valor Neto Acreditado"
                    value={fmtCOP(stats.totalNeto)}
                    description="Suma neta acreditada a socios"
                    icon={DollarSign}
                    accentColor="#166534"
                />
                <StatCard
                    title="Socios Beneficiados"
                    value={stats.socios}
                    description="Socios con devolución registrada"
                    icon={Users}
                    accentColor="#1a7a42"
                />
                <StatCard
                    title="Devolución Promedio"
                    value={fmtCOP(stats.promedio)}
                    description="Promedio por socio beneficiado"
                    icon={BarChart3}
                    accentColor="#fbbf24"
                />
            </div>

            {/* Top socio */}
            {stats.topSocio && (
                <Card className="border border-emerald-200 bg-emerald-50/40">
                    <div className="p-4 flex items-center gap-3">
                        <div className="bg-emerald-600 rounded-xl p-2.5">
                            <TrendingUp className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Mayor devolución acumulada</p>
                            <p className="text-sm font-black text-emerald-900">
                                {stats.topSocio.clientName} {stats.topSocio.clientSurname}
                                <span className="ml-2 text-emerald-700 font-semibold">— {fmtCOP(stats.topMonto)}</span>
                            </p>
                            <p className="text-xs text-gray-500">Customer ID {stats.topSocio.clientCustomerId}</p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Filters */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-wrap gap-3 items-end shadow-sm">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text" placeholder="Buscar por nombre, Customer ID o ID_VM..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    />
                </div>
                <FilterSelect icon={Calendar} value={yearFilter} onChange={e => setYearFilter(e.target.value)} ariaLabel="Filtrar por año">
                    <option value="">Año: Todos</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </FilterSelect>
                <FilterSelect icon={UserCheck} value={estatusFilter} onChange={e => setEstatusFilter(e.target.value)} ariaLabel="Filtrar por estatus socio">
                    <option value="">Estatus: Todos</option>
                    <option value="Activo">Activo</option>
                    <option value="Desactivado">Desactivado</option>
                </FilterSelect>
                <p className="text-xs text-gray-500 ml-auto self-center whitespace-nowrap">
                    <span className="font-bold text-emerald-700">{filtered.length}</span> de {data.length} registros
                </p>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
                <Card><CardContent className="p-12 text-center">
                    <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">No se encontraron devoluciones con los filtros actuales.</p>
                </CardContent></Card>
            ) : (
                <Card className="overflow-hidden border border-gray-100 shadow-sm">
                    <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
                        <table className="w-full text-xs border-collapse" style={{ minWidth: `${TABLE_COLS.reduce((s, c) => s + c.minW, 0)}px` }}>
                            <thead className="sticky top-0 z-10 bg-emerald-700 text-white">
                                <tr>
                                    {TABLE_COLS.map(col => (
                                        <th key={col.key}
                                            style={{ textAlign: col.align, minWidth: col.minW }}
                                            className="px-3 py-3 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap cursor-pointer hover:bg-emerald-800 transition-colors select-none"
                                            onClick={() => handleSort(col.key)}>
                                            <span className="inline-flex items-center gap-1">
                                                {col.label}
                                                <SortIcon colKey={col.key} sortConfig={sortConfig} />
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.map((row, i) => (
                                    <tr key={row.id || i}
                                        className={`border-t border-gray-50 transition-colors hover:bg-emerald-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                        {TABLE_COLS.map(col => (
                                            <td key={col.key} style={{ textAlign: col.align, minWidth: col.minW }} className="px-3 py-2.5 whitespace-nowrap">
                                                {col.isDate ? (
                                                    <span className="tabular-nums text-gray-700">{formatDate(row[col.key])}</span>
                                                ) : col.isCur ? (
                                                    <span className="font-semibold text-emerald-700 tabular-nums">
                                                        {fmtCOP(row[col.key])}
                                                    </span>
                                                ) : col.isEstatus ? (
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${(row[col.key] || '').toLowerCase() === 'activo' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                                                        {row[col.key] || '—'}
                                                    </span>
                                                ) : col.key === 'externalId' ? (
                                                    <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">{row[col.key] || '—'}</span>
                                                ) : col.key === 'clientCustomerId' ? (
                                                    <span className="font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-[11px]">{row[col.key] || '—'}</span>
                                                ) : (
                                                    <span className="text-gray-700">{row[col.key] ?? '—'}</span>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-emerald-50 font-bold text-emerald-900 border-t-2 border-emerald-200 sticky bottom-0">
                                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest" colSpan={7}>
                                        Totales · {filtered.length} registro(s)
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{fmtCOP(stats.totalDevuelto)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtCOP(stats.totalNeto)}</td>
                                    <td className="px-3 py-2" colSpan={3}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex justify-between items-center p-3 border-t border-gray-100 bg-gray-50/50">
                            <span className="text-xs text-gray-500">
                                Mostrando <strong className="text-emerald-700">{startIdx + 1}–{Math.min(startIdx + ITEMS_PER_PAGE, filtered.length)}</strong> de <strong>{filtered.length}</strong>
                            </span>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                    <ChevronLeft className="h-4 w-4 mr-1" />Anterior
                                </Button>
                                <span className="text-xs font-medium text-gray-600">
                                    Página <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{currentPage}</span> de {totalPages}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                    Siguiente<ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

export default DevolucionesAhorrosPage;
