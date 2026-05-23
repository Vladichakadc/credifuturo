import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, CreditCard, AlertTriangle, Inbox, Download, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';

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
                    </h2>
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
