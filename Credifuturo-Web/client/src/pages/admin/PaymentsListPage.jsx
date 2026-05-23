import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatDate } from '../../utils/excelUtils';
import { useSortTable, SortIcon } from '../../utils/useSortTable';

const MONTH_NAMES_ES = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
};

// Helper to display dates in DD-MM-YYYY regardless of stored format.
// Uses mesPago as the source of truth to detect if day and month are swapped in DB.
// Handles: YYYY-MM-DD (standard), YYYY-DD-MM (imported/swapped), DD-MM-YYYY, or just a day number.
const displayFecha = (dateStr, mesPago) => {
    if (!dateStr) return '—';
    const s = String(dateStr).trim();
    const parts = s.split('-');

    // Case 1: ISO-style  YYYY-XX-XX  (first part is 4-digit year)
    if (parts.length === 3 && parts[0].length === 4) {
        const yyyy = parts[0];
        const p1 = parts[1].padStart(2, '0'); // could be MM or DD depending on source
        const p2 = parts[2].padStart(2, '0'); // the other one

        // Use mesPago to detect if the format is YYYY-MM-DD or YYYY-DD-MM
        if (mesPago) {
            const correctMM = MONTH_NAMES_ES[mesPago.toLowerCase().trim()];
            if (correctMM) {
                if (p1 === correctMM) {
                    // p1 is month → format is YYYY-MM-DD → display as DD-MM-YYYY
                    return `${p2}-${p1}-${yyyy}`;
                }
                if (p2 === correctMM) {
                    // p2 is month → format is YYYY-DD-MM → display as DD-MM-YYYY
                    return `${p1}-${p2}-${yyyy}`;
                }
            }
        }

        // Fallback without mesPago: assume standard YYYY-MM-DD
        return `${p2}-${p1}-${yyyy}`;
    }

    // Case 2: DD-MM-YYYY (already correct display format)
    if (parts.length === 3 && parts[2].length === 4) {
        return s;
    }

    // Case 3: Only a day number (e.g., "09" or "9")
    const dayNum = parseInt(s, 10);
    if (!isNaN(dayNum) && parts.length === 1) {
        const dd = String(dayNum).padStart(2, '0');
        if (mesPago) {
            const mm = MONTH_NAMES_ES[mesPago.toLowerCase().trim()];
            if (mm) {
                const yyyy = new Date().getFullYear();
                return `${dd}-${mm}-${yyyy}`;
            }
        }
        return dd;
    }

    return s;
};
import api from '../../config/api';
import * as XLSX from 'xlsx';
import { Download, RefreshCw, Search, X, AlertTriangle, Inbox, DollarSign, PieChart, CheckCircle, BarChart3, Activity, Clock, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import ListHeader from '../../components/admin/ListHeader';
import { CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import YearMultiSelect from '../../components/admin/YearMultiSelect';
import StatusMultiSelect from '../../components/admin/StatusMultiSelect';
import PillSingleSelect from '../../components/admin/PillSingleSelect';

const StatCard = ({ title, value, description, icon: Icon, color, customBg, isDark = false, textColor, onClick }) => (
    <Card
        className={`transition-all duration-200 overflow-hidden relative ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-brand-primary/20 hover:shadow-md' : ''}`}
        style={customBg ? { background: customBg, border: 'none' } : {}}
        onClick={onClick}
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

const MoraDetailModal = ({ isOpen, onClose, items }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Detalle de Cartera en Mora Cuota Prestamo</h3>
                        <p className="text-sm text-gray-500 italic">Registros de Cuotas Pendientes con fecha vencida</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="p-0 max-h-[60vh] overflow-y-auto">
                    {items.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            No hay registros vencidos para mostrar.
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white border-b border-gray-100 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Socio / Fecha</th>
                                    <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Mes</th>
                                    <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Monto Deuda</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-red-50/30 transition-colors group">
                                        <td className="p-4">
                                            <div className="font-semibold text-gray-900 group-hover:text-red-700 transition-colors">
                                                {item.name}
                                            </div>
                                            <div className="text-[10px] text-gray-400">
                                                Venció: {formatDate(item.fecha)} ({item.idVm})
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="text-xs text-gray-600 font-bold">
                                                {item.mes}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-mono font-bold text-red-600">
                                            {formatCurrency(item.valor)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-5 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <div className="text-xs text-gray-500 font-medium tracking-tight">
                        TOTAL {items.length} REGISTROS VENCIDOS
                    </div>
                    <div className="text-lg font-black text-red-600 tracking-tighter tabular-nums drop-shadow-sm">
                        {formatCurrency(items.reduce((sum, it) => sum + it.valor, 0))}
                    </div>
                </div>
            </div>
        </div>
    );
};


// ────────────────────────────────────────────────────────────────────────────
// NOTA DE ARQUITECTURA — 1-orders_table_estado_prestamos
//   - 'id'               → PK autoincremental interno de DB (técnico)
//   - 'externalId'       → Id_EP (P1, P2 …) — consecutivo oficial del registro
//   - 'clientCustomerId' → Customer_id (PK del negocio para el socio)
//   - 'idVm'             → Id del préstamo desembolsado (SOL##)
// ────────────────────────────────────────────────────────────────────────────

const TABLE_COLUMNS = [
    { key: 'externalId', label: 'Id_EP', align: 'center', minWidth: '90px', highlight: true },
    { key: 'idVm', label: 'Id_VM', align: 'center', minWidth: '100px', highlight: true },
    { key: 'clientCustomerId', label: 'Customer ID', align: 'center', minWidth: '110px', highlight: true },
    { key: 'clientName', label: 'Socio', align: 'left', minWidth: '180px' },
    { key: 'clientCedula', label: 'Cédula', align: 'left', minWidth: '120px' },
    { key: 'mesDesembolso', label: 'Mes Desembolso', align: 'center', minWidth: '130px' },
    { key: 'saldoInicial', label: 'Saldo Inicial', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'cuotasPrestamo', label: '# Cuotas Prestamo', align: 'center', minWidth: '130px', isNumber: true },
    { key: 'interesMensual', label: 'Interés Mensual', align: 'center', minWidth: '120px', isPercent: true },
    { key: 'valorInteresesAmortizados', label: 'Val. Intereses', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'fechaPagoMax', label: 'Fecha Pago Max', align: 'center', minWidth: '130px', isDate: true },
    { key: 'mesPago', label: 'Mes Pago', align: 'center', minWidth: '110px' },
    { key: 'valorCuotaVariable', label: 'Cuota Variable', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'estado', label: 'Estado Pago', align: 'center', minWidth: '110px', isEstadoBadge: true },
    { key: 'saldoFinal', label: 'Saldo Final', align: 'right', minWidth: '120px', isCurrency: true },
    { key: 'estadoPrestamo', label: 'Estado Préstamo', align: 'center', minWidth: '140px', isLoanBadge: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '140px' },
    { key: 'numeroTransaccion', label: '# Transacción', align: 'left', minWidth: '140px' },
    { key: 'cuentaAhorros', label: 'Cuenta Ahorros', align: 'left', minWidth: '140px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '280px' },
    { key: 'soporte', label: 'Soporte', align: 'center', minWidth: '80px', isSoporteButton: true },
];

// Badge de estado de pago
const EstadoBadge = ({ value }) => {
    const v = (value || '').toLowerCase();
    const color = v.includes('pag') ? 'bg-green-100 text-green-700'
        : v.includes('mora') ? 'bg-red-100 text-red-700'
            : v.includes('cancel') ? 'bg-gray-100 text-gray-600'
                : 'bg-yellow-100 text-yellow-700';
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{value || '—'}</span>;
};

// Badge de estado del préstamo
const LoanBadge = ({ value }) => {
    const v = (value || '').toLowerCase();
    const color = v.includes('activ') ? 'bg-blue-100 text-blue-700'
        : v.includes('cancel') ? 'bg-gray-100 text-gray-500'
            : v.includes('liquid') ? 'bg-purple-100 text-purple-700'
                : 'bg-slate-100 text-slate-600';
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{value || '—'}</span>;
};

const formatCurrency = (val) => {
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    return `$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (val) => {
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    return `${(n * 100).toFixed(2)}%`;
};

const CellRenderer = ({ column, value, row, onDownload }) => {
    if (column.isSoporteButton) {
        if (row.soporte) {
            return (
                <button
                    onClick={() => onDownload(row.id, row.soporte.name)}
                    className="inline-flex items-center justify-center p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-md transition-colors"
                    title={`Descargar ${row.soporte.name}`}
                >
                    <Download className="h-4 w-4" />
                </button>
            );
        }
        return <span className="text-gray-300">—</span>;
    }

    if (value === null || value === undefined || value === '') {
        return <span className="text-gray-300 text-xs italic">—</span>;
    }
    if (column.isTechId) return <span className="font-mono text-xs text-gray-400 tabular-nums">{value}</span>;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{displayFecha(value, row.mesPago)}</span>;
    if (column.isCurrency) return <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(value)}</span>;
    if (column.isPercent) return <span className="tabular-nums text-gray-700">{formatPercent(value)}</span>;
    if (column.isNumber) return <span className="tabular-nums text-gray-700">{value}</span>;
    if (column.highlight) return <span className="font-semibold text-gray-900">{value}</span>;
    if (column.isEstadoBadge) return <EstadoBadge value={value} />;
    if (column.isLoanBadge) return <LoanBadge value={value} />;
    return <span className="text-gray-700">{value}</span>;
};

const FilterControl = ({ label, children }) => (
    <div className="flex-1 min-w-[150px]">
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border-2 border-gray-200/80 shadow-sm transition-all hover:shadow-lg hover:border-gray-300 w-full h-11">
            {children}
        </div>
    </div>
);

// ─── Opciones únicas para filtros ───────────────────────────────────────────
const getUnique = (data, key) =>
    [...new Set(data.map(r => r[key]).filter(Boolean))].sort();

const ITEMS_PER_PAGE = 20;

// ════════════════════════════════════════════════════════════════════════════
const PaymentsListPage = () => {
    const { toast } = useUi();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterSearch, setFilterSearch] = useState('');   // full socio key search
    const [filterIdVm, setFilterIdVm] = useState('');        // filtro Id_VM (SOL##)
    const [filterEstado, setFilterEstado] = useState([]);
    const [filterEstadoPrestamo, setFilterEstadoPrestamo] = useState([]);
    const [selectedYears, setSelectedYears] = useState([new Date().getFullYear(), new Date().getFullYear() + 1]);
    const [soportesInfo, setSoportesInfo] = useState({}); // { paymentId: { exists: true, name: '...' } }
    const [showMoraDetail, setShowMoraDetail] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/payments/list');
            if (res.data && res.data.ok) {
                // Add a normalized socioKey to each record for reliable filtering/dropdowns
                const withKeys = (res.data.data || []).map(p => {
                    const namePart = p.clientName || '';
                    const cedulaPart = p.clientCedula || '';
                    const idPago = p.externalId || '';
                    // Broad key for the "combo" style search: Name (Cedula)
                    const socioKey = `${namePart} (${cedulaPart})`.replace(/\s\(\)$/, '').trim();
                    return { ...p, socioKey };
                });

                setPayments(withKeys);
            } else {
                throw new Error(res.data?.error || 'Respuesta inesperada del servidor');
            }
        } catch (err) {
            console.error('Error fetching payments list:', err);
            setError(err.message || 'Error al conectar con el servidor');
            setPayments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);

    // Actualizar cuando PaymentsPage guarda un pago (evento global, misma pes\u00f1a)
    useEffect(() => {
        const handler = () => fetchPayments();
        window.addEventListener('paymentsUpdated', handler);
        return () => window.removeEventListener('paymentsUpdated', handler);
    }, [fetchPayments]);

    // Detectar actualizaciones desde otras rutas via localStorage (diferente ruta)
    useEffect(() => {
        const lastUpdate = localStorage.getItem('paymentsLastUpdate');
        const lastFetched = localStorage.getItem('paymentsListLastFetched');
        if (lastUpdate && lastUpdate !== lastFetched) {
            fetchPayments();
            localStorage.setItem('paymentsListLastFetched', lastUpdate);
        }
        const handler = (e) => {
            if (e.key === 'paymentsLastUpdate') {
                fetchPayments();
                localStorage.setItem('paymentsListLastFetched', e.newValue);
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, [fetchPayments]);

    // ── Descargar Soporte ─────────────────────────────────────────────────────
    const handleDownloadSoporte = async (paymentId, fileName) => {
        try {
            const response = await api.get(`/admin/payments/${paymentId}/soporte`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName || `soporte_${paymentId}.jpg`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            toast.error('Error al descargar el archivo: ' + (err.message || ''));
        }
    };

    // ── Opciones dinámicas de filtros (de los datos cargados) ──────────────
    const estadoOptions = useMemo(() =>
        [...new Set(payments.map(p => p.estado?.trim()).filter(Boolean))].sort(),
        [payments]);

    const estadoPrestamoOptions = useMemo(() =>
        [...new Set(payments.map(p => p.estadoPrestamo?.trim()).filter(Boolean))].sort(),
        [payments]);

    // Opciones únicas de Id_VM ordenadas por número SOL (SOL1, SOL2 … SOL24)
    const idVmOptions = useMemo(() => {
        const unique = [...new Set(payments.map(p => p.idVm?.trim()).filter(Boolean))];
        return unique.sort((a, b) => {
            const numA = parseInt((a || '').replace(/\D/g, '') || '0');
            const numB = parseInt((b || '').replace(/\D/g, '') || '0');
            return numB - numA; // más recientes primero
        });
    }, [payments]);


    // ── Filtrado / búsqueda client-side ─────────────────────────────────────
    const filteredPayments = useMemo(() => {
        let result = payments;

        // Búsqueda unificada de socio (Dropdown exact match using pre-calculated key)
        if (filterSearch.trim()) {
            const term = filterSearch.trim();
            result = result.filter(p => p.socioKey === term);
        }

        // Filtro Estado Pago — soporte de selección múltiple
        if (filterEstado && filterEstado.length > 0) {
            result = result.filter(p => filterEstado.includes((p.estado || '').trim()));
        }

        // Filtro Estado Préstamo — soporte de selección múltiple
        if (filterEstadoPrestamo && filterEstadoPrestamo.length > 0) {
            result = result.filter(p => filterEstadoPrestamo.includes((p.estadoPrestamo || '').trim()));
        }

        // Filtro Id_VM — coincidencia exacta con el SOL seleccionado
        if (filterIdVm.trim()) {
            result = result.filter(p => (p.idVm || '').trim() === filterIdVm.trim());
        }

        // Filtro Año — extrae el año directamente del string fechaPagoMax (YYYY-XX-XX)
        if (selectedYears && selectedYears.length > 0) {
            result = result.filter(p => {
                if (!p.fechaPagoMax) return false;
                const s = String(p.fechaPagoMax).trim();
                // Formato YYYY-MM-DD: los primeros 4 caracteres son el año
                const yr = s.length >= 4 ? parseInt(s.substring(0, 4), 10) : 0;
                return selectedYears.includes(yr);
            });
        }

        return result;
    }, [payments, filterSearch, filterIdVm, filterEstado, filterEstadoPrestamo, selectedYears]);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterSearch, filterIdVm, filterEstado, filterEstadoPrestamo, selectedYears]);

    const { sortedData: sortedPayments, sortConfig: paymentsSort, handleSort: handlePaymentsSort } = useSortTable(filteredPayments, 'idVm', 'desc');

    // Paginated data
    const paginatedPayments = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedPayments.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedPayments, currentPage]);

    // ── Número de cuota dinámico: agrupa por idVm, ordena por id ASC ──────────
    const cuotaNumMap = useMemo(() => {
        const sorted = [...payments].sort((a, b) => {
            if (a.idVm < b.idVm) return -1;
            if (a.idVm > b.idVm) return 1;
            return (a.id || 0) - (b.id || 0);
        });
        const map = {};
        const counters = {};
        for (const p of sorted) {
            const key = p.idVm || '__none__';
            counters[key] = (counters[key] || 0) + 1;
            map[p.id] = counters[key];
        }
        return map;
    }, [payments]);

    // HELPERS & CONSTANTS
    const monthsLower = useMemo(() => ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"], []);
    // todayThreshold en hora local (no UTC) — usado en tabla y en cálculo de stats
    const todayThreshold = useMemo(() => {
        const n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    }, []);

    const safeParseDate = useCallback((dateVal, mesRef) => {
        if (!dateVal) return null;
        // Normalizar: quitar parte T si es ISO con timestamp
        let dateStr = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal);
        if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];

        const parts = dateStr.split('-');
        if (parts.length !== 3) return new Date(dateStr + 'T00:00:00'); // fuerza hora local

        const [p1, p2, p3] = parts.map(Number);

        // Detectar YYYY-MM-DD (primer segmento de 4 dígitos)
        if (String(parts[0]).length === 4) {
            const y = p1, m = p2, d = p3;
            if (mesRef) {
                const targetIdx = monthsLower.indexOf(mesRef.toLowerCase().trim()) + 1;
                if (targetIdx > 0) {
                    if (m === targetIdx) return new Date(y, m - 1, d); // YYYY-MM-DD → local
                    if (d === targetIdx) return new Date(y, d - 1, m); // YYYY-DD-MM swapped
                }
            }
            return new Date(y, m - 1, d); // assume YYYY-MM-DD, hora local
        }

        // DD-MM-YYYY
        if (String(parts[2]).length === 4) {
            return new Date(p3, p2 - 1, p1);
        }

        return new Date(dateStr + 'T00:00:00');
    }, [monthsLower]);

    // Años únicos derivados de fechaPagoMax (colocado después de safeParseDate)
    const yearOptions = useMemo(() => {
        const years = new Set();
        payments.forEach(p => {
            if (!p.fechaPagoMax) return;
            const s = String(p.fechaPagoMax).trim();
            const yr = s.length >= 4 ? s.substring(0, 4) : '';
            if (yr && !isNaN(Number(yr))) years.add(yr);
        });
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [payments]);

    // Summary calculations (Smart Cards)
    const stats = useMemo(() => {
        const nowFresh = new Date();
        const todayLocal = new Date(nowFresh.getFullYear(), nowFresh.getMonth(), nowFresh.getDate());

        // Construir set de claves de registros ya pagados (clientId|idVm|mesPago)
        // para excluirlos del cálculo de mora (igual que el backend)
        const paidKeySet = new Set(
            payments
                .filter(p => ['pago', 'abono'].includes((p.estado || '').trim().toLowerCase()))
                .map(p => `${p.clientId}|${(p.idVm || '').trim().toLowerCase()}|${(p.mesPago || '').trim().toLowerCase()}`)
        );

        return filteredPayments.reduce((acc, curr) => {
            acc.totalIntereses += parseFloat(curr.valorInteresesAmortizados || 0);
            acc.totalCuotas++;

            const valCuota = parseFloat(curr.valorCuotaVariable || 0);
            const valPago = parseFloat(curr.valorCuotaPago || 0);

            // Sumamos el valor prestado solo una vez por Id_VM presente en los resultados filtrados
            if (curr.idVm && !acc.loanIdsRef.has(curr.idVm)) {
                acc.loanIdsRef.add(curr.idVm);
                acc.totalValorPrestado += parseFloat(curr.valorPrestado || 0);
            }

            const isPago = (curr.estado || '').trim().toLowerCase() === 'pago';
            const isPendiente = (curr.estado || '').trim().toLowerCase() === 'pendiente';

            if (isPago) {
                acc.cuotasPagadas++;
                acc.totalRecaudo += valPago;
            } else if (isPendiente) {
                acc.carteraActiva += valCuota;

                // Excluir si ya existe un pago/abono para este cliente+préstamo+mes
                const paidKey = `${curr.clientId}|${(curr.idVm || '').trim().toLowerCase()}|${(curr.mesPago || '').trim().toLowerCase()}`;
                if (paidKeySet.has(paidKey)) return acc;

                // Regla: fechaPagoMax < hoy (00:00:00 local) y Estado = Pendiente
                const fechaPagoMax = safeParseDate(curr.fechaPagoMax, curr.mesPago);
                if (fechaPagoMax && fechaPagoMax < todayLocal) {
                    acc.moraCartera += valCuota;
                    acc.moraItems.push({
                        name: curr.clientName,
                        mes: curr.mesPago || '—',
                        valor: valCuota,
                        fecha: curr.fechaPagoMax,
                        idVm: curr.idVm
                    });
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
            moraItems: [],
            loanIdsRef: new Set()
        });
    }, [filteredPayments, payments, safeParseDate]);


    const clearFilters = () => {
        setFilterSearch('');
        setFilterIdVm('');
        setFilterEstado([]);
        setFilterEstadoPrestamo([]);
        setSelectedYears([new Date().getFullYear(), new Date().getFullYear() + 1]);
    };
    const hasActiveFilters = filterSearch || filterIdVm || filterEstado.length > 0 || filterEstadoPrestamo.length > 0 || selectedYears.length !== 2 || selectedYears[0] !== new Date().getFullYear() || selectedYears[1] !== new Date().getFullYear() + 1;

    const totalPages = Math.max(1, Math.ceil(filteredPayments.length / ITEMS_PER_PAGE));


    // ── Export Excel ─────────────────────────────────────────────────────────
    const handleExport = () => {
        if (filteredPayments.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const dataToExport = filteredPayments.map(p => ({
            'Id_EP': p.externalId,
            'Id_VM': p.idVm,
            'Customer_ID': p.clientCustomerId,
            'Socio': p.clientName,
            'Cédula': p.clientCedula,
            'Mes Desembolso': p.mesDesembolso,
            'Saldo Inicial': p.saldoInicial,
            '# Cuotas Prestamo': p.cuotasPrestamo,
            'Item_Quantity': cuotaNumMap[p.id] ?? p.itemQuantity ?? 0,
            'Interés Mensual': p.interesMensual,
            'Val. Intereses Amortizados': p.valorInteresesAmortizados,
            'Fecha Pago Max': formatDate(p.fechaPagoMax),
            'Mes de Pago': p.mesPago,
            'Cuota Variable': p.valorCuotaVariable,
            'Estado Pago': p.estado,
            'Valor Cuota Pago': p.valorCuotaPago,
            'Saldo Final': p.saldoFinal,
            'Estado Préstamo': p.estadoPrestamo,
            'Soporte Adjunto': p.soporte ? 'Sí' : 'No',
            'Banco': p.banco,
            '# Transacción': p.numeroTransaccion,
            'Cuenta Ahorros': p.cuentaAhorros,
            'Observaciones': p.observaciones,
            '# DB (Técnico)': p.id,
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Estado Prestamos');
        XLSX.writeFile(wb, 'Lista_Estado_Prestamos.xlsx');
        toast.success('Reporte exportado exitosamente');
    };

    // ── LOADING ──────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="h-8 w-72 bg-gray-200 rounded animate-pulse mb-2" />
                    <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="bg-white rounded-xl border border-ui-border shadow-sm p-4 space-y-3">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
                    ))}
                </div>
            </div>
        );
    }

    // ── ERROR ────────────────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary">Lista Estado Préstamos</h1>
                    <p className="text-sm text-gray-500 mt-1">1-orders_table_estado_prestamos · {payments.length} registros totales</p>
                </div>
                <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50 mb-4">
                        <AlertTriangle className="h-7 w-7 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Error al cargar datos</h3>
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 inline-block mb-4 font-mono">{error}</p>
                    <div className="mt-4">
                        <Button onClick={fetchPayments} variant="outline" className="gap-2">
                            <RefreshCw className="h-4 w-4" /> Reintentar
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ── MAIN RENDER ──────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <ListHeader
                    title="Lista Estado Préstamos"
                    source="1-orders_table_estado_prestamos"
                    totalCount={payments.length}
                    filteredCount={filteredPayments.length}
                    loading={loading}
                    className="mb-0"
                />
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={fetchPayments} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" /> Actualizar
                    </Button>
                    <Button size="sm" onClick={handleExport} className="gap-1.5" disabled={filteredPayments.length === 0}>
                        <Download className="h-3.5 w-3.5" /> Exportar Excel
                    </Button>
                </div>
            </div>

            {/* Smart Summary Cards - Row 1: Financiero */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <StatCard
                    title="Total Valor Prestado"
                    value={`$${stats.totalValorPrestado.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Suma bruta de préstamos"
                    icon={DollarSign}
                    color="text-emerald-500"
                />
                <StatCard
                    title="Cartera Activa + intereses"
                    value={`$${stats.carteraActiva.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Suma cuotas pendientes"
                    icon={Activity}
                    color="text-emerald-700"
                />
                <StatCard
                    title="Total Recaudo + intereses"
                    value={`$${stats.totalRecaudo.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Suma cuotas pagadas"
                    icon={CheckCircle}
                    color="text-blue-600"
                />
                <StatCard
                    title="Total Intereses"
                    value={`$${stats.totalIntereses.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Intereses amortizados"
                    icon={BarChart3}
                    color="text-amber-500"
                />
                <StatCard
                    title="Cartera en Mora EP"
                    value={`$${stats.moraCartera.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Pendiente con fecha vencida"
                    icon={AlertTriangle}
                    color="text-red-500"
                    customBg="linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
                    onClick={() => setShowMoraDetail(true)}
                />
            </div>

            {/* Smart Summary Cards - Row 2: Conteo */}
            <div className="grid gap-4 md:grid-cols-3 mt-4">
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
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Socio, Cédula o ID Pago</label>
                        <PillSingleSelect
                            options={Array.from(new Set(payments.map(p => p.socioKey).filter(Boolean))).sort()}
                            selectedValue={filterSearch}
                            onChange={setFilterSearch}
                            labelPrefix="Socio"
                            icon={Users}
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Año</label>
                        <YearMultiSelect selectedYears={selectedYears} onChange={setSelectedYears} />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Estado Pago</label>
                        <StatusMultiSelect
                            options={estadoOptions}
                            selectedValues={filterEstado}
                            onChange={setFilterEstado}
                            labelPrefix="Estado Pago"
                            icon={CheckCircle}
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Estado Préstamo</label>
                        <StatusMultiSelect
                            options={estadoPrestamoOptions}
                            selectedValues={filterEstadoPrestamo}
                            onChange={setFilterEstadoPrestamo}
                            labelPrefix="Estado Préstamo"
                            icon={Activity}
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Id_VM (Préstamo)</label>
                        <PillSingleSelect
                            options={idVmOptions}
                            selectedValue={filterIdVm}
                            onChange={setFilterIdVm}
                            labelPrefix="Id_VM"
                            icon={Search}
                        />
                    </div>

                    {/* Limpiar Filtros */}
                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-gray-500 hover:text-gray-700 self-end">
                            <X className="h-3.5 w-3.5" /> Limpiar
                        </Button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-ui-border shadow-sm overflow-hidden">
                {/* EMPTY STATE */}
                {filteredPayments.length === 0 ? (
                    <div className="text-center py-20 px-4">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-50 mb-4">
                            <Inbox className="h-7 w-7 text-gray-400" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-700 mb-1">Sin registros</h3>
                        <p className="text-sm text-gray-400 max-w-sm mx-auto">
                            {hasActiveFilters
                                ? 'No hay registros que coincidan con los filtros activos.'
                                : 'No se encontraron registros de Estado Préstamos. Sincronice la base de datos.'}
                        </p>
                        {hasActiveFilters && (
                            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 gap-1.5">
                                <X className="h-3.5 w-3.5" /> Limpiar filtros
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* TABLE */}
                        <Card className="overflow-hidden border-none shadow-none bg-transparent">
                            <div className="table-container max-h-[70vh] overflow-y-auto">
                                <table className="premium-table" id="payments-list-table">
                                    <thead>
                                        <tr className="bg-brand-primary text-white">
                                            {TABLE_COLUMNS.map(col => (
                                                <th
                                                    className="sticky top-0 z-10 bg-brand-primary cursor-pointer select-none hover:bg-brand-dark transition-colors"
                                                    key={col.key}
                                                    style={{ textAlign: col.align, minWidth: col.minWidth }}
                                                    onClick={() => !col.isSoporteButton && handlePaymentsSort(col.key)}
                                                >
                                                    <span className="inline-flex items-center gap-1">
                                                        {col.label}
                                                        {col.isTechId && <span className="text-[10px] font-normal text-gray-400 normal-case tracking-normal">(interno)</span>}
                                                        {!col.isSoporteButton && <SortIcon colKey={col.key} sortConfig={paymentsSort} />}
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedPayments.map((row, rowIdx) => {
                                            const isPago = (row.estado || '').trim().toLowerCase() === 'pago';
                                            const fechaMax = safeParseDate(row.fechaPagoMax, row.mesPago);
                                            const isMora = !isPago && fechaMax && (fechaMax < todayThreshold);

                                            let rowClass = rowIdx % 2 === 0 ? 'hover:bg-emerald-50' : 'bg-gray-50/30 hover:bg-emerald-50';
                                            if (isPago) rowClass = 'bg-emerald-50/70 hover:bg-emerald-100/80';
                                            else if (isMora) rowClass = 'bg-rose-50/80 hover:bg-rose-100/90';

                                            return (
                                                <tr
                                                    key={row.id}
                                                    className={`transition-colors duration-150 border-b border-gray-100 ${rowClass}`}
                                                >
                                                    {TABLE_COLUMNS.map(col => (
                                                        <td
                                                            key={col.key}
                                                            style={{ textAlign: col.align, minWidth: col.minWidth }}
                                                        >
                                                            <CellRenderer
                                                                column={col}
                                                                row={row}
                                                                onDownload={handleDownloadSoporte}
                                                                value={row[col.key]}
                                                            />
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination and Total counter */}
                            <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-gray-500 px-4 py-2 border-t border-ui-border bg-gray-50/30 gap-2">
                                <p>
                                    {hasActiveFilters
                                        ? (<>Mostrando <strong>{filteredPayments.length}</strong> de <strong>{payments.length}</strong> registros filtrados</>)
                                        : (<>Total: <strong>{payments.length}</strong> registros</>)
                                    }
                                </p>
                                {totalPages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                        </Button>
                                        <span className="font-medium">
                                            Página{' '}
                                            <span className="font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md">
                                                {currentPage}
                                            </span>
                                            {' '}/ {totalPages}
                                        </span>
                                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </>
                )}
            </div>

            {/* Modals */}
            <MoraDetailModal
                isOpen={showMoraDetail}
                onClose={() => setShowMoraDetail(false)}
                items={stats.moraItems}
            />
        </div>
    );
};

export default PaymentsListPage;
