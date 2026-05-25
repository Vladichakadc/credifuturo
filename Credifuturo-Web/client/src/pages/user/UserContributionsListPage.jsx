import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, Wallet, Inbox, Download } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';

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
                     {!user?.nombre ? '' : `- ${user.nombre} ${user.apellido || ''}`.trim()}</h2>
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
