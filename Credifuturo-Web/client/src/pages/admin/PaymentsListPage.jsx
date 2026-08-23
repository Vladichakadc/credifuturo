import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDate } from '../../utils/excelUtils';
import { useSortTable, SortIcon } from '../../utils/useSortTable';

const MONTH_NAMES_ES = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
};

// Orden calendario (no alfabético) para el filtro de Mes de Pago
const MONTH_LABELS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const capitalizeMonth = (m) => m ? m.trim().charAt(0).toUpperCase() + m.trim().slice(1).toLowerCase() : '';

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
import { Download, RefreshCw, Search, X, AlertTriangle, Inbox, DollarSign, PieChart, CheckCircle, BarChart3, Activity, Clock, ChevronLeft, ChevronRight, Users, Calendar, Plus, Trash2, Edit, FileDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input, Label } from '../../components/ui/Input';
import { useUi } from '../../context/UiContext';
import ListHeader from '../../components/admin/ListHeader';
import { CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import YearMultiSelect from '../../components/admin/YearMultiSelect';
import StatusMultiSelect from '../../components/admin/StatusMultiSelect';
import PillSingleSelect from '../../components/admin/PillSingleSelect';
import { notifyUpdate } from '../../utils/sync';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../../utils/banks';
import { hoyISO } from '../../utils/fechas';

// ── Input numérico con formato (migrado de PaymentsPage.jsx) — muestra el valor
// formateado (miles/porcentaje) cuando no tiene foco, y el número crudo mientras se edita.
const FormattedNumberInput = ({ value, onChange, isPercent = false, className, readOnly, ...props }) => {
    const [focused, setFocused] = useState(false);

    let displayValue = value;
    if (!focused && value !== '' && value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            if (isPercent) {
                displayValue = (num * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + '%';
            } else {
                displayValue = num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
        }
    }

    return (
        <Input
            {...props}
            type={focused ? "number" : "text"}
            value={focused ? value : displayValue}
            readOnly={readOnly}
            onChange={onChange}
            onFocus={(e) => {
                if (!readOnly) setFocused(true);
                if (props.onFocus) props.onFocus(e);
            }}
            onBlur={(e) => {
                if (!readOnly) setFocused(false);
                if (props.onBlur) props.onBlur(e);
            }}
            className={className}
        />
    );
};

// ── Toggle Switch — alterna Estado Pago Pago/Pendiente sin abrir el modal ──
const ToggleSwitch = ({ active, onToggle, disabled }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        title={active ? 'Desactivar' : 'Activar'}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
            ${active ? 'bg-green-500' : 'bg-gray-300'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
        <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                ${active ? 'translate-x-6' : 'translate-x-1'}`}
        />
    </button>
);

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
    { key: 'itemQuantity', label: 'N° Cuota', align: 'center', minWidth: '100px', isCuotaNum: true },
    { key: 'interesMensual', label: 'Interés Mensual', align: 'center', minWidth: '120px', isPercent: true },
    { key: 'valorInteresesAmortizados', label: 'Val. Intereses', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'fechaPagoMax', label: 'Fecha Pago Max', align: 'center', minWidth: '130px', isDate: true },
    { key: 'mesPago', label: 'Mes Pago', align: 'center', minWidth: '110px' },
    { key: 'valorCuotaVariable', label: 'Cuota Variable', align: 'right', minWidth: '130px', isCurrency: true },
    // Lo que el socio pagó de verdad. Faltaba: la lista solo mostraba lo que se
    // DEBÍA, así que un pago por encima de la cuota era invisible aquí.
    { key: 'valorCuotaPago', label: 'Valor Pagado', align: 'right', minWidth: '130px', isPagado: true },
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

// Badge de estado del préstamo — 'vigente' es el valor real de un préstamo activo
// (no 'activ'/'activo', que casi nunca aparece en los datos reales del fondo).
const LoanBadge = ({ value }) => {
    const v = (value || '').toLowerCase();
    const color = (v.includes('vigen') || v.includes('activ')) ? 'bg-blue-100 text-blue-700'
        : v.includes('cancel') ? 'bg-gray-100 text-gray-500'
            : v.includes('liquid') ? 'bg-purple-100 text-purple-700'
                : v.includes('pendien') ? 'bg-amber-100 text-amber-700'
                    : v.includes('desembols') ? 'bg-emerald-100 text-emerald-700'
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
    if (column.isCuotaNum) {
        const num = parseInt(value) || '—';
        const total = parseInt(row.cuotasPrestamo) || null;
        return (
            <span className="inline-flex items-center gap-1 tabular-nums font-semibold">
                <span className="text-emerald-700">{num}</span>
                {total && <span className="text-gray-400 font-normal text-[10px]">/ {total}</span>}
            </span>
        );
    }
    if (column.isTechId) return <span className="font-mono text-xs text-gray-400 tabular-nums">{value}</span>;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{displayFecha(value, row.mesPago)}</span>;
    if (column.isCurrency) return <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(value)}</span>;
    // Lo pagado se compara con la cuota: si excede, es un abono a capital y se
    // señala con el excedente al lado. Un número suelto no dice nada; lo que
    // importa es la diferencia contra lo que se debía.
    if (column.isPagado) {
        const pagado = parseFloat(value) || 0;
        const cuota = parseFloat(row.valorCuotaVariable) || 0;
        const exceso = pagado - cuota;
        if (pagado <= 0) return <span className="text-gray-300">—</span>;
        if (exceso > 1) {
            // El backend deja constancia en las observaciones de qué hizo con el
            // excedente. Se lee de ahí para no afirmar un tratamiento que quizá
            // no ocurrió: en un préstamo con cronograma heredado el abono se
            // registra pero no se recalcula nada.
            const obs = String(row.observaciones || '');
            const trato = /reducci[oó]n de cuota/i.test(obs) ? 'reduce la cuota'
                : /reducci[oó]n de plazo/i.test(obs) ? 'reduce el plazo'
                    : null;
            return (
                <span className="inline-flex flex-col items-end leading-tight">
                    <span className="font-bold text-amber-700 tabular-nums">{formatCurrency(pagado)}</span>
                    <span className="text-[10px] font-semibold text-amber-600 tabular-nums">
                        +{formatCurrency(exceso)} a capital
                    </span>
                    <span className="text-[10px] font-medium text-amber-500">
                        {trato || 'sin recalcular'}
                    </span>
                </span>
            );
        }
        return <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(pagado)}</span>;
    }
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
    const [searchParams, setSearchParams] = useSearchParams();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // ── Estado del modal CRUD "Registrar Pago" (migrado de PaymentsPage.jsx) ──
    const [clients, setClients] = useState([]);
    const [disbursedLoans, setDisbursedLoans] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isSaving, setIsSaving] = useState(false); // guardado del modal — independiente de `loading` (que gobierna el skeleton de página completa)
    const [deletingId, setDeletingId] = useState(null);
    const [togglingId, setTogglingId] = useState(null);
    // Qué hacer con lo que el socio pague por encima de su cuota. Por defecto se
    // baja la cuota y se conserva el plazo; el socio puede pedir lo contrario.
    const [politicaAbono, setPoliticaAbono] = useState('reducir-cuota');
    // Abonos a capital que el sistema encontró sin aplicar. El barrido
    // automático se ocupa de los casos claros; aquí se ven sobre todo los que
    // se negó a tocar y necesitan una decisión de una persona.
    const [abonos, setAbonos] = useState(null);
    const [aplicandoAbonos, setAplicandoAbonos] = useState(false);
    const [selectingRecord, setSelectingRecord] = useState(false);
    const [selectorSearch, setSelectorSearch] = useState('');
    const [selectorClientId, setSelectorClientId] = useState('');
    const [selectorIdVm, setSelectorIdVm] = useState('');
    const [selectorMes, setSelectorMes] = useState('');
    const [selectorEstado, setSelectorEstado] = useState('');
    const [selectorCuota, setSelectorCuota] = useState('');
    const [soporteFile, setSoporteFile] = useState(null);
    const [paymentForm, setPaymentForm] = useState({
        externalId: '',
        clientId: '',
        nombre: '',
        apellido: '',
        idVm: '',
        mesDesembolso: '',
        saldoInicial: '',
        cuotasPrestamo: '',
        interesMensual: '',
        valorInteresesAmortizados: '',
        fechaPagoMax: hoyISO(),
        mesPago: MONTH_LABELS_ES[new Date().getMonth()],
        valorCuotaVariable: '',
        estado: 'Pendiente',
        valorCuotaPago: '',
        saldoFinal: '',
        itemQuantity: '1',
        banco: '',
        numeroTransaccion: '',
        cuentaAhorros: '',
        observaciones: '',
        estadoPrestamo: ''
    });
    // Los 3 filtros abajo aceptan un valor inicial desde la URL (?estado=, ?estadoPrestamo=,
    // ?search=) para que las tarjetas del Panel Ejecutivo (y cualquier otro enlace externo)
    // aterricen ya filtradas en vez de en una lista genérica sin contexto.
    const [filterSearch, setFilterSearch] = useState(searchParams.get('search') || '');   // full socio key search
    const [filterIdVm, setFilterIdVm] = useState('');        // filtro Id_VM (SOL##)
    const [filterEstado, setFilterEstado] = useState(() => {
        const v = searchParams.get('estado');
        return v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    });
    const [filterEstadoPrestamo, setFilterEstadoPrestamo] = useState(() => {
        const v = searchParams.get('estadoPrestamo');
        return v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    });
    const [selectedYears, setSelectedYears] = useState([new Date().getFullYear(), new Date().getFullYear() + 1]);
    const [filterMes, setFilterMes] = useState([]);        // filtro Mes de Pago (mesPago)
    const [showMoraDetail, setShowMoraDetail] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    // Revisa qué pagos por encima de la cuota siguen sin abonarse a capital.
    // Es solo lectura: el servidor calcula lo que haría, sin escribir nada.
    const fetchAbonos = useCallback(async () => {
        try {
            const res = await api.get('/admin/payments/abonos');
            setAbonos(res.data && res.data.ok ? res.data : null);
        } catch {
            // Que falle esta revisión no debe estropear la lista de pagos.
            setAbonos(null);
        }
    }, []);

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

    // Qué se hace con el excedente de ESTE préstamo. Queda guardado, así que el
    // barrido nocturno lo respeta en vez de volver al defecto del fondo.
    const handlePoliticaAbono = useCallback(async (idVm, politica) => {
        try {
            await api.put('/admin/payments/abonos/politica', { idVm, politica });
            await fetchAbonos();
            toast.success(politica === 'reducir-plazo'
                ? `${idVm}: el abono acortará el plazo.`
                : `${idVm}: el abono bajará la cuota.`);
        } catch (err) {
            toast.error('No se pudo guardar la política: ' + (err.response?.data?.error || err.message || ''));
        }
    }, [fetchAbonos, toast]);

    const handleAplicarAbonos = useCallback(async (idVm = null) => {
        setAplicandoAbonos(true);
        try {
            const res = await api.post('/admin/payments/abonos/aplicar', idVm ? { idVm } : {});
            const n = (res.data?.aplicados || []).length;
            toast.success(n === 1
                ? 'Se recalculó 1 préstamo con abono a capital.'
                : `Se recalcularon ${n} préstamos con abono a capital.`);
            await fetchPayments();
            await fetchAbonos();
        } catch (err) {
            toast.error('No se pudieron aplicar los abonos: ' + (err.response?.data?.error || err.message || ''));
        } finally {
            setAplicandoAbonos(false);
        }
    }, [fetchPayments, fetchAbonos, toast]);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);
    useEffect(() => { fetchAbonos(); }, [fetchAbonos]);

    // Clientes y pr\u00e9stamos desembolsados \u2014 necesarios para los selectores del modal
    // "Registrar Pago" (socio, Id_VM, autocompletado de banco/cuenta/tasa). No los trae
    // /payments/list (solo un resumen aplanado del pr\u00e9stamo), por eso van aparte.
    const fetchClients = useCallback(async () => {
        try {
            const res = await api.get('/admin/clients');
            setClients(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Error fetching clients:', err);
        }
    }, []);
    const fetchDisbursedLoans = useCallback(async () => {
        try {
            const res = await api.get('/admin/disbursed-loans');
            setDisbursedLoans(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Error fetching disbursed loans:', err);
        }
    }, []);
    useEffect(() => { fetchClients(); }, [fetchClients]);
    useEffect(() => { fetchDisbursedLoans(); }, [fetchDisbursedLoans]);

    // \u00danico punto que refresca todo tras crear/editar/eliminar/alternar estado.
    const refreshAll = useCallback(async () => {
        await Promise.all([fetchPayments(), fetchClients(), fetchDisbursedLoans()]);
    }, [fetchPayments, fetchClients, fetchDisbursedLoans]);

    // Se actualiza cuando esta misma p\u00e1gina u otra (ej. al desembolsar un pr\u00e9stamo,
    // que crea/regenera cuotas) dispara notifyUpdate('payments').
    useEffect(() => {
        const handler = () => fetchPayments();
        window.addEventListener('paymentsUpdated', handler);
        return () => window.removeEventListener('paymentsUpdated', handler);
    }, [fetchPayments]);

    // Detectar actualizaciones desde otras pestañas via localStorage (evento 'storage').
    // Nota: no hay que comparar/reconsultar al montar — el useEffect de arriba ya
    // hace un fetchPayments() fresco en cada montaje, así que repetirlo aquí solo
    // duplicaba la descarga completa de la tabla cada vez que se abría esta página
    // después de cualquier edición reciente en el formulario de pagos.
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'paymentsLastUpdate') {
                fetchPayments();
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

    // ── AUTO-OPEN: navegado desde el sidebar "Registrar Pago" (?action=new) ──
    // A diferencia del efecto equivalente que ya trae este mismo archivo cuando vivía en
    // PaymentsPage.jsx, este SÍ limpia el query param al abrir (mismo patrón ya usado en
    // la fusión de préstamos) — sin limpiarlo, cualquier recarga de datos posterior con el
    // modal ya cerrado volvería a abrirlo solo, porque el guard nunca deja de ser true.
    useEffect(() => {
        if (searchParams.get('action') === 'new' && !loading && !isModalOpen) {
            handleOpenModal();
            setSearchParams({}, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, loading]);

    // ── Form helpers ──────────────────────────────────────────────────────────
    const resetPaymentForm = () => {
        setPaymentForm({
            externalId: '', clientId: '', nombre: '', apellido: '',
            mesDesembolso: '', saldoInicial: '', cuotasPrestamo: '',
            interesMensual: '', valorInteresesAmortizados: '',
            fechaPagoMax: hoyISO(),
            mesPago: MONTH_LABELS_ES[new Date().getMonth()],
            valorCuotaVariable: '', estado: 'Pendiente',
            valorCuotaPago: '', saldoFinal: '',
            itemQuantity: '1', banco: '', numeroTransaccion: '',
            cuentaAhorros: '', observaciones: '', idVm: '', estadoPrestamo: ''
        });
        setIsEditing(false);
        setEditingId(null);
        setSoporteFile(null);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetPaymentForm();
    };

    const handleOpenModal = (payment = null) => {
        if (payment) {
            // Fecha de Pago Max: siempre muestra la fecha actual como punto de partida
            // para que el admin registre el pago en la fecha real de hoy.
            const today = hoyISO();
            const loanRef = disbursedLoans.find(l => (l.idVm || l.orderId) === payment.idVm);
            // Nombre/apellido vía clientsById (ver comentario arriba) — payment.Client no
            // existe en las filas de /payments/list.
            const clientRec = clientsById[payment.clientId];

            setPaymentForm({
                ...payment,
                fechaPagoMax: today,
                // El total de cuotas del PLAN, no el número de esta cuota. Estaban
                // invertidos: al editar se cargaba itemQuantity aquí y al guardar se
                // persistía, así que cada edición reescribía el plan del préstamo
                // con el número de la cuota que se estaba tocando.
                cuotasPrestamo: payment.cuotasPrestamo ?? payment.itemQuantity,
                nombre: clientRec?.name || '',
                apellido: `${clientRec?.surname1 || ''} ${clientRec?.surname2 || ''}`.trim(),
                estadoPrestamo: loanRef ? loanRef.estado : payment.estadoPrestamo
            });
            setIsEditing(true);
            setEditingId(payment.id);
            setSelectingRecord(false);
        } else {
            resetPaymentForm();
            setSelectingRecord(true);
            setSelectorSearch('');
            setSelectorClientId('');
            setSelectorIdVm('');
            setSelectorMes('');
            setSelectorEstado('');
            setSelectorCuota('');
        }
        setIsModalOpen(true);
    };

    // ── Al cambiar cliente, poblar los datos del préstamo (solo al crear) ─────
    useEffect(() => {
        if (!paymentForm.clientId) return;
        if (editingId) return;

        const client = clientsById[paymentForm.clientId] || clients.find(c => c.id.toString() === paymentForm.clientId.toString());
        if (!client) return;

        const clientLoans = disbursedLoans.filter(l => l.clientId.toString() === paymentForm.clientId.toString());
        if (clientLoans.length === 0) return;

        const activeLoans = clientLoans.filter(l => l.estado && l.estado.toLowerCase() === 'vigente');
        activeLoans.sort((a, b) => new Date(b.fechaPrestamo) - new Date(a.fechaPrestamo));
        clientLoans.sort((a, b) => new Date(b.fechaPrestamo) - new Date(a.fechaPrestamo));

        const latestLoan = activeLoans.length > 0 ? activeLoans[0] : clientLoans[0];

        setPaymentForm(prev => ({
            ...prev,
            nombre: client.name || '',
            apellido: `${client.surname1 || ''} ${client.surname2 || ''}`.trim(),
            idVm: latestLoan.idVm || latestLoan.orderId || '',
            mesDesembolso: latestLoan.mesDesembolso || '',
            saldoInicial: latestLoan.valorPrestado || latestLoan.monto || '',
            cuotasPrestamo: latestLoan.cuotas || '',
            interesMensual: latestLoan.interesMensual || '',
            banco: latestLoan.banco || '',
            cuentaAhorros: latestLoan.cuentaAhorros || latestLoan.cuenta || '',
            estadoPrestamo: latestLoan.estado || '',
            itemQuantity: '',
            valorInteresesAmortizados: '',
            valorCuotaVariable: '',
            valorCuotaPago: '',
            saldoFinal: '',
            mesPago: '',
            fechaPagoMax: '',
            numeroTransaccion: '',
            observaciones: '',
            externalId: ''
        }));
        setIsEditing(false);
        setEditingId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paymentForm.clientId, editingId]);

    // ── Recalcular saldoFinal reactivamente ────────────────────────────────
    useEffect(() => {
        const saldoInicial = parseFloat(paymentForm.saldoInicial) || 0;
        const valorPago = parseFloat(paymentForm.valorCuotaPago) || 0;
        const intereses = parseFloat(paymentForm.valorInteresesAmortizados) || 0;
        const saldoFinal = saldoInicial + intereses - valorPago;

        setPaymentForm(prev => ({
            ...prev,
            saldoFinal: saldoFinal > 0 ? saldoFinal.toFixed(0) : '0'
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paymentForm.saldoInicial, paymentForm.valorInteresesAmortizados, paymentForm.valorCuotaPago]);

    // ── Abono extraordinario: cuánto se paga por encima de la cuota ──────────
    // Se calcula en vivo mientras el administrador escribe, porque de ese valor
    // depende que al guardar se reescriba o no el cronograma del préstamo.
    const excedenteAbono = Math.max(
        0,
        (parseFloat(paymentForm.valorCuotaPago) || 0) - (parseFloat(paymentForm.valorCuotaVariable) || 0)
    );

    // ── Toggle Activar/Desactivar (estado Pago <-> Pendiente) ─────────────────
    const handleToggle = async (payment) => {
        const newEstado = payment.estado === 'Pago' ? 'Pendiente' : 'Pago';
        setTogglingId(payment.id);
        try {
            await api.put(`/admin/payments/${payment.id}`, { ...payment, estado: newEstado });
            setPayments(prev => prev.map(p => p.id === payment.id ? { ...p, estado: newEstado } : p));
            toast.success(`Estado cambiado a "${newEstado}"`);
            notifyUpdate('payments');
        } catch (err) {
            toast.error('Error al cambiar estado: ' + (err.message || ''));
        } finally {
            setTogglingId(null);
        }
    };

    // ── Submit (crear/editar) ───────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true); // NO reusar `loading` — ese controla el skeleton de página completa y haría desaparecer el modal
        try {
            let paymentIdToUse = editingId;

            const payload = {
                externalId: paymentForm.externalId,
                clientId: paymentForm.clientId,
                mesDesembolso: paymentForm.mesDesembolso,
                cuotasPrestamo: paymentForm.cuotasPrestamo,
                interesMensual: paymentForm.interesMensual,
                valorInteresesAmortizados: paymentForm.valorInteresesAmortizados,
                fechaPagoMax: paymentForm.fechaPagoMax,
                mesPago: paymentForm.mesPago,
                valorCuotaVariable: paymentForm.valorCuotaVariable,
                estado: paymentForm.estado,
                valorCuotaPago: paymentForm.valorCuotaPago || 0,
                saldoFinal: paymentForm.saldoFinal,
                itemQuantity: paymentForm.itemQuantity,
                banco: paymentForm.banco,
                numeroTransaccion: paymentForm.numeroTransaccion,
                cuentaAhorros: paymentForm.cuentaAhorros,
                observaciones: paymentForm.observaciones,
                idVm: paymentForm.idVm,
                estadoPrestamo: paymentForm.estadoPrestamo,
                // Solo viaja cuando hay excedente; el backend la ignora si no lo hay.
                ...(excedenteAbono > 0 ? { politicaAbono } : {})
            };

            if (isEditing) {
                const res = await api.put(`/admin/payments/${editingId}`, payload);
                // El backend devuelve qué hizo con el excedente — o por qué no
                // pudo hacer nada. Decirlo importa: el administrador acaba de
                // provocar (o no) una reescritura del cronograma del préstamo.
                const abono = res.data?.abonoExtraordinario;
                if (abono?.aplicado) {
                    toast.success(
                        `Abono aplicado: ${formatCurrency(abono.excedente)} a capital. ` +
                        `El socio ahorra ${formatCurrency(abono.ahorroInteres)} en intereses` +
                        (abono.cuotasDespues < abono.cuotasAntes
                            ? ` y le quedan ${abono.cuotasDespues} cuotas en vez de ${abono.cuotasAntes}.`
                            : '.')
                    );
                } else if (abono) {
                    toast.error(`No se pudo aplicar el abono a capital. ${abono.motivo || ''}`);
                } else {
                    toast.success('Registro actualizado correctamente');
                }
            } else {
                const response = await api.post('/admin/payments', payload);
                paymentIdToUse = response.data.id;
                // Un pago registrado por encima de su cuota reescribe el
                // cronograma igual que al editarlo: hay que decirlo, no dejarlo
                // en un "registrado correctamente" que oculta la reescritura.
                const abonoNuevo = response.data?.abonoExtraordinario;
                if (abonoNuevo?.aplicado) {
                    toast.success(
                        `Pago registrado. Abono aplicado: ${formatCurrency(abonoNuevo.excedente)} a capital. ` +
                        (abonoNuevo.ahorroInteres > 0
                            ? `El socio ahorra ${formatCurrency(abonoNuevo.ahorroInteres)} en intereses`
                            : 'Las cuotas siguientes ya se recalcularon') +
                        (abonoNuevo.cuotasDespues < abonoNuevo.cuotasAntes
                            ? ` y le quedan ${abonoNuevo.cuotasDespues} cuotas en vez de ${abonoNuevo.cuotasAntes}.`
                            : '.')
                    );
                } else if (abonoNuevo) {
                    toast.error(`Pago registrado, pero no se pudo aplicar el abono a capital. ${abonoNuevo.motivo || ''}`);
                } else {
                    toast.success('Pago registrado correctamente');
                }
            }

            if (soporteFile && paymentIdToUse) {
                const formData = new FormData();
                formData.append('soporte', soporteFile);
                try {
                    await api.post(`/admin/payments/${paymentIdToUse}/soporte`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    toast.success('Soporte adjuntado correctamente');
                } catch (fileErr) {
                    console.error('Error uploading file:', fileErr);
                    toast.error('Guardado, pero falló la subida del soporte: ' + (fileErr.response?.data?.error || fileErr.message));
                }
            }

            handleCloseModal();
            refreshAll();
            // Guardar una cuota puede resolver —o crear— un abono pendiente.
            fetchAbonos();
            notifyUpdate('payments');
        } catch (error) {
            console.error('Error saving payment:', error);
            const msg = error.response?.data?.error || error.response?.data?.message || error.message || 'Error desconocido';
            toast.error('Error al guardar: ' + msg);
        } finally {
            setIsSaving(false);
        }
    };

    // ── Eliminar registro ────────────────────────────────────────────────────
    const handleDelete = async (payment) => {
        if (!window.confirm(`¿Eliminar el registro ${payment.externalId}?`)) return;
        setDeletingId(payment.id);
        try {
            await api.delete(`/admin/payments/${payment.id}`);
            toast.success('Registro eliminado correctamente');
            notifyUpdate('payments');
            refreshAll();
        } catch (err) {
            toast.error(err.message || 'Error al eliminar');
        } finally {
            setDeletingId(null);
        }
    };

    // ── Eliminar soporte ──────────────────────────────────────────────────────
    const handleDeleteSoporte = async (paymentId) => {
        if (!window.confirm('¿Eliminar el soporte adjunto? Esta acción no se puede deshacer.')) return;
        try {
            await api.delete(`/admin/payments/${paymentId}/soporte`);
            // soportesInfo se deriva de `payments` — parchar la fila localmente para que
            // el panel del modal se actualice sin tener que cerrarlo y reabrirlo.
            setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, soporte: null } : p));
            toast.success('Soporte eliminado correctamente');
        } catch (err) {
            toast.error('Error al eliminar el soporte: ' + (err.response?.data?.error || err.message));
        }
    };

    // ── Lookup de clientes por id (migrado: reemplaza a payment.Client, que no existe
    // en las filas de /payments/list — esas solo traen clientName ya concatenado, no
    // separable de forma confiable en nombre/apellido). Más robusto que la asociación
    // embebida original, que podía quedar vieja. ──
    const clientsById = useMemo(() => {
        const map = {};
        clients.forEach(c => { map[c.id] = c; });
        return map;
    }, [clients]);

    // ── Soporte por pago, derivado de /payments/list (ya trae soporte:{id,name} por
    // fila) en vez de mantenerse en un estado aparte que había que sincronizar a mano. ──
    const soportesInfo = useMemo(() => {
        const map = {};
        payments.forEach(p => { if (p.soporte) map[p.id] = { exists: true, id: p.soporte.id, name: p.soporte.name }; });
        return map;
    }, [payments]);

    // Socios activos con al menos un préstamo — para el selector "Customer_id" del modal
    const clientsWithActiveLoans = useMemo(() => {
        if (!clients || !disbursedLoans) return [];
        const clientIdsWithLoans = new Set(disbursedLoans.map(loan => loan.clientId?.toString()));
        return clients.filter(c => {
            const hasLoan = clientIdsWithLoans.has(c.id.toString());
            const isActive = c.estatus && c.estatus.toLowerCase().includes('activo');
            return hasLoan && isActive;
        });
    }, [clients, disbursedLoans]);

    // ── Opciones dinámicas de filtros (de los datos cargados) ──────────────
    const estadoOptions = useMemo(() =>
        [...new Set(payments.map(p => p.estado?.trim()).filter(Boolean))].sort(),
        [payments]);

    const estadoPrestamoOptions = useMemo(() =>
        [...new Set(payments.map(p => p.estadoPrestamo?.trim()).filter(Boolean))].sort(),
        [payments]);

    // Meses presentes en los datos, en orden calendario (no alfabético)
    const mesOptions = useMemo(() => {
        const present = new Set(payments.map(p => capitalizeMonth(p.mesPago)).filter(Boolean));
        return MONTH_LABELS_ES.filter(m => present.has(m));
    }, [payments]);

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

        // Filtro Mes de Pago — soporte de selección múltiple
        if (filterMes && filterMes.length > 0) {
            result = result.filter(p => filterMes.includes(capitalizeMonth(p.mesPago)));
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
    }, [payments, filterSearch, filterIdVm, filterEstado, filterEstadoPrestamo, filterMes, selectedYears]);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterSearch, filterIdVm, filterEstado, filterEstadoPrestamo, filterMes, selectedYears]);

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
        setFilterMes([]);
        setSelectedYears([new Date().getFullYear(), new Date().getFullYear() + 1]);
    };
    const hasActiveFilters = filterSearch || filterIdVm || filterEstado.length > 0 || filterEstadoPrestamo.length > 0 || filterMes.length > 0 || selectedYears.length !== 2 || selectedYears[0] !== new Date().getFullYear() || selectedYears[1] !== new Date().getFullYear() + 1;

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
            'N° Cuota': p.itemQuantity ?? '',
            'Total Cuotas': p.cuotasPrestamo,
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

    // ── Variables del selector de registros del modal "Registrar Pago" ────────
    const selectorUniqueClients = (() => {
        const idsWithPayments = new Set(payments.map(p => p.clientId).filter(Boolean));
        return Object.values(clientsById)
            .filter(c => idsWithPayments.has(c.id))
            .map(c => [c.id, c])
            .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
    })();

    const selectorUniqueIdVms = [...new Set(
        payments
            .filter(p => !selectorClientId || String(p.clientId) === String(selectorClientId))
            .map(p => p.idVm)
            .filter(Boolean)
    )].sort();

    const selectorAnyFilter = selectorSearch.trim() || selectorClientId || selectorIdVm || selectorMes || selectorEstado || selectorCuota;
    const selectorFiltered = selectorAnyFilter ? payments.filter(p => {
        const term = selectorSearch.toLowerCase().trim();
        if (term && !(p.externalId || '').toLowerCase().includes(term)) return false;
        if (selectorClientId && String(p.clientId) !== String(selectorClientId)) return false;
        if (selectorIdVm && (p.idVm || '').toLowerCase() !== selectorIdVm.toLowerCase()) return false;
        if (selectorMes && (p.mesPago || '').toLowerCase() !== selectorMes.toLowerCase()) return false;
        if (selectorEstado && p.estado !== selectorEstado) return false;
        if (selectorCuota && String(p.itemQuantity) !== String(selectorCuota)) return false;
        return true;
    }) : [];

    const selectorFieldCls = "flex h-10 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary outline-none transition-colors";
    const clearSelectorFilters = () => { setSelectorSearch(''); setSelectorClientId(''); setSelectorIdVm(''); setSelectorMes(''); setSelectorEstado(''); setSelectorCuota(''); };

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
                    <Button size="sm" onClick={() => handleOpenModal()} className="gap-1.5">
                        <Edit className="h-3.5 w-3.5" /> Registrar Pago
                    </Button>
                </div>
            </div>

            {/* Abonos a capital que siguen sin aplicarse.
                El barrido automático resuelve los casos claros por su cuenta, así
                que lo que normalmente aparece aquí son los que el sistema se negó
                a tocar: cronogramas heredados, préstamos en mora o abonos de un
                ejercicio ya cerrado. Esos necesitan una decisión de una persona. */}
            {abonos && (abonos.pendientes?.length > 0 || abonos.bloqueados?.length > 0) && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-semibold text-amber-900">
                                    {abonos.pendientes.length > 0
                                        ? `${abonos.pendientes.length} préstamo(s) con pagos por encima de la cuota sin abonar a capital`
                                        : `${abonos.bloqueados.length} préstamo(s) con sobrepago requieren revisión manual`}
                                </p>
                                {abonos.pendientes.length > 0 && (
                                    <p className="text-sm text-amber-800 mt-0.5">
                                        ${Math.round(abonos.resumen?.capitalPorAplicar || 0).toLocaleString('es-CO')} por abonar a capital
                                        {abonos.resumen?.ahorroEnIntereses > 0 && (
                                            <> · ${Math.round(abonos.resumen.ahorroEnIntereses).toLocaleString('es-CO')} de ahorro en intereses para los socios</>
                                        )}
                                    </p>
                                )}
                                <p className="text-xs text-amber-700 mt-1">
                                    El sistema aplica estos abonos solo, al arrancar y cada noche. Este botón adelanta esa revisión.
                                </p>
                            </div>
                        </div>
                        {abonos.pendientes.length > 0 && (
                            <Button size="sm" onClick={() => handleAplicarAbonos()} disabled={aplicandoAbonos} className="gap-1.5">
                                {aplicandoAbonos ? 'Aplicando…' : 'Aplicar ahora'}
                            </Button>
                        )}
                    </div>

                    {abonos.pendientes.length > 0 && (
                        <ul className="mt-3 space-y-2 text-sm text-amber-900">
                            {abonos.pendientes.slice(0, 6).map((p) => (
                                <li key={p.idVm} className="rounded-md border border-amber-200 bg-white/60 px-3 py-2">
                                    <div className="flex flex-wrap items-baseline gap-x-2">
                                        <span className="font-medium">{p.idVm}</span>
                                        <span>cuota {p.cuotaAbonada}:</span>
                                        <span className="font-medium">${Math.round(p.resumen.excedente).toLocaleString('es-CO')} a capital</span>
                                        {p.resumen.ahorroInteres > 0 && (
                                            <span className="text-amber-700">
                                                · ahorra ${Math.round(p.resumen.ahorroInteres).toLocaleString('es-CO')} en intereses
                                            </span>
                                        )}
                                        {p.resumen.cuotasDespues < p.resumen.cuotasAntes && (
                                            <span className="text-amber-700">
                                                · le quedan {p.resumen.cuotasDespues} cuotas en vez de {p.resumen.cuotasAntes}
                                            </span>
                                        )}
                                        {p.resumen.sobrante > 0 && (
                                            <span className="font-medium">
                                                · ${Math.round(p.resumen.sobrante).toLocaleString('es-CO')} a favor del socio, por devolver
                                            </span>
                                        )}
                                    </div>

                                    {/* La elección entre bajar la cuota o acortar el plazo es del socio.
                                        Se puede cambiar aquí y el efecto se recalcula al momento, antes
                                        de confirmar nada; queda guardada para los abonos siguientes. */}
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {[
                                            ['reducir-cuota', 'Bajar la cuota'],
                                            ['reducir-plazo', 'Acortar el plazo'],
                                        ].map(([val, etiqueta]) => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => handlePoliticaAbono(p.idVm, val)}
                                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${p.politica === val
                                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                                    : 'border-amber-300 bg-white text-amber-900 hover:border-emerald-500'}`}
                                            >
                                                {etiqueta}
                                            </button>
                                        ))}
                                        {p.origenPolitica === 'defecto' && (
                                            <span className="text-xs text-amber-700">por defecto del fondo</span>
                                        )}
                                        {p.origenPolitica === 'abono-anterior' && (
                                            <span className="text-xs text-amber-700">heredada del abono anterior</span>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleAplicarAbonos(p.idVm)}
                                            disabled={aplicandoAbonos}
                                            className="ml-auto"
                                        >
                                            Aplicar a este préstamo
                                        </Button>
                                    </div>
                                </li>
                            ))}
                            {abonos.pendientes.length > 6 && (
                                <li className="text-amber-700">… y {abonos.pendientes.length - 6} más.</li>
                            )}
                        </ul>
                    )}

                    {abonos.bloqueados.length > 0 && (
                        <div className="mt-3 border-t border-amber-200 pt-3">
                            <p className="text-sm font-medium text-amber-900">
                                Sin recalcular ({abonos.bloqueados.length}) — el cronograma no permite rehacerlo sin inventar cifras:
                            </p>
                            <ul className="mt-1 space-y-1 text-sm text-amber-800">
                                {abonos.bloqueados.slice(0, 5).map((b) => (
                                    <li key={b.idVm}>
                                        <span className="font-medium">{b.idVm}</span>
                                        {b.excedente > 0 && <> · ${Math.round(b.excedente).toLocaleString('es-CO')}</>}
                                        {' — '}{b.motivo}
                                    </li>
                                ))}
                                {abonos.bloqueados.length > 5 && (
                                    <li className="text-amber-700">… y {abonos.bloqueados.length - 5} más.</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
            )}

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
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Mes de Pago</label>
                        <StatusMultiSelect
                            options={mesOptions}
                            selectedValues={filterMes}
                            onChange={setFilterMes}
                            labelPrefix="Mes Pago"
                            icon={Calendar}
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
                                            <th className="sticky top-0 z-10 bg-brand-primary" style={{ textAlign: 'center', minWidth: '70px' }}>Activo</th>
                                            <th className="sticky top-0 z-10 bg-brand-primary" style={{ textAlign: 'center', minWidth: '90px' }}>Acciones</th>
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
                                                    <td style={{ textAlign: 'center' }}>
                                                        <ToggleSwitch
                                                            active={row.estado === 'Pago'}
                                                            onToggle={() => handleToggle(row)}
                                                            disabled={togglingId === row.id}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button type="button" onClick={() => handleOpenModal(row)} title="Editar" className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                                                                <Edit className="h-4 w-4 text-blue-500" />
                                                            </button>
                                                            <button type="button" onClick={() => handleDelete(row)} disabled={deletingId === row.id} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40">
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </button>
                                                        </div>
                                                    </td>
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

            {/* ═══════════════════════ MODAL REGISTRAR/EDITAR PAGO ═══════════════════════════════ */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-brand-primary">
                                {isEditing
                                    ? '✏️ Modificar Registro Estado Préstamo'
                                    : '🔍 Seleccionar Registro a Modificar'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
                        </div>

                        {/* ── FORMULARIO DE BÚSQUEDA MULTI-CAMPO (modo selector) ── */}
                        {selectingRecord ? (
                            <div className="p-6 space-y-5">
                                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-start gap-3">
                                    <Search className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-indigo-800">Filtrar registro a modificar</p>
                                        <p className="text-xs text-indigo-600 mt-0.5">Usa uno o más campos para encontrar el registro exacto. Los resultados se actualizan automáticamente.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Id_EP</label>
                                        <input type="text" autoFocus aria-label="Buscar pago por Id_EP" placeholder="Ej: P59, P122..." value={selectorSearch} onChange={e => setSelectorSearch(e.target.value)} className={selectorFieldCls} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Socio</label>
                                        <select
                                            aria-label="Socio"
                                            value={selectorClientId}
                                            onChange={e => {
                                                setSelectorClientId(e.target.value);
                                                setSelectorIdVm('');
                                            }}
                                            className={selectorFieldCls}
                                        >
                                            <option value="">— Todos los socios —</option>
                                            {selectorUniqueClients.map(([id, c]) => <option key={id} value={id}>{c.name} {c.surname1}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">
                                            Id VM (Préstamo)
                                            {selectorClientId && <span className="ml-1 text-indigo-500 font-normal normal-case">— filtrado por socio</span>}
                                        </label>
                                        <select aria-label="Préstamo (Id_VM)" value={selectorIdVm} onChange={e => setSelectorIdVm(e.target.value)} className={selectorFieldCls}>
                                            <option value="">— Todos —</option>
                                            {selectorUniqueIdVms.map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Mes de Pago</label>
                                        <select aria-label="Mes de pago" value={selectorMes} onChange={e => setSelectorMes(e.target.value)} className={selectorFieldCls}>
                                            <option value="">— Todos los meses —</option>
                                            {MONTH_LABELS_ES.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Estado</label>
                                        <select aria-label="Estado de la cuota" value={selectorEstado} onChange={e => setSelectorEstado(e.target.value)} className={selectorFieldCls}>
                                            <option value="">— Todos —</option>
                                            <option value="Pendiente">Pendiente</option>
                                            <option value="Pago">Pago</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide"># Cuota</label>
                                        <input type="number" min="1" aria-label="Filtrar por número de cuota" placeholder="Ej: 1, 2, 3..." value={selectorCuota} onChange={e => setSelectorCuota(e.target.value)} className={selectorFieldCls} />
                                    </div>
                                </div>

                                {selectorAnyFilter && (
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-gray-500">{selectorFiltered.length} resultado(s) encontrado(s)</p>
                                        <button type="button" onClick={clearSelectorFilters} className="text-xs text-red-500 hover:text-red-700 font-medium underline">Limpiar todos los filtros</button>
                                    </div>
                                )}

                                {!selectorAnyFilter && (
                                    <div className="text-center py-8 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                                        <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                        Selecciona al menos un filtro para ver registros
                                    </div>
                                )}

                                {selectorAnyFilter && selectorFiltered.length === 0 && (
                                    <div className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                                        No se encontraron registros con los filtros aplicados
                                    </div>
                                )}

                                {selectorAnyFilter && selectorFiltered.length > 0 && (
                                    <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                                        {selectorFiltered.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => handleOpenModal(p)}
                                                className="w-full text-left border-2 border-gray-200 hover:border-brand-primary rounded-lg px-4 py-3 transition-all group hover:shadow-md bg-white"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <span className="inline-flex items-center justify-center min-w-[60px] h-9 rounded-md bg-brand-primary/10 text-brand-primary font-bold text-sm px-2 group-hover:bg-brand-primary group-hover:text-white transition-colors">
                                                            {p.externalId}
                                                        </span>
                                                        <div>
                                                            <div className="font-semibold text-gray-900 text-sm">{clientsById[p.clientId]?.name} {clientsById[p.clientId]?.surname1}</div>
                                                            <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                                                                <span className="font-mono font-semibold">{p.idVm}</span>
                                                                <span className="text-gray-300">|</span>
                                                                <span>{p.mesPago}</span>
                                                                <span className="text-gray-300">|</span>
                                                                <span>Cuota #{p.itemQuantity}</span>
                                                                <span className="text-gray-300">|</span>
                                                                <span className="font-semibold text-gray-700">${parseFloat(p.valorCuotaVariable || 0).toLocaleString('es-CO')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${p.estado === 'Pago' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{p.estado}</span>
                                                        <Edit size={15} className="text-gray-300 group-hover:text-brand-primary transition-colors" />
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="flex justify-end pt-2 border-t">
                                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                                </div>
                            </div>
                        ) : (
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* SECCIÓN 1: IDENTIFICACIÓN */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div>
                                    <Label>1. Id_EP</Label>
                                    <select
                                        aria-label="Id_EP"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.externalId || ''}
                                        onChange={e => {
                                            const selectedId = e.target.value;
                                            setPaymentForm(prev => ({ ...prev, externalId: selectedId }));
                                            if (selectedId) {
                                                const found = payments.find(p => p.externalId === selectedId);
                                                if (found) handleOpenModal(found);
                                            }
                                        }}
                                    >
                                        <option value="">-- Seleccionar Id_EP --</option>
                                        {[...payments]
                                            .sort((a, b) => {
                                                const na = parseInt((a.externalId || '').replace(/\D/g, '') || '0');
                                                const nb = parseInt((b.externalId || '').replace(/\D/g, '') || '0');
                                                return nb - na;
                                            })
                                            .map(p => (
                                                <option key={p.id} value={p.externalId}>
                                                    {p.externalId}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <Label>2. Customer_id</Label>
                                    <select
                                        aria-label="Customer_id"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.clientId}
                                        onChange={e => {
                                            setIsEditing(false);
                                            setEditingId(null);
                                            setPaymentForm(prev => ({ ...prev, clientId: e.target.value }));
                                        }}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {(clientsWithActiveLoans || []).map(c => <option key={c.id} value={c.id}>{c.customerId || c.id} - {c.name} {c.surname1}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <Label>3. Nombre</Label>
                                    <Input
                                        value={paymentForm.nombre || ''}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, nombre: e.target.value }))}
                                        className="bg-white"
                                    />
                                </div>
                                <div>
                                    <Label>4. Apellido</Label>
                                    <Input
                                        value={paymentForm.apellido || ''}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, apellido: e.target.value }))}
                                        className="bg-white"
                                    />
                                </div>
                            </div>

                            {/* SECCIÓN 2: DETALLES PRÉSTAMO */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <Label>5. Mes Desembolso</Label>
                                    <Input
                                        value={paymentForm.mesDesembolso || ''}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, mesDesembolso: e.target.value }))}
                                        className="bg-white"
                                    />
                                </div>
                                <div>
                                    <Label>6. Saldo Inicial</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-900 font-bold">$</span>
                                        <FormattedNumberInput
                                            step="0.01"
                                            value={paymentForm.saldoInicial || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, saldoInicial: e.target.value }))}
                                            className="pl-7 bg-white text-green-900 font-bold border-green-200"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label>7. # Cuota a Pagar</Label>
                                    <select
                                        aria-label="# Cuota a pagar"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.itemQuantity}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, itemQuantity: e.target.value ? parseInt(e.target.value, 10) : '' }))}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {(() => {
                                            const realLoan = paymentForm.idVm
                                                ? disbursedLoans.find(l => (l.idVm || l.orderId) === paymentForm.idVm)
                                                : null;
                                            const maxCuotas = parseInt(realLoan?.cuotas || paymentForm.cuotasPrestamo || 12);
                                            return Array.from({ length: maxCuotas }, (_, i) => (
                                                <option key={i + 1} value={i + 1}>Cuota {i + 1}</option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                                <div>
                                    <Label>8. Interes Mensual (%)</Label>
                                    <div className="relative">
                                        <FormattedNumberInput
                                            isPercent={true}
                                            step="0.0001"
                                            min="0"
                                            max="1"
                                            value={paymentForm.interesMensual || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, interesMensual: e.target.value }))}
                                            className="bg-white font-medium"
                                            placeholder="Ej: 0.02 = 2%"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 3: AMORTIZACIÓN */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div>
                                    <Label>9. Valor Int. Amortizados</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-bold">$</span>
                                        <FormattedNumberInput
                                            step="0.01"
                                            value={paymentForm.valorInteresesAmortizados || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, valorInteresesAmortizados: e.target.value }))}
                                            className="pl-7 bg-white font-mono"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="payment-fecha-max">10. Fecha de Pago Max</Label>
                                    <input
                                        id="payment-fecha-max"
                                        type="date"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.fechaPagoMax || ''}
                                        onChange={e => {
                                            const val = e.target.value;
                                            let calculatedMes = paymentForm.mesPago;
                                            if (val) {
                                                const [, monthStr] = val.split('-');
                                                const mesIdx = parseInt(monthStr, 10) - 1;
                                                calculatedMes = MONTH_LABELS_ES[mesIdx] || calculatedMes;
                                            }
                                            setPaymentForm(prev => ({ ...prev, fechaPagoMax: val, mesPago: calculatedMes }));
                                        }}
                                    />
                                </div>
                                <div>
                                    <Label>11. Mes de Pago</Label>
                                    <select
                                        aria-label="Mes de pago"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.mesPago}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, mesPago: e.target.value }))}
                                    >
                                        <option value="">-- Seleccionar Mes --</option>
                                        {MONTH_LABELS_ES.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-blue-800 font-bold">12. Valor Cuota Variable</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-700 font-bold">$</span>
                                        <FormattedNumberInput
                                            step="0.01"
                                            value={paymentForm.valorCuotaVariable || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, valorCuotaVariable: e.target.value }))}
                                            className="pl-7 bg-white font-bold text-blue-700 text-lg border-blue-300"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 4: ESTADO Y SALDOS */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-green-50 p-4 rounded-lg border border-green-100">
                                <div>
                                    <Label>13. Estado</Label>
                                    <select
                                        aria-label="Estado de la cuota"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                        value={paymentForm.estado}
                                        onChange={e => setPaymentForm({ ...paymentForm, estado: e.target.value })}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {estadoOptions.map(est => (
                                            <option key={est} value={est}>{est}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-green-800 font-bold">14. Valor Cuota Pago</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">$</span>
                                        <FormattedNumberInput step="0.01" className="pl-7 border-green-500 font-bold text-lg" value={paymentForm.valorCuotaPago} onChange={e => setPaymentForm({ ...paymentForm, valorCuotaPago: e.target.value })} required />
                                    </div>
                                </div>

                                {/* Aviso de abono extraordinario.
                                    Guardar un pago mayor que la cuota reescribe el cronograma del
                                    préstamo, y hasta ahora eso ocurría sin que la pantalla lo
                                    dijera. Aquí se anuncia antes de guardar, con el excedente a la
                                    vista y la política a elegir — que es una decisión del socio,
                                    no del sistema. */}
                                {excedenteAbono > 0 && (
                                    <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                            <span className="text-sm font-bold text-amber-900">Abono extraordinario a capital</span>
                                            <span className="text-sm text-amber-800">
                                                paga {formatCurrency(paymentForm.valorCuotaPago)} sobre una cuota de {formatCurrency(paymentForm.valorCuotaVariable)}.
                                                <strong className="ml-1">Los {formatCurrency(excedenteAbono)} de diferencia irán a capital.</strong>
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-amber-800">
                                            Al guardar se recalculará el saldo y los intereses de las cuotas pendientes
                                            posteriores a esta. No se tocan las ya pagadas, las anteriores que sigan
                                            debiéndose, ni las que estén en mora.
                                        </p>
                                        <p className="mt-3 text-xs font-bold text-amber-900">
                                            ¿Qué se hace con ese abono?
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap gap-2">
                                            {[
                                                ['reducir-cuota', 'Reducir la cuota', 'mismo plazo, cuotas más bajas', true],
                                                ['reducir-plazo', 'Reducir el plazo', 'misma cuota, termina antes', false],
                                            ].map(([val, titulo, nota, esDefecto]) => (
                                                <button
                                                    key={val}
                                                    type="button"
                                                    onClick={() => setPoliticaAbono(val)}
                                                    className={`flex-1 min-w-[190px] rounded-lg border px-3 py-2 text-left transition-colors ${politicaAbono === val
                                                        ? 'border-amber-600 bg-white ring-1 ring-amber-600'
                                                        : 'border-amber-200 bg-white/60 hover:bg-white'}`}
                                                >
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="text-sm font-bold text-amber-900">{titulo}</span>
                                                        {esDefecto && (
                                                            <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                                                por defecto
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="block text-xs text-amber-700">{nota}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <p className="mt-2 text-[11px] text-amber-700">
                                            Reducir el plazo le ahorra más intereses al socio; reducir la cuota conserva más
                                            rendimiento para el fondo. La elección es del socio.
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <Label className="text-red-800 font-bold">15. Saldo Final</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-700 font-bold">$</span>
                                        <FormattedNumberInput
                                            step="0.01"
                                            value={paymentForm.saldoFinal || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, saldoFinal: e.target.value }))}
                                            className="pl-7 bg-white font-bold text-red-700"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label>16. Total Cuotas Plan <span className="ml-1 text-xs font-normal text-gray-400">(informativo)</span></Label>
                                    <Input
                                        type="number"
                                        readOnly
                                        value={(() => {
                                            if (!paymentForm.idVm) return paymentForm.cuotasPrestamo || '';
                                            const loan = disbursedLoans.find(l => (l.idVm || l.orderId) === paymentForm.idVm);
                                            return loan?.cuotas ?? paymentForm.cuotasPrestamo ?? '';
                                        })()}
                                        className="bg-gray-50 text-gray-500 cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            {/* SECCIÓN 5: DETALLES */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <Label>17. Banco Desembolsado</Label>
                                    <select
                                        aria-label="Banco desembolsado"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.banco}
                                        onChange={e => setPaymentForm({ ...paymentForm, banco: e.target.value })}
                                    >
                                        <option value="">-- Seleccionar Banco --</option>
                                        {COLOMBIAN_BANKS_WITH_OTHER.map(bank => (
                                            <option key={bank} value={bank}>{bank}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label>18. # Transaccion</Label>
                                    <Input value={paymentForm.numeroTransaccion} onChange={e => setPaymentForm({ ...paymentForm, numeroTransaccion: e.target.value })} />
                                </div>
                                <div>
                                    <Label>19. Cuenta de Ahorros</Label>
                                    <Input value={paymentForm.cuentaAhorros} onChange={e => setPaymentForm({ ...paymentForm, cuentaAhorros: e.target.value })} />
                                </div>
                                <div>
                                    <Label>20. Observaciones</Label>
                                    <Input value={paymentForm.observaciones} onChange={e => setPaymentForm({ ...paymentForm, observaciones: e.target.value })} />
                                </div>
                            </div>

                            {/* SECCIÓN 6: RELACIÓN PRÉSTAMO */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                <div>
                                    <Label>21. Id_VM (Ref. Préstamo)</Label>
                                    <select
                                        aria-label="Id_VM (Ref. préstamo)"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                        value={paymentForm.idVm}
                                        onChange={e => {
                                            const loan = disbursedLoans.find(l => (l.idVm === e.target.value || l.orderId === e.target.value));
                                            if (loan) {
                                                const existingPaymentsCount = payments.filter(p => p.idVm === (loan.idVm || loan.orderId)).length;
                                                setPaymentForm(prev => ({
                                                    ...prev,
                                                    idVm: e.target.value,
                                                    mesDesembolso: loan.mesDesembolso,
                                                    saldoInicial: loan.valorPrestado || loan.monto,
                                                    cuotasPrestamo: loan.cuotas,
                                                    interesMensual: loan.interesMensual,
                                                    estadoPrestamo: loan.estado,
                                                    banco: loan.banco,
                                                    cuentaAhorros: loan.cuentaAhorros,
                                                    itemQuantity: (existingPaymentsCount + 1).toString()
                                                }));
                                            } else {
                                                setPaymentForm(prev => ({ ...prev, idVm: e.target.value }));
                                            }
                                        }}
                                    >
                                        <option value="">-- Manual / Ninguno --</option>
                                        {(disbursedLoans || [])
                                            .filter(l => l && l.clientId && (!paymentForm.clientId || l.clientId.toString() === paymentForm.clientId.toString()))
                                            .map(l => (
                                                <option key={l.id} value={l.idVm || l.orderId}>
                                                    {l.idVm || l.orderId} - {l.estado} (${parseFloat(l.valorPrestado || l.monto || 0).toLocaleString()})
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>
                                <div>
                                    <Label>22. Estado Préstamo</Label>
                                    {/* Solo lectura a propósito: es el estado REAL del préstamo (idVm),
                                        no un campo independiente del pago — el backend ya lo deriva del
                                        préstamo al guardar; esto solo lo muestra. */}
                                    <div className={`flex h-10 w-full items-center rounded-md border px-3 text-sm font-semibold ${
                                        (paymentForm.estadoPrestamo || '').toLowerCase().includes('vigente') ? 'bg-blue-50 border-blue-200 text-blue-700'
                                        : (paymentForm.estadoPrestamo || '').toLowerCase().includes('cancel') ? 'bg-gray-100 border-gray-200 text-gray-500'
                                        : 'bg-amber-50 border-amber-200 text-amber-700'
                                    }`}>
                                        {paymentForm.estadoPrestamo || 'Sin préstamo asociado'}
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 7: SOPORTE DE PAGO */}
                            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 space-y-3">
                                <Label className="text-gray-800 font-bold block">23. Subir Registro de Pago (Soporte)</Label>

                                {isEditing && soportesInfo[editingId] && !soporteFile && (
                                    <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <FileDown className="h-5 w-5 text-blue-600 shrink-0" />
                                            <div>
                                                <p className="text-sm font-semibold text-blue-800">Soporte adjunto</p>
                                                <p className="text-xs text-blue-600">{soportesInfo[editingId].name}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadSoporte(editingId, soportesInfo[editingId].name)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
                                            >
                                                <FileDown className="h-3.5 w-3.5" /> Descargar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSoporte(editingId)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                                            >
                                                <X className="h-3.5 w-3.5" /> Eliminar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div
                                    className={`relative border-2 border-dashed rounded-lg p-6 transition-all duration-200 ease-in-out text-center ${soporteFile
                                        ? 'border-brand-primary bg-brand-primary/5'
                                        : 'border-gray-300 hover:border-brand-primary hover:bg-gray-50'
                                        }`}
                                >
                                    <input
                                        type="file"
                                        aria-label="Subir soporte de pago"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        accept=".jpg,.jpeg,.png,.pdf"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                setSoporteFile(e.target.files[0]);
                                            }
                                        }}
                                    />
                                    <div className="flex flex-col items-center justify-center space-y-2">
                                        {soporteFile ? (
                                            <>
                                                <div className="bg-brand-primary/20 p-3 rounded-full">
                                                    <FileDown className="h-6 w-6 text-brand-primary" />
                                                </div>
                                                <p className="text-sm font-medium text-gray-900">{soporteFile.name}</p>
                                                <p className="text-xs text-gray-500">{(soporteFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                <div className="z-10 relative mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setSoporteFile(null);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                                                    >
                                                        <X className="h-3.5 w-3.5" /> Eliminar Archivo
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="bg-gray-100 p-3 rounded-full">
                                                    <Plus className="h-6 w-6 text-gray-400" />
                                                </div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {isEditing && soportesInfo[editingId]
                                                        ? 'Arrastra para reemplazar el soporte actual'
                                                        : <>
                                                            Arrastra una imagen/PDF aquí o <span className="text-brand-primary">explora</span>
                                                          </>}
                                                </p>
                                                <p className="text-xs text-gray-500">JPG, PNG o PDF (Máximo 10MB)</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button type="button" variant="outline" onClick={handleCloseModal}>Cancelar</Button>
                                <Button type="submit" size="lg" disabled={isSaving}>
                                    {isSaving ? 'Guardando...' : '💾 Actualizar Registro'}
                                </Button>
                            </div>
                        </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentsListPage;
