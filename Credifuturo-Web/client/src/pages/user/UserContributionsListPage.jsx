import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, Wallet, Inbox, Download, TrendingUp, Hash, Calendar } from 'lucide-react';
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
    { key: 'date', label: 'Fecha Pago', align: 'center', minWidth: '110px', isDate: true },
    { key: 'year', label: 'Año', align: 'center', minWidth: '80px' },
    { key: 'month', label: 'Mes', align: 'center', minWidth: '100px' },
    { key: 'amount', label: 'Valor', align: 'right', minWidth: '120px', isCurrency: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '120px' },
    { key: 'numeroTransaccion', label: '# Transaccion', align: 'left', minWidth: '120px' },
    { key: 'origen', label: 'Desde Cuenta de Ahorros', align: 'left', minWidth: '180px' },
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

const CellValue = ({ column, value }) => {
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (column.isStatusBadge) return <StatusBadge value={value} />;
    if (value === null || value === undefined || value === '') return <span className="text-gray-300 text-xs italic">—</span>;
    if (column.isCurrency) {
        const num = parseFloat(value);
        return <span className="font-medium text-gray-900 tabular-nums">${!isNaN(num) ? num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</span>;
    }
    if (column.highlight) return <span className="font-semibold text-gray-900">{value}</span>;
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
        return { totalAmount, barData, count: data.length, yearRange: years.length > 0 ? `${years[0]} – ${years[years.length - 1]}` : '—' };
    }, [data]);

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
                                {filteredData.map((item, idx) => (
                                    <tr key={item.id} className={`transition-colors duration-150 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                        {TABLE_COLUMNS.map(col => (
                                            <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                <CellValue column={col} value={item[col.key]} />
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

export default UserContributionsListPage;
