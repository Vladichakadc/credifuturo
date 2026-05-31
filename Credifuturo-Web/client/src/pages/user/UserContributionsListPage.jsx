import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, Wallet, Inbox, Download, TrendingUp, Hash, Calendar, Calculator, ArrowDownToLine, ArrowUpToLine, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell } from 'recharts';

const fmtCOP = v => `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const BAR_COLORS = ['#166534', '#fbbf24', '#1a7a42', '#d97706', '#2d9652', '#f5c518', '#052e16'];

const BarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
            <p className="font-bold text-gray-700 mb-1">{label}</p>
            <p className="text-emerald-600 font-semibold">{fmtCOP(payload[0].value)}</p>
        </div>
    );
};

const TABLE_COLUMNS = [
    { key: 'externalId', label: 'Id_AI', align: 'center', minWidth: '80px', highlight: true },
    { key: 'status', label: 'Estado', align: 'center', minWidth: '100px', isStatusBadge: true },
    { key: 'date', label: 'Fecha Aporte', align: 'center', minWidth: '110px', isDate: true },
    { key: 'periodo', label: 'Periodo', align: 'center', minWidth: '120px', isPeriodo: true },
    { key: 'amount', label: 'Valor Aportado', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'pctDelTotal', label: '% del Total', align: 'center', minWidth: '110px', isPctBar: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '120px' },
    { key: 'numeroTransaccion', label: '# Transacción', align: 'left', minWidth: '120px' },
    { key: 'origen', label: 'Cuenta Origen', align: 'left', minWidth: '160px' },
];

const StatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-300 text-xs italic">—</span>;
    const normalized = value.trim().toLowerCase();
    const isActive = normalized === 'activo' || normalized === 'active' || normalized === 'pagado' || normalized === 'vigente';
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${isActive ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-gray-100 text-gray-700 ring-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            {value}
        </span>
    );
};

const CellValue = ({ column, value, row }) => {
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (column.isStatusBadge) return <StatusBadge value={value} />;
    if (column.isPeriodo) {
        const mes = row?.month || '';
        const anio = row?.year || '';
        if (!mes && !anio) return <span className="text-gray-300 text-xs italic">—</span>;
        return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{mes} {anio}</span>;
    }
    if (column.isPctBar) {
        const pct = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;
        return (
            <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-[50px]">
                    <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-bold tabular-nums text-emerald-700 w-10 text-right">{pct.toFixed(1)}%</span>
            </div>
        );
    }
    if (value === null || value === undefined || value === '') return <span className="text-gray-300 text-xs italic">—</span>;
    if (column.isCurrency) {
        const num = parseFloat(value);
        if (isNaN(num)) return <span className="text-gray-300 text-xs italic">—</span>;
        return <span className="font-medium text-gray-900 tabular-nums">${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>;
    }
    if (column.highlight) return <span className="font-bold text-emerald-800">{value}</span>;
    return <span className="text-gray-700">{value}</span>;
};

const UserContributionsListPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    const { toast } = useUi();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 25;

    useEffect(() => { setCurrentPage(1); }, [searchTerm]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/my/initial-contributions');
            if (res.data && res.data.ok) {
                setData(res.data.data);
            } else {
                throw new Error('Error del servidor');
            }
        } catch (err) {
            setError(err.message || 'Error de conexión');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) return data;
        const term = searchTerm.toLowerCase().trim();
        return data.filter(s =>
            (s.externalId && s.externalId.toLowerCase().includes(term)) ||
            (s.banco && s.banco.toLowerCase().includes(term))
        );
    }, [data, searchTerm]);

    const stats = useMemo(() => {
        const totalAmount = data.reduce((acc, s) => acc + parseFloat(s.amount || 0), 0);
        const yearMap = {};
        data.forEach(s => {
            const yr = parseInt(s.year);
            if (!isNaN(yr)) yearMap[yr] = (yearMap[yr] || 0) + parseFloat(s.amount || 0);
        });
        const barData = Object.entries(yearMap)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([yr, val]) => ({ anio: yr, valor: val }));
        const years = barData.map(d => d.anio);
        const ticketPromedio = data.length > 0 ? totalAmount / data.length : 0;

        // Fechas: primer aporte, último aporte, frecuencia
        const fechas = data
            .map(s => s.date ? new Date(s.date) : null)
            .filter(d => d && !isNaN(d.getTime()))
            .sort((a, b) => a - b);
        const primerAporte = fechas[0] || null;
        const ultimoAporte = fechas[fechas.length - 1] || null;
        const diasDesdeUltimo = ultimoAporte ? Math.floor((Date.now() - ultimoAporte.getTime()) / (1000 * 60 * 60 * 24)) : null;
        const aporteMaximo = data.reduce((m, s) => Math.max(m, parseFloat(s.amount || 0)), 0);

        return {
            totalAmount, barData, count: data.length,
            yearRange: years.length > 0 ? `${years[0]} – ${years[years.length - 1]}` : '—',
            ticketPromedio, primerAporte, ultimoAporte, diasDesdeUltimo, aporteMaximo
        };
    }, [data]);

    const fmtDate = (d) => d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    const handleExport = () => {
        if (filteredData.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const exportData = filteredData.map(s => ({
            'Id_AI': s.externalId,
            'Estado': s.status,
            'Fecha Pago': formatDate(s.date),
            'Año': s.year,
            'Mes': s.month,
            'Valor': s.amount,
            'Banco': s.banco,
            '# Transaccion': s.numeroTransaccion,
            'Desde Cuenta de Ahorros': s.origen
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mis Aportes');
        XLSX.writeFile(wb, 'Mis_Aportes_Iniciales.xlsx');
        toast.success('Exportado exitosamente');
    };

    if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Cargando...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Wallet className="h-6 w-6 text-brand-primary" />
                        Mis Aportes Iniciales
                     {!user?.name ? '' : `- ${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim()}</h2>
                    <p className="text-gray-500 text-sm">Historial de aportes de capital</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="relative flex-1 lg:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            aria-label="Buscar en mis aportes"
                            type="text"
                            placeholder="Buscar..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/40 focus:border-brand-primary"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="secondary" onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
                    <Button variant="ghost" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                </div>
            </div>

            {/* KPI row con métricas del comportamiento de aporte */}
            {data.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Aporte Promedio</p>
                                <Calculator className="h-4 w-4 text-emerald-700" />
                            </div>
                            <p className="text-xl font-black text-emerald-800 tabular-nums leading-tight">{fmtCOP(stats.ticketPromedio)}</p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">Valor promedio por aporte realizado</p>
                        </div>
                    </Card>
                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Aporte Máximo</p>
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                            </div>
                            <p className="text-xl font-black text-emerald-600 tabular-nums leading-tight">{fmtCOP(stats.aporteMaximo)}</p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">Mayor contribución registrada en el histórico</p>
                        </div>
                    </Card>
                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Primer Aporte</p>
                                <ArrowDownToLine className="h-4 w-4 text-amber-600" />
                            </div>
                            <p className="text-base font-black text-amber-700 leading-tight">{fmtDate(stats.primerAporte)}</p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">Fecha del primer ingreso de capital al fondo</p>
                        </div>
                    </Card>
                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Último Aporte</p>
                                <ArrowUpToLine className="h-4 w-4 text-amber-500" />
                            </div>
                            <p className="text-base font-black text-amber-600 leading-tight">{fmtDate(stats.ultimoAporte)}</p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                                {stats.diasDesdeUltimo != null ? `Hace ${stats.diasDesdeUltimo} día(s)` : 'Sin registros'}
                            </p>
                        </div>
                    </Card>
                </div>
            )}

            {/* Tarjeta inteligente + Gráfico por años */}
            {data.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Tarjeta resumen total */}
                    <div className="lg:col-span-1 flex flex-col gap-4">
                        <Card className="overflow-hidden border-0 shadow-md" style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 55%, #1a7a42 100%)' }}>
                            <div className="p-6 relative">
                                <div className="absolute top-4 right-4 bg-white/10 rounded-xl p-2">
                                    <Wallet className="h-6 w-6 text-white/80" />
                                </div>
                                <p className="text-emerald-200 text-xs font-semibold uppercase tracking-wider mb-1">Capital Aportado</p>
                                <p className="text-3xl font-bold text-white mb-3 tabular-nums leading-tight">
                                    {fmtCOP(stats.totalAmount)}
                                </p>
                                <div className="h-px bg-white/15 my-3" />
                                <div className="flex items-center justify-between text-sm">
                                    <span className="flex items-center gap-1.5 text-emerald-200">
                                        <Hash className="h-3.5 w-3.5" />
                                        {stats.count} {stats.count === 1 ? 'aporte' : 'aportes'}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-emerald-200">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {stats.yearRange}
                                    </span>
                                </div>
                            </div>
                        </Card>

                        {/* Mini estadísticas por año */}
                        {stats.barData.length > 1 && (
                            <Card className="border border-gray-100 shadow-sm">
                                <div className="px-4 pt-4 pb-2 border-b border-gray-50">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalle por Año</p>
                                </div>
                                <div className="p-3 space-y-2">
                                    {stats.barData.map((d, i) => (
                                        <div key={d.anio} className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                                                <span className="text-gray-600 font-medium">{d.anio}</span>
                                            </span>
                                            <span className="font-semibold text-gray-800 tabular-nums">{fmtCOP(d.valor)}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* Gráfico de barras por año */}
                    <Card className="lg:col-span-2 border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                            <h3 className="text-sm font-bold text-gray-700">Evolución de Aportes por Año</h3>
                        </div>
                        <div className="p-5">
                            {stats.barData.length === 0 ? (
                                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos suficientes</div>
                            ) : (
                                <div style={{ height: stats.barData.length === 1 ? 140 : 200 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={stats.barData} margin={{ top: 28, right: 16, left: 8, bottom: 4 }} barSize={stats.barData.length <= 3 ? 48 : 36}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis
                                                dataKey="anio"
                                                axisLine={false} tickLine={false}
                                                tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }}
                                            />
                                            <YAxis
                                                axisLine={false} tickLine={false}
                                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                                                width={52}
                                            />
                                            <Tooltip content={<BarTooltip />} cursor={{ fill: '#f0fdf4' }} />
                                            <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                                                {stats.barData.map((_, i) => (
                                                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
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

            {filteredData.length === 0 ? (
                <Card><CardContent className="p-12 text-center">
                    <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No tienes aportes iniciales registrados.</p>
                </CardContent></Card>
            ) : (() => {
                const total = filteredData.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
                const enriched = filteredData.map(r => ({
                    ...r,
                    pctDelTotal: total > 0 ? (parseFloat(r.amount || 0) / total) * 100 : 0
                }));
                const totalPages = Math.max(1, Math.ceil(enriched.length / ITEMS_PER_PAGE));
                const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
                const paginated = enriched.slice(startIdx, startIdx + ITEMS_PER_PAGE);
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
                                    {paginated.map((item, idx) => (
                                        <tr key={item.id} className={`transition-colors duration-150 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                            {TABLE_COLUMNS.map(col => (
                                                <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                    <CellValue column={col} value={item[col.key]} row={item} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-emerald-50 font-bold text-emerald-900 border-t-2 border-emerald-200">
                                        <td className="px-3 py-2 text-[10px] uppercase tracking-widest" colSpan={4}>Total · {enriched.length} aporte(s)</td>
                                        <td className="px-3 py-2 text-right tabular-nums">${total.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                        <td className="px-3 py-2 text-center text-[10px]">100%</td>
                                        <td className="px-3 py-2" colSpan={3}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex justify-between items-center gap-2 p-3 border-t border-gray-100 bg-gray-50/50">
                                <span className="text-xs text-gray-500">Mostrando <strong className="text-emerald-700">{startIdx + 1}–{Math.min(startIdx + ITEMS_PER_PAGE, enriched.length)}</strong> de <strong>{enriched.length}</strong> aporte(s)</span>
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
    );
};

export default UserContributionsListPage;
