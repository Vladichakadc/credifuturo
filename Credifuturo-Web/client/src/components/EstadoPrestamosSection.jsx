import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Calendar, CheckCircle, Activity, Loader2, DollarSign,
    BarChart3, AlertTriangle, PieChart, Clock, ChevronDown
} from 'lucide-react';

/**
 * EstadoPrestamosSection — réplica exacta de la sección "Lista Estado Préstamos
 * (Cuotas)" del Detalle de la Cuenta del admin (SavingsSummaryPage): mismos KPIs,
 * filtros, orden y tabla. Compartida por el Simulador de Préstamo y la Lista de
 * Pagos del socio para que vean lo mismo que ve el admin.
 * Props: payments (cuotas del socio), loans (préstamos), loading, socioName.
 */

const Card = ({ children, className = '', style }) => (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 ${className}`} style={style}>{children}</div>
);

const PaymentStatCard = ({ title, value, description, icon: Icon, color, customBg }) => (
    <Card className="transition-all duration-200 overflow-hidden relative !p-5" style={customBg ? { background: customBg, border: 'none' } : {}}>
        <div className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <h3 className="text-[11px] font-bold text-gray-500 tracking-wide uppercase">{title}</h3>
            <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="relative z-10">
            <div className="text-xl font-black text-gray-900">{value}</div>
            <p className="text-[10px] mt-1 text-gray-400 font-medium">{description}</p>
        </div>
    </Card>
);

const PillSelect = ({ icon: Icon, value, onChange, options, width = 'w-44' }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const isActive = value && value !== 'Todos' && value !== '';
    const selected = options.find(o => o.value === value);

    return (
        <div className={`relative ${width}`} ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${isActive ? 'bg-brand-primary/10 border-brand-primary/40' : 'bg-emerald-50 border-emerald-200'}`}
            >
                <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-brand-primary' : 'text-emerald-600'}`} />
                <span className={`flex-1 text-sm font-semibold truncate ${isActive ? 'text-gray-800' : 'text-gray-500'}`}>
                    {selected?.label || options[0]?.label}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[60] overflow-hidden">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm border-b border-gray-50 last:border-0 transition-colors ${opt.value === value ? 'bg-brand-primary/10 text-brand-primary font-bold' : 'text-gray-700 hover:bg-gray-50 font-medium'}`}
                        >
                            {opt.label}
                            {opt.value === value && <CheckCircle className="h-3.5 w-3.5 text-brand-primary flex-shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const fullMonthsLower = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const EstadoPrestamosSection = ({ payments = [], loans = [], loading = false, socioName = '' }) => {
    const [paymentYearFilter, setPaymentYearFilter] = useState('Todos');
    const [paymentStatusFilter, setPaymentStatusFilter] = useState('Todos');
    const [paymentLoanStatusFilter, setPaymentLoanStatusFilter] = useState('Todos');
    const [paymentSortConfig, setPaymentSortConfig] = useState({ key: 'idVm', dir: 'desc' });

    const safeParseDate = useCallback((dateVal, mesRef) => {
        if (!dateVal) return null;
        let dateStr = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal);
        if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];

        const parts = dateStr.split('-');
        if (parts.length !== 3) return new Date(dateStr + 'T00:00:00');

        const [p1, p2, p3] = parts.map(Number);
        if (String(parts[0]).length === 4) {
            const y = p1, m = p2, d = p3;
            if (mesRef) {
                const targetIdx = fullMonthsLower.indexOf(mesRef.toLowerCase().trim()) + 1;
                if (targetIdx > 0) {
                    if (m === targetIdx) return new Date(y, m - 1, d);
                    if (d === targetIdx) return new Date(y, d - 1, m);
                }
            }
            return new Date(y, m - 1, d);
        }
        return new Date(dateStr + 'T00:00:00');
    }, []);

    const availablePaymentYears = useMemo(() => {
        const years = new Set();
        payments.forEach(p => {
            if (p.fechaPagoMax) {
                years.add(p.fechaPagoMax.split('-')[0]);
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [payments]);

    const filteredSocioPayments = useMemo(() => {
        return payments.filter(p => {
            if (paymentYearFilter !== 'Todos') {
                const y = p.fechaPagoMax ? p.fechaPagoMax.split('-')[0] : '';
                if (y !== paymentYearFilter) return false;
            }
            if (paymentStatusFilter !== 'Todos') {
                if ((p.estado || '').trim().toLowerCase() !== paymentStatusFilter.toLowerCase()) return false;
            }
            if (paymentLoanStatusFilter !== 'Todos') {
                const loan = loans.find(l => String(l.idVm) === String(p.idVm));
                if (loan) {
                    if ((loan.estado || '').trim().toLowerCase() !== paymentLoanStatusFilter.toLowerCase()) return false;
                } else {
                    return false;
                }
            }
            return true;
        });
    }, [payments, paymentYearFilter, paymentStatusFilter, paymentLoanStatusFilter, loans]);

    const sortedSocioPayments = useMemo(() => {
        const { key, dir } = paymentSortConfig;
        const extractNum = (val) => parseInt((val || '').replace(/\D/g, '') || '0');
        const numericPrefixKeys = ['externalId', 'idVm'];
        const numericKeys = ['itemQuantity', 'valorCuotaVariable', 'valorCuotaPago', 'saldoFinal'];
        const dateKeys = ['fechaPagoMax'];

        return [...filteredSocioPayments].sort((a, b) => {
            let av = a[key], bv = b[key];
            let cmp = 0;
            if (numericPrefixKeys.includes(key)) {
                cmp = extractNum(av) - extractNum(bv);
            } else if (numericKeys.includes(key)) {
                cmp = (parseFloat(av) || 0) - (parseFloat(bv) || 0);
            } else if (dateKeys.includes(key)) {
                cmp = new Date(av || 0) - new Date(bv || 0);
            } else {
                cmp = (av || '').toString().localeCompare((bv || '').toString(), 'es');
            }
            return dir === 'asc' ? cmp : -cmp;
        });
    }, [filteredSocioPayments, paymentSortConfig]);

    const handlePaymentSort = (key) => {
        setPaymentSortConfig(prev =>
            prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        );
    };

    const paymentStats = useMemo(() => {
        const today = new Date();
        const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        return filteredSocioPayments.reduce((acc, curr) => {
            acc.totalIntereses += parseFloat(curr.valorInteresesAmortizados || 0);
            acc.totalCuotas++;

            const valCuota = parseFloat(curr.valorCuotaVariable || 0);
            const valPago = parseFloat(curr.valorCuotaPago || 0);

            if (curr.idVm && !acc.loanIdsRef.has(curr.idVm)) {
                acc.loanIdsRef.add(curr.idVm);
                const loan = loans.find(l => String(l.idVm) === String(curr.idVm));
                acc.totalValorPrestado += loan ? parseFloat(loan.valorPrestado || 0) : 0;
            }

            const isPago = (curr.estado || '').trim().toLowerCase() === 'pago';
            const isPendiente = (curr.estado || '').trim().toLowerCase() === 'pendiente';

            if (isPago) {
                acc.cuotasPagadas++;
                acc.totalRecaudo += valPago;
            } else if (isPendiente) {
                acc.carteraActiva += valCuota;
                const dueDate = safeParseDate(curr.fechaPagoMax, curr.mesPago);
                if (dueDate && dueDate < todayLocal) {
                    acc.moraCartera += valCuota;
                }
            }
            return acc;
        }, {
            totalIntereses: 0,
            totalValorPrestado: 0,
            totalCuotas: 0,
            cuotasPagadas: 0,
            totalRecaudo: 0,
            carteraActiva: 0,
            moraCartera: 0,
            loanIdsRef: new Set()
        });
    }, [filteredSocioPayments, loans, safeParseDate]);

    if (!loading && payments.length === 0) return null;

    return (
        <div className="w-full mt-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex flex-col mb-4">
                <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2 mb-1">
                    <Activity className="h-5 w-5" /> Lista Estado Préstamos (Cuotas)
                </h2>
                <p className="text-xs text-gray-400">
                    {payments.length} cuota{payments.length !== 1 ? 's' : ''} registrada{payments.length !== 1 ? 's' : ''}{socioName ? ` · ${socioName}` : ''}
                </p>
            </div>

            {/* KPI Cards (Row 1) */}
            <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-5 mb-4">
                <PaymentStatCard title="Total Valor Prestado" value={`$${paymentStats.totalValorPrestado.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Suma bruta de préstamos" icon={DollarSign} color="text-emerald-500" />
                <PaymentStatCard title="Cartera Activa + intereses" value={`$${paymentStats.carteraActiva.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Suma cuotas pendientes" icon={Activity} color="text-emerald-700" />
                <PaymentStatCard title="Total Recaudo + intereses" value={`$${paymentStats.totalRecaudo.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Suma cuotas pagadas" icon={CheckCircle} color="text-blue-600" />
                <PaymentStatCard title="Total Intereses" value={`$${paymentStats.totalIntereses.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Intereses amortizados" icon={BarChart3} color="text-amber-500" />
                <PaymentStatCard title="Cartera en Mora EP" value={`$${paymentStats.moraCartera.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} description="Pendiente con fecha vencida" icon={AlertTriangle} color="text-red-500" customBg="linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)" />
            </div>

            {/* KPI Cards (Row 2) */}
            <div className="grid gap-3 lg:gap-4 grid-cols-3 mb-6">
                <PaymentStatCard title="Cuotas Totales" value={paymentStats.totalCuotas} description="Registros actuales" icon={PieChart} color="text-gray-500" />
                <PaymentStatCard title="Cuotas Pagadas" value={paymentStats.cuotasPagadas} description="Estado 'Pago'" icon={CheckCircle} color="text-green-600" />
                <PaymentStatCard title="Cuotas Pendientes" value={paymentStats.totalCuotas - paymentStats.cuotasPagadas} description="Estado 'Pendiente'" icon={Clock} color="text-amber-600" />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50/50 border border-gray-100 rounded-xl print:hidden">
                <PillSelect icon={Calendar} value={paymentYearFilter} onChange={setPaymentYearFilter} options={[{ value: 'Todos', label: 'Año: Todos' }, ...availablePaymentYears.map(y => ({ value: y, label: String(y) }))]} />
                <PillSelect icon={CheckCircle} value={paymentStatusFilter} onChange={setPaymentStatusFilter} width="w-48" options={[{ value: 'Todos', label: 'Estado Pago (Todos)' }, { value: 'pago', label: 'Pago' }, { value: 'pendiente', label: 'Pendiente' }, { value: 'mora', label: 'Mora' }]} />
                <PillSelect icon={Activity} value={paymentLoanStatusFilter} onChange={setPaymentLoanStatusFilter} width="w-56" options={[{ value: 'Todos', label: 'Estado Préstamo (Todos)' }, { value: 'vigente', label: 'Vigente' }, { value: 'activo', label: 'Activo' }, { value: 'cancelado', label: 'Cancelado' }]} />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-brand-primary/30" /></div>
            ) : (
                <div className="overflow-auto rounded-lg border border-gray-100 max-h-[480px] print:overflow-visible print:max-h-none print:border-gray-200">
                    <table className="text-xs border-collapse w-full">
                        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-left font-bold text-gray-500 uppercase tracking-wide text-[10px]">
                            <tr>
                                {[
                                    { key: 'externalId',          label: 'ID Pago',      align: '' },
                                    { key: 'idVm',                label: 'Préstamo',     align: '' },
                                    { key: 'itemQuantity',        label: 'Cuota #',      align: 'text-center' },
                                    { key: 'estado',              label: 'Estado',       align: '' },
                                    { key: 'fechaPagoMax',        label: 'Fecha Máx',    align: '' },
                                    { key: 'valorCuotaVariable',  label: 'Valor Cuota',  align: 'text-right' },
                                    { key: 'valorCuotaPago',      label: 'Valor Pagado', align: 'text-right' },
                                    { key: 'saldoFinal',          label: 'Saldo Final',  align: 'text-right' },
                                ].map(col => (
                                    <th
                                        key={col.key}
                                        className={`px-3 py-2.5 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${col.align}`}
                                        onClick={() => handlePaymentSort(col.key)}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {col.label}
                                            <span className="text-[9px] leading-none">
                                                {paymentSortConfig.key === col.key
                                                    ? (paymentSortConfig.dir === 'asc' ? '▲' : '▼')
                                                    : <span className="text-gray-300">⇅</span>}
                                            </span>
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sortedSocioPayments.map((payment, i) => {
                                const isPaid = payment.estado === 'Pago';

                                const fechaMax = safeParseDate(payment.fechaPagoMax, payment.mesPago);
                                const todayThreshold = new Date();
                                todayThreshold.setHours(0, 0, 0, 0);
                                const isMora = !isPaid && fechaMax && (fechaMax < todayThreshold);

                                const isLate = payment.estado?.toLowerCase().includes('mora') || isMora;
                                const isPending = !isLate && (payment.estado === 'Pendiente' || payment.estado === 'Vigente');

                                return (
                                    <tr key={payment.id || i} className={`transition-colors hover:bg-brand-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <span className="font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded text-[11px]">{payment.externalId || `#${payment.id}`}</span>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 font-bold">{payment.idVm || '—'}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-center text-gray-600 font-mono">{payment.itemQuantity || '—'} / {payment.cuotasPrestamo || '—'}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                isPaid ? 'bg-emerald-100 text-emerald-700' :
                                                isLate ? 'bg-rose-100 text-rose-700' :
                                                isPending ? 'bg-amber-100 text-amber-700' :
                                                'bg-gray-100 text-gray-500'
                                            }`}>{payment.estado || '—'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{payment.fechaPagoMax || payment.date || '—'}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-right font-bold text-gray-800 tabular-nums">
                                            {payment.valorCuotaVariable ? `$${Math.round(Number(payment.valorCuotaVariable)).toLocaleString('es-CO')}` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-right font-bold text-emerald-600 tabular-nums">
                                            {payment.valorCuotaPago && Number(payment.valorCuotaPago) > 0 ? `$${Math.round(Number(payment.valorCuotaPago)).toLocaleString('es-CO')}` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-right font-bold text-gray-600 tabular-nums">
                                            {payment.saldoFinal !== null && payment.saldoFinal !== undefined ? `$${Math.round(Number(payment.saldoFinal)).toLocaleString('es-CO')}` : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default EstadoPrestamosSection;
