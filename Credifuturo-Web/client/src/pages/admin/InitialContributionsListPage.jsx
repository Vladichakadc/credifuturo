import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { notifyUpdate } from '../../utils/sync';
import { Search, RefreshCw, ClipboardList, AlertTriangle, Inbox, Download, Edit, Trash2, DollarSign, Users, Hash } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { formatDate } from '../../utils/excelUtils';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import ListHeader from '../../components/admin/ListHeader';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { useSortTable, SortIcon } from '../../utils/useSortTable';

// Configuración de columnas — Basado en Aportes Iniciales
const TABLE_COLUMNS = [
    { key: 'externalId', label: 'Id_AI', align: 'center', minWidth: '80px', highlight: true },
    { key: 'clientCustomerId', label: 'Customer_id', align: 'center', minWidth: '100px', highlight: true },
    { key: 'clientName', label: 'Nombre', align: 'left', minWidth: '120px' },
    { key: 'clientSurname', label: 'Apellido', align: 'left', minWidth: '120px' }, // Needs backend support or split from clientName
    { key: 'status', label: 'Estado', align: 'center', minWidth: '100px', isStatusBadge: true },
    { key: 'date', label: 'Fecha Pago', align: 'center', minWidth: '110px', isDate: true },
    { key: 'year', label: 'Año', align: 'center', minWidth: '80px' },
    { key: 'month', label: 'Mes', align: 'center', minWidth: '100px' },
    { key: 'amount', label: 'Valor', align: 'right', minWidth: '120px', isCurrency: true },
    { key: 'itemQuantity', label: 'Item_Quantity', align: 'center', minWidth: '100px', isNumber: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '120px' },
    { key: 'numeroTransaccion', label: '# Transaccion', align: 'left', minWidth: '120px' },
    { key: 'origen', label: 'Desde Cuenta de Ahorros', align: 'left', minWidth: '180px' },
    { key: 'actions', label: 'Acciones', align: 'center', minWidth: '100px' },
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

const CellValue = ({ column, value, item, onDelete }) => {
    if (column.key === 'actions') {
        return (
            <div className="flex justify-center gap-2">
                <Link
                    to={`/admin/initial-contributions/edit/${item.id}`}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                >
                    <Edit className="h-4 w-4" />
                </Link>
                <button
                    onClick={() => onDelete(item.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        );
    }
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (column.isStatusBadge) return <StatusBadge value={value} />;
    if (value === null || value === undefined || value === '') {
        return <span className="text-gray-300 text-xs italic">—</span>;
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

const StatCard = ({ title, value, description, icon: Icon, color, customBg, isDark = false, textColor }) => (
    <Card
        className="transition-all duration-200 overflow-hidden relative"
        style={customBg ? { background: customBg, border: 'none' } : {}}
    >
        <div className="p-5 flex flex-row items-center justify-between space-y-0 relative z-10 border-b border-gray-100">
            <h3 className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-gray-500'}`}>{title}</h3>
            <div className={`p-2 rounded-lg ${color.replace('text-', 'bg-').replace('-500', '-50')} flex-shrink-0`}>
                <Icon className={`h-4 w-4 ${color}`} />
            </div>
        </div>
        <div className="p-5 relative z-10">
            <div className={`text-2xl font-bold ${textColor || (isDark ? 'text-white' : 'text-gray-900')}`}>{value}</div>
            <p className={`text-xs mt-1 ${isDark ? 'text-white/80' : 'text-gray-500'}`}>{description}</p>
        </div>
    </Card>
);

const InitialContributionsListPage = () => {
    const { toast } = useUi();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [totalFromServer, setTotalFromServer] = useState(0);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Filtrar directamente por tipo Aporte Inicial
            const res = await api.get('/admin/savings/list?type=Aporte Inicial');
            if (res.data && res.data.ok) {
                setData(res.data.data);
                setTotalFromServer(res.data.total);
            } else {
                throw new Error(res.data?.error || 'Respuesta inesperada del servidor');
            }
        } catch (err) {
            console.error('Error fetching initial contributions list:', err);
            setError(err.message || 'Error al conectar con el servidor');
            setData([]);
            setTotalFromServer(0);
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
            (s.clientName && s.clientName.toLowerCase().includes(term)) ||
            (s.clientCedula && s.clientCedula.toLowerCase().includes(term)) ||
            (s.banco && s.banco.toLowerCase().includes(term))
        );
    }, [data, searchTerm]);

    const stats = useMemo(() => {
        // Filtrar solo los registros activos para las métricas
        const activeData = filteredData.filter(item => {
            if (!item.status) return false;
            const normalized = item.status.trim().toLowerCase();
            return normalized === 'activo' || normalized === 'active' || normalized === 'pagado' || normalized === 'vigente';
        });

        const totalAmount = activeData.reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);
        const uniqueClients = new Set(activeData.map(item => item.clientCustomerId).filter(Boolean)).size;
        
        // Calcular datos para gráfico por año (solo registros activos)
        const yearMap = {};
        activeData.forEach(item => {
            const yr = parseInt(item.year);
            if (!isNaN(yr)) {
                yearMap[yr] = (yearMap[yr] || 0) + parseFloat(item.amount || 0);
            }
        });
        const barData = Object.entries(yearMap)
            .sort(([a], [b]) => a - b) // Ordenar años ascendente
            .map(([yr, val]) => ({ anio: yr, valor: val }));

        return {
            totalAmount,
            uniqueClients,
            totalTransactions: activeData.length,
            barData
        };
    }, [filteredData]);

    const { sortedData: sortedContribs, sortConfig: contribSort, handleSort: handleContribSort } = useSortTable(filteredData);

    const handleDelete = async (id) => {
        if (!window.confirm('¿Está seguro de que desea eliminar este aporte inicial? Esta acción no se puede deshacer.')) return;

        try {
            await api.delete(`/admin/savings/${id}`);
            toast.success('Aporte inicial eliminado correctamente');
            notifyUpdate('savings');
            fetchData();
        } catch (err) {
            console.error('Error deleting contribution:', err);
            toast.error('Error al eliminar: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleExport = () => {
        if (filteredData.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const exportData = filteredData.map(s => ({
            'Id_AI': s.externalId,
            'Customer_id': s.clientCustomerId,
            'Nombre': s.clientName,
            'Apellido': s.clientSurname,
            'Estado': s.status,
            'Fecha Pago': formatDate(s.date),
            'Año': s.year,
            'Mes': s.month,
            'Valor': s.amount,
            'Item_Quantity': s.itemQuantity,
            'Banco': s.banco,
            '# Transaccion': s.numeroTransaccion,
            'Desde Cuenta de Ahorros': s.origen
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Aportes Iniciales');
        XLSX.writeFile(wb, 'Lista_Aportes_Iniciales.xlsx');
        toast.success('Reporte exportado exitosamente');
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
                <Card><CardContent className="p-6 space-y-4">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="flex gap-4 items-center">
                            <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
                        </div>
                    ))}
                </CardContent></Card>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6 text-center py-20">
                <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">Error al cargar datos</h3>
                <p className="text-gray-500 mb-6">{error}</p>
                <Button onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" /> Reintentar</Button>
            </div>
        );
    }

    const fmtCOP = (n) => `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

    const BarTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white border border-gray-100 shadow-xl rounded-lg p-3">
                    <p className="text-xs font-bold text-gray-700 mb-1">Año {label}</p>
                    <p className="text-xs font-mono font-bold text-emerald-600">{fmtCOP(payload[0].value)}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6">
            {/* Smart Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    title="Total Aportes Iniciales"
                    value={`$${stats.totalAmount.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Suma total de aportes filtrados"
                    icon={DollarSign}
                    color="text-emerald-500"
                />
                <StatCard
                    title="Total Socios"
                    value={stats.uniqueClients}
                    description="Cantidad de socios únicos"
                    icon={Users}
                    color="text-blue-500"
                />
                <StatCard
                    title="Transacciones"
                    value={stats.totalTransactions}
                    description="Número de aportes registrados"
                    icon={Hash}
                    color="text-amber-500"
                />
            </div>

            {/* Gráfico de Barras por Año */}
            {stats.barData && stats.barData.length > 0 && (
                <Card className="overflow-hidden border border-gray-100 shadow-sm w-full lg:w-1/2 mx-auto">
                    <div className="px-4 pt-4 pb-2 border-b border-gray-100">
                        <h2 className="text-sm font-bold text-emerald-600 text-center">Evolución de Aportes por Año</h2>
                    </div>
                    <div className="p-4">
                        <div className="w-full relative" style={{ height: 180 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.barData} margin={{ top: 20, right: 20, left: 20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis
                                        dataKey="anio"
                                        axisLine={false} tickLine={false}
                                        tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }}
                                    />
                                    <YAxis
                                        axisLine={false} tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                                        tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                                    />
                                    <Tooltip content={<BarTooltip />} cursor={{ fill: '#f0fdf4' }} />
                                    <Bar dataKey="valor" fill="#10b981" radius={[4, 4, 0, 0]} barSize={36}>
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
                    </div>
                </Card>
            )}

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-center gap-3">
                    <ListHeader
                        title="Lista de Aportes Iniciales"
                        source="1-orders_table_aportes_iniciales"
                        totalCount={data.length}
                        filteredCount={filteredData.length}
                        loading={loading}
                    />
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="relative flex-1 lg:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/40 focus:border-brand-primary outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="secondary" onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
                    <Button variant="ghost" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                </div>
            </div>

            {filteredData.length === 0 ? (
                <Card><CardContent className="p-12 text-center text-gray-500">
                    <Inbox className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No se encontraron aportes iniciales.</p>
                </CardContent></Card>
            ) : (
                <Card className="overflow-hidden border-none shadow-none bg-transparent">
                    <div className="table-container">
                        <table className="premium-table">
                            <thead>
                                <tr>
                                    {TABLE_COLUMNS.map(col => (
                                        <th key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }} className="cursor-pointer select-none hover:opacity-80 transition-opacity" onClick={() => handleContribSort(col.key)}>
                                            <span className="inline-flex items-center gap-1">{col.label}<SortIcon colKey={col.key} sortConfig={contribSort} /></span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedContribs.map((item, idx) => (
                                    <tr key={item.id} className={`transition-colors duration-150 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                        {TABLE_COLUMNS.map(col => (
                                            <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                <CellValue column={col} value={item[col.key]} item={item} onDelete={handleDelete} />
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

export default InitialContributionsListPage;
