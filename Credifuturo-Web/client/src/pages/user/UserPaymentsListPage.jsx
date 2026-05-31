import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, BarChart2, Inbox, Download, Activity, CheckCircle, BarChart3, AlertTriangle, Clock, X, TrendingUp, Hash, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart as RPieChart, Pie, Cell, LabelList, ReferenceLine } from 'recharts';

const fmtCOP = v => `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const PaymentTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[160px]">
            <p className="font-bold text-gray-700 mb-2">{label}</p>
            {payload.map(p => (
                <div key={p.dataKey} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
                        <span className="text-gray-500">{p.name}</span>
                    </span>
                    <span className="font-semibold" style={{ color: p.fill }}>{fmtCOP(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

// Columnas optimizadas para vista del socio: se omiten datos redundantes (su propio nombre, cédula, customer ID)
const TABLE_COLUMNS = [
    { key: 'idVm', label: 'Crédito', align: 'center', minWidth: '90px', highlight: true },
    { key: 'mesPago', label: 'Mes', align: 'center', minWidth: '100px' },
    { key: 'fechaPago', label: 'Fecha Límite', align: 'center', minWidth: '120px', isDate: true },
    { key: 'diasAlVencimiento', label: 'Vencimiento', align: 'center', minWidth: '120px', isVencimiento: true },
    { key: 'valorCuotaVariable', label: 'Valor Cuota', align: 'right', minWidth: '120px', isCurrency: true },
    { key: 'valorInteresesAmortizados', label: 'Intereses', align: 'right', minWidth: '110px', isCurrency: true },
    { key: 'saldoFinal', label: 'Saldo Insoluto', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'estado', label: 'Estado', align: 'center', minWidth: '110px', isBadge: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '120px' },
    { key: 'numeroTransaccion', label: '# Transacción', align: 'left', minWidth: '110px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '160px' }
];

const STATUS_COLORS = { Pagado: '#166534', Pendiente: '#fbbf24', Mora: '#ef4444' };

const StatCard = ({ title, value, description, icon: Icon, accentColor, customBg, isDark = false }) => (
    <Card
        className="transition-all duration-200 overflow-hidden relative bg-white"
        style={customBg ? { background: customBg, border: 'none' } : { borderTop: `3px solid ${accentColor || '#166534'}` }}
    >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-gray-500'}`}>{title}</CardTitle>
            <Icon className="h-4 w-4" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : (accentColor || '#166534') }} />
        </CardHeader>
        <CardContent className="relative z-10">
            <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</div>
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
        ring = 'bg-amber-100 text-amber-800 ring-amber-200';
        dot = 'bg-amber-500';
    }

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ring-1 ${ring}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dot}`} />
            {value}
        </span>
    );
};

const CellValue = ({ column, value, row }) => {
    if (column.isBadge) return <StatusBadge value={value} />;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (column.isVencimiento) {
        // value es número de días: positivo = vence en N días, negativo = vencido hace N días
        const estado = (row?.estado || '').toLowerCase();
        const pagada = estado === 'pago' || estado === 'pagado' || estado === 'abono';
        if (pagada) return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Liquidada</span>;
        if (value == null || isNaN(value)) return <span className="text-gray-300 text-xs italic">—</span>;
        if (value < 0) return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">⚠ {Math.abs(value)}d vencida</span>;
        if (value === 0) return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Hoy</span>;
        if (value <= 7) return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">En {value}d</span>;
        return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full">En {value}d</span>;
    }
    if (value === null || value === undefined || value === '') return <span className="text-gray-300 text-xs italic">—</span>;
    if (column.isCurrency) {
        const num = parseFloat(value);
        if (isNaN(num)) return <span className="text-gray-300 text-xs italic">—</span>;
        return <span className={`font-medium tabular-nums ${num === 0 ? 'text-gray-400' : 'text-gray-900'}`}>${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>;
    }
    if (column.isPercent) {
        const num = parseFloat(value);
        if (!isNaN(num)) return <span className="tabular-nums text-gray-700">{(num * 100).toFixed(2)}%</span>;
    }
    if (column.isNumber) return <span className="tabular-nums text-gray-700">{value}</span>;
    if (column.highlight) return <span className="font-bold text-emerald-800">{value}</span>;
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
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 25;

    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterEstado, filterEstadoPrestamo]);

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

    const paymentsByLoan = useMemo(() => {
        const map = {};
        payments.forEach(p => {
            if (!p.idVm) return;
            if (!map[p.idVm]) map[p.idVm] = { id: p.idVm, pagado: 0, pendiente: 0 };
            const val = parseFloat(p.valorCuotaVariable || 0);
            if ((p.estado || '').trim().toLowerCase() === 'pago') map[p.idVm].pagado += val;
            else if ((p.estado || '').trim().toLowerCase() === 'pendiente') map[p.idVm].pendiente += val;
        });
        return Object.values(map).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }, [payments]);

    // Donut: distribución del valor total entre pagado / pendiente / mora
    const donutData = useMemo(() => {
        const buckets = [
            { name: 'Pagado', value: stats.totalRecaudo, color: STATUS_COLORS.Pagado },
            { name: 'Pendiente', value: Math.max(0, stats.carteraActiva - stats.moraCartera), color: STATUS_COLORS.Pendiente },
            { name: 'En mora', value: stats.moraCartera, color: STATUS_COLORS.Mora }
        ];
        return buckets.filter(b => b.value > 0);
    }, [stats]);

    // Tendencia mensual de pagos efectivamente realizados (últimos 12 meses naturales)
    const monthlyTrend = useMemo(() => {
        const buckets = {};
        payments.forEach(p => {
            if ((p.estado || '').trim().toLowerCase() !== 'pago') return;
            const f = p.fechaPago ? new Date(p.fechaPago) : null;
            if (!f || isNaN(f.getTime())) return;
            const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
            buckets[key] = (buckets[key] || 0) + parseFloat(p.valorCuotaPago || p.valorCuotaVariable || 0);
        });
        return Object.entries(buckets)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-12)
            .map(([k, v]) => ({ mes: k.slice(2).replace('-', '/'), valor: v }));
    }, [payments]);

    const trendAvg = useMemo(() => {
        if (monthlyTrend.length === 0) return 0;
        return monthlyTrend.reduce((s, x) => s + x.valor, 0) / monthlyTrend.length;
    }, [monthlyTrend]);

    // Métricas económicas operativas: velocidad, tiempo restante, eficiencia
    const operativeMetrics = useMemo(() => {
        // Velocidad de pago: cuotas pagadas / meses activos del último año
        const fechasPago = payments
            .filter(p => (p.estado || '').trim().toLowerCase() === 'pago' && p.fechaPago)
            .map(p => new Date(p.fechaPago))
            .filter(d => !isNaN(d.getTime()))
            .sort((a, b) => a - b);
        const mesesActivos = fechasPago.length > 1
            ? Math.max(1, ((fechasPago[fechasPago.length - 1] - fechasPago[0]) / (1000 * 60 * 60 * 24 * 30.44)))
            : 1;
        const velocidad = fechasPago.length > 0 ? fechasPago.length / mesesActivos : 0;

        // Tiempo restante estimado en meses
        const cuotasRestantes = stats.totalCuotas - stats.cuotasPagadas;
        const tiempoRestanteMeses = velocidad > 0 ? cuotasRestantes / velocidad : null;

        // Carga financiera mensual promedio (cuota promedio pagada)
        const valorCuotaPromedio = stats.cuotasPagadas > 0 ? stats.totalRecaudo / stats.cuotasPagadas : 0;

        // Ratio intereses / capital
        const ratioInteresesCapital = stats.totalRecaudo > 0
            ? (stats.totalIntereses / stats.totalRecaudo) * 100
            : 0;

        return { velocidad, tiempoRestanteMeses, valorCuotaPromedio, ratioInteresesCapital, cuotasRestantes };
    }, [payments, stats]);

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

            {/* KPIs consolidados — métricas operativas clave */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Pagado"
                    value={fmtCOP(stats.totalRecaudo)}
                    description={`${stats.cuotasPagadas} cuotas liquidadas a satisfacción`}
                    icon={CheckCircle}
                    accentColor="#166534"
                />
                <StatCard
                    title="Cartera Vigente"
                    value={fmtCOP(stats.carteraActiva)}
                    description={`${stats.totalCuotas - stats.cuotasPagadas} cuota(s) por vencer`}
                    icon={Activity}
                    accentColor="#1a7a42"
                />
                <StatCard
                    title="Intereses Causados"
                    value={fmtCOP(stats.totalIntereses)}
                    description="Costo financiero amortizado"
                    icon={BarChart3}
                    accentColor="#fbbf24"
                />
                <StatCard
                    title="Cartera Vencida"
                    value={fmtCOP(stats.moraCartera)}
                    description={stats.moraCartera > 0 ? '⚠ Requiere regularización' : 'Sin obligaciones en mora'}
                    icon={AlertTriangle}
                    accentColor={stats.moraCartera > 0 ? '#dc2626' : '#9ca3af'}
                    customBg={stats.moraCartera > 0 ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' : undefined}
                />
            </div>

            {/* Barra de progreso global del portafolio */}
            {stats.totalCuotas > 0 && (
                <Card className="border border-gray-100 shadow-sm">
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Target className="h-4 w-4 text-emerald-600" />
                                <p className="text-sm font-bold text-gray-700">Avance del Portafolio Crediticio</p>
                            </div>
                            <p className="text-xs font-semibold text-gray-500">
                                <span className="text-emerald-600 font-black">{((stats.cuotasPagadas / stats.totalCuotas) * 100).toFixed(0)}%</span> · {stats.cuotasPagadas} de {stats.totalCuotas} cuotas
                            </p>
                        </div>
                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${(stats.cuotasPagadas / stats.totalCuotas) * 100}%` }} />
                            {stats.moraCartera > 0 && (
                                <div className="h-full bg-red-500 transition-all duration-700" style={{ width: `${(stats.moraCartera / (stats.totalRecaudo + stats.carteraActiva)) * 100}%` }} title="En mora" />
                            )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Pagado</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200" /> Por vencer</span>
                            {stats.moraCartera > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> En mora</span>}
                        </div>
                    </div>
                </Card>
            )}

            {/* Análisis económico operativo */}
            {payments.length > 0 && operativeMetrics.velocidad > 0 && (
                <Card className="border border-emerald-200 shadow-sm bg-gradient-to-br from-emerald-50/40 to-white">
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-900">Velocidad de Pago</p>
                                <Activity className="h-4 w-4 text-emerald-700" />
                            </div>
                            <p className="text-xl font-black text-emerald-900 tabular-nums leading-tight">
                                {operativeMetrics.velocidad.toFixed(2)} <span className="text-xs">cuotas/mes</span>
                            </p>
                            <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                Ritmo histórico al que has liquidado cuotas. Refleja tu cumplimiento real, no el cronograma teórico.
                            </p>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Tiempo Restante Estimado</p>
                                <Clock className="h-4 w-4 text-emerald-500" />
                            </div>
                            <p className="text-xl font-black text-emerald-700 tabular-nums leading-tight">
                                {operativeMetrics.tiempoRestanteMeses != null
                                    ? `~${operativeMetrics.tiempoRestanteMeses.toFixed(1)} meses`
                                    : '—'}
                            </p>
                            <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                Al ritmo actual ({operativeMetrics.velocidad.toFixed(2)} cuotas/mes) terminarías las {operativeMetrics.cuotasRestantes} cuota(s) pendientes en este plazo.
                            </p>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Cuota Promedio Pagada</p>
                                <Target className="h-4 w-4 text-amber-500" />
                            </div>
                            <p className="text-xl font-black text-amber-800 tabular-nums leading-tight">
                                {fmtCOP(operativeMetrics.valorCuotaPromedio)}
                            </p>
                            <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                Valor medio que has desembolsado por cuota. Útil para presupuestar futuros pagos.
                            </p>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Intereses sobre Capital</p>
                                <BarChart3 className="h-4 w-4 text-amber-600" />
                            </div>
                            <p className="text-xl font-black text-amber-800 tabular-nums leading-tight">
                                {operativeMetrics.ratioInteresesCapital.toFixed(1)}<span className="text-sm">%</span>
                            </p>
                            <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                Por cada $100 pagados, {operativeMetrics.ratioInteresesCapital.toFixed(1)} corresponden a intereses y el resto amortiza capital.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Donut composición + Línea tendencia mensual */}
            {payments.length > 0 && (donutData.length > 0 || monthlyTrend.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {donutData.length > 0 && (
                        <Card className="border border-gray-100 shadow-sm">
                            <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-emerald-600" />
                                <h3 className="text-sm font-bold text-gray-700">Composición del Portafolio</h3>
                            </div>
                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                                <div style={{ height: 180 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RPieChart>
                                            <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={2}>
                                                {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                            </Pie>
                                            <Tooltip formatter={(v) => fmtCOP(v)} />
                                        </RPieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-2">
                                    {donutData.map(d => {
                                        const total = donutData.reduce((s, x) => s + x.value, 0);
                                        const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : 0;
                                        return (
                                            <div key={d.name} className="text-sm">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                                                        <span className="text-gray-700 font-medium">{d.name}</span>
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-500">{pct}%</span>
                                                </div>
                                                <p className="text-xs tabular-nums text-gray-600 ml-5">{fmtCOP(d.value)}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </Card>
                    )}
                    {monthlyTrend.length > 1 && (
                        <Card className="border border-gray-100 shadow-sm">
                            <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                                    <h3 className="text-sm font-bold text-gray-700">Tendencia de Pagos · últimos {monthlyTrend.length} meses</h3>
                                </div>
                                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                    <span className="w-3 border-t border-dashed border-gray-400" />
                                    Promedio: <span className="font-bold tabular-nums text-gray-700">{fmtCOP(trendAvg)}</span>
                                </span>
                            </div>
                            <div className="p-5" style={{ height: 240 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={monthlyTrend} margin={{ top: 28, right: 24, left: 8, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={52} />
                                        <Tooltip
                                            formatter={(v) => fmtCOP(v)}
                                            labelFormatter={(label) => `Mes ${label}`}
                                            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                                        />
                                        <ReferenceLine y={trendAvg} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Promedio', position: 'insideTopRight', fill: '#94a3b8', fontSize: 10 }} />
                                        <Line type="monotone" dataKey="valor" stroke="#166534" strokeWidth={2.5} dot={{ fill: '#166534', r: 4 }} activeDot={{ r: 6 }}>
                                            <LabelList
                                                dataKey="valor"
                                                position="top"
                                                offset={10}
                                                style={{ fill: '#166534', fontSize: 10, fontWeight: 700 }}
                                                formatter={(v) => fmtCOP(v)}
                                            />
                                        </Line>
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* Tarjeta total + Gráfico por préstamo */}
            {payments.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Tarjeta principal */}
                    <div className="lg:col-span-1 flex flex-col gap-4">
                        <Card className="overflow-hidden border-0 shadow-md" style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 55%, #1a7a42 100%)' }}>
                            <div className="p-6 relative">
                                <div className="absolute top-4 right-4 rounded-xl p-2" style={{ backgroundColor: 'rgba(251,191,36,0.2)' }}>
                                    <TrendingUp className="h-6 w-6" style={{ color: '#fbbf24' }} />
                                </div>
                                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#86efac' }}>Total Recaudado</p>
                                <p className="text-3xl font-bold text-white tabular-nums leading-tight">{fmtCOP(stats.totalRecaudo)}</p>
                                <div className="h-px bg-white/15 my-3" />
                                <div className="flex items-center gap-1.5 text-sm" style={{ color: '#86efac' }}>
                                    <Hash className="h-3.5 w-3.5" />
                                    {stats.cuotasPagadas} cuotas pagadas de {stats.totalCuotas}
                                </div>
                            </div>
                        </Card>

                        {/* Detalle por préstamo */}
                        {paymentsByLoan.length > 0 && (
                            <Card className="border border-gray-100 shadow-sm">
                                <div className="px-4 pt-4 pb-2 border-b border-gray-50">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalle por Préstamo</p>
                                </div>
                                <div className="p-3 space-y-2">
                                    {paymentsByLoan.map(d => (
                                        <div key={d.id} className="text-sm">
                                            <div className="flex justify-between mb-1">
                                                <span className="font-semibold text-gray-700">{d.id}</span>
                                                <span className="text-gray-400 text-xs">{fmtCOP(d.pagado + d.pendiente)}</span>
                                            </div>
                                            <div className="flex rounded-full overflow-hidden h-1.5 bg-gray-100">
                                                <div className="h-full" style={{ width: `${d.pagado + d.pendiente > 0 ? (d.pagado / (d.pagado + d.pendiente)) * 100 : 0}%`, backgroundColor: '#166534' }} />
                                                <div className="h-full" style={{ width: `${d.pagado + d.pendiente > 0 ? (d.pendiente / (d.pagado + d.pendiente)) * 100 : 0}%`, backgroundColor: '#fbbf24' }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* Gráfico de barras por préstamo */}
                    <Card className="lg:col-span-2 border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" style={{ color: '#166534' }} />
                            <h3 className="text-sm font-bold text-gray-700">Pagado vs Pendiente por Préstamo</h3>
                        </div>
                        <div className="p-5">
                            {paymentsByLoan.length === 0 ? (
                                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
                            ) : (
                                <div style={{ height: paymentsByLoan.length <= 2 ? 180 : 240 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={paymentsByLoan} margin={{ top: 16, right: 16, left: 8, bottom: 4 }} barSize={paymentsByLoan.length <= 3 ? 40 : 28} barGap={4}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis dataKey="id" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} width={56} />
                                            <Tooltip content={<PaymentTooltip />} cursor={{ fill: '#f0fdf4' }} />
                                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                                            <Bar dataKey="pagado" name="Pagado" fill="#166534" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="pendiente" name="Pendiente" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {/* Filters Bar */}
            <div className="bg-white rounded-xl border border-ui-border shadow-sm p-4">
                <div className="flex flex-wrap gap-3 items-end">
                    {/* Búsqueda General */}
                    <div className="min-w-[280px] flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Buscar (Id_EP, Id_VM, Banco)</label>
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

                    {/* Filtro Estado Pago */}
                    <div className="min-w-[170px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Estado Pago</label>
                        <select
                            aria-label="Filtrar por estado del pago"
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
                            aria-label="Filtrar por estado del préstamo"
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
            ) : (() => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const enriched = filteredPayments.map(p => {
                    let dias = null;
                    if (p.fechaPago) {
                        const f = safeParseDate(p.fechaPago, p.mesPago);
                        if (f && !isNaN(f.getTime())) {
                            dias = Math.round((f - today) / 86400000);
                        }
                    }
                    return { ...p, diasAlVencimiento: dias };
                });
                const totalPages = Math.max(1, Math.ceil(enriched.length / ITEMS_PER_PAGE));
                const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
                const paginated = enriched.slice(startIdx, startIdx + ITEMS_PER_PAGE);
                const totals = enriched.reduce((a, r) => ({
                    valorCuotaVariable: a.valorCuotaVariable + parseFloat(r.valorCuotaVariable || 0),
                    valorInteresesAmortizados: a.valorInteresesAmortizados + parseFloat(r.valorInteresesAmortizados || 0),
                }), { valorCuotaVariable: 0, valorInteresesAmortizados: 0 });
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
                                    {paginated.map((payment, idx) => {
                                        const estado = (payment.estado || '').toLowerCase();
                                        const vencida = payment.diasAlVencimiento != null && payment.diasAlVencimiento < 0 && estado !== 'pago' && estado !== 'abono';
                                        return (
                                            <tr key={payment.id} className={`transition-colors duration-150 ${vencida ? 'bg-red-50/60' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                                {TABLE_COLUMNS.map(col => (
                                                    <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                        <CellValue column={col} value={payment[col.key]} row={payment} />
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-emerald-50 font-bold text-emerald-900 border-t-2 border-emerald-200">
                                        <td className="px-3 py-2 text-[10px] uppercase tracking-widest" colSpan={4}>Totales · {enriched.length} cuota(s)</td>
                                        <td className="px-3 py-2 text-right tabular-nums">${totals.valorCuotaVariable.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-amber-700">${totals.valorInteresesAmortizados.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                        <td className="px-3 py-2" colSpan={5}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex justify-between items-center gap-2 p-3 border-t border-gray-100 bg-gray-50/50">
                                <span className="text-xs text-gray-500">Mostrando <strong className="text-emerald-700">{startIdx + 1}–{Math.min(startIdx + ITEMS_PER_PAGE, enriched.length)}</strong> de <strong>{enriched.length}</strong> cuota(s)</span>
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

export default UserPaymentsListPage;
