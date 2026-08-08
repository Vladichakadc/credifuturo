import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../config/api';
import {
    Users, DollarSign, AlertTriangle, PiggyBank, BarChart3,
    Save, CheckCircle, XCircle, AlertCircle, X, RefreshCw, Database, TrendingUp, Landmark, Activity,
    ShieldCheck, ActivitySquare, FileDown, Clock, Calendar, ChevronDown, Maximize2, Edit2,
    LineChart as LineChartIcon
} from 'lucide-react';
import ChartExpandModal, { analyzeComparativeChart, analyzeIncomeDistribution } from '../../components/ChartExpandModal';
import { computeFundProjection } from '../../utils/fundProjection';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useUi } from '../../context/UiContext';
import DataTable from '../../components/ui/DataTable';
import nuLogo from '../../assets/nu-logo.png';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import nuBg from '../../assets/nu-bg.png';
import logo from '../../assets/logo.jpg';
import YearMultiSelect from '../../components/admin/YearMultiSelect';
import YearComparisonChart from '../../components/admin/YearComparisonChart';
import YearProgressCard from '../../components/admin/YearProgressCard';

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



// ─── NUEVO: COMPONENTE DE GRÁFICA PROFESIONAL ────────────────────────────────────────────────────────
const FinancialChart = ({ stats, execStats, yearCmp, yearCmpError = false, selectedYears = [], onEditMeta }) => {
    // Etiqueta del período que cubren las cifras (regla de gobernanza: declarar el período)
    const periodoLabel = selectedYears.length > 0 ? selectedYears.join(' – ') : 'todos los años';
    const [expandDonut, setExpandDonut] = useState(false);
    const [expandComp, setExpandComp] = useState(null);

    if (!stats) return null;

    // Calcular valores principales
    const disponible = (stats.saldoEnBanco || 0) + (stats.rentabilidadCajaNU || 0);
    const mora = stats.moraCarteraEP || 0;
    // carteraDia viene del backend: cuotas Pendiente en el rango de años cuya fechaPagoMax >= hoy
    const prestadoVigente = stats.carteraDia || 0;

    const total = disponible + prestadoVigente;

    // (Se eliminaron aquí el array `data` y el componente `CustomTooltip`: restos de
    // un PieChart retirado hace tiempo, sin ninguna referencia en el render. Además
    // definían una paleta —Disponible púrpura, Cartera azul— que contradecía la que
    // sí se pinta en la leyenda del KPI de Capital Total.)

    const riskIndex = total > 0 ? ((mora / total) * 100).toFixed(1) : 0;
    const liquidity = total > 0 ? ((disponible / total) * 100).toFixed(1) : 0;

    // Baselines del año anterior — calculados por el backend desde la BD y AppSettings
    // (plan de mejora de gráficas: sin cifras congeladas en el código; los valores
    // 2025 quedan como semilla por defecto en dashboard-stats si AppSettings está vacío).
    const baselinePrestamos = Number(stats?.baselines?.prestamos) || 29750000;
    const baselinePatrimonio = Number(stats?.baselines?.patrimonio) || 36126201;
    const baselineIntereses = Number(stats?.baselines?.intereses) || 1206913;
    const baselineAnio = stats?.baselines?.anio || 2025;
    // NU: sin serie histórica por año (saldo único editado manualmente) — gobernado
    // por AppSetting rentabilidadCajaNUCierre{año}, igual patrón que patrimonioCierre.
    // Mora: sí tiene serie histórica real (Saving.valorAPenalizar por año) — dinámico.
    const baselineNU = Number(stats?.baselines?.nu) || 1029139;
    const baselineMora = Number(stats?.baselines?.mora) || 0;
    // Ganancia REAL del año anterior = suma de los 3 baselines de arriba. Distinto,
    // a propósito, de "rentabilidad2025"/metaGanancia más abajo — esa es la META del
    // comité para el año EN CURSO, no el resultado real del año anterior; mezclarlas
    // hacía que "Ganancia total del fondo · 2025" no coincidiera con la suma real de
    // sus 3 filas apenas alguno de los 3 baselines dejara de ser el valor congelado.
    const gananciaReal2025 = baselineIntereses + baselineNU + baselineMora;

    // ── Ganancia del año en curso (YTD) ───────────────────────────────────────
    // Se toma de fundProjection.js, la fuente ÚNICA del fondo, igual que hacen el
    // Panel Ejecutivo y el Ranking de Ahorro. Antes este panel sumaba sus propios
    // campos, lo que arrastraba dos errores: contaba intereses de cuotas de 2027 ya
    // pagadas (el selector de años de la página trae [año actual, año siguiente]) y
    // usaba solo estado 'Pago' mientras el baseline del año anterior usa
    // ('Pago','Abono'). El fallback conserva el cálculo anterior por si la serie del
    // Panel Ejecutivo no cargó.
    const anioActualProyeccion = new Date().getFullYear();
    const proyeccionFondo = computeFundProjection({ exec: execStats, stats, anioActual: anioActualProyeccion });
    const rentabilidadActual = proyeccionFondo?.gananciaRealYtd
        ?? ((stats.totalInteresesPagados || 0) + (stats.rentabilidadCajaNU || 0)
            + (stats.totalPenaltyValue || 0) + (stats.descuentoAnualVigente || 0));

    // ── Comparación honesta contra el año anterior ────────────────────────────
    // El error que esto corrige: se dividía la ganancia ACUMULADA del año en curso
    // (unos pocos meses) entre la ganancia COMPLETA de 12 meses del año anterior. Con
    // el fondo rindiendo exactamente igual que el año pasado, ese cociente marca
    // "-40%" en agosto y solo llegaría a 0% el 31 de diciembre: medía el calendario,
    // no el desempeño. Ahora se compara contra el MISMO CORTE del año anterior
    // (enero → mes actual), que es la única comparación entre iguales.
    //
    // Intereses y mora tienen serie mensual real, así que su corte es medido. El
    // rendimiento de la cuenta NU no tiene histórico mensual (el admin edita un único
    // saldo), así que se prorratea su cierre anual y se declara como estimado en la UI
    // en vez de fingir un dato que no existe.
    const cmpCorte = yearCmp?.corte || null;
    const fraccionAnio = cmpCorte?.fraccionAnio ?? null;
    const seriePrev = yearCmp?.series?.find(s => Number(s.anio) === Number(baselineAnio)) || null;

    // ── Base de comparación: el RITMO del año anterior ────────────────────────
    // Se compara la ganancia acumulada de este año contra la del año anterior
    // prorrateada a la misma fracción de calendario transcurrida.
    //
    // Por qué no se usa el tramo ene–<mes> MEDIDO del año anterior: porque cuando
    // ese tramo es pequeño el porcentaje se dispara y deja de informar. Caso real
    // de este fondo: en 2025 casi todo el interés venció en el segundo semestre,
    // así que su tramo hasta agosto fue de apenas ~$127 mil frente a ~$1,5 M del
    // año completo. Dividir la ganancia de este año entre esa base daba +2.308%:
    // aritméticamente cierto, pero ilegible y alarmante sin motivo.
    //
    // El prorrateo del año COMPLETO da una base estable (nunca cerca de cero) y
    // responde justo lo que la tarjeta promete: si el fondo va por encima o por
    // debajo del ritmo con que cerró el año pasado. Además usa `gananciaReal2025`,
    // la misma cifra que la tabla muestra en la columna del año completo, así que
    // no puede desalinearse con ella (antes el NU del comparador podía valer 0 si
    // faltaba su AppSetting de cierre, mientras la tabla mostraba el valor de
    // respaldo — dos números distintos para lo mismo).
    const gananciaPrevRitmo = (gananciaReal2025 > 0 && fraccionAnio !== null)
        ? gananciaReal2025 * fraccionAnio
        : null;
    // Avance sobre el TOTAL del año anterior: sigue siendo útil ("llevamos el 65% de lo
    // que ganamos en todo 2025"), pero es un porcentaje de avance, nunca una caída.
    const avanceSobreAnioCompleto = gananciaReal2025 > 0 ? (rentabilidadActual / gananciaReal2025) * 100 : null;
    const nombreMesCorte = cmpCorte
        ? new Date(cmpCorte.anioActual, cmpCorte.mes - 1, cmpCorte.dia).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
        : null;

    // Cortes por fuente. `null` significa "no hay serie para comparar" — se propaga
    // hasta la UI para mostrar "—" en vez de un 0 que se leería como una caída total.
    const interesesPrevYtd = seriePrev ? seriePrev.ytdAlCorte.intereses : null;
    // Lado del año en curso: se toma del MISMO corte que el año anterior. Es
    // deliberado no usar aquí `gananciaRealYtd`/`intCobradosAnio` de la proyección:
    // esas cifras abarcan el año calendario completo (incluyen cuotas con
    // vencimiento en octubre o diciembre que un socio ya prepagó), así que
    // dividirlas entre un baseline cortado a agosto volvería a comparar tramos
    // distintos — el mismo error, en sentido contrario. `gananciaRealYtd` sí se
    // usa para MOSTRAR la ganancia acumulada; aquí solo se calcula el %.
    const serieActual = yearCmp?.series?.find(s => s.esAnioEnCurso) || null;
    const interesesActualYtd = serieActual?.ytdAlCorte.intereses
        ?? proyeccionFondo?.intCobradosAnio
        ?? (stats.totalInteresesPagados || 0);
    const moraActualYtd = serieActual?.ytdAlCorte.mora
        ?? proyeccionFondo?.moraYtdReal
        ?? (stats.totalPenaltyValue || 0);
    const colocacionPrevYtd = seriePrev ? seriePrev.ytdAlCorte.colocacion : null;
    const colocacionActualYtd = serieActual ? serieActual.ytdAlCorte.colocacion : (stats.totalPrestamos || 0);

    // Ahorro: mismo criterio que Préstamos/Intereses — el año anterior siempre
    // está cerrado (12 meses) y el año en curso es naturalmente parcial mientras
    // dure el año, así que ahorroPorAnio ya trae exactamente lo que
    // YearProgressCard espera sin necesidad de un corte adicional.
    const ahorroPorAnioArr = stats.ahorroPorAnio || [];
    const ahorroFilaPrev = ahorroPorAnioArr.find(a => Number(a.anio) === baselineAnio);
    const ahorroFilaActual = ahorroPorAnioArr.find(a => Number(a.anio) === baselineAnio + 1);
    const ahorroPrevTotal = ahorroFilaPrev?.total || 0;
    const ahorroActualTotal = ahorroFilaActual?.total || 0;
    const ahorroComposicionNota = (() => {
        if (!ahorroFilaActual || !ahorroFilaActual.total) return null;
        const mensualPct = Math.round((ahorroFilaActual.mensual / ahorroFilaActual.total) * 100);
        const aportesPct = 100 - mensualPct;
        return aportesPct > 0
            ? `${mensualPct}% es ahorro mensual recurrente y ${aportesPct}% son aportes iniciales de socios nuevos.`
            : 'El 100% proviene del ahorro mensual recurrente de los socios — la señal más sana de disciplina de ahorro.';
    })();
    // El numerador es la MISMA cifra que la tarjeta muestra en grande (la ganancia
    // acumulada del año, incluida la cuenta NU), para que el porcentaje y el monto
    // no puedan contar historias distintas.
    //
    // Guarda de arranque de año: en enero la fracción transcurrida es tan pequeña
    // que cualquier cociente se dispara. Antes de que haya un mes corrido no se
    // muestra porcentaje, se dice que aún es pronto.
    const FRACCION_MINIMA = 0.08; // ≈ un mes
    const baseComparableValida = gananciaPrevRitmo !== null
        && gananciaPrevRitmo > 0
        && fraccionAnio >= FRACCION_MINIMA;
    const growthVsPrevYtd = baseComparableValida
        ? ((rentabilidadActual / gananciaPrevRitmo) * 100 - 100)
        : null;
    const comparacionPrematura = fraccionAnio !== null && fraccionAnio < FRACCION_MINIMA;
    // Un crecimiento enorme se comunica mejor como múltiplo: "3,4× el ritmo de 2025"
    // en vez de "+240,0%", que a partir de cierto tamaño se lee como un error.
    // Ritmo del año anterior para una magnitud dada: su total prorrateado al
    // calendario transcurrido. Es la base que usan las tarjetas y los análisis.
    const ritmoPrev = (totalAnterior) => (fraccionAnio > 0 ? totalAnterior * fraccionAnio : totalAnterior);
    const fmtVariacion = (pct) => pct >= 200
        ? `${(1 + pct / 100).toFixed(1).replace('.', ',')}×`
        : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

    const rentabilidad2025 = Number(stats?.baselines?.metaGanancia) || 2448052;
    const achievement = (rentabilidadActual / rentabilidad2025) * 100; // Porcentaje de cumplimiento de la meta
    const growthValue = achievement - 100; // Avance sobre la meta anual (NO es "vs año anterior")

    let growthBgClass = "bg-gray-50 border-gray-200 text-gray-500";
    let growthTextClass = "text-gray-900";
    let growthLabelClass = "text-gray-500";

    if (achievement < 80) {
        growthBgClass = "bg-red-50 border-red-100"; // Rojo muy suave (estilo Cartera en Mora)
        growthTextClass = "text-red-700";
        growthLabelClass = "text-red-600/70";
    } else if (achievement >= 80 && achievement < 100) {
        growthBgClass = "bg-orange-50 border-orange-100"; // Naranja suave
        growthTextClass = "text-orange-700";
        growthLabelClass = "text-orange-600/70";
    } else {
        growthBgClass = "bg-emerald-50 border-emerald-100"; // Verde suave
        growthTextClass = "text-emerald-700";
        growthLabelClass = "text-emerald-600/70";
    }

    // --- ESTIMADO AL CIERRE DE AÑO — mismo modelo que ExecutivePanelPage.jsx (utils/fundProjection.js) ---
    // Antes: proyeccionIntereses = stats.totalIntereses * 0.95, donde totalIntereses suma
    // TODOS los intereses agendados en el rango del selector de años de esta página (por
    // defecto año actual + año siguiente) — es decir, mezclaba intereses de 2027 en la
    // "proyección de cierre 2026" apenas alguien tocara ese filtro, o incluso por defecto
    // si hay cuotas ya agendadas para el año siguiente. El nuevo modelo usa únicamente
    // cobrado/agendado del año calendario en curso (independiente del selector de arriba)
    // más la tasa de recaudo real observada — igual que en el Panel Ejecutivo, para que
    // ambos paneles nunca muestren cifras distintas de "cuánto ganará el fondo este año".
    // Se muestra el escenario conservador (no "base"/optimista) en todas las
    // filas por decisión explícita: un solo número prudente, sin rangos ni notas.
    // (anioActualProyeccion y proyeccionFondo se calculan arriba, junto a la ganancia YTD)
    const proyeccionIntereses = proyeccionFondo?.intereses?.conservador ?? 0;
    const proyeccionCajaNU = proyeccionFondo?.nu?.conservador ?? 0;
    const proyeccionPenalidad = proyeccionFondo?.penalidad?.conservador ?? 0;
    const proyeccionTotal = proyeccionFondo?.total?.conservador ?? 0;


    return (
        <div className="flex flex-col w-full">
            {/* ── VEREDICTO EJECUTIVO ──────────────────────────────────────────── */}
            {(() => {
                const _aArr = stats.ahorroPorAnio || [];
                const _aLast = _aArr[_aArr.length - 1];
                const _aPrev = _aArr[_aArr.length - 2];
                const _aActual = _aLast ? _aLast.total : 0;
                const _aMeta = _aPrev ? _aPrev.total : 0;
                const _aOk = _aMeta > 0 ? (_aActual / _aMeta) >= 0.85 : true;
                const _score = [_aOk, parseFloat(riskIndex) <= 5, parseFloat(liquidity) >= 30, total >= baselinePatrimonio * 0.85, achievement >= 80].filter(Boolean).length;
                const _v = _score >= 4
                    ? { from: 'from-emerald-600', to: 'to-emerald-800', icon: '✓', title: 'Fondo Saludable', desc: 'Los indicadores clave están en zona positiva. El fondo opera con normalidad.', badgeTxt: 'ESTADO NORMAL' }
                    : _score >= 3
                    ? { from: 'from-amber-500', to: 'to-amber-700', icon: '▲', title: 'Requiere Revisión', desc: 'Algunos indicadores están fuera del rango óptimo. Revisar cartera y liquidez.', badgeTxt: 'ATENCIÓN' }
                    : { from: 'from-red-600', to: 'to-red-800', icon: '⚠', title: 'Alerta Operativa', desc: 'Múltiples indicadores requieren atención inmediata. Convocar revisión del comité.', badgeTxt: 'CRÍTICO' };
                return (
                    <div className={`bg-gradient-to-r ${_v.from} ${_v.to} px-6 py-4 flex items-center justify-between gap-4`}>
                        <div className="flex items-center gap-4">
                            <div className="bg-white/15 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">
                                <span className="text-xl font-black text-white">{_v.icon}</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white leading-none">{_v.title}</h3>
                                <p className="text-sm text-white/75 font-medium mt-0.5">{_v.desc}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-[11px] font-black px-3 py-1 rounded-full bg-white/20 text-white">{_v.badgeTxt}</span>
                            <div className="text-right">
                                <p className="text-[11px] text-white/50 font-bold uppercase tracking-wide">Actualizado</p>
                                <p className="text-[11px] font-black text-white">{new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── KPIs EJECUTIVOS — 5 métricas con delta vs 2025 ────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 border-b border-gray-100">
                {/* KPI 1: Capital Total */}
                <div className="bg-gradient-to-br from-emerald-50 to-white p-5 flex flex-col gap-3 border-b md:border-b-0 border-r border-gray-100">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Capital Total</p>
                        <div className="bg-emerald-100 p-1.5 rounded-xl"><DollarSign className="h-3.5 w-3.5 text-emerald-600" /></div>
                    </div>
                    <p className="text-[22px] font-black text-gray-900 font-mono leading-none">
                        ${Number(total).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </p>
                    {/* Aquí SÍ es válido comparar contra el año completo: el capital es un
                        saldo a una fecha (un stock), no un acumulado del período. Contrastar
                        el saldo de hoy con el saldo de cierre del año anterior compara dos
                        fotos equivalentes. Solo se corrige el año fijo en el texto. */}
                    {(() => {
                        const ref = baselinePatrimonio;
                        const pct = ((total / ref) * 100 - 100).toFixed(1);
                        const up = total >= ref;
                        return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{up ? '▲' : '▼'} {Math.abs(pct)}% vs cierre {baselineAnio}</span>;
                    })()}
                    <div>
                        <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                            <div className="bg-lime-500 rounded-l-full" style={{ width: `${total > 0 ? (disponible / total) * 100 : 0}%` }} />
                            <div className="bg-emerald-700 rounded-r-full flex-1" />
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold">
                            <span className="text-lime-600">● Disponible</span>
                            <span className="text-emerald-700">● Cartera</span>
                        </div>
                    </div>
                </div>

                {/* KPI 2: Liquidez — paleta semántica: verde = salud financiera, ámbar = atención */}
                <div className={`p-5 flex flex-col gap-3 border-b md:border-b-0 border-r border-gray-100 ${parseFloat(liquidity) >= 30 ? 'bg-gradient-to-br from-emerald-50 to-white' : 'bg-gradient-to-br from-amber-50 to-white'}`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Liquidez</p>
                        <div className={`p-1.5 rounded-xl ${parseFloat(liquidity) >= 30 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                            <ActivitySquare className={`h-3.5 w-3.5 ${parseFloat(liquidity) >= 30 ? 'text-emerald-600' : 'text-amber-600'}`} />
                        </div>
                    </div>
                    <p className="text-[26px] font-black text-gray-900 font-mono leading-none">
                        {liquidity}<span className="text-sm font-bold text-gray-400 ml-0.5">%</span>
                    </p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${parseFloat(liquidity) >= 50 ? 'bg-emerald-100 text-emerald-700' : parseFloat(liquidity) >= 30 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {parseFloat(liquidity) >= 50 ? '● Óptima' : parseFloat(liquidity) >= 30 ? '● Saludable' : '▲ Ajustada'}
                    </span>
                    <div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${parseFloat(liquidity) >= 30 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${liquidity}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold mt-1">${Number(disponible).toLocaleString('es-CO')} disponibles</p>
                    </div>
                </div>

                {/* KPI 3: Mora en Cartera */}
                <div className={`p-5 flex flex-col gap-3 border-b md:border-b-0 border-r border-gray-100 ${parseFloat(riskIndex) > 5 ? 'bg-gradient-to-br from-red-50 to-white' : 'bg-gradient-to-br from-blue-50 to-white'}`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Mora Cartera</p>
                        <div className={`p-1.5 rounded-xl ${parseFloat(riskIndex) > 5 ? 'bg-red-100' : 'bg-blue-100'}`}>
                            {parseFloat(riskIndex) > 5 ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> : <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />}
                        </div>
                    </div>
                    <p className="text-[26px] font-black text-gray-900 font-mono leading-none">
                        {riskIndex}<span className="text-sm font-bold text-gray-400 ml-0.5">%</span>
                    </p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${parseFloat(riskIndex) <= 3 ? 'bg-emerald-100 text-emerald-700' : parseFloat(riskIndex) <= 5 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                        {parseFloat(riskIndex) <= 3 ? '● Bajo' : parseFloat(riskIndex) <= 5 ? '● Aceptable' : '⚠ Atención'}
                    </span>
                    <div>
                        <div className="relative flex h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-400 w-[33%]" />
                            <div className="bg-amber-400 w-[17%]" />
                            <div className="bg-red-400 flex-1" />
                            <div className="absolute top-0 bottom-0 w-0.5 bg-gray-900 rounded-full" style={{ left: `${Math.min(parseFloat(riskIndex) * 2, 98)}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold mt-1">${Number(mora).toLocaleString('es-CO')} en mora</p>
                    </div>
                </div>

                {/* KPI 4: Ganancia YTD */}
                <div className={`p-5 flex flex-col gap-3 border-b md:border-b-0 border-r border-gray-100 bg-gradient-to-br ${achievement >= 100 ? 'from-emerald-50' : achievement >= 80 ? 'from-amber-50' : 'from-red-50'} to-white`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Ganancia {new Date().getFullYear()}</p>
                        <div className={`p-1.5 rounded-xl ${achievement >= 80 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                            <TrendingUp className={`h-3.5 w-3.5 ${achievement >= 80 ? 'text-emerald-600' : 'text-amber-600'}`} />
                        </div>
                    </div>
                    <p className="text-[19px] font-black text-gray-900 font-mono leading-none">
                        ${Math.round(rentabilidadActual).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </p>
                    {/* Antes esta insignia decía "vs {año anterior}" pero dividía entre la META
                        anual, no entre lo ganado el año anterior: dos tarjetas del panel podían
                        mostrar porcentajes distintos con la misma etiqueta. Ahora compara contra
                        el año anterior AL MISMO CORTE, que es lo que la etiqueta promete. */}
                    {growthVsPrevYtd !== null ? (
                        <span
                            title={`Ganancia acumulada de este año frente al ritmo de ${baselineAnio}: se compara contra el resultado de ese año prorrateado al ${fraccionAnio !== null ? (fraccionAnio * 100).toFixed(0) : '—'}% del calendario ya transcurrido.`}
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start border ${growthVsPrevYtd >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                            {growthVsPrevYtd >= 0 ? '▲' : '▼'} {growthVsPrevYtd >= 200 ? fmtVariacion(growthVsPrevYtd) : `${Math.abs(growthVsPrevYtd).toFixed(1)}%`} vs ritmo {baselineAnio}
                        </span>
                    ) : (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full self-start border bg-gray-50 text-gray-600 border-gray-200">
                            {comparacionPrematura ? 'Aún es pronto para comparar' : `Sin comparativo de ${baselineAnio}`}
                        </span>
                    )}
                    <div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${achievement >= 100 ? 'bg-emerald-500' : achievement >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(achievement, 100)}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold mt-1">{achievement.toFixed(0)}% de meta anual</p>
                    </div>
                </div>

                {/* KPI 5: Proyección Dic */}
                <div className="bg-gradient-to-br from-slate-50 to-white p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Proyección Dic</p>
                        <div className="bg-slate-100 p-1.5 rounded-xl"><BarChart3 className="h-3.5 w-3.5 text-slate-600" /></div>
                    </div>
                    <p className="text-[19px] font-black text-gray-900 font-mono leading-none">
                        ${Math.round(proyeccionTotal).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </p>
                    {/* Este porcentaje divide entre la META anual (AppSettings.metaGananciaAnual),
                        no entre lo ganado el año anterior. Decía "vs 2025" y coincidía solo porque
                        la meta se sembró con el resultado real de 2025; en cuanto el comité edite
                        la meta, la etiqueta habría mentido. */}
                    {(() => {
                        const pctExacto = (proyeccionTotal / rentabilidad2025) * 100 - 100;
                        const up = proyeccionTotal >= rentabilidad2025;
                        // Cuando la proyección cae casi exactamente sobre la meta, el
                        // redondeo a un decimal daba "▼ 0.0% vs meta anual": una flecha
                        // hacia abajo junto a un cero, que se lee como si el indicador
                        // estuviera roto. Por debajo de medio punto se dice lo que
                        // realmente ocurre — que va en línea con la meta.
                        if (Math.abs(pctExacto) < 0.5) {
                            return (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full self-start bg-emerald-100 text-emerald-700">
                                    ≈ En línea con la meta
                                </span>
                            );
                        }
                        return (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full self-start ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {up ? '▲' : '▼'} {Math.abs(pctExacto).toFixed(1)}% vs meta anual
                            </span>
                        );
                    })()}
                    <div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="bg-slate-500 h-full rounded-full" style={{ width: `${Math.min((proyeccionTotal / rentabilidad2025) * 100, 100)}%` }} />
                        </div>
                        {onEditMeta ? (
                            <button onClick={onEditMeta} className="text-[10px] text-gray-500 font-bold mt-1 hover:text-brand-primary transition-colors flex items-center gap-1" title="Editar meta anual">
                                Meta: ${Number(rentabilidad2025).toLocaleString('es-CO')} <Edit2 className="w-2.5 h-2.5" />
                            </button>
                        ) : (
                            <p className="text-[10px] text-gray-500 font-bold mt-1">Meta: ${Number(rentabilidad2025).toLocaleString('es-CO')}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Gráficos — 3 columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 border-b border-gray-100">

                {/* Chart 2: Capital del Fondo — composición patrimonial */}
                {(() => {
                    const aportes = stats.totalInitialContributions || 0;
                    const ahorros = Math.max(0, (stats.totalSavings || 0) - (stats.totalPenaltyValue || 0));
                    const tf = aportes + ahorros;
                    const ahorroPct = tf > 0 ? ((ahorros / tf) * 100) : 0;
                    const aportePct = tf > 0 ? ((aportes / tf) * 100) : 0;

                    const diagnostico = ahorroPct >= 60
                        ? { signal: '✓ Fondeo sano', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100', txt: `El ahorro recurrente (${ahorroPct.toFixed(0)}%) sostiene el capital — la base más robusta para una cooperativa. Cada peso de ahorro mensual adicional se traduce directamente en mayor cupo crediticio para los socios.` }
                        : ahorroPct >= 40
                        ? { signal: '● Fondeo mixto', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100', txt: `Balance entre ahorros (${ahorroPct.toFixed(0)}%) y aportes (${aportePct.toFixed(0)}%). Incrementar el ahorro mensual ampliaría la capacidad prestable de forma sostenible.` }
                        : { signal: '▲ Revisar fondeo', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100', txt: `Los aportes dominan (${aportePct.toFixed(0)}%). Fortalecer el ahorro mensual es la palanca de crecimiento más importante — convierte el fondo de capitalización puntual a acumulación continua.` };

                    return (
                        <div className="p-6 flex flex-col gap-4">
                            {/* Encabezado */}
                            <div>
                                <h3 className="text-[12px] font-black text-gray-800">Capital del Fondo</h3>
                                <p className="text-[10px] text-gray-400 mt-0.5">Composición del patrimonio · socios activos · ahorro neto de recargos por mora</p>
                            </div>

                            {/* Patrimonio total centrado */}
                            <div className="text-center py-2">
                                <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1">Patrimonio Total</p>
                                <p className="text-[26px] font-black text-gray-900 font-mono leading-none">
                                    ${Number(tf).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                </p>
                            </div>

                            {/* Barra de composición apilada */}
                            <div>
                                <div className="flex h-7 rounded-full overflow-hidden shadow-inner">
                                    <div className="bg-amber-400 flex items-center justify-center transition-all"
                                        style={{ width: `${aportePct}%` }}>
                                        {aportePct >= 15 && <span className="text-[11px] font-black text-white">{aportePct.toFixed(0)}%</span>}
                                    </div>
                                    <div className="bg-emerald-500 flex items-center justify-center flex-1 transition-all">
                                        <span className="text-[11px] font-black text-white">{ahorroPct.toFixed(0)}%</span>
                                    </div>
                                </div>
                                <div className="flex justify-between mt-2 text-[11px] font-bold">
                                    <span className="flex items-center gap-1 text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Base Patrimonial</span>
                                    <span className="flex items-center gap-1 text-emerald-600">Ahorro Recurrente<span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /></span>
                                </div>
                            </div>

                            {/* Stat cards */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                    <p className="text-[11px] font-black text-amber-600 uppercase tracking-wider">Aportes Iniciales</p>
                                    <p className="text-[13px] font-black text-amber-800 font-mono mt-0.5">${Number(aportes).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                                    <p className="text-[11px] text-amber-600/70 mt-0.5">{aportePct.toFixed(0)}% del capital</p>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                                    <p className="text-[11px] font-black text-emerald-600 uppercase tracking-wider">Ahorros Mensuales</p>
                                    <p className="text-[13px] font-black text-emerald-800 font-mono mt-0.5">${Number(ahorros).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                                    <p className="text-[11px] text-emerald-600/70 mt-0.5">{ahorroPct.toFixed(0)}% del capital</p>
                                </div>
                            </div>

                            {/* Diagnóstico condensado */}
                            <div className={`rounded-xl px-3 py-2.5 border mt-auto ${diagnostico.bg}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[11px] font-black uppercase tracking-widest ${diagnostico.color}`}>{diagnostico.signal}</span>
                                </div>
                                <p className={`text-[10px] leading-relaxed ${diagnostico.color.replace('700', '600')}`}>{diagnostico.txt}</p>
                            </div>
                        </div>
                    );
                })()}


                {/* Chart 3: Rentabilidad — col-span-2, nuevo layout: titular → donut izq + cards der */}
                <div className="lg:col-span-2 flex flex-col">
                    {(() => {
                        const rentSources = [
                            { label: 'Intereses de préstamos', value: stats.totalInteresesPagados || 0, hex: '#3b82f6', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', bar: 'bg-blue-400' },
                            { label: 'Rendimiento cuenta NU',  value: stats.rentabilidadCajaNU || 0,     hex: '#8b5cf6', bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700', bar: 'bg-violet-400' },
                            { label: 'Cobros por mora',        value: stats.totalPenaltyValue || 0,      hex: '#ef4444', bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-600',    bar: 'bg-red-400' },
                        ];
                        const totalRent = rentSources.reduce((s, x) => s + x.value, 0);
                        const sorted = [...rentSources].sort((a, b) => b.value - a.value);
                        const topPct = totalRent > 0 ? ((sorted[0].value / totalRent) * 100).toFixed(0) : 0;
                        const secondPct = totalRent > 0 ? ((sorted[1].value / totalRent) * 100).toFixed(0) : 0;

                        const analysisTexts = {
                            'Intereses de préstamos': <>La <strong>cartera crediticia</strong> lidera los ingresos con el {topPct}% — la estructura más sana para una cooperativa. Esta concentración es deseable pero concentra el riesgo: <strong>una caída en colocación o aumento de mora impacta el flujo directamente</strong>. El rendimiento NU ({secondPct}%) complementa como buffer. <strong>Acción clave:</strong> mora &lt;5%, sostener colocación y explorar instrumentos complementarios.</>,
                            'Rendimiento cuenta NU': <><strong className="text-amber-700">Señal de alerta:</strong> el NU lidera ({topPct}%) sobre la cartera ({secondPct}%). En una cooperativa sana el NU es complementario (15–25%), no estructural. Capital estacionado pierde la diferencia de 12–20 puntos entre tasa activa y rendimiento NU. <strong>Acción prioritaria:</strong> revisar política de aprobación y fijar meta mensual de colocación.</>,
                            'Cobros por mora': <><strong className="text-red-700">Alerta crítica:</strong> mora lidera ingresos ({topPct}%). Las penalidades no son sostenibles — erosionan la confianza y ocultan deterioro patrimonial. <strong>Plan urgente:</strong> auditar cartera vencida, cobro preventivo 15 días antes del vencimiento y revisar criterios de aprobación.</>,
                        };

                        return (
                            <>
                            {/* HOOK: Titular ganancia total */}
                            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-[12px] font-black text-gray-800">¿Cuánto está ganando el fondo?</h3>
                                    {/* El período es el AÑO EN CURSO, no el selector de años de la página:
                                        esta cifra viene de fundProjection.js, que siempre acota al año
                                        calendario vigente. Antes el rótulo decía "2026 – 2027" y sugería
                                        que la ganancia incluía el año siguiente. */}
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        Intereses y recargos de {anioActualProyeccion} al {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })} · Cta. NU: valor acumulado ingresado manualmente
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Ganancia Total</p>
                                        <p className="text-[26px] font-black text-emerald-700 font-mono leading-none">
                                            ${Math.round(totalRent).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                        </p>
                                    </div>
                                    <button onClick={() => setExpandDonut(true)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700 flex-shrink-0" title="Ampliar y analizar">
                                        <Maximize2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* BODY: Donut izquierda + fuentes derecha */}
                            <div className="flex flex-col md:flex-row flex-1">
                                {/* Donut — LEFT (visual principal) */}
                                <div className="md:w-[45%] flex items-center justify-center p-4 border-b md:border-b-0 md:border-r border-gray-100">
                                    <div className="relative w-full" style={{ height: 260 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart margin={{ top: 8, right: 40, bottom: 8, left: 40 }}>
                                                <Pie
                                                    data={rentSources}
                                                    cx="50%" cy="50%"
                                                    innerRadius="44%" outerRadius="70%"
                                                    dataKey="value" nameKey="label"
                                                    startAngle={90} endAngle={-270} paddingAngle={3}
                                                    label={({ cx, cy, midAngle, outerRadius, payload, percent }) => {
                                                        const RADIAN = Math.PI / 180;
                                                        const r = outerRadius + 18;
                                                        const x = cx + r * Math.cos(-midAngle * RADIAN);
                                                        const y = cy + r * Math.sin(-midAngle * RADIAN);
                                                        const anchor = x > cx ? 'start' : 'end';
                                                        const shortNames = { 'Intereses de préstamos': 'Intereses', 'Rendimiento cuenta NU': 'Cta. NU', 'Cobros por mora': 'Mora' };
                                                        if (percent < 0.04) return null;
                                                        return (
                                                            <g>
                                                                <text x={x} y={y - 12} textAnchor={anchor} fill={payload.hex} fontSize={12} fontWeight="800">{shortNames[payload.label]}</text>
                                                                <text x={x} y={y + 2} textAnchor={anchor} fill="#6b7280" fontSize={11} fontWeight="700">{(percent * 100).toFixed(0)}%</text>
                                                                <text x={x} y={y + 15} textAnchor={anchor} fill="#9ca3af" fontSize={10} fontWeight="600">${Math.round(payload.value).toLocaleString('es-CO')}</text>
                                                            </g>
                                                        );
                                                    }}
                                                    labelLine={{ stroke: '#d1d5db', strokeWidth: 1.5 }}
                                                >
                                                    {rentSources.map((s, i) => (
                                                        <Cell key={i} fill={s.hex} strokeWidth={0} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={({ active, payload }) => {
                                                    if (active && payload?.length) {
                                                        const d = payload[0];
                                                        const pct = totalRent > 0 ? ((d.value / totalRent) * 100).toFixed(1) : 0;
                                                        return (
                                                            <div className="bg-white p-2 border border-gray-100 shadow-lg rounded-lg text-xs">
                                                                <p className="font-bold text-gray-700">{d.payload.label}</p>
                                                                <p className="font-mono font-black" style={{ color: d.payload.hex }}>${Number(d.value).toLocaleString('es-CO')}</p>
                                                                <p className="text-gray-400">{pct}% del total</p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Total</span>
                                            <span className="text-[17px] font-black text-gray-900 font-mono leading-tight">${Math.round(totalRent).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                                            <span className="text-[11px] text-gray-400 font-bold">{new Date().getFullYear()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Fuentes + análisis — RIGHT */}
                                <div className="md:w-[55%] p-5 flex flex-col gap-3">
                                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Desglose por Fuente</p>

                                    {/* Source bars — compactos */}
                                    <div className="space-y-2">
                                        {sorted.map((item, idx) => {
                                            const pct = totalRent > 0 ? (item.value / totalRent) * 100 : 0;
                                            return (
                                                <div key={item.label} className={`rounded-xl p-2.5 ${item.bg}`}
                                                    style={{ border: `${idx === 0 ? 2 : 1}px solid ${item.hex}${idx === 0 ? '50' : '25'}` }}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-1.5">
                                                            {idx === 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: item.hex }}>#1</span>}
                                                            <span className={`text-[11px] font-black ${item.text} uppercase tracking-wide`}>{item.label}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] font-bold ${item.text} opacity-70`}>{pct.toFixed(0)}%</span>
                                                            <span className={`text-[11px] font-black ${item.text} font-mono`}>${Number(item.value).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-1 bg-white/60 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${item.bar}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Análisis del experto */}
                                    <div className="rounded-xl px-3 py-2.5 bg-gray-50 border border-gray-100 mt-auto">
                                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1">Análisis del Experto</p>
                                        <p className="text-[11px] text-gray-600 leading-relaxed">
                                            {analysisTexts[sorted[0].label] || analysisTexts['Intereses de préstamos']}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <ChartExpandModal
                                isOpen={expandDonut}
                                onClose={() => setExpandDonut(false)}
                                title="¿Cuánto está ganando el fondo? — Distribución de Ingresos"
                                analysisResult={analyzeIncomeDistribution({ totalInteresesPagados: stats.totalInteresesPagados, rentabilidadCajaNU: stats.rentabilidadCajaNU, totalPenaltyValue: stats.totalPenaltyValue })}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={rentSources} cx="50%" cy="50%" innerRadius="35%" outerRadius="60%" dataKey="value" nameKey="label" paddingAngle={3}
                                            label={({ cx, cy, midAngle, outerRadius, payload, percent }) => {
                                                const RADIAN = Math.PI / 180;
                                                const r = outerRadius + 22;
                                                const x = cx + r * Math.cos(-midAngle * RADIAN);
                                                const y = cy + r * Math.sin(-midAngle * RADIAN);
                                                const anchor = x > cx ? 'start' : 'end';
                                                const shortNames = { 'Intereses de préstamos': 'Intereses', 'Rendimiento cuenta NU': 'Cta. NU', 'Cobros por mora': 'Mora' };
                                                return (
                                                    <g>
                                                        <text x={x} y={y - 7} textAnchor={anchor} fill={payload.hex} fontSize={13} fontWeight="800">{shortNames[payload.label]}</text>
                                                        <text x={x} y={y + 9} textAnchor={anchor} fill="#6b7280" fontSize={12} fontWeight="700">{(percent * 100).toFixed(0)}%</text>
                                                    </g>
                                                );
                                            }}
                                            labelLine={{ stroke: '#d1d5db', strokeWidth: 1.5 }}
                                        >
                                            {rentSources.map((s, i) => <Cell key={i} fill={s.hex} strokeWidth={0} />)}
                                        </Pie>
                                        <Tooltip formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} contentStyle={{ fontSize: '11px', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </ChartExpandModal>
                            </>
                        );
                    })()}
                </div>
            </div>

            {/* Fila Inferior: ¿Cuánto está ganando el fondo? */}
            <div className="p-4 bg-gray-50/50 border-t border-gray-100">
                {(() => {
                    // El indicador principal compara contra el RITMO del año anterior
                    // (su resultado completo prorrateado al tiempo transcurrido). Si no
                    // hay con qué comparar, se declara así en vez de inventar un número.
                    const growthOk = growthVsPrevYtd === null || growthVsPrevYtd >= 0;

                    return (
                        <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                            <div className="w-full md:w-1/4">
                                {/* El título "¿Cuánto está ganando el fondo?" ya encabeza el bloque del
                                    donut, unas líneas más arriba dentro de esta misma tarjeta. Aquí se
                                    nombra lo que realmente hace esta sección: comparar contra el año
                                    anterior, en vez de repetir la misma pregunta dos veces. */}
                                <h3 className="text-base font-extrabold text-gray-900">¿Vamos mejor que el año pasado?</h3>
                                <p className="inline-block mt-1 text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wide">
                                    {fraccionAnio !== null
                                        ? `vs el ritmo de ${baselineAnio} · ${(fraccionAnio * 100).toFixed(0)}% del año`
                                        : `Comparado con ${baselineAnio}`}
                                </p>

                                <div className={`mt-3 border rounded-xl p-4 flex flex-col items-center justify-center shadow-sm transition-all duration-500 ${growthVsPrevYtd === null ? 'bg-gray-50 border-gray-200' : growthOk ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${growthVsPrevYtd === null ? 'text-gray-500' : growthOk ? 'text-emerald-600/70' : 'text-red-600/70'}`}>Resultado total</span>
                                    <span className={`text-3xl font-black font-mono ${growthVsPrevYtd === null ? 'text-gray-900' : growthOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {growthVsPrevYtd === null ? '—' : fmtVariacion(growthVsPrevYtd)}
                                    </span>
                                    {/* El % solo dice "cuánto más rápido"; el socio también necesita
                                        "cuánto más rápido EN PESOS" — la diferencia real entre lo
                                        acumulado y el ritmo del año anterior a esta misma altura. */}
                                    {gananciaPrevRitmo !== null && (
                                        <span className={`text-sm font-black font-mono mt-0.5 ${growthOk ? 'text-emerald-700/90' : 'text-red-700/90'}`}>
                                            {growthOk ? '+' : '−'}${Math.round(Math.abs(rentabilidadActual - gananciaPrevRitmo)).toLocaleString('es-CO')}
                                        </span>
                                    )}
                                    <span className={`text-[10px] mt-1 font-semibold text-center leading-snug ${growthVsPrevYtd === null ? 'text-gray-500' : growthOk ? 'text-emerald-700/80' : 'text-red-700/80'}`}>
                                        {growthVsPrevYtd === null
                                            ? (comparacionPrematura
                                                ? 'Aún es pronto en el año para comparar'
                                                : `Sin datos de ${baselineAnio} para comparar`)
                                            : growthOk
                                                ? `Vamos por encima del ritmo de ${baselineAnio}`
                                                : `Vamos por debajo del ritmo de ${baselineAnio}`}
                                    </span>
                                    <span className="text-[11px] mt-1.5 font-bold text-gray-500 text-center leading-snug">
                                        {gananciaPrevRitmo !== null
                                            ? `Ritmo de ${baselineAnio} a esta altura: $${Math.round(gananciaPrevRitmo).toLocaleString('es-CO')} · llevamos $${Math.round(rentabilidadActual).toLocaleString('es-CO')}`
                                            : 'Intereses + mora + cuenta NU'}
                                    </span>
                                </div>

                                {/* Avance sobre el año completo: dato útil, pero rotulado como lo que
                                    es (progreso), nunca como una caída. */}
                                {avanceSobreAnioCompleto !== null && (
                                    <div className="mt-2 bg-white border border-gray-200 rounded-xl p-3">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Avance del año</span>
                                            <span className="text-sm font-black font-mono text-gray-800">{avanceSobreAnioCompleto.toFixed(0)}%</span>
                                        </div>
                                        <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-brand-primary transition-all duration-700"
                                                style={{ width: `${Math.min(avanceSobreAnioCompleto, 100)}%` }} />
                                        </div>
                                        <p className="text-[10px] text-gray-500 font-semibold mt-1.5 leading-snug">
                                            Llevamos el {avanceSobreAnioCompleto.toFixed(0)}% de lo que se ganó en todo {baselineAnio}
                                            {fraccionAnio !== null && `, con el ${(fraccionAnio * 100).toFixed(0)}% del año transcurrido`}.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="w-full md:w-3/4 bg-white rounded-xl p-1 border border-gray-200 shadow-sm overflow-x-auto">
                                <table className="w-full text-sm min-w-[600px] border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100 text-gray-800 uppercase tracking-wider text-[11px]">
                                            <th className="text-left font-extrabold p-3 rounded-tl-lg">Fuente de ingreso</th>
                                            <th className="text-right font-extrabold p-3">{baselineAnio} completo</th>
                                            <th className="text-right font-extrabold p-3">Lo que llevamos en {baselineAnio + 1}</th>
                                            <th className="text-right font-extrabold p-3 text-brand-primary rounded-tr-lg">Estimado al cierre del año</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="p-3 text-gray-900 font-bold">
                                                Intereses de préstamos
                                                <p className="text-[10px] text-emerald-700 font-semibold">Lo que pagan los socios por sus préstamos</p>
                                            </td>
                                            <td className="p-3 text-right text-gray-500 font-bold bg-gray-50/50">${baselineIntereses.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-blue-700 border-l">${Math.round(interesesActualYtd).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black border-l text-brand-primary">
                                                ${Math.round(proyeccionIntereses).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="p-3 text-gray-900 font-bold">
                                                Rendimiento cuenta NU
                                                <p className="text-[10px] text-emerald-700 font-semibold">Intereses que genera el dinero guardado en NU</p>
                                            </td>
                                            <td className="p-3 text-right text-gray-500 font-bold bg-gray-50/50">${baselineNU.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-purple-700 border-l">${Math.round(stats.rentabilidadCajaNU || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black border-l text-brand-primary">
                                                ${Math.round(proyeccionCajaNU).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="p-3 text-gray-900 font-bold">
                                                Cobros por pagos tardíos
                                                <p className="text-[10px] text-emerald-700 font-semibold">Recargo aplicado a socios con cuotas vencidas</p>
                                            </td>
                                            <td className="p-3 text-right text-gray-500 font-bold bg-gray-50/50">${baselineMora.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-red-600 border-l">${Math.round(moraActualYtd).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black border-l text-brand-primary">
                                                ${Math.round(proyeccionPenalidad).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                            </td>
                                        </tr>
                                        <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                                            <td className="p-3 text-emerald-900 font-black text-base uppercase tracking-wider">Ganancia total del fondo</td>
                                            <td className="p-3 text-right text-gray-500 font-bold text-base">${gananciaReal2025.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-emerald-700 text-lg border-l">${Math.round(rentabilidadActual).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-lg border-l rounded-br-lg text-emerald-800">
                                                ${Math.round(proyeccionTotal).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <p className="text-[11px] text-gray-500 font-semibold px-3 py-2 leading-snug">
                                    La columna de {baselineAnio} es el año <strong>completo</strong> (12 meses); la del año
                                    en curso es lo acumulado hasta hoy, así que aún le faltan meses. Para saber si vamos
                                    mejor o peor, mira el indicador de la izquierda: ahí la comparación sí está ajustada al
                                    tiempo transcurrido. El <strong>rendimiento de la cuenta NU</strong> entra en el total.
                                </p>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* ── Comparador interanual ─────────────────────────────────────── */}
            <div className="p-6 bg-white border-t border-gray-200" data-pdf-section="true">
                <div className="flex items-start gap-3 mb-5">
                    <div className="p-2 bg-brand-primary rounded-lg shadow-lg shadow-brand-primary/20 shrink-0">
                        <LineChartIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 leading-tight">Comparar con años anteriores</h3>
                        <p className="text-xs text-gray-500 font-semibold mt-1 leading-snug">
                            Elige el indicador y los años que quieras contrastar. Cada año se dibuja sobre los mismos
                            meses, así la comparación siempre es entre períodos equivalentes.
                        </p>
                    </div>
                </div>
                <YearComparisonChart data={yearCmp} error={yearCmpError} />
            </div>

            {/* Resultados del Año */}
            <div className="p-6 bg-slate-50/80 border-t border-gray-200" data-pdf-section="true">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-brand-primary rounded-lg shadow-lg shadow-brand-primary/20">
                        <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 leading-none">Resultados del Año — Fondo Credifuturo</h3>
                        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-tighter mt-1">
                            {nombreMesCorte
                                ? `Año en curso frente a ${baselineAnio}, medido hasta el ${nombreMesCorte} en ambos años`
                                : `¿Cómo vamos comparado con ${baselineAnio}?`}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <YearProgressCard
                        title="Ahorro de los Socios"
                        subtitle="Ahorro mensual + aportes iniciales, por año"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={ahorroPrevTotal}
                        actual={ahorroActualTotal}
                        fraccionAnio={fraccionAnio}
                        nota={ahorroComposicionNota}
                        onExpand={() => setExpandComp('ahorro')}
                    />
                    <YearProgressCard
                        title="Préstamos Entregados"
                        subtitle="Dinero colocado en créditos a los socios"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselinePrestamos}
                        actual={colocacionActualYtd}
                        fraccionAnio={fraccionAnio}
                        onExpand={() => setExpandComp('prestamos')}
                    />
                    {/* El patrimonio es un SALDO a una fecha, no un acumulado del
                        período: comparar la foto de hoy con la del cierre anterior sí
                        es válido, y la noción de "ritmo" no aplica. */}
                    <YearProgressCard
                        title="Patrimonio del Fondo"
                        subtitle="Cuánto vale el fondo hoy"
                        tipo="saldo"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselinePatrimonio}
                        actual={total}
                        fraccionAnio={fraccionAnio}
                        onExpand={() => setExpandComp('patrimonio')}
                    />
                    <YearProgressCard
                        title="Ganancias por Intereses"
                        subtitle="Lo que pagan los socios por sus préstamos"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselineIntereses}
                        actual={interesesActualYtd}
                        proyeccion={proyeccionIntereses}
                        fraccionAnio={fraccionAnio}
                        nota={`Además hay ${'$'}${Number(Math.max(0, (stats.totalIntereses || 0) - (stats.totalInteresesPagados || 0))).toLocaleString('es-CO', { maximumFractionDigits: 0 })} en intereses por cobrar: cuotas que los socios aún no han pagado. Cuando se paguen, se sumarán a esta cifra.`}
                        onExpand={() => setExpandComp('intereses')}
                    />
                    {/* NU no tiene serie mensual (el admin edita un único saldo), pero
                        sí un cierre anual guardado — se compara igual que Intereses. */}
                    <YearProgressCard
                        title="Rendimiento Cuenta NU"
                        subtitle="Interés que genera el dinero guardado en NU"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselineNU}
                        actual={stats.rentabilidadCajaNU || 0}
                        proyeccion={proyeccionCajaNU}
                        fraccionAnio={fraccionAnio}
                        nota="Saldo actualizado a mano por el administrador según el extracto más reciente — no tiene registro mensual, por eso el estimado de cierre es una extrapolación simple."
                        onExpand={() => setExpandComp('nu')}
                    />
                    {/* Mora: tono rojo y masEsMejor=false — aquí crecer es una mala señal. */}
                    <YearProgressCard
                        title="Cobros por Pagos Tardíos"
                        subtitle="Recargo aplicado a socios con cuotas vencidas"
                        tono="rojo"
                        masEsMejor={false}
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselineMora}
                        actual={moraActualYtd}
                        proyeccion={proyeccionPenalidad}
                        fraccionAnio={fraccionAnio}
                        onExpand={() => setExpandComp('mora')}
                    />
                </div>

                {/* ── Modales de expansión de gráficas comparativas ── */}
                <ChartExpandModal isOpen={expandComp === 'ahorro'} onClose={() => setExpandComp(null)}
                    title={`Ahorro de los Socios — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Ahorro de los Socios', historic: ritmoPrev(ahorroPrevTotal), current: ahorroActualTotal, progressPct: Math.min((ahorroActualTotal / (ritmoPrev(ahorroPrevTotal) || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Ahorro de los Socios" subtitle="Ahorro mensual + aportes iniciales, por año" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={ahorroPrevTotal} actual={ahorroActualTotal} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'prestamos'} onClose={() => setExpandComp(null)}
                    title={`Préstamos Entregados — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Préstamos Entregados', historic: ritmoPrev(baselinePrestamos), current: colocacionActualYtd, progressPct: Math.min((colocacionActualYtd / (ritmoPrev(baselinePrestamos) || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Préstamos Entregados" subtitle="Dinero colocado en créditos a los socios" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselinePrestamos} actual={colocacionActualYtd} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'patrimonio'} onClose={() => setExpandComp(null)}
                    title={`Patrimonio del Fondo — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Patrimonio del Fondo', historic: baselinePatrimonio, current: total, projectedYearEnd: baselinePatrimonio + proyeccionTotal, progressPct: Math.min((total / (baselinePatrimonio || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Patrimonio del Fondo" subtitle="Cuánto vale el fondo hoy" tipo="saldo" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselinePatrimonio} actual={total} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'intereses'} onClose={() => setExpandComp(null)}
                    title={`Ganancias por Intereses — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Ganancias por Intereses', historic: ritmoPrev(baselineIntereses), current: interesesActualYtd, projectedYearEnd: proyeccionIntereses, progressPct: Math.min((interesesActualYtd / (ritmoPrev(baselineIntereses) || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Ganancias por Intereses" subtitle="Lo que pagan los socios por sus préstamos" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselineIntereses} actual={interesesActualYtd} proyeccion={proyeccionIntereses} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'nu'} onClose={() => setExpandComp(null)}
                    title={`Rendimiento Cuenta NU — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Rendimiento Cuenta NU', historic: ritmoPrev(baselineNU), current: stats.rentabilidadCajaNU || 0, projectedYearEnd: proyeccionCajaNU, progressPct: Math.min(((stats.rentabilidadCajaNU || 0) / (ritmoPrev(baselineNU) || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Rendimiento Cuenta NU" subtitle="Interés que genera el dinero guardado en NU" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselineNU} actual={stats.rentabilidadCajaNU || 0} proyeccion={proyeccionCajaNU} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'mora'} onClose={() => setExpandComp(null)}
                    title={`Cobros por Pagos Tardíos — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Cobros por Pagos Tardíos', historic: ritmoPrev(baselineMora), current: moraActualYtd, projectedYearEnd: proyeccionPenalidad, progressPct: Math.min((moraActualYtd / (ritmoPrev(baselineMora) || 1)) * 100, 150), masEsMejor: false })}>
                    <YearProgressCard compact title="Cobros por Pagos Tardíos" subtitle="Recargo aplicado a socios con cuotas vencidas" tono="rojo" masEsMejor={false} anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselineMora} actual={moraActualYtd} proyeccion={proyeccionPenalidad} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>

                {/* ── Diagnóstico Financiero — 3 Insight Cards ─────────────────── */}
                {(() => {
                    const ahorroArr = stats.ahorroPorAnio || [];
                    const ahorroLast = ahorroArr[ahorroArr.length - 1];
                    const ahorroPrev = ahorroArr[ahorroArr.length - 2];
                    const ahorroYearActual = ahorroLast ? ahorroLast.anio : new Date().getFullYear();
                    const ahorroYearPrev = ahorroPrev ? ahorroPrev.anio : ahorroYearActual - 1;
                    const ahorroMeta = ahorroPrev ? ahorroPrev.total : 0;
                    const ahorroActual = ahorroLast ? ahorroLast.total : 0;
                    const ahorroPct = ahorroMeta > 0 ? ((ahorroActual / ahorroMeta) * 100).toFixed(1) : '0.0';
                    const ahorroDiff = ahorroActual - ahorroMeta;
                    const ahorroHealthy = parseFloat(ahorroPct) >= 95;

                    const prestamoMeta = baselinePrestamos;
                    const prestamoActual = stats.totalPrestamos || 0;
                    const prestamoPct = ((prestamoActual / (prestamoMeta || 1)) * 100).toFixed(1);

                    const interesesMeta = baselineIntereses;
                    const interesesActual = stats.totalInteresesPagados || 0;

                    const today = new Date();
                    const dayOfYear = Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24));
                    const pctYearElapsed = ((dayOfYear / 365) * 100).toFixed(0);

                    const interesesPaceTarget = interesesMeta * (dayOfYear / 365);
                    const interesesAheadOfPace = interesesActual >= interesesPaceTarget;
                    const interesesPacePct = interesesPaceTarget > 0 ? ((interesesActual / interesesPaceTarget) * 100).toFixed(1) : '0.0';

                    return (
                        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" data-pdf-section="true">
                            {/* Header */}
                            <div className="px-6 py-4 bg-gradient-to-r from-brand-primary to-emerald-800 flex items-center gap-3">
                                <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm flex-shrink-0">
                                    <ShieldCheck className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white">Diagnóstico Financiero — ¿Qué nos dicen los números?</h4>
                                    <p className="text-xs text-emerald-200 font-semibold mt-0.5">Análisis al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} · Llevamos el {pctYearElapsed}% del año</p>
                                </div>
                            </div>

                            {/* 3 Insight Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">

                                {/* Card 1: Ahorros */}
                                <div className={`p-5 flex flex-col gap-3 ${ahorroHealthy ? '' : 'bg-amber-50/40'}`}>
                                    <div className="flex items-start gap-2">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5 ${ahorroHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                                            {ahorroHealthy ? '✓' : '!'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Módulo 1 · Ahorro</p>
                                            <h5 className="text-sm font-black text-gray-900 leading-snug">¿Están ahorrando los socios?</h5>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${ahorroHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {ahorroHealthy ? 'BIEN' : 'REVISAR'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        En {ahorroYearPrev} los socios ahorraron <strong>${Number(ahorroMeta).toLocaleString('es-CO')}</strong>. Este año llevan <strong className={ahorroHealthy ? 'text-emerald-700' : 'text-amber-700'}>${Number(ahorroActual).toLocaleString('es-CO')}</strong> ({ahorroPct}% del año anterior).
                                        {ahorroDiff >= 0 ? ` Hay $${Number(ahorroDiff).toLocaleString('es-CO')} más que el año pasado.` : ` Hay $${Number(Math.abs(ahorroDiff)).toLocaleString('es-CO')} menos que el año pasado.`}
                                    </p>
                                    <div className={`rounded-lg p-3 mt-auto border ${ahorroHealthy ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                                        <p className="text-[11px] font-black uppercase tracking-wider mb-1 text-gray-500">Recomendación</p>
                                        <p className="text-[10px] font-semibold text-gray-700 leading-snug">
                                            {ahorroHealthy
                                                ? 'Mantener el ritmo. Reconocer públicamente a los socios cumplidos para sostener el hábito de ahorro.'
                                                : 'Identificar socios con aportes pendientes y hacer seguimiento personalizado antes del cierre de mes.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Card 2: Crédito y Cartera */}
                                <div className={`p-5 flex flex-col gap-3 ${parseFloat(riskIndex) > 5 ? 'bg-red-50/30' : ''}`}>
                                    <div className="flex items-start gap-2">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5 ${parseFloat(riskIndex) <= 5 ? 'bg-blue-500' : 'bg-red-500'}`}>
                                            {parseFloat(riskIndex) <= 5 ? '✓' : '!'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Módulo 2 · Crédito</p>
                                            <h5 className="text-sm font-black text-gray-900 leading-snug">¿Cómo está la cartera?</h5>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${parseFloat(riskIndex) <= 3 ? 'bg-emerald-100 text-emerald-700' : parseFloat(riskIndex) <= 5 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                            {parseFloat(riskIndex) <= 3 ? 'BAJO RIESGO' : parseFloat(riskIndex) <= 5 ? 'NORMAL' : 'ATENCIÓN'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Préstamos entregados: <strong className="text-blue-700">${Number(prestamoActual).toLocaleString('es-CO')}</strong> ({prestamoPct}% del nivel 2025).
                                        Mora actual: <strong className={parseFloat(riskIndex) > 5 ? 'text-red-700' : 'text-blue-700'}>{riskIndex}%</strong> del capital (<strong>${Number(mora).toLocaleString('es-CO')}</strong> en cuotas vencidas).
                                    </p>
                                    <div className={`rounded-lg p-3 mt-auto border ${parseFloat(riskIndex) <= 5 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                        <p className="text-[11px] font-black uppercase tracking-wider mb-1 text-gray-500">Recomendación</p>
                                        <p className="text-[10px] font-semibold text-gray-700 leading-snug">
                                            {parseFloat(riskIndex) <= 3
                                                ? 'Cartera saludable. Evaluar aprobación de nuevos préstamos — la liquidez lo permite.'
                                                : parseFloat(riskIndex) <= 5
                                                ? 'Mora aceptable. Activar recordatorios preventivos para cuotas próximas a vencer.'
                                                : 'Mora elevada. Priorizar gestión de cobro. Pausar nuevos préstamos hasta reducir el índice.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Card 3: Rentabilidad */}
                                <div className={`p-5 flex flex-col gap-3 ${achievement < 80 ? 'bg-red-50/30' : ''}`}>
                                    <div className="flex items-start gap-2">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5 ${achievement >= 100 ? 'bg-emerald-500' : achievement >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}>
                                            {achievement >= 80 ? '✓' : '!'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Módulo 3 · Rentabilidad</p>
                                            <h5 className="text-sm font-black text-gray-900 leading-snug">¿Está ganando el fondo?</h5>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${achievement >= 100 ? 'bg-emerald-100 text-emerald-700' : achievement >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                            {achievement >= 100 ? 'META' : achievement >= 80 ? 'EN CURSO' : 'REVISAR'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Ganancia acumulada: <strong className={achievement >= 80 ? 'text-emerald-700' : 'text-amber-700'}>${Math.round(rentabilidadActual).toLocaleString('es-CO')}</strong> ({achievement.toFixed(0)}% de meta).
                                        {interesesAheadOfPace
                                            ? ` Ritmo de intereses positivo (${interesesPacePct}% del esperado).`
                                            : ` Ritmo de intereses por debajo de lo esperado.`}
                                        Proyección dic: <strong>${Math.round(proyeccionTotal).toLocaleString('es-CO')}</strong>.
                                    </p>
                                    <div className={`rounded-lg p-3 mt-auto border ${achievement >= 100 ? 'bg-emerald-50 border-emerald-100' : achievement >= 80 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
                                        <p className="text-[11px] font-black uppercase tracking-wider mb-1 text-gray-500">Recomendación</p>
                                        <p className="text-[10px] font-semibold text-gray-700 leading-snug">
                                            {achievement >= 100
                                                ? 'Meta superada. Evaluar distribución del excedente o incremento del fondo de reserva.'
                                                : achievement >= 80
                                                ? `Ritmo adecuado para el ${pctYearElapsed}% del año. Mantener colocación y controlar mora.`
                                                : 'Revisar cuotas atrasadas y nivel de colocación para recuperar el ritmo de ingresos.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Acciones Prioritarias */}
                            <div className="mx-5 mb-4 mt-4 rounded-xl border border-gray-100 overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2 border-b border-gray-100">
                                    <Activity className="h-4 w-4 text-brand-primary" />
                                    <h5 className="text-[10px] font-black text-gray-700 uppercase tracking-wider">Acciones Prioritarias</h5>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {[
                                        {
                                            severity: parseFloat(riskIndex) > 5 ? 'high' : parseFloat(riskIndex) > 3 ? 'medium' : 'low',
                                            icon: '💳',
                                            title: 'Gestión de Cartera en Mora',
                                            action: parseFloat(riskIndex) > 5
                                                ? `Mora de ${riskIndex}% requiere atención urgente. Contactar socios deudores. Monto: $${Number(mora).toLocaleString('es-CO')}.`
                                                : `Mora en ${riskIndex}% — nivel aceptable. Activar recordatorios a socios con cuotas próximas a vencer.`
                                        },
                                        {
                                            severity: parseFloat(liquidity) < 30 ? 'high' : parseFloat(liquidity) < 50 ? 'medium' : 'low',
                                            icon: '💰',
                                            title: 'Gestión de Liquidez',
                                            action: parseFloat(liquidity) >= 50
                                                ? `Liquidez óptima (${liquidity}%). $${Number(disponible).toLocaleString('es-CO')} disponibles — evaluar nuevos préstamos.`
                                                : parseFloat(liquidity) >= 30
                                                ? `Liquidez saludable (${liquidity}%). Continuar aprobando préstamos con normalidad.`
                                                : `Liquidez ajustada (${liquidity}%). Priorizar cobro antes de aprobar nuevos créditos.`
                                        },
                                        {
                                            severity: achievement < 80 ? 'high' : achievement < 100 ? 'medium' : 'low',
                                            icon: '📈',
                                            title: 'Cumplimiento de Meta de Rentabilidad',
                                            action: achievement >= 100
                                                ? `Meta anual superada (${achievement.toFixed(0)}%). Evaluar distribución de excedentes.`
                                                : `Se lleva el ${achievement.toFixed(0)}% de la meta con el ${pctYearElapsed}% del año. Mantener ritmo para alcanzar $${Number(rentabilidad2025).toLocaleString('es-CO')}.`
                                        },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-start gap-3 px-4 py-3">
                                            <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${item.severity === 'high' ? 'bg-red-500' : item.severity === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                            <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-gray-800">{item.title}</p>
                                                <p className="text-[10px] text-gray-500 font-medium leading-snug mt-0.5">{item.action}</p>
                                            </div>
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full self-start flex-shrink-0 ${item.severity === 'high' ? 'bg-red-100 text-red-700' : item.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {item.severity === 'high' ? 'URGENTE' : item.severity === 'medium' ? 'ESTA SEMANA' : 'EN ORDEN'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* En Resumen */}
                            <div className="mx-5 mb-5 p-4 bg-gradient-to-r from-brand-primary/5 to-slate-100 rounded-xl border border-brand-primary/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <ActivitySquare className="h-4 w-4 text-brand-primary" />
                                    <h5 className="text-[10px] font-black text-brand-primary uppercase tracking-wider">En Resumen</h5>
                                </div>
                                <p className="text-[11px] text-gray-700 leading-relaxed font-medium">
                                    {ahorroHealthy && parseFloat(riskIndex) <= 5 && achievement >= 80
                                        ? <>El fondo <strong className="text-brand-primary">Credifuturo</strong> está operando bien al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}. Los socios ahorran, la mora es controlada y los ingresos van en la dirección correcta. La recomendación es mantener el ritmo de colocación y hacer seguimiento a socios con cuotas atrasadas para cerrar 2026 mejor que 2025.</>
                                        : <>El fondo <strong className="text-brand-primary">Credifuturo</strong> tiene señales que requieren atención al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}. Revisar los indicadores marcados y ejecutar las acciones prioritarias listadas arriba para retomar el ritmo esperado y cerrar el año en positivo.</>
                                    }
                                </p>
                            </div>
                        </div>
                    );
                })()}

                <div className="mt-6 p-4 bg-white/60 border border-white rounded-2xl backdrop-blur-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <img src={logo} alt="Credifuturo" className="h-8 w-8 object-contain opacity-50 grayscale" />
                        <p className="text-[10px] text-gray-400 font-medium italic max-w-md">
                            * Los valores de "2025" son el cierre real del año anterior. Los valores de "2026" se actualizan automáticamente. El estimado usa: intereses agendados ×95% (absorbe posibles moras), NU al ritmo diario real observado, y penalidades en proyección lineal.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Actualizado automáticamente</p>
                        <p className="text-[10px] font-bold text-brand-primary">Panel de Gestión Credifuturo v2.0</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Dashboard Home ───────────────────────────────────────────────────────────
const DashboardHome = () => {
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
            <div className="w-full">
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

            {/* --- SECCIÓN 4: INDICADORES DE RIESGO Y RENDIMIENTO --- */}
            {(() => {
                const disponible = (stats?.saldoEnBanco || 0) + (stats?.rentabilidadCajaNU || 0);
                const carteraTotal = (stats?.carteraDia || 0) + (stats?.moraCarteraEP || 0);
                const mora = stats?.moraCarteraEP || 0;
                const sociosMora = stats?.sociosMoraCount || 0;
                const totalSocios = stats?.activeClientsCount || 1;

                // Índice de Mora: % de la cartera que está vencida
                const indiceMora = carteraTotal > 0 ? (mora / carteraTotal) * 100 : 0;
                const moraColor = indiceMora <= 3 ? 'from-emerald-50' : indiceMora <= 5 ? 'from-amber-50' : 'from-red-50';
                const moraText = indiceMora <= 3 ? 'text-emerald-700' : indiceMora <= 5 ? 'text-amber-700' : 'text-red-700';
                const moraBadge = indiceMora <= 3 ? 'bg-emerald-100 text-emerald-700' : indiceMora <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                const moraBadgeLabel = indiceMora <= 3 ? '● Bajo' : indiceMora <= 5 ? '▲ Moderado' : '⚠ Alto';

                // Cobertura de Mora: cuántas veces el efectivo cubre la mora
                const cobertura = mora > 0 ? disponible / mora : null;
                const coberturaColor = cobertura === null ? 'from-emerald-50' : cobertura >= 5 ? 'from-emerald-50' : cobertura >= 2 ? 'from-amber-50' : 'from-red-50';
                const coberturaText = cobertura === null ? 'text-emerald-700' : cobertura >= 5 ? 'text-emerald-700' : cobertura >= 2 ? 'text-amber-700' : 'text-red-700';
                const coberturaBadge = cobertura === null ? 'bg-emerald-100 text-emerald-700' : cobertura >= 5 ? 'bg-emerald-100 text-emerald-700' : cobertura >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                const coberturaBadgeLabel = cobertura === null ? '✓ Sin mora' : cobertura >= 5 ? '✓ Sólida' : cobertura >= 2 ? '● Adecuada' : '⚠ Débil';

                // Socios en Mora: count y % del total
                const sociosMoraPct = totalSocios > 0 ? (sociosMora / totalSocios) * 100 : 0;
                const sociosMoraColor = sociosMora === 0 ? 'from-emerald-50' : sociosMoraPct <= 10 ? 'from-amber-50' : 'from-red-50';
                const sociosMoraText = sociosMora === 0 ? 'text-emerald-700' : sociosMoraPct <= 10 ? 'text-amber-700' : 'text-red-700';
                const sociosMoraBadge = sociosMora === 0 ? 'bg-emerald-100 text-emerald-700' : sociosMoraPct <= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                const sociosMoraBadgeLabel = sociosMora === 0 ? '✓ Ninguno' : `${sociosMoraPct.toFixed(0)}% del total`;

                // Retorno del Capital: rentabilidad total / patrimonio activos
                const rentabilidadTotal = (stats?.totalInteresesPagados || 0) + (stats?.rentabilidadCajaNU || 0) + (stats?.totalPenaltyValue || 0);
                const patrimonio = stats?.totalAhorradoGeneral || 1;
                const retornoCapital = (rentabilidadTotal / patrimonio) * 100;
                const retornoColor = retornoCapital >= 5 ? 'from-emerald-50' : retornoCapital >= 2 ? 'from-amber-50' : 'from-gray-50';
                const retornoText = retornoCapital >= 5 ? 'text-emerald-700' : retornoCapital >= 2 ? 'text-amber-700' : 'text-gray-600';
                const retornoBadge = retornoCapital >= 5 ? 'bg-emerald-100 text-emerald-700' : retornoCapital >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600';
                const retornoBadgeLabel = retornoCapital >= 5 ? '▲ Saludable' : retornoCapital >= 2 ? '● Moderado' : '▼ Revisar';

                return (
                    <div className="mb-8">
                        <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-rose-600" /> Indicadores de Riesgo y Rendimiento
                        </h2>
                        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">

                            {/* Índice de Mora */}
                            <div className={`bg-gradient-to-br ${moraColor} to-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Índice de Mora</p>
                                    <AlertTriangle className={`h-4 w-4 ${moraText}`} />
                                </div>
                                <p className={`text-[28px] font-black font-mono leading-none ${loading ? 'text-gray-300' : moraText}`}>
                                    {loading ? '...' : `${indiceMora.toFixed(1)}%`}
                                </p>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${moraBadge}`}>{moraBadgeLabel}</span>
                                <div>
                                    <div className="relative flex h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-emerald-400 w-[30%]" />
                                        <div className="bg-amber-400 w-[20%]" />
                                        <div className="bg-red-400 flex-1" />
                                        <div className="absolute top-0 bottom-0 w-0.5 bg-gray-900 rounded-full" style={{ left: `${Math.min(indiceMora * 4, 98)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                                        {loading ? '' : `$${Number(mora).toLocaleString('es-CO')} de $${Number(carteraTotal).toLocaleString('es-CO')} cartera`}
                                    </p>
                                </div>
                            </div>

                            {/* Socios en Mora */}
                            <div
                                className={`bg-gradient-to-br ${sociosMoraColor} to-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm transition-all duration-200 ${isAdmin && sociosMora > 0 ? 'cursor-pointer hover:shadow-md hover:border-brand-primary/20 active:scale-[0.99]' : ''}`}
                                onClick={() => isAdmin && sociosMora > 0 && setShowMoraModal(true)}
                                title={isAdmin && sociosMora > 0 ? 'Ver detalle de socios en mora' : undefined}
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Socios en Mora</p>
                                    <Users className={`h-4 w-4 ${sociosMoraText}`} />
                                </div>
                                <div className="flex items-end gap-1.5">
                                    <p className={`text-[28px] font-black font-mono leading-none ${loading ? 'text-gray-300' : sociosMoraText}`}>
                                        {loading ? '...' : sociosMora}
                                    </p>
                                    {!loading && <p className="text-[13px] font-bold text-gray-400 mb-0.5">de {totalSocios}</p>}
                                </div>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${sociosMoraBadge}`}>{sociosMoraBadgeLabel}</span>
                                <div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${sociosMora === 0 ? 'bg-emerald-400' : sociosMoraPct <= 10 ? 'bg-amber-400' : 'bg-red-400'}`}
                                            style={{ width: `${Math.min(sociosMoraPct, 100)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                                        {loading ? '' : sociosMora === 0 ? 'Todos al día con sus pagos' : `${sociosMoraPct.toFixed(0)}% de socios activos`}
                                    </p>
                                </div>
                            </div>

                            {/* Cobertura de Mora */}
                            <div className={`bg-gradient-to-br ${coberturaColor} to-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cobertura de Mora</p>
                                    <ShieldCheck className={`h-4 w-4 ${coberturaText}`} />
                                </div>
                                <p className={`text-[28px] font-black font-mono leading-none ${loading ? 'text-gray-300' : coberturaText}`}>
                                    {loading ? '...' : cobertura === null ? '∞' : `${cobertura.toFixed(1)}×`}
                                </p>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${coberturaBadge}`}>{coberturaBadgeLabel}</span>
                                <div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${coberturaText.includes('emerald') ? 'bg-emerald-400' : coberturaText.includes('amber') ? 'bg-amber-400' : 'bg-red-400'}`}
                                            style={{ width: `${cobertura === null ? 100 : Math.min((cobertura / 10) * 100, 100)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                                        {loading ? '' : cobertura === null ? 'Sin deuda vencida que cubrir' : `$${Number(disponible).toLocaleString('es-CO')} caja / $${Number(mora).toLocaleString('es-CO')} mora`}
                                    </p>
                                </div>
                            </div>

                            {/* Retorno del Capital */}
                            <div className={`bg-gradient-to-br ${retornoColor} to-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Retorno del Capital</p>
                                    <TrendingUp className={`h-4 w-4 ${retornoText}`} />
                                </div>
                                <p className={`text-[28px] font-black font-mono leading-none ${loading ? 'text-gray-300' : retornoText}`}>
                                    {loading ? '...' : `${retornoCapital.toFixed(1)}%`}
                                </p>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${retornoBadge}`}>{retornoBadgeLabel}</span>
                                <div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${retornoCapital >= 5 ? 'bg-emerald-400' : retornoCapital >= 2 ? 'bg-amber-400' : 'bg-gray-300'}`}
                                            style={{ width: `${Math.min(retornoCapital * 10, 100)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                                        {loading ? '' : `$${Number(rentabilidadTotal).toLocaleString('es-CO')} ganancia / $${Number(patrimonio).toLocaleString('es-CO')} patrimonio`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

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
