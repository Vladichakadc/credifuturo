import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, CreditCard, Inbox, Download, X, Hash, TrendingUp } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell } from 'recharts';

const fmtCOP = v => `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const LOAN_BAR_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

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
    { key: 'idVm', label: 'ID Préstamo', align: 'center', minWidth: '100px', highlight: true },
    { key: 'estado', label: 'Estado', align: 'center', minWidth: '110px', isBadge: true },
    { key: 'fechaPrestamo', label: 'Fecha Préstamo', align: 'center', minWidth: '130px', isDate: true },
    { key: 'valorPrestado', label: 'Valor Prestado', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'cuotas', label: '# Cuotas', align: 'center', minWidth: '90px', isNumber: true },
    { key: 'interesMensual', label: 'Interés Mensual', align: 'right', minWidth: '120px', isPercent: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '130px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '180px' },
];

const LoanStatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-400 text-xs italic">—</span>;
    const normalized = value.trim().toLowerCase();
    const colorMap = {
        'activo': 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        'desembolsado': 'bg-blue-100 text-blue-800 ring-blue-200',
        'pendiente': 'bg-amber-100 text-amber-800 ring-amber-200',
        'cancelado': 'bg-red-100 text-red-700 ring-red-200',
        'mora': 'bg-orange-100 text-orange-800 ring-orange-200',
    };
    const dotMap = {
        'activo': 'bg-emerald-500',
        'desembolsado': 'bg-blue-500',
        'pendiente': 'bg-amber-500',
        'cancelado': 'bg-red-500',
        'mora': 'bg-orange-500',
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
    if (value === null || value === undefined || value === '') return <span className="text-gray-300 text-xs italic">—</span>;
    if (column.isCurrency) {
        const num = parseFloat(value);
        return <span className="font-medium text-gray-900 tabular-nums">${!isNaN(num) ? num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</span>;
    }
    if (column.isPercent) {
        const num = parseFloat(value);
        if (!isNaN(num)) return <span className="tabular-nums text-gray-700">{(num * 100).toFixed(2)}%</span>;
    }
    if (column.isNumber) return <span className="tabular-nums text-gray-700">{value}</span>;
    if (column.highlight) return <span className="font-semibold text-gray-900">{value}</span>;
    return <span className="text-gray-700">{value}</span>;
};

const UserLoansListPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    const { toast } = useUi();
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterAnio, setFilterAnio] = useState('');

    const fetchLoans = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/my/loans');
            if (res.data && res.data.ok) {
                setLoans(res.data.data);
            } else {
                throw new Error(res.data?.error || 'Error del servidor');
            }
        } catch (err) {
            setError(err.message || 'Error al conectar');
            setLoans([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLoans(); }, [fetchLoans]);

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
        return [...new Set(years)].sort((a, b) => b - a); // Orden descendente (más recientes primero)
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
        const barData = loans
            .filter(l => l.idVm && parseFloat(l.valorPrestado || 0) > 0)
            .sort((a, b) => (a.idVm || '').localeCompare(b.idVm || '', undefined, { numeric: true }))
            .map(l => ({ id: l.idVm, valor: parseFloat(l.valorPrestado || 0), estado: l.estado || '' }));
        return { totalPrestado, count: loans.length, barData };
    }, [loans]);

    const clearFilters = () => {
        setSearchTerm('');
        setFilterEstado('');
        setFilterAnio('');
    };
    const hasActiveFilters = searchTerm || filterEstado || filterAnio;

    const handleExport = () => {
        if (filteredLoans.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const dataToExport = filteredLoans.map(l => ({
            'ID_VM': l.idVm,
            'Estado': l.estado,
            'Fecha Préstamo': formatDate(l.fechaPrestamo),
            'Valor Prestado': l.valorPrestado,
            '# Cuotas': l.cuotas,
            'Interés Mensual': l.interesMensual,
            'Banco': l.banco,
            'Observaciones': l.observaciones
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mis Préstamos');
        XLSX.writeFile(wb, 'Mis_Prestamos.xlsx');
        toast.success('Exportado exitosamente');
    };

    if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Cargando...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <CreditCard className="h-6 w-6 text-brand-primary" />
                        Mis Préstamos
                     {!user?.name ? '' : `- ${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim()}</h2>
                    <p className="text-gray-500 text-sm">Historial de préstamos desembolsados</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <Button variant="secondary" onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
                    <Button variant="ghost" onClick={fetchLoans}><RefreshCw className="h-4 w-4" /></Button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white rounded-xl border border-ui-border shadow-sm p-4">
                <div className="flex flex-wrap gap-3 items-end">
                    {/* Búsqueda General */}
                    <div className="min-w-[280px] flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Buscar (Id VM, Banco)</label>
                        <div className="relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar en mis préstamos..."
                                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Filtro Estado */}
                    <div className="min-w-[170px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                        <select
                            value={filterEstado}
                            onChange={e => setFilterEstado(e.target.value)}
                            className="w-full py-2 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                        >
                            <option value="">Todos</option>
                            {estadoOptions.map(o => (
                                <option key={o} value={o}>{o}</option>
                            ))}
                        </select>
                    </div>

                    {/* Filtro Año Desembolso */}
                    <div className="min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Año Desembolso</label>
                        <select
                            value={filterAnio}
                            onChange={e => setFilterAnio(e.target.value)}
                            className="w-full py-2 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                        >
                            <option value="">Todos</option>
                            {anioOptions.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* Limpiar Filtros */}
                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-gray-500 hover:text-gray-700 self-end">
                            <X className="h-3.5 w-3.5" /> Limpiar
                        </Button>
                    )}
                </div>
            </div>

            {/* Tarjeta total + Gráfico por ID de préstamo */}
            {loans.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Tarjeta total */}
                    <div className="lg:col-span-1 flex flex-col gap-4">
                        <Card className="overflow-hidden border-0 shadow-md" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%)' }}>
                            <div className="p-6 relative">
                                <div className="absolute top-4 right-4 bg-white/10 rounded-xl p-2">
                                    <CreditCard className="h-6 w-6 text-white/80" />
                                </div>
                                <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">Total Desembolsado</p>
                                <p className="text-3xl font-bold text-white tabular-nums leading-tight">{fmtCOP(loanStats.totalPrestado)}</p>
                                <div className="h-px bg-white/15 my-3" />
                                <div className="flex items-center gap-1.5 text-indigo-200 text-sm">
                                    <Hash className="h-3.5 w-3.5" />
                                    {loanStats.count} {loanStats.count === 1 ? 'préstamo' : 'préstamos'} en total
                                </div>
                            </div>
                        </Card>

                        {/* Lista rápida por préstamo */}
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

                    {/* Gráfico de barras por ID de préstamo */}
                    <Card className="lg:col-span-2 border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-indigo-500" />
                            <h3 className="text-sm font-bold text-gray-700">Valor Desembolsado por ID Préstamo</h3>
                        </div>
                        <div className="p-5">
                            {loanStats.barData.length === 0 ? (
                                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
                            ) : (
                                <div style={{ height: loanStats.barData.length <= 2 ? 160 : 220 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={loanStats.barData}
                                            margin={{ top: 30, right: 16, left: 8, bottom: 4 }}
                                            barSize={loanStats.barData.length <= 4 ? 44 : 32}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis
                                                dataKey="id"
                                                axisLine={false} tickLine={false}
                                                tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }}
                                            />
                                            <YAxis
                                                axisLine={false} tickLine={false}
                                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                                tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`}
                                                width={56}
                                            />
                                            <Tooltip content={<LoanBarTooltip />} cursor={{ fill: '#eef2ff' }} />
                                            <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                                                {loanStats.barData.map((_, i) => (
                                                    <Cell key={i} fill={LOAN_BAR_COLORS[i % LOAN_BAR_COLORS.length]} />
                                                ))}
                                                <LabelList
                                                    dataKey="valor"
                                                    position="top"
                                                    style={{ fill: '#374151', fontSize: 10, fontWeight: 700 }}
                                                    formatter={v => fmtCOP(v)}
                                                />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {filteredLoans.length === 0 ? (
                <Card><CardContent className="p-12 text-center">
                    <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No tienes préstamos registrados.</p>
                </CardContent></Card>
            ) : (
                <Card className="overflow-hidden border-none shadow-none bg-transparent">
                    <div className="table-container">
                        <table className="premium-table">
                            <thead>
                                <tr>
                                    {TABLE_COLUMNS.map(col => (
                                        <th key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLoans.map((loan, idx) => (
                                    <tr key={loan.id} className={`transition-colors duration-150 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                        {TABLE_COLUMNS.map(col => (
                                            <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                <CellValue column={col} value={loan[col.key]} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default UserLoansListPage;
