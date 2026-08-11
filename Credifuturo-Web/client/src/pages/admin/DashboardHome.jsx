import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../config/api';
import {
    Users, DollarSign, AlertTriangle, PiggyBank, BarChart3,
    Save, CheckCircle, XCircle, AlertCircle, X, RefreshCw, Database, TrendingUp, Landmark, Activity,
    ShieldCheck, FileDown, Clock, Calendar, ChevronDown, Edit2
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useUi } from '../../context/UiContext';
import DataTable from '../../components/ui/DataTable';
import nuLogo from '../../assets/nu-logo.png';
import nuBg from '../../assets/nu-bg.png';
import logo from '../../assets/logo.jpg';
import YearMultiSelect from '../../components/admin/YearMultiSelect';
import FinancialChart from '../../components/admin/FinancialChart';
import RiskReturnIndicators from '../../components/admin/RiskReturnIndicators';
import { useVisibilidad } from '../../context/VisibilidadContext';

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, description, icon: Icon, color, onClick, customBg, isDark = false, textColor }) => {
    const isLoading = value === '...' || value === '…';
    const strValue = String(value ?? '');
    const valueFontClass = strValue.length > 12 ? 'text-base' : strValue.length > 9 ? 'text-xl' : 'text-2xl';
    const valueColorClass = textColor || (isDark ? 'text-white' : 'text-gray-900');
    return (
        <Card
            className={`transition-all duration-200 overflow-hidden relative ${onClick ? 'cursor-pointer hover:shadow-md hover:border-brand-primary/20 active:scale-[0.99]' : ''}`}
            style={customBg ? { background: customBg, border: 'none' } : {}}
            onClick={onClick}
        >
            {/* Icono flotante arriba a la derecha */}
            <div className="absolute top-3 right-3 z-10 opacity-80">
                {typeof Icon === 'string' ? (
                    <img src={Icon} alt="" className="h-8 w-auto object-contain" />
                ) : (
                    <Icon className={`h-7 w-7 ${color}`} />
                )}
            </div>
            {/* pr-10 garantiza zona libre para el ícono en columnas estrechas */}
            <CardHeader className="pb-1 pt-5 relative z-10 text-center pr-10">
                <CardTitle className={`text-sm font-medium leading-snug ${isDark ? 'text-white/90' : 'text-gray-500'}`}>{title}</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 text-center pb-5 pr-10">
                {isLoading ? (
                    <div className={`mx-auto h-7 w-24 rounded-md animate-pulse ${isDark ? 'bg-white/25' : 'bg-gray-200/80'}`} />
                ) : (
                    <div className={`${valueFontClass} font-bold leading-tight ${valueColorClass}`}>{value}</div>
                )}
                <p className={`text-xs mt-1 font-bold ${isDark ? 'text-white/80' : 'text-gray-500'}`}>{description}</p>
            </CardContent>
        </Card>
    );
};

