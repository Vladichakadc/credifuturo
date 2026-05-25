import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, BarChart2, Inbox, Download, DollarSign, Activity, CheckCircle, BarChart3, AlertTriangle, PieChart, Clock, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';

const TABLE_COLUMNS = [
    { key: 'externalId', label: 'Id_EP', align: 'center', minWidth: '80px', highlight: true },
    { key: 'idVm', label: 'Id_VM', align: 'center', minWidth: '90px', highlight: true },
    { key: 'clientCustomerId', label: 'Customer ID', align: 'center', minWidth: '110px' },
    { key: 'clientName', label: 'Socio', align: 'left', minWidth: '180px' },
    { key: 'clientCedula', label: 'Cédula', align: 'left', minWidth: '100px' },
    { key: 'mesDesembolso', label: 'Mes Desembolso', align: 'center', minWidth: '130px' },
    { key: 'saldoInicial', label: 'Saldo Inicial', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'cuotasPrestamo', label: '# Cuotas Prestamo', align: 'center', minWidth: '130px', isNumber: true },
    { key: 'interesMensual', label: 'Interés Mensual', align: 'center', minWidth: '120px', isPercent: true },
    { key: 'valorInteresesAmortizados', label: 'Val. Intereses', align: 'right', minWidth: '120px', isCurrency: true },
    { key: 'fechaPago', label: 'Fecha Pago Max', align: 'center', minWidth: '120px', isDate: true },
    { key: 'mesPago', label: 'Mes Pago', align: 'center', minWidth: '100px' },
    { key: 'valorCuotaVariable', label: 'Cuota Variable', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'estadoPrestamo', label: 'Estado Préstamo', align: 'center', minWidth: '130px', isBadge: true },
    { key: 'estado', label: 'Estado Pago', align: 'center', minWidth: '110px', isBadge: true },
    { key: 'saldoFinal', label: 'Saldo Final', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '140px' },
    { key: 'numeroTransaccion', label: '# Transacción', align: 'left', minWidth: '120px' },
    { key: 'cuentaAhorros', label: 'Cuenta Ahorros', align: 'left', minWidth: '140px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '200px' }
];

const StatCard = ({ title, value, description, icon: Icon, color, customBg, isDark = false, textColor }) => (
    <Card
        className="transition-all duration-200 overflow-hidden relative"
        style={customBg ? { background: customBg, border: 'none' } : {}}
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

const StatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-400 text-xs italic">—</span>;
    const normalized = value.trim().toLowerCase();
    const isPago = normalized === 'pago' || normalized === 'pagado';
    const isVigente = normalized === 'vigente' || normalized === 'pendiente';
    let ring = 'bg-gray-100 text-gray-700 ring-gray-200';
    let dot = 'bg-gray-400';

    if (isPago) {
        ring = 'bg-emerald-100 text-emerald-800 ring-emerald-200';
        dot = 'bg-emerald-500';
    } else if (isVigente) {
        ring = 'bg-blue-100 text-blue-800 ring-blue-200';
        dot = 'bg-blue-500';
    }

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ring-1 ${ring}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dot}`} />
            {value}
        </span>
    );
};

const CellValue = ({ column, value }) => {
    if (column.isBadge) return <StatusBadge value={value} />;
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

const UserPaymentsListPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    const { toast } = useUi();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterEstadoPrestamo, setFilterEstadoPrestamo] = useState('');

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/my/payments');
            if (res.data && res.data.ok) {
                setPayments(res.data.data);
            } else {
                throw new Error('Error del servidor');
            }
        } catch (err) {
            setError(err.message || 'Error de conexión');
            setPayments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);

    const estadoOptions = useMemo(() =>
        [...new Set(payments.map(p => p.estado?.trim()).filter(Boolean))].sort(),
        [payments]);

    const estadoPrestamoOptions = useMemo(() =>
        [...new Set(payments.map(p => p.estadoPrestamo?.trim()).filter(Boolean))].sort(),
        [payments]);

    const filteredPayments = useMemo(() => {
        let result = payments;

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            result = result.filter(p =>
                (p.externalId && p.externalId.toLowerCase().includes(term)) ||
                (p.idVm && p.idVm.toLowerCase().includes(term)) ||
                (p.banco && p.banco.toLowerCase().includes(term))
            );
        }

        if (filterEstado) {
            const term = filterEstado.trim().toLowerCase();
            result = result.filter(p => (p.estado || '').trim().toLowerCase() === term);
        }

        if (filterEstadoPrestamo) {
            const term = filterEstadoPrestamo.trim().toLowerCase();
            result = result.filter(p => (p.estadoPrestamo || '').trim().toLowerCase() === term);
        }

        return result;
    }, [payments, searchTerm, filterEstado, filterEstadoPrestamo]);

    const clearFilters = () => {
        setSearchTerm('');
        setFilterEstado('');
        setFilterEstadoPrestamo('');
    };
    const hasActiveFilters = searchTerm || filterEstado || filterEstadoPrestamo;

    const monthsLower = useMemo(() => ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"], []);
    const todayThreshold = useMemo(() => {
        const n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    }, []);

    const safeParseDate = useCallback((dateVal, mesRef) => {
        if (!dateVal) return null;
        let dateStr = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal);
        if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];

        const validDate = (d) => (d instanceof Date && !isNaN(d.getTime()) ? d : null);

        const parts = dateStr.split('-');
        if (parts.length !== 3) return validDate(new Date(dateStr + 'T00:00:00'));

        const [p1, p2, p3] = parts.map(Number);
        if (String(parts[0]).length === 4) {
            const y = p1, m = p2, d = p3;
            if (mesRef) {
                const targetIdx = monthsLower.indexOf(mesRef.toLowerCase().trim()) + 1;
                if (targetIdx > 0) {
                    if (m === targetIdx) return validDate(new Date(y, m - 1, d));
                    if (d === targetIdx) return validDate(new Date(y, d - 1, m));
                }
            }
            return validDate(new Date(y, m - 1, d));
        }

        if (String(parts[2]).length === 4) {
            return validDate(new Date(p3, p2 - 1, p1));
        }

        return validDate(new Date(dateStr + 'T00:00:00'));
    }, [monthsLower]);

    const stats = useMemo(() => {
        const nowFresh = new Date();
        const todayLocal = new Date(nowFresh.getFullYear(), nowFresh.getMonth(), nowFresh.getDate());

        const paidKeySet = new Set(
            payments
                .filter(p => ['pago', 'abono'].includes((p.estado || '').trim().toLowerCase()))
                .map(p => `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`)
        );

        return filteredPayments.reduce((acc, curr) => {
            acc.totalIntereses += parseFloat(curr.valorInteresesAmortizados || 0);
            acc.totalCuotas++;

            const valCuota = parseFloat(curr.valorCuotaPago || curr.valorCuotaVariable || 0); // Modificado para frontend
            const valPago = parseFloat(curr.valorCuotaPago || 0);

            if (curr.idVm && !acc.loanIdsRef.has(curr.idVm)) {
                acc.loanIdsRef.add(curr.idVm);
                // NOTA: Para el frontend del usuario no tenemos 'valorPrestado' exacto en LoanPayment
                // Usamos un aproximado basado en la lógica. Pero en realidad sí hay préstamos en `/admin/my/loans`.
                // Aqui lo omitiremos o mostraremos 0 si no lo tenemos en el modelo, o calculamos recaudo total.
            }

            const isPago = (curr.estado || '').trim().toLowerCase() === 'pago';
            const isPendiente = (curr.estado || '').trim().toLowerCase() === 'pendiente';

            if (isPago) {
                acc.cuotasPagadas++;
                acc.totalRecaudo += valPago;
            } else if (isPendiente) {
                acc.carteraActiva += valCuota;

                const paidKey = `${curr.clientId}|${(curr.idVm || '').trim().toLowerCase()}|${(curr.mesPago || '').trim().toLowerCase()}`;
                if (paidKeySet.has(paidKey)) return acc;

                const fechaPago = safeParseDate(curr.fechaPago, curr.mesPago);
                if (fechaPago && fechaPago < todayLocal) {
                    acc.moraCartera += valCuota;
                }
            }
            return acc;
        }, {
            totalIntereses: 0,
            totalCuotas: 0,
            cuotasPagadas: 0,
            totalRecaudo: 0,
            carteraActiva: 0,
            moraCartera: 0,
            loanIdsRef: new Set()
        });
    }, [filteredPayments, payments, safeParseDate]);

    const handleExport = () => {
        if (filteredPayments.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const exportData = filteredPayments.map(p => ({
            'ID_EP': p.externalId,
            'ID_VM': p.idVm,
            'Customer ID': p.clientCustomerId,
            'Socio': p.clientName,
            'Cédula': p.clientCedula,
            'Mes Desembolso': p.mesDesembolso,
            'Saldo Inicial': p.saldoInicial,
            '# Cuotas Prestamo': p.cuotasPrestamo,
            'Interés Mensual': p.interesMensual,
            'Val. Intereses': p.valorInteresesAmortizados,
            'Fecha Pago Max': formatDate(p.fechaPago),
            'Mes Pago': p.mesPago,
            'Cuota Variable': p.valorCuotaVariable,
            'Estado Préstamo': p.estadoPrestamo,
            'Estado Pago': p.estado,
            'Saldo Final': p.saldoFinal,
            'Banco': p.banco,
            '# Transacción': p.numeroTransaccion,
            'Cuenta Ahorros': p.cuentaAhorros,
            'Observaciones': p.observaciones
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mis Pagos');
        XLSX.writeFile(wb, 'Mis_Pagos.xlsx');
        toast.success('Exportado exitosamente');
    };

    if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Cargando...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart2 className="h-6 w-6 text-brand-primary" />
                        Estado Préstamos
                     {!user?.name ? '' : `- ${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim()}</h2>
                    <p className="text-gray-500 text-sm">Historial de pagos de préstamos</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <Button variant="secondary" onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
                    <Button variant="ghost" onClick={fetchPayments}><RefreshCw className="h-4 w-4" /></Button>
                </div>
            </div>

            {/* Smart Summary Cards */}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Cartera Activa"
                    value={`$${stats.carteraActiva.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Suma cuotas pendientes"
                    icon={Activity}
                    color="text-emerald-700"
                />
                <StatCard
                    title="Total Pagado"
                    value={`$${stats.totalRecaudo.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Suma cuotas pagadas"
                    icon={CheckCircle}
                    color="text-blue-600"
                />
                <StatCard
                    title="Intereses Pagados"
                    value={`$${stats.totalIntereses.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Intereses amortizados"
                    icon={BarChart3}
                    color="text-amber-500"
                />
                <StatCard
                    title="Cartera Vencida"
                    value={`$${stats.moraCartera.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Cuotas en mora"
                    icon={AlertTriangle}
                    color="text-red-500"
                    customBg="linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
                />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    title="Cuotas Totales"
                    value={stats.totalCuotas}
                    description="Registros actuales"
                    icon={PieChart}
                    color="text-gray-500"
                />
                <StatCard
                    title="Cuotas Pagadas"
                    value={stats.cuotasPagadas}
                    description="Estado 'Pago'"
                    icon={CheckCircle}
                    color="text-green-600"
                />
                <StatCard
                    title="Cuotas Pendientes"
                    value={stats.totalCuotas - stats.cuotasPagadas}
                    description="Estado 'Pendiente'"
                    icon={Clock}
                    color="text-amber-600"
                />
            </div>

            {/* Filters Bar */}
            <div className="bg-white rounded-xl border border-ui-border shadow-sm p-4">
                <div className="flex flex-wrap gap-3 items-end">
                    {/* Búsqueda General */}
                    <div className="min-w-[280px] flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Buscar (Id_EP, Id_VM, Banco)</label>
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

                    {/* Filtro Estado Pago */}
                    <div className="min-w-[170px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Estado Pago</label>
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

                    {/* Filtro Estado Préstamo */}
                    <div className="min-w-[180px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Estado Préstamo</label>
                        <select
                            value={filterEstadoPrestamo}
                            onChange={e => setFilterEstadoPrestamo(e.target.value)}
                            className="w-full py-2 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                        >
                            <option value="">Todos</option>
                            {estadoPrestamoOptions.map(o => (
                                <option key={o} value={o}>{o}</option>
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

            {filteredPayments.length === 0 ? (
                <Card><CardContent className="p-12 text-center">
                    <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No tienes pagos registrados.</p>
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
                                {filteredPayments.map((payment, idx) => (
                                    <tr key={payment.id} className={`transition-colors duration-150 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                        {TABLE_COLUMNS.map(col => (
                                            <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                <CellValue column={col} value={payment[col.key]} />
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

export default UserPaymentsListPage;