// ─── Validate DB Modal ────────────────────────────────────────────────────────
const ValidateModal = ({ result, onClose }) => {
    if (!result) return null;
    const allOk = result.ok && !result.hasWarnings;

    const statusIcon = (status) => {
        if (status === 'OK') return <CheckCircle className="h-4 w-4 text-emerald-500" />;
        if (status === 'WARN') return <AlertCircle className="h-4 w-4 text-amber-500" />;
        return <XCircle className="h-4 w-4 text-red-500" />;
    };

    const statusBadge = (status) => {
        const map = {
            OK: 'bg-emerald-100 text-emerald-800',
            WARN: 'bg-amber-100 text-amber-800',
            ERROR: 'bg-red-100 text-red-800'
        };
        return `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || map.ERROR}`;
    };

    const formattedTime = new Date(result.timestamp).toLocaleString('es-CO');

    return (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">

                {/* Header */}
                <div className={`p-6 flex items-center justify-between ${allOk ? 'bg-emerald-50 border-b border-emerald-100' : result.hasWarnings ? 'bg-amber-50 border-b border-amber-100' : 'bg-red-50 border-b border-red-100'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-full ${allOk ? 'bg-emerald-100' : result.hasWarnings ? 'bg-amber-100' : 'bg-red-100'}`}>
                            <Database className={`h-6 w-6 ${allOk ? 'text-emerald-600' : result.hasWarnings ? 'text-amber-600' : 'text-red-600'}`} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-brand-primary">
                                {allOk ? '✅ Base de Datos Validada' : result.hasWarnings ? '⚠️ Validación con Advertencias' : '❌ Error en Validación'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">{formattedTime}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/10 transition-colors">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Table results */}
                <div className="p-0">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-3 text-left">Tabla</th>
                                <th className="px-6 py-3 text-center">Registros</th>
                                <th className="px-6 py-3 text-left">Detalle</th>
                                <th className="px-6 py-3 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {result.summary?.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50/50">
                                    <td className="px-6 py-3 font-medium text-gray-900">{row.table}</td>
                                    <td className="px-6 py-3 text-center">
                                        <span className="tabular-nums font-mono font-semibold text-gray-800">{row.count.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-3 text-gray-500 text-xs">{row.message}</td>
                                    <td className="px-6 py-3 text-center">
                                        <span className={statusBadge(row.status)}>
                                            {statusIcon(row.status)}
                                            {row.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {result.totals && (
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                                <tr>
                                    <td className="px-6 py-3 font-bold text-gray-800 text-sm">Total General</td>
                                    <td className="px-6 py-3 text-center font-bold text-gray-800 tabular-nums font-mono">
                                        {(result.totals.totalClients + result.totals.totalSavings + result.totals.totalLoans + result.totals.totalPayments).toLocaleString()}
                                    </td>
                                    <td colSpan={2} className="px-6 py-3 text-xs text-gray-400">
                                        Todos los datos están almacenados correctamente en el servidor.
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <Button onClick={onClose} size="lg">
                        Aceptar
                    </Button>
                </div>
            </div>
        </div>
    );
};

const MoraModal = ({ details, onClose }) => {
    if (!details || details.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-red-600 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6" />
                        <h3 className="text-xl font-bold">Detalle de Cartera en Mora</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[70vh] overflow-y-auto p-0">
                    <div className="bg-red-50 px-6 py-3 border-b border-red-100 italic text-red-700 text-sm">
                        Socios con ahorros pendientes desde el 1 de enero hasta hoy
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Socio / Cédula</th>
                                <th className="px-6 py-3 text-center">Meses Pendientes</th>
                                <th className="px-6 py-3 text-right">Penalización</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {details.map((socio) => (
                                <tr key={socio.clientId} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                                <Users className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900">{socio.nombre}</div>
                                                <div className="text-xs text-gray-500">{socio.cedula}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700 font-bold text-sm">
                                            {socio.mesesPendientes.length}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="font-bold text-red-600">
                                            ${Number(socio.penalizacion).toLocaleString('es-CO')}
                                        </div>
                                        <div className="text-[10px] text-gray-400">
                                            {socio.diasDesdeDia11} días de mora
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <Button onClick={onClose} size="lg">
                        Cerrar Detalle
                    </Button>
                </div>
            </div>
        </div>
    );
};

const MoraEPModal = ({ details, onClose }) => {
    if (!details || details.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-red-600 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6" />
                        <h3 className="text-xl font-bold">Detalle de Cartera en Mora EP</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[70vh] overflow-y-auto p-0">
                    <div className="bg-red-50 px-6 py-3 border-b border-red-100 italic text-red-700 text-sm">
                        Registros de Cuotas Pendientes con fecha vencida
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Socio / Cédula / Id VM</th>
                                <th className="px-6 py-3 text-center">Mes</th>
                                <th className="px-6 py-3 text-right">Monto Deuda</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {details.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                                <Users className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900">{item.nombre}</div>
                                                <div className="text-xs text-gray-500">{item.cedula}</div>
                                                <div className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {item.idVm || '—'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="text-xs font-bold text-gray-700">{item.mes}</div>
                                        <div className="text-[10px] text-gray-400 font-mono">{item.fecha}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="font-bold text-red-600">
                                            ${Math.round(Number(item.valor)).toLocaleString('es-CO')}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <Button onClick={onClose} size="lg">
                        Cerrar Detalle
                    </Button>
                </div>
            </div>
        </div>
    );
};

const PenaltyModal = ({ details, onClose }) => {
    if (!details || details.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-amber-500 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <DollarSign className="h-6 w-6" />
                        <h3 className="text-xl font-bold">Detalle de Penalidades Pagadas</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[70vh] overflow-y-auto p-0">
                    <div className="bg-amber-50 px-6 py-3 border-b border-amber-100 italic text-amber-700 text-sm">
                        Registros con penalización pagada en el año actual
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Socio / Cédula</th>
                                <th className="px-6 py-3 text-center">Fecha / Mes</th>
                                <th className="px-6 py-3 text-right">Valor Penalizado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {details.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                                <Users className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900">{item.nombre}</div>
                                                <div className="text-xs text-gray-500">{item.cedula}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="text-xs font-bold text-gray-700">{item.mes}</div>
                                        <div className="text-[10px] text-gray-400 font-mono">{item.fecha}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="font-bold text-amber-600">
                                            ${Number(item.valor).toLocaleString('es-CO')}
                                        </div>
                                        <div className="text-[10px] text-gray-400">
                                            {item.dias} días de penalización
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <Button onClick={onClose} size="lg" className="bg-amber-500 hover:bg-amber-600">
                        Cerrar Detalle
                    </Button>
                </div>
            </div>
        </div>
    );
};

// (Se retiró aquí el componente ComparativeChart. Comparaba el acumulado del año
// en curso contra el mismo tramo MEDIDO del año anterior, y cuando ese tramo era
// pequeño el porcentaje se disparaba: con los intereses reales de 2025 —$104.460
// hasta agosto frente a $1.206.913 del año completo— marcaba "+1.472,6%". Lo
// reemplaza components/admin/YearProgressCard.jsx, que compara contra el ritmo
// del año anterior y presenta el avance en lenguaje llano.)


// (Se retiró aquí el componente SavingsByYearChart: reemplazado por
// YearProgressCard, que ahora también rinde el gráfico de Ahorro de los
// Socios con el mismo formato que Préstamos/Patrimonio/Intereses/NU/Mora.)



// FinancialChart (Panel de Inteligencia Financiera & Actividad, con el
// comparador interanual y el diagnóstico) se extrajo a
// components/admin/FinancialChart.jsx: lo reutiliza también
// pages/admin/FinancialIntelligencePage.jsx, la página dedicada para
// socios, sin duplicar ~1160 líneas entre los dos archivos.

// ─── Dashboard Home ───────────────────────────────────────────────────────────
const DashboardHome = () => {
    const { esVisible } = useVisibilidad();
    const { toast, navigate } = useUi();
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();
    const isAdmin = user.role === 'admin';
    const [statusFilter, setStatusFilter] = useState('Activo');
    const [selectedYears, setSelectedYears] = useState([new Date().getFullYear(), new Date().getFullYear() + 1]);
    const [availableStatuses, setAvailableStatuses] = useState([]);
    const [stats, setStats] = useState({
        clientsCount: 0,
        activeClientsCount: 0,
        inactiveClientsCount: 0,
        totalSavings: 0,
        carteraActiva: 0,
        carteraDia: 0,
        carteraDiaCount: 0,
        carteraActivaCount: 0,
        totalPrestamos: 0,
        totalPrestamosCount: 0,
        totalIntereses: 0,
        totalPrestamosMasIntereses: 0,
        totalCuotasPagadas: 0,
        recaudoCuotasCount: 0,
        totalInteresesPagados: 0,
        totalInitialContributions: 0,
        totalAhorradoGeneral: 0,
        totalNetoActivos: 0,
        ahorroPorAnio: [],
        totalPenaltyDays: 0,
        totalPenaltyValue: 0,
        rentabilidadCajaNU: 0,
        saldoEnBanco: 0,
        carteraMora: 0,
        moraCarteraEP: 0,
        sociosMoraCount: 0,
        detalleMora: [],
        detalleMoraEP: [],
        detallePenalidad: [],
        recentSavings: [],
        recentPayments: [],
        proximosVencimientos30d: { count: 0, monto: 0, socios: 0 },
        sociosAlDiaMes: { count: 0, total: 0 }
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [validateResult, setValidateResult] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showMoraModal, setShowMoraModal] = useState(false);
    const [showMoraEPModal, setShowMoraEPModal] = useState(false);
    const [showPenaltyModal, setShowPenaltyModal] = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [showNUModal, setShowNUModal] = useState(false);
    const [nuInputRaw, setNuInputRaw] = useState('');
    // Meta anual de ganancia: editable por el admin (AppSettings.metaGananciaAnual)
    const [showMetaModal, setShowMetaModal] = useState(false);
    const [metaInputRaw, setMetaInputRaw] = useState('');
    const [metaSaving, setMetaSaving] = useState(false);
    const [nuSaving, setNuSaving] = useState(false);
    const reportRef = useRef(null);

    // ── Load distinct statuses from clients table on mount ─────────────────────
    useEffect(() => {
        api.get('/admin/clients/list')
            .then(res => {
                if (res.data?.ok && Array.isArray(res.data.data)) {
                    const unique = [...new Set(
                        res.data.data
                            .map(c => c.estatus?.trim())
                            .filter(Boolean)
                    )].sort();
                    setAvailableStatuses(unique);
                }
            })
            .catch(() => {/* silently ignore: fallback rendered below */ });
    }, []);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const yearsParam = selectedYears.length > 0 ? `&years=${selectedYears.join(',')}` : '';
            const res = await api.get(`/admin/dashboard-stats?status=${encodeURIComponent(statusFilter)}${yearsParam}`);
            // Updated setStats to include new fields
            if (res.data) {
                setStats({
                    clientsCount: res.data.clientsCount || 0,
                    activeClientsCount: res.data.activeClientsCount || 0,
                    inactiveClientsCount: res.data.inactiveClientsCount || 0,
                    totalSavings: res.data.totalSavings || 0,
                    carteraActiva: res.data.carteraActiva || 0,
                    carteraDia: res.data.carteraDia || 0,
                    carteraDiaCount: res.data.carteraDiaCount || 0,
                    carteraActivaCount: res.data.carteraActivaCount || 0,
                    pendingInstallmentsCount: res.data.pendingInstallmentsCount || 0,
                    totalPrestamos: res.data.totalPrestamos || 0,
                    totalPrestamosCount: res.data.totalPrestamosCount || 0,
                    totalIntereses: res.data.totalIntereses || 0,
                    totalPrestamosMasIntereses: res.data.totalPrestamosMasIntereses || 0,
                    totalCuotasPagadas: res.data.totalCuotasPagadas || 0,
                    recaudoCuotasCount: res.data.recaudoCuotasCount || 0,
                    totalInteresesPagados: res.data.totalInteresesPagados || 0,
                    totalInitialContributions: res.data.totalInitialContributions || 0,
                    totalAhorradoGeneral: res.data.totalAhorradoGeneral || 0,
                    totalNetoActivos: res.data.totalNetoActivos || 0,
                    ahorroPorAnio: res.data.ahorroPorAnio || [],
                    totalPenaltyDays: res.data.totalPenaltyDays || 0,
                    totalPenaltyValue: res.data.totalPenaltyValue || 0,
                    descuentoAnualVigente: res.data.descuentoAnualVigente || 0,
                    rentabilidadCajaNU: res.data.rentabilidadCajaNU || 0,
                    saldoEnBanco: res.data.saldoEnBanco || 0,
                    carteraMora: res.data.carteraMora || 0,
                    moraCarteraEP: res.data.moraCarteraEP || 0,
                    sociosMoraCount: res.data.sociosMoraCount || 0,
                    detalleMora: res.data.detalleMora || [],
                    detalleMoraEP: res.data.detalleMoraEP || [],
                    detallePenalidad: res.data.detallePenalidad || [],
                    recentSavings: res.data.recentSavings || [],
                    recentPayments: res.data.recentPayments || [],
                    proximosVencimientos30d: res.data.proximosVencimientos30d || { count: 0, monto: 0, socios: 0 },
                    sociosAlDiaMes: res.data.sociosAlDiaMes || { count: 0, total: 0 },
                    // FIX: este objeto se venía perdiendo por completo — el backend ya calculaba
                    // baselines dinámicos (prestamos/intereses/mora desde la BD, patrimonio/meta/nu
                    // desde AppSettings) pero nunca llegaban al render, así que TODO baseline en
                    // esta página caía siempre al valor hardcodeado de respaldo en el JS, nunca al
                    // real. Con esto, stats.baselines.* refleja lo que de verdad calculó el backend.
                    baselines: res.data.baselines || {},
                    timestamp: res.data.timestamp
                });
            }
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            toast.error('Error al cargar estadísticas del panel');
        } finally {
            setLoading(false);
            setLastUpdated(new Date());
        }
    }, [toast, statusFilter, selectedYears]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    // Serie/eficiencia de recaudo del año en curso — misma fuente que ExecutivePanelPage,
    // para que "Estimado al cierre del año" nunca contradiga al Panel Ejecutivo.
    const [execStats, setExecStats] = useState(null);
    useEffect(() => {
        api.get('/admin/executive-stats')
            .then(res => setExecStats(res.data))
            .catch(() => {/* la tabla usa optional chaining; sin esto solo pierde el rango de proyección */ });
    }, []);

    // Serie mensual por año — habilita comparar el año en curso contra años
    // anteriores AL MISMO CORTE del calendario. Sin esto, la única comparación
    // posible era "lo que llevamos" contra "un año completo", que siempre pinta
    // el año en curso como si fuera peor.
    const [yearCmp, setYearCmp] = useState(null);
    const [yearCmpError, setYearCmpError] = useState(false);
    useEffect(() => {
        api.get('/admin/year-comparison')
            .then(res => { setYearCmp(res.data); setYearCmpError(false); })
            .catch(() => {
                // Si esto falla, los indicadores que dependen del corte se declaran
                // "sin comparativo" en vez de caer al cociente engañoso contra el año
                // completo. Es preferible no dar un número a dar uno equivocado.
                setYearCmpError(true);
            });
    }, []);

    // Actualizar stats ante cualquier mutación de datos en la app
    useEffect(() => {
        const handler = () => fetchStats();
        const events = ['dataUpdated', 'paymentsUpdated', 'savingsUpdated', 'loansUpdated', 'clientsUpdated'];
        events.forEach(e => window.addEventListener(e, handler));
        return () => events.forEach(e => window.removeEventListener(e, handler));
    }, [fetchStats]);

    // Detectar actualizaciones desde otras pestañas/rutas via localStorage
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'lastDataUpdate' || e.key === 'paymentsLastUpdate' ||
                e.key === 'savingsLastUpdate' || e.key === 'loansLastUpdate' || e.key === 'clientsLastUpdate') {
                fetchStats();
                localStorage.setItem('dashboardLastFetched', e.newValue);
            }
        };
        // Chequeo inicial por si otra ruta actualizó antes de montar
        const lastUpdate = localStorage.getItem('lastDataUpdate');
        const lastFetched = localStorage.getItem('dashboardLastFetched');
        if (lastUpdate && lastUpdate !== lastFetched) {
            fetchStats();
            localStorage.setItem('dashboardLastFetched', lastUpdate);
        }
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, [fetchStats]);

    // Auto-refresh cada 30 segundos como fallback
    useEffect(() => {
        const interval = setInterval(() => fetchStats(), 30000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    const handleCardClick = (path, params = {}) => {
        const queryParams = new URLSearchParams(params);
        if (statusFilter !== 'Todos') {
            queryParams.append('status', statusFilter);
        }
        navigate(`${path}?${queryParams.toString()}`);
    };

    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            const res = await api.post('/admin/validate-db');
            setValidateResult(res.data);
            setShowModal(true);
            if (res.data.ok && !res.data.hasWarnings) {
                toast.success('Base de datos validada correctamente. Todos los cambios están guardados.');
            } else if (res.data.hasWarnings) {
                toast.error('Validación completada con advertencias. Revisa el detalle.');
            } else {
                toast.error('Error durante la validación. Revisa el detalle.');
            }
        } catch (err) {
            console.error('validate-db error:', err);
            toast.error('No se pudo conectar con el servidor para validar.');
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateReport = async () => {
        if (!reportRef.current) return;
        setGeneratingPdf(true);
        try {
            const fechaHoy = new Date();
            const fechaStr = fechaHoy.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
            const horaStr = fechaHoy.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

            // ── Convertir logo a base64 ─────────────────────────────────────────
            const getLogoBase64 = (url) => new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth; c.height = img.naturalHeight;
                    c.getContext('2d').drawImage(img, 0, 0);
                    resolve(c.toDataURL('image/jpeg'));
                };
                img.onerror = () => resolve(null);
                img.src = url;
            });
            const logoBase64 = await getLogoBase64(logo);

            // ── Medir fronteras de sección ANTES de capturar ─────────────────────
            // Combina hijos directos + elementos marcados con data-pdf-section
            // para detectar sub-secciones anidadas (FinancialChart, Comparativa, etc.)
            const SCALE = 3;
            const containerEl = reportRef.current;
            const containerRect = containerEl.getBoundingClientRect();
            const sectionBoundaries = (() => {
                const tops = [];
                Array.from(containerEl.children)
                    .filter(el => el.dataset.html2canvasIgnore !== 'true')
                    .forEach(el => tops.push(el.getBoundingClientRect().top));
                Array.from(containerEl.querySelectorAll('[data-pdf-section="true"]'))
                    .forEach(el => tops.push(el.getBoundingClientRect().top));
                return [...new Set(tops)]
                    .map(top => (top - containerRect.top) * SCALE)
                    .filter(pos => pos > 120)
                    .sort((a, b) => a - b);
            })();

            // ── Deshabilitar overflow-hidden de ancestros para que las SVG/Recharts no se clípen ──
            const overflowFixes = [];
            let ancestor = containerEl.parentElement;
            while (ancestor && ancestor !== document.body) {
                const cs = window.getComputedStyle(ancestor);
                if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') {
                    overflowFixes.push({ el: ancestor, overflow: ancestor.style.overflow, overflowX: ancestor.style.overflowX });
                    ancestor.style.overflow = 'visible';
                    ancestor.style.overflowX = 'visible';
                }
                ancestor = ancestor.parentElement;
            }

            // ── Capturar dashboard excluyendo botones de acción ─────────────────
            const canvas = await html2canvas(reportRef.current, {
                scale: SCALE,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#f8fafc',
                logging: false,
                imageTimeout: 30000,
                scrollX: 0,
                scrollY: -window.scrollY,
                windowWidth: containerEl.scrollWidth,
                ignoreElements: (el) => el.dataset.html2canvasIgnore === 'true',
            });

            // ── Restaurar overflow original ──────────────────────────────────────
            overflowFixes.forEach(({ el, overflow, overflowX }) => {
                el.style.overflow = overflow;
                el.style.overflowX = overflowX;
            });

            // ── Medidas del PDF ─────────────────────────────────────────────────
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const margin = 7;
            const headerH = 36;   // más alto para acomodar título centrado
            const footerH = 11;
            const contentH = pageH - headerH - footerH - 3;

            const imgW = canvas.width;
            const imgH = canvas.height;
            const printW = pageW - margin * 2;
            const mmPerPx = printW / imgW;

            // ── Escaneo de fila clara (fallback) ──────────────────────────────────
            const ctxScan = canvas.getContext('2d');
            const findSafeCut = (idealY, tol = 200) => {
                const isLight = (y) => {
                    if (y < 5 || y >= imgH - 5) return false;
                    const d = ctxScan.getImageData(0, Math.floor(y), imgW, 1).data;
                    let light = 0, total = 0;
                    const step = Math.max(1, Math.floor(imgW / 250));
                    for (let x = 0; x < imgW; x += step, total++) {
                        if (d[x * 4] > 220 && d[x * 4 + 1] > 222 && d[x * 4 + 2] > 224) light++;
                    }
                    return light / total > 0.85;
                };
                for (let off = 0; off <= tol; off += 3) {
                    if (isLight(idealY - off)) return idealY - off;
                    if (off && isLight(idealY + off)) return idealY + off;
                }
                return idealY;
            };

            // ── Planificador de páginas por frontera de sección ───────────────────
            // Regla: si una sección nueva arranca en el último 38 % de la página
            // actual → cortamos justo antes para que inicie limpia en la hoja siguiente.
            // Esto evita partir gráficas o bloques de análisis a la mitad.
            const pageHpx = contentH / mmPerPx;
            const cutPoints = [0];
            let pos = 0;

            while (true) {
                if (imgH - pos <= pageHpx * 1.05) break;   // resto cabe en una hoja
                const idealEnd = pos + pageHpx;

                // Buscar la frontera de sección más temprana dentro del último 38 % de esta página
                const zoneStart = pos + pageHpx * 0.62;
                const targetBoundary = sectionBoundaries
                    .filter(b => b >= zoneStart && b <= idealEnd)
                    .sort((a, b) => a - b)[0];

                let cutAt;
                if (targetBoundary !== undefined) {
                    // Cortar justo antes del inicio de la sección → arranca fresca en la hoja siguiente
                    cutAt = Math.max(pos + pageHpx * 0.40, targetBoundary - 4);
                } else {
                    // Fallback: fila de píxeles claros cerca del corte ideal
                    cutAt = findSafeCut(idealEnd, 200);
                }

                const next = Math.min(Math.round(cutAt), imgH);
                cutPoints.push(next);
                pos = next;
                if (pos >= imgH) break;
            }
            cutPoints.push(imgH);
            const numPages = cutPoints.length - 1;
            // El detalle de mora EP es nominal (nombre + cédula + deuda de cada
            // socio), así que el backend ya no se lo envía a quien no es admin. Sin
            // esta condición el PDF del socio añadía igual la página y, al ver la
            // lista vacía, imprimía "No hay cartera en mora EP" en verde — junto a
            // la tarjeta "Mora de Cartera" del MISMO informe mostrando la mora real.
            // Un documento con el sello del fondo afirmando lo contrario de sus
            // propias cifras. Ausencia de permiso no es ausencia de mora: se omite
            // la página entera, no se rellena con una negación falsa.
            const incluirMoraEP = isAdmin;
            const totalPages = numPages + (incluirMoraEP ? 1 : 0);

            // ── Encabezado corporativo completo ─────────────────────────────────
            const drawHeader = (pageNum) => {
                // Fondo verde
                pdf.setFillColor(22, 101, 52);
                pdf.rect(0, 0, pageW, headerH, 'F');
                // Franja esmeralda inferior
                pdf.setFillColor(16, 185, 129);
                pdf.rect(0, headerH - 2.5, pageW, 2.5, 'F');

                // Logo circular
                if (logoBase64) {
                    pdf.setFillColor(255, 255, 255);
                    pdf.circle(margin + 9.5, 13.5, 9, 'F');
                    pdf.addImage(logoBase64, 'JPEG', margin + 1, 5, 17, 17);
                }

                // Nombre empresa (izquierda)
                const tx = logoBase64 ? margin + 23 : margin;
                pdf.setTextColor(255, 255, 255);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(15);
                pdf.text('CREDIFUTURO', tx, 11);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7.5);
                pdf.setTextColor(167, 243, 208);
                pdf.text('Cooperativa Familiar de Crédito y Ahorro Solidario', tx, 17);

                // Fecha y página (derecha)
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8);
                pdf.setTextColor(255, 255, 255);
                pdf.text(fechaStr, pageW - margin, 11, { align: 'right' });
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7);
                pdf.setTextColor(167, 243, 208);
                pdf.text(`Hora: ${horaStr}`, pageW - margin, 17, { align: 'right' });
                pdf.setTextColor(255, 255, 255);
                pdf.text(`Pág. ${pageNum} / ${totalPages}`, pageW - margin, 23, { align: 'right' });

                // ─ Título centrado y resaltado ───────────────────────────────────
                const titleY = 30;
                // Cápsula de fondo blanco semitransparente
                const titleText = 'INFORME EJECUTIVO';
                pdf.setFontSize(11);
                const titleW = pdf.getTextWidth(titleText);
                const capsW = titleW + 10;
                const capsX = (pageW - capsW) / 2;
                pdf.setFillColor(255, 255, 255, 0.18); // blanco muy tenue (jsPDF ignora alpha, usamos workaround)
                pdf.setFillColor(10, 78, 39);
                pdf.roundedRect(capsX, titleY - 5.5, capsW, 8, 2, 2, 'F');
                pdf.setDrawColor(167, 243, 208);
                pdf.setLineWidth(0.5);
                pdf.roundedRect(capsX, titleY - 5.5, capsW, 8, 2, 2, 'S');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11);
                pdf.setTextColor(255, 255, 255);
                pdf.text(titleText, pageW / 2, titleY, { align: 'center' });
            };

            // ── Pie de página ───────────────────────────────────────────────────
            const drawFooter = () => {
                const fy = pageH - footerH;
                pdf.setFillColor(241, 245, 249);
                pdf.rect(0, fy, pageW, footerH, 'F');
                pdf.setDrawColor(203, 213, 225);
                pdf.setLineWidth(0.3);
                pdf.line(0, fy, pageW, fy);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(6.5);
                pdf.setTextColor(100, 116, 139);
                pdf.text('CREDIFUTURO · Informe Financiero Confidencial · No distribuir sin autorización', margin, fy + 7);
                pdf.text(`Generado: ${fechaStr} · ${horaStr}`, pageW - margin, fy + 7, { align: 'right' });
            };

            // ── Componer páginas con cortes inteligentes ────────────────────────
            for (let p = 0; p < numPages; p++) {
                if (p > 0) pdf.addPage();
                drawHeader(p + 1);
                drawFooter();

                const srcY = cutPoints[p];
                const srcH = cutPoints[p + 1] - srcY;
                if (srcH <= 0) continue;

                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = imgW;
                sliceCanvas.height = Math.ceil(srcH);
                const ctx = sliceCanvas.getContext('2d');
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
                ctx.drawImage(canvas, 0, -Math.floor(srcY));

                const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.98);
                const sliceHmm = srcH * mmPerPx;
                pdf.addImage(sliceData, 'JPEG', margin, headerH + 1.5, printW, sliceHmm);
            }

            // ── Página adicional: Detalle de Cartera en Mora EP (solo admin) ───
            if (incluirMoraEP) {
            pdf.addPage();
            drawHeader(totalPages);
            drawFooter();

            const moraData = stats.detalleMoraEP || [];
            let my = headerH + 8;

            // Título de sección
            pdf.setFillColor(220, 38, 38);
            pdf.roundedRect(margin, my, pageW - margin * 2, 9, 2, 2, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(255, 255, 255);
            pdf.text('DETALLE DE CARTERA EN MORA EP', pageW / 2, my + 6, { align: 'center' });
            my += 13;

            if (moraData.length === 0) {
                // Mensaje de ausencia
                pdf.setFillColor(240, 253, 244);
                pdf.roundedRect(margin, my, pageW - margin * 2, 14, 2, 2, 'F');
                pdf.setDrawColor(134, 239, 172);
                pdf.setLineWidth(0.4);
                pdf.roundedRect(margin, my, pageW - margin * 2, 14, 2, 2, 'S');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.setTextColor(21, 128, 61);
                pdf.text('No hay cartera en mora EP', pageW / 2, my + 9, { align: 'center' });
            } else {
                // Encabezados de tabla
                const cols = [
                    { label: 'Socio', x: margin, w: 55 },
                    { label: 'Cédula', x: margin + 55, w: 30 },
                    { label: 'ID VM', x: margin + 85, w: 22 },
                    { label: 'Mes', x: margin + 107, w: 22 },
                    { label: 'Fecha', x: margin + 129, w: 28 },
                    { label: 'Monto Deuda', x: margin + 157, w: 36 },
                ];
                const rowH = 8;

                // Fila de cabecera
                pdf.setFillColor(153, 27, 27);
                pdf.rect(margin, my, pageW - margin * 2, rowH, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7.5);
                pdf.setTextColor(255, 255, 255);
                cols.forEach(col => {
                    pdf.text(col.label, col.x + 1.5, my + 5.5);
                });
                my += rowH;

                // Filas de datos
                moraData.forEach((item, idx) => {
                    const isEven = idx % 2 === 0;
                    pdf.setFillColor(isEven ? 255 : 254, isEven ? 242 : 242, isEven ? 242 : 242);
                    pdf.rect(margin, my, pageW - margin * 2, rowH, 'F');
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(7);
                    pdf.setTextColor(30, 30, 30);

                    const formatMonto = (v) =>
                        '$' + Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0 });

                    const cells = [
                        item.nombre || '',
                        String(item.cedula || ''),
                        String(item.idVm || ''),
                        item.mes || '',
                        item.fecha || '',
                        formatMonto(item.valor),
                    ];
                    cols.forEach((col, ci) => {
                        const txt = String(cells[ci] || '');
                        if (ci === cols.length - 1) {
                            pdf.setFont('helvetica', 'bold');
                            pdf.setTextColor(185, 28, 28);
                        } else {
                            pdf.setFont('helvetica', 'normal');
                            pdf.setTextColor(30, 30, 30);
                        }
                        pdf.text(txt, col.x + 1.5, my + 5.5);
                    });

                    // Línea separadora
                    pdf.setDrawColor(254, 202, 202);
                    pdf.setLineWidth(0.2);
                    pdf.line(margin, my + rowH, pageW - margin, my + rowH);
                    my += rowH;
                });

                // Total
                my += 3;
                const totalValor = moraData.reduce((acc, item) => acc + Number(item.valor || 0), 0);
                pdf.setFillColor(254, 226, 226);
                pdf.rect(margin, my, pageW - margin * 2, 9, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8);
                pdf.setTextColor(153, 27, 27);
                pdf.text('TOTAL EN MORA EP:', margin + 2, my + 6);
                pdf.text('$' + totalValor.toLocaleString('es-CO', { minimumFractionDigits: 0 }), pageW - margin - 2, my + 6, { align: 'right' });
            }
            } // fin de incluirMoraEP

            const fileName = `Informe_Credifuturo_${fechaHoy.toISOString().slice(0, 10)}.pdf`;
            pdf.save(fileName);
            toast.success(`Informe generado: ${fileName}`);
        } catch (err) {
            console.error('Error generando PDF:', err);
            toast.error('Error al generar el informe. Intenta de nuevo.');
        } finally {
            setGeneratingPdf(false);
        }
    };

    return (
        <div className="space-y-6" ref={reportRef}>
            {/* Header with Save Button and Filter */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary">
                        Panel Principal {!isAdmin && user.name ? `- ${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim() : ''}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-gray-500">Resumen general de la actividad financiera.</p>
                        {/* Live indicator */}
                        <span className="inline-flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`} />
                            <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">
                                {loading ? 'Actualizando...' : lastUpdated
                                    ? `Actualizado: ${lastUpdated.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${lastUpdated.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                    : 'En vivo'}
                            </span>
                        </span>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center" data-html2canvas-ignore="true">
                    {/* Status Filter */}
                    {isAdmin && (
                        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-green-50 px-6 py-3 rounded-xl border-2 border-emerald-200/80 shadow-sm transition-all hover:shadow-lg hover:border-emerald-300">
                            <Users className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                            <select
                                id="status-filter"
                                aria-label="Filtrar por estado de socio"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="text-sm font-bold text-emerald-900 bg-transparent border-none focus:ring-0 cursor-pointer outline-none p-0"
                            >
                                <option value="Todos">Todos los Socios</option>
                                {availableStatuses.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Year Multi-Select Filter */}
                    <YearMultiSelect selectedYears={selectedYears} onChange={setSelectedYears} />

                    <button
                        onClick={handleGenerateReport}
                        disabled={generatingPdf || loading}
                        className={`
                            inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm
                            shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 
                            transition-all duration-300 shrink-0
                            ${generatingPdf || loading
                                ? 'bg-emerald-500/60 text-white cursor-not-allowed'
                                : 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.97] border border-emerald-700/50'
                            }
                        `}
                    >
                        {generatingPdf
                            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generando...</>
                            : <><FileDown className="h-4 w-4" /> Generar Informe</>
                        }
                    </button>

                    {isAdmin && (
                        <button
                            id="save-db-button"
                            onClick={handleSaveChanges}
                            disabled={saving}
                            className={`
                                inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm
                                shadow-lg shadow-brand-primary/20 hover:shadow-xl hover:shadow-brand-primary/30
                                transition-all duration-300 shrink-0
                                ${saving
                                    ? 'bg-brand-primary/60 text-white cursor-not-allowed'
                                    : 'bg-gradient-to-br from-brand-primary to-brand-dark text-white hover:bg-brand-dark active:scale-[0.97] border border-brand-dark/50'
                                }
                            `}
                        >
                            {saving
                                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Validando...</>
                                : <><Save className="h-4 w-4" /> Guardar Cambios en la Base de Datos</>
                            }
                        </button>
                    )}
                </div>
            </div>

            {/* ── Primera macro-zona: el estado general del fondo, primero. Antes esta
                tarjeta vivía debajo de cuatro secciones de indicadores sueltos —
                un visitante nuevo tenía que bajar toda la página para llegar al
                veredicto ejecutivo. Ahora es lo primero que se ve. ── */}
            <div className="flex items-center gap-3">
                <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">Estado general del fondo</span>
                <div className="flex-1 h-px bg-gray-200" />
            </div>
            {/* Este bloque es EXACTAMENTE el mismo componente que pinta la página
                "Inteligencia Financiera" — alerta operativa, banda de KPIs,
                comparador interanual, "Resultados del Año" y diagnóstico. Estaba
                duplicado en las dos pantallas.
                Se oculta AQUÍ y no allá: aquel menú existe solo para este análisis
                (quitarlo lo dejaría vacío), mientras que esta página ya mezcla las
                tarjetas operativas por área con las acciones de administración, y
                sin el bloque gana coherencia y carga menos. Reversible desde
                "Cambios" (fondo.analisisFinanciero). */}
            {esVisible('fondo.analisisFinanciero') && (
            <div id="fondo.analisisFinanciero" className="w-full">
                <Card className="border-none shadow-md">
                    <CardHeader className="bg-gray-50 border-b border-gray-100 pb-3 rounded-t-xl">
                        <CardTitle className="text-brand-primary flex items-center gap-2 font-black text-lg">
                            <Activity className="h-5 w-5 text-brand-primary" />
                            Panel de Inteligencia Financiera & Actividad
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 bg-white rounded-b-xl overflow-hidden">
                        <FinancialChart
                            stats={stats}
                            execStats={execStats}
                            yearCmp={yearCmp}
                            yearCmpError={yearCmpError}
                            selectedYears={selectedYears}
                            onEditMeta={isAdmin ? () => {
                                setMetaInputRaw(String(stats?.baselines?.metaGanancia || ''));
                                setShowMetaModal(true);
                            } : undefined}
                        />
                    </CardContent>
                </Card>
            </div>
            )}

            {/* ── Segunda macro-zona: indicadores rápidos por área. El panel de
                análisis de arriba responde "¿cómo va el fondo en general?"; esta
                zona responde "¿cómo va CADA área?" — socios, préstamos, saldos,
                riesgo — con acceso directo (clic) al detalle de cada una. ── */}
            <div className="flex items-center gap-3 pt-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">Indicadores por área</span>
                <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* --- SECCIÓN 1: SOCIOS Y AHORROS --- */}
            <div className="mb-8">
                <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
                    <PiggyBank className="w-5 h-5 text-emerald-600" /> Gestión de Socios y Ahorros
                </h2>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <StatCard
                        title="Socios del Fondo"
                        value={loading ? '...' : (stats?.clientsCount || 0)}
                        description={
                            statusFilter === 'Todos'
                                ? `${stats?.activeClientsCount || 0} activos · ${stats?.inactiveClientsCount || 0} inactivos`
                                : `Socios ${statusFilter}`
                        }
                        icon={Users}
                        color="text-blue-500"
                        onClick={() => handleCardClick('/admin/clients/list')}
                    />
                    <StatCard
                        title="Ahorros Mensuales"
                        value={loading ? '...' : `$${Number(stats?.totalSavings || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Abonos acumulados · socios activos"
                        icon={PiggyBank}
                        color="text-green-500"
                        onClick={() => handleCardClick('/admin/savings/list', { type: 'Mensual' })}
                    />
                    <StatCard
                        title="Base Patrimonial"
                        value={loading ? '...' : `$${Number(stats?.totalInitialContributions || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Capital inicial de socios activos"
                        icon={Database}
                        color="text-amber-500"
                        onClick={() => handleCardClick('/admin/contributions/initial-list')}
                    />
                    <StatCard
                        title="Patrimonio de Socios"
                        value={loading ? '...' : `$${Number(stats?.totalAhorradoGeneral || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Ahorros + aportes consolidados"
                        icon={PiggyBank}
                        color="text-emerald-700"
                        onClick={() => handleCardClick('/admin/savings/list')}
                    />
                    <StatCard
                        title="Días en Retraso"
                        value={loading ? '...' : (stats?.totalPenaltyDays || 0)}
                        description="Mora en ahorros · año en curso"
                        icon={AlertCircle}
                        color="text-rose-500"
                        textColor={stats?.totalPenaltyDays > 0 ? 'text-rose-600' : 'text-gray-900'}
                        onClick={() => handleCardClick('/admin/savings/list', { status: 'Penalizacion' })}
                    />
                    {/* Los tres modales de detalle (recargos, mora EP, socios en mora)
                        listan nombre y cédula socio por socio, así que el backend ya no
                        manda esos arrays a quien no es admin — y los modales devuelven
                        null con la lista vacía. Sin gatear el onClick, la tarjeta se
                        pintaba clicable para el socio y el clic no abría nada:
                        comprobado, "Mora de Cartera" era un clic muerto. Prometer un
                        detalle que nunca llega hace que la página se perciba rota. */}
                    <StatCard
                        title="Recargos por Mora"
                        value={loading ? '...' : `$${Number(stats?.totalPenaltyValue || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Cobros por retraso · año actual"
                        icon={DollarSign}
                        color="text-amber-500"
                        onClick={isAdmin ? () => setShowPenaltyModal(true) : undefined}
                        customBg="linear-gradient(135deg, #FEFDE8 0%, #FEF9C3 100%)"
                    />
                </div>
            </div>

            {/* --- SECCIÓN 2: PRÉSTAMOS --- */}
            <div className="mb-8">
                <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-600" /> Préstamos y Cartera
                </h2>
                {/* Fila 1: flujo de capital */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                    <StatCard
                        title="Capital Desembolsado"
                        value={loading ? '...' : `$${Number(stats?.totalPrestamos || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description={`${stats?.totalPrestamosCount || 0} préstamos entregados`}
                        icon={DollarSign}
                        color="text-emerald-500"
                        onClick={() => handleCardClick('/admin/disbursed-loans/list')}
                    />
                    <StatCard
                        title="Cartera al Día"
                        value={loading ? '...' : `$${Number(stats?.carteraDia || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description={`${stats?.carteraDiaCount || 0} cuotas vigentes`}
                        icon={TrendingUp}
                        color="text-emerald-600"
                        onClick={() => handleCardClick('/admin/payments/list', { estadoPrestamo: 'Vigente' })}
                    />
                    <StatCard
                        title="Cuotas Recaudadas"
                        value={loading ? '...' : `$${Number(stats?.totalCuotasPagadas || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description={`${stats?.recaudoCuotasCount || 0} pagos completados`}
                        icon={CheckCircle}
                        color="text-blue-600"
                        onClick={() => handleCardClick('/admin/payments/list')}
                    />
                    <StatCard
                        title="Mora de Cartera"
                        value={loading ? '...' : `$${Number(stats?.moraCarteraEP || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Cuotas con vencimiento superado"
                        icon={AlertTriangle}
                        color="text-red-500"
                        customBg="linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
                        onClick={isAdmin ? () => setShowMoraEPModal(true) : undefined}
                    />
                </div>
                {/* Fila 2: flujo de intereses */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        title="Cartera Total"
                        value={loading ? '...' : `$${Number(stats?.totalPrestamosMasIntereses || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Capital + intereses del portafolio"
                        icon={Activity}
                        color="text-gray-500"
                    />
                    <StatCard
                        title="Intereses Proyectados"
                        value={loading ? '...' : `$${Number(stats?.totalIntereses || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Intereses agendados del portafolio"
                        icon={BarChart3}
                        color="text-gray-500"
                        onClick={() => handleCardClick('/admin/payments/list')}
                    />
                    <StatCard
                        title="Intereses Cobrados"
                        value={loading ? '...' : `$${Number(stats?.totalInteresesPagados || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Ingreso por cartera crediticia"
                        icon={TrendingUp}
                        color="text-brand-primary"
                        onClick={() => handleCardClick('/admin/payments/list', { estado: 'Pago' })}
                    />
                    <StatCard
                        title="Intereses Pendientes"
                        value={loading ? '...' : `$${Math.max(0, (stats?.totalIntereses || 0) - (stats?.totalInteresesPagados || 0)).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Por recaudar al cierre del año"
                        icon={Clock}
                        color="text-gray-500"
                        customBg="linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)"
                        onClick={() => handleCardClick('/admin/payments/list', { estado: 'Pendiente' })}
                    />
                </div>
            </div>

            {/* --- SECCIÓN 3: SALDOS --- */}
            <div className="mb-8">
                <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5 text-purple-600" /> Saldos y Rendimientos
                </h2>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                    <StatCard
                        title="Caja Disponible"
                        value={loading ? '...' : `$${Number(stats?.saldoEnBanco || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Patrimonio − Capital total + Cuotas históricas"
                        icon={nuLogo}
                        customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)"
                        isDark={false}
                    />
                    <div className="relative">
                        <StatCard
                            title="Rendimiento Cuenta NU"
                            value={loading ? '...' : `$${Number(stats?.rentabilidadCajaNU || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                            description={isAdmin ? 'Clic para actualizar el valor' : 'Intereses generados por depósitos'}
                            icon={nuLogo}
                            customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)"
                            isDark={false}
                            onClick={isAdmin ? () => {
                                setNuInputRaw(String(stats?.rentabilidadCajaNU || ''));
                                setShowNUModal(true);
                            } : undefined}
                        />
                        {isAdmin && (
                            <div className="absolute bottom-3 left-3 flex items-center gap-1 text-[10px] text-violet-400 font-medium pointer-events-none">
                                <Edit2 className="w-3 h-3" /> Editar
                            </div>
                        )}
                    </div>
                    <StatCard
                        title="Disponible Total"
                        value={loading ? '...' : `$${Number((stats?.saldoEnBanco || 0) + (stats?.rentabilidadCajaNU || 0)).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Caja + rendimientos consolidados"
                        icon={nuLogo}
                        customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)"
                        isDark={false}
                    />
                </div>
            </div>

            {/* --- SECCIÓN 4: INDICADORES DE RIESGO Y RENDIMIENTO ---
                 Extraído a components/admin/RiskReturnIndicators.jsx: lo reutiliza
                 también pages/admin/FinancialIntelligencePage.jsx. El clic sobre
                 "Socios en Mora" sigue exclusivo del admin (abre MoraModal, que vive
                 aquí, no en el componente extraído). --- */}
            <RiskReturnIndicators
                stats={stats}
                loading={loading}
                onSociosMoraClick={isAdmin ? () => setShowMoraModal(true) : undefined}
            />

            {/* Modals */}
            {showModal && <ValidateModal result={validateResult} onClose={() => setShowModal(false)} />}
            {showMoraModal && <MoraModal details={stats?.detalleMora} onClose={() => setShowMoraModal(false)} />}
            {showMoraEPModal && <MoraEPModal details={stats?.detalleMoraEP} onClose={() => setShowMoraEPModal(false)} />}
            {showPenaltyModal && <PenaltyModal details={stats?.detallePenalidad} onClose={() => setShowPenaltyModal(false)} />}

            {/* Modal: Actualizar Rendimiento Cuenta NU */}
            {showNUModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowNUModal(false)} />
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)' }}>
                            <div className="flex items-center gap-2">
                                <img src={nuLogo} alt="NU" className="h-7 w-auto object-contain" />
                                <h3 className="text-lg font-bold text-violet-800">Rendimiento Cuenta NU</h3>
                            </div>
                            <button onClick={() => setShowNUModal(false)} className="p-1 hover:bg-violet-200 rounded-full transition-colors">
                                <X className="h-5 w-5 text-violet-600" />
                            </button>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-sm text-gray-500 mb-4">
                                Ingresa el valor del rendimiento generado por los depósitos en la cuenta NU, según el extracto más reciente.
                            </p>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                                Monto en pesos colombianos
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="w-full pl-7 pr-4 py-3 border-2 border-violet-200 rounded-xl text-xl font-bold text-violet-800 focus:outline-none focus:border-violet-500 transition-colors text-right"
                                    placeholder="0"
                                    value={nuInputRaw === '' ? '' : Number(nuInputRaw).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                    onChange={e => {
                                        const raw = e.target.value.replace(/\D/g, '');
                                        setNuInputRaw(raw === '' ? '' : raw);
                                    }}
                                    autoFocus
                                />
                            </div>
                            {nuInputRaw !== '' && (
                                <p className="text-xs text-violet-500 mt-1 text-right font-medium">
                                    $ {Number(nuInputRaw).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                </p>
                            )}
                        </div>
                        <div className="px-6 pb-5 flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setShowNUModal(false)}
                                disabled={nuSaving}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                                disabled={nuSaving || nuInputRaw === ''}
                                onClick={async () => {
                                    setNuSaving(true);
                                    try {
                                        await api.put('/admin/settings/rentabilidadCajaNU', { value: Number(nuInputRaw) });
                                        setShowNUModal(false);
                                        setNuInputRaw('');
                                        await fetchStats();
                                    } catch {
                                        alert('No se pudo guardar el valor. Intenta de nuevo.');
                                    } finally {
                                        setNuSaving(false);
                                    }
                                }}
                            >
                                {nuSaving ? 'Guardando…' : 'Actualizar'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: editar meta anual de ganancia (AppSettings.metaGananciaAnual) */}
            {showMetaModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowMetaModal(false)} />
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' }}>
                            <div className="flex items-center gap-2">
                                <TrendingUp className="h-6 w-6 text-emerald-700" />
                                <h3 className="text-lg font-bold text-emerald-800">Meta Anual de Ganancia</h3>
                            </div>
                            <button onClick={() => setShowMetaModal(false)} className="p-1 hover:bg-emerald-200 rounded-full transition-colors">
                                <X className="h-5 w-5 text-emerald-600" />
                            </button>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-sm text-gray-500 mb-4">
                                Meta de ganancia del fondo para el año en curso (intereses + rendimientos + recargos), definida por el comité. Se usa en el Veredicto Ejecutivo y el KPI de cumplimiento.
                            </p>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                                Monto en pesos colombianos
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="w-full pl-7 pr-4 py-3 border-2 border-emerald-200 rounded-xl text-xl font-bold text-emerald-800 focus:outline-none focus:border-emerald-500 transition-colors text-right"
                                    placeholder="0"
                                    value={metaInputRaw === '' ? '' : Number(metaInputRaw).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                    onChange={e => {
                                        const raw = e.target.value.replace(/\D/g, '');
                                        setMetaInputRaw(raw === '' ? '' : raw);
                                    }}
                                    autoFocus
                                />
                            </div>
                            {metaInputRaw !== '' && (
                                <p className="text-xs text-emerald-600 mt-1 text-right font-medium">
                                    $ {Number(metaInputRaw).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                </p>
                            )}
                        </div>
                        <div className="px-6 pb-5 flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setShowMetaModal(false)}
                                disabled={metaSaving}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1"
                                disabled={metaSaving || metaInputRaw === ''}
                                onClick={async () => {
                                    setMetaSaving(true);
                                    try {
                                        await api.put('/admin/settings/metaGananciaAnual', { value: Number(metaInputRaw) });
                                        setShowMetaModal(false);
                                        setMetaInputRaw('');
                                        await fetchStats();
                                    } catch {
                                        alert('No se pudo guardar la meta. Intenta de nuevo.');
                                    } finally {
                                        setMetaSaving(false);
                                    }
                                }}
                            >
                                {metaSaving ? 'Guardando…' : 'Actualizar'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
export default DashboardHome;
