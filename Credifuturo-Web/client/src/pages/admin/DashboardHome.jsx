import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../config/api';
import {
    Users, DollarSign, AlertTriangle, PiggyBank, BarChart3,
    Save, CheckCircle, XCircle, AlertCircle, X, RefreshCw, Database, TrendingUp, Landmark, Activity,
    ShieldCheck, ActivitySquare, FileDown, Clock, Calendar, ChevronDown, Maximize2
} from 'lucide-react';
import ChartExpandModal, { analyzeComparativeChart, analyzeIncomeDistribution } from '../../components/ChartExpandModal';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useUi } from '../../context/UiContext';
import DataTable from '../../components/ui/DataTable';
import nuLogo from '../../assets/nu-logo.png';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ComposedChart, Line } from 'recharts';
import nuBg from '../../assets/nu-bg.png';
import logo from '../../assets/logo.jpg';
import YearMultiSelect from '../../components/admin/YearMultiSelect';

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, description, icon: Icon, color, onClick, customBg, isDark = false, textColor }) => {
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
                <div className={`${valueFontClass} font-bold leading-tight ${valueColorClass}`}>{value}</div>
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

// ─── Comparative Bar Chart Component (Expert Financial Analysis) ──────────────
const ComparativeChart = ({ title, historic, current, color, labelHistoric, labelCurrent, detail, projection, value2027, note, secondaryComparison, counts, compact, onExpand }) => {
    const data = [
        { name: labelHistoric, value: historic, fill: '#cbd5e1' },
        { name: labelCurrent, value: current, fill: color },
        ...(value2027 !== undefined ? [{ name: '2027 (est.)', value: value2027, fill: `${color}55` }] : [])
    ];

    // ── Métricas financieras ──
    const deviation = current - historic;
    const deviationPct = historic > 0 ? ((deviation / historic) * 100) : 0;
    const isPositive = deviation >= 0;
    const progressPct = historic > 0 ? Math.min(((current / historic) * 100), 150) : 0;
    const ratio = historic > 0 ? (current / historic) : 0;

    // Proyección al cierre: usa el valor externo si fue provisto (sincronizado con
    // "Estimado al cierre del año"), si no calcula extrapolación lineal propia.
    const today = new Date();
    const dayOfYear = Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24));
    const incrementSoFar = current - historic;
    const linearProjectedYearEnd = historic + (dayOfYear > 0 ? incrementSoFar * (365 / dayOfYear) : 0);
    const projectedYearEnd = projection !== undefined ? projection : linearProjectedYearEnd;
    const projectedAnnualIncrement = projectedYearEnd - historic;
    const projectedPctVs2025 = historic > 0 ? ((projectedAnnualIncrement / historic) * 100) : 0;
    const isPacePositive = projectedAnnualIncrement >= 0;

    // Color coding por nivel de desempeño
    const getPerformanceLevel = () => {
        if (progressPct >= 100) return { label: 'Superado', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', ring: 'ring-emerald-200' };
        if (progressPct >= 85) return { label: 'En Ruta', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500', ring: 'ring-blue-200' };
        if (progressPct >= 60) return { label: 'Moderado', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', ring: 'ring-amber-200' };
        return { label: 'Rezagado', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500', ring: 'ring-red-200' };
    };
    const perf = getPerformanceLevel();

    const fmtCOP = (n) => `$${Number(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const paceLabel = isPacePositive
        ? `Al ritmo actual, cerraría el año en ${fmtCOP(projectedYearEnd)} (+${projectedPctVs2025.toFixed(1)}% vs 2025)`
        : `Al ritmo actual, cerraría el año en ${fmtCOP(projectedYearEnd)} (${projectedPctVs2025.toFixed(1)}% vs 2025)`;

    if (compact) {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#374151' }} />
                    <YAxis hide domain={[0, 'dataMax + 5000000']} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} contentStyle={{ fontSize: '11px', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={value2027 !== undefined ? 40 : 55}>
                        <LabelList dataKey="value" position="top" formatter={(v) => fmtCOP(v)} style={{ fontSize: '12px', fontWeight: '900', fill: '#0f172a' }} />
                    </Bar>
                    <Line dataKey="value" type="linear" stroke={isPositive ? '#10b981' : '#ef4444'} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 5, fill: isPositive ? '#10b981' : '#ef4444', strokeWidth: 2, stroke: '#fff' }} activeDot={false} />
                </ComposedChart>
            </ResponsiveContainer>
        );
    }

    return (
        <div className={`flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ring-1 ${perf.ring}`}>
            {/* Header con título y badge de estado */}
            <div className="px-5 pt-5 pb-2 flex flex-col items-center gap-2 text-center relative">
                <h4 className="text-sm font-black text-emerald-800 uppercase tracking-widest">{title}</h4>
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${perf.bg} ${perf.color}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${perf.dot} mr-1`}></span>
                    {perf.label}
                </span>
                {onExpand && (
                    <button onClick={onExpand} className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700" title="Ampliar y analizar">
                        <Maximize2 className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Gráfico */}
            <div className="w-full h-64 px-2">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fontWeight: 900, fill: '#374151' }}
                        />
                        <YAxis hide domain={[0, 'dataMax + 5000000']} />
                        <Tooltip
                            cursor={{ fill: '#f8fafc' }}
                            formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`}
                            contentStyle={{ fontSize: '11px', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={value2027 !== undefined ? 40 : 55}>
                            <LabelList
                                dataKey="value"
                                position="top"
                            formatter={(v) => fmtCOP(v)}
                                style={{ fontSize: '12px', fontWeight: '900', fill: '#0f172a' }}
                            />
                        </Bar>
                        <Line
                            dataKey="value"
                            type="linear"
                            stroke={isPositive ? '#10b981' : '#ef4444'}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            dot={{ r: 5, fill: isPositive ? '#10b981' : '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                            activeDot={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Panel de métricas — lenguaje simple */}
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-gradient-to-b from-gray-50/80 to-white space-y-4">

                {/* KPI tile: Cambio vs año pasado */}
                <div className="grid grid-cols-1 gap-2">
                    <div className={`rounded-xl p-3 border text-center ${isPositive ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${isPositive ? 'text-emerald-800' : 'text-red-700'}`}>Cambio vs año pasado</p>
                        <div className="flex items-baseline justify-center gap-1.5">
                            <span className={`text-lg font-black font-mono leading-none ${isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                                {isPositive ? '+' : ''}{Math.abs(deviationPct).toFixed(1)}%
                            </span>
                            <span className={`text-[9px] font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isPositive ? '▲' : '▼'}
                            </span>
                        </div>
                        <p className={`text-lg font-black mt-0.5 font-mono ${isPositive ? 'text-emerald-600/80' : 'text-red-500/80'}`}>
                            {isPositive ? '+' : ''}{fmtCOP(deviation)}
                        </p>
                    </div>
                </div>

                {/* Barra de avance del año */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wider">Avance del año</span>
                        <span className={`text-xs font-black ${perf.color}`}>{progressPct.toFixed(1)}%</span>
                    </div>
                    <div className="relative">
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-1000 ease-out relative"
                                style={{
                                    width: `${Math.min(progressPct, 100)}%`,
                                    background: `linear-gradient(90deg, ${color}99, ${color})`,
                                    boxShadow: progressPct >= 100 ? `0 0 12px ${color}50` : 'none'
                                }}
                            >
                                {progressPct >= 15 && (
                                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-black text-white drop-shadow-sm">
                                        {progressPct.toFixed(0)}%
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-between mt-1 px-0.5">
                            <span className="text-[7px] text-gray-400 font-bold">0%</span>
                            <span className="text-[7px] text-gray-400 font-bold">50%</span>
                            <span className="text-[7px] text-gray-400 font-bold">100%</span>
                        </div>
                    </div>
                </div>

                {/* Resultado vs 2025 */}
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full flex flex-col items-center justify-center border-2 ${ratio >= 1 ? 'border-emerald-400 bg-emerald-50' : ratio >= 0.85 ? 'border-blue-400 bg-blue-50' : ratio >= 0.6 ? 'border-amber-400 bg-amber-50' : 'border-red-400 bg-red-50'
                            }`}>
                            <span className={`text-xs font-black font-mono leading-none ${perf.color}`}>{Math.round(ratio * 100)}%</span>
                            <span className="text-[7px] text-gray-400 font-bold leading-none mt-0.5">vs 2025</span>
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-emerald-800 uppercase tracking-wider">Logro vs año anterior</p>
                            <p className="text-[10px] font-bold text-gray-700">
                                {ratio >= 1
                                    ? `Se superó el nivel 2025 en un ${(deviationPct).toFixed(1)}%`
                                    : ratio >= 0.85
                                        ? `Se alcanzó el ${Math.round(ratio * 100)}% del nivel 2025`
                                        : `Por debajo del nivel 2025 (${Math.round(ratio * 100)}%)`
                                }
                            </p>
                        </div>
                    </div>
                    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border ${perf.bg} ${perf.color}`}>
                        {perf.label}
                    </span>
                </div>

                {/* Qué significa en palabras simples */}
                <div className={`p-3 rounded-lg border ${isPositive ? 'bg-emerald-50/60 border-emerald-100' : 'bg-red-50/60 border-red-100'}`}>
                    <p className="text-[10px] font-bold text-gray-800 leading-relaxed">
                        {isPositive
                            ? <><strong className="text-emerald-700">Superamos el nivel 2025</strong> — crecimos un {Math.abs(deviationPct).toFixed(1)}% (+{fmtCOP(deviation)}) respecto al año anterior.</>
                            : <><strong className="text-red-700">Por debajo del nivel 2025</strong> — caímos un {Math.abs(deviationPct).toFixed(1)}% ({fmtCOP(Math.abs(deviation))} menos) respecto al año anterior.</>
                        }
                    </p>
                </div>

                {/* Desglose opcional del valor actual */}
                {detail && detail.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">¿Cómo se calcula?</p>
                        <div className="space-y-1.5">
                            {(() => {
                                const detailTotal = detail.reduce((s, d) => s + (d.value || 0), 0);
                                return detail.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                                            <span className="text-gray-700 font-bold">{item.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2 ml-auto">
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${item.color}22`, color: item.color }}>
                                                {detailTotal > 0 ? ((item.value / detailTotal) * 100).toFixed(1) : '0.0'}%
                                            </span>
                                            <span className="font-black text-gray-800 font-mono">${Number(item.value).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    </div>
                                ));
                            })()}
                            <div className="border-t border-gray-300 pt-1.5 mt-1.5 flex items-center justify-between text-[11px]">
                                <span className="font-black text-gray-700 uppercase tracking-wide">Total</span>
                                <span className="font-black text-emerald-700 font-mono text-[12px]">${Number(detail.reduce((s, d) => s + (d.value || 0), 0)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                    </div>
                )}
                {/* Nota informativa opcional */}
                {note && (
                    <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                        <span className="text-blue-500 text-[13px] flex-shrink-0 mt-0.5">ℹ️</span>
                        <p className="text-[10px] font-bold text-blue-800 leading-relaxed">{note}</p>
                    </div>
                )}
                {secondaryComparison && (() => {
                    const { title: secTitle, historic: secHistoric, current: secCurrent, labelHistoric: secLH, labelCurrent: secLC, color: secColor } = secondaryComparison;
                    const secDiff = secCurrent - secHistoric;
                    const secPct = secHistoric > 0 ? ((secDiff / secHistoric) * 100).toFixed(1) : '0.0';
                    const secPositive = secDiff >= 0;
                    return (
                        <div key="sec" className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: `${secColor}15`, borderBottom: `1px solid ${secColor}30` }}>
                                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: secColor }}>{secTitle}</p>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${secPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{secPositive ? '+' : ''}{secPct}% vs {secLH}</span>
                            </div>
                            <div className="px-3 py-2.5 grid grid-cols-2 gap-2">
                                <div className="text-center p-2 bg-gray-50 rounded-lg">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{secLH}</p>
                                    <p className="text-[12px] font-black text-gray-600 font-mono">${Number(secHistoric).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                                </div>
                                <div className="text-center p-2 rounded-lg" style={{ backgroundColor: `${secColor}15` }}>
                                    <p className="text-[9px] font-bold uppercase mb-0.5" style={{ color: secColor }}>{secLC}</p>
                                    <p className="text-[12px] font-black font-mono" style={{ color: secColor }}>${Number(secCurrent).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                                </div>
                            </div>
                        </div>
                    );
                })()}
                {/* Conteo por año */}
                {counts && (
                    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="text-[9px] font-black text-gray-700 uppercase tracking-widest mb-2">Total préstamos por año</p>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="text-center p-2 rounded-lg bg-slate-100">
                                <p className="text-[9px] font-bold text-gray-500 uppercase mb-0.5">{labelHistoric}</p>
                                <p className="text-2xl font-black text-gray-700 font-mono leading-none">{counts.historic}</p>
                                <p className="text-[9px] font-bold text-gray-400 mt-0.5">préstamos</p>
                            </div>
                            <div className="text-center p-2 rounded-lg" style={{ backgroundColor: `${color}18` }}>
                                <p className="text-[9px] font-bold uppercase mb-0.5" style={{ color }}>{labelCurrent}</p>
                                <p className="text-2xl font-black font-mono leading-none" style={{ color }}>{counts.current}</p>
                                <p className="text-[9px] font-bold mt-0.5" style={{ color: `${color}99` }}>préstamos</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// ─── Gráfica de AHORRO POR AÑO (no acumulable) ───────────────────────────────
// Cada barra es un año independiente: ahorro mensual + aportes iniciales de ese
// año (apilados). NO acumula años anteriores. Datos: stats.ahorroPorAnio.
const SavingsByYearChart = ({ data, title = 'Ahorro de los Socios por Año', compact, onExpand }) => {
    const fmtCOP = (n) => `$${Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const rows = Array.isArray(data) ? data : [];

    // Cambio del último año vs el anterior
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const deviation = last && prev ? last.total - prev.total : 0;
    const deviationPct = prev && prev.total > 0 ? (deviation / prev.total) * 100 : 0;
    const isPositive = deviation >= 0;

    const chart = (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 24, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="anio" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 900, fill: '#374151' }} />
                <YAxis hide domain={[0, 'dataMax + 4000000']} />
                <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(value, name) => [fmtCOP(value), name === 'mensual' ? 'Ahorro mensual' : 'Aportes iniciales']}
                    contentStyle={{ fontSize: '11px', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="mensual" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} barSize={55} />
                <Bar dataKey="aportes" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={55}>
                    <LabelList dataKey="total" position="top" formatter={(v) => fmtCOP(v)} style={{ fontSize: '12px', fontWeight: '900', fill: '#0f172a' }} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );

    // ── Métricas de análisis (experto finanzas) ──
    const accumulated = rows.reduce((s, r) => s + (r.total || 0), 0);
    const mensualPct = last && last.total > 0 ? (last.mensual / last.total) * 100 : 0;
    const aportesPct = last && last.total > 0 ? (last.aportes / last.total) * 100 : 0;
    const recurrenteDriven = mensualPct >= 50;

    // Veredicto del "experto en finanzas personales"
    let verdict;
    if (!last) {
        verdict = null;
    } else if (!prev) {
        verdict = `Primer año con registros (${last.anio}). A partir del próximo año podremos medir el crecimiento real del ahorro.`;
    } else if (isPositive && recurrenteDriven) {
        verdict = `El ahorro de ${last.anio} creció ${deviationPct.toFixed(0)}% frente a ${prev.anio}, y el ${mensualPct.toFixed(0)}% viene del ahorro mensual recurrente — la señal más sana: refleja disciplina y hábito de los socios, no aportes puntuales.`;
    } else if (isPositive && !recurrenteDriven) {
        verdict = `El ahorro de ${last.anio} creció ${deviationPct.toFixed(0)}%, pero el ${aportesPct.toFixed(0)}% son aportes iniciales (socios nuevos) más que ahorro mensual constante. Conviene impulsar la constancia mensual para que el crecimiento sea sostenible.`;
    } else {
        verdict = `En ${last.anio} se ahorró ${Math.abs(deviationPct).toFixed(0)}% menos que en ${prev.anio}. Vale la pena revisar qué socios bajaron el ritmo o dejaron de aportar.`;
    }

    if (compact) return chart;

    const cardChrome = (children) => (
        <div className="flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ring-1 ring-emerald-200">
            <div className="px-5 pt-5 pb-2 flex flex-col items-center gap-2 text-center relative">
                <h4 className="text-sm font-black text-emerald-800 uppercase tracking-widest">{title}</h4>
                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>
                    No acumulable
                </span>
                {onExpand && (
                    <button onClick={onExpand} className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700" title="Ampliar y analizar">
                        <Maximize2 className="h-4 w-4" />
                    </button>
                )}
            </div>
            {children}
        </div>
    );

    // Estado vacío: nunca mostrar una tarjeta en blanco
    if (rows.length === 0) {
        return cardChrome(
            <div className="px-5 py-16 flex flex-col items-center justify-center text-center gap-2">
                <PiggyBank className="h-10 w-10 text-gray-300" />
                <p className="text-sm font-bold text-gray-500">Sin datos de ahorro por año</p>
                <p className="text-[11px] text-gray-400 max-w-[16rem]">No se encontraron registros de ahorro. Verifica que el servidor esté actualizado y que existan ahorros cargados.</p>
            </div>
        );
    }

    return cardChrome(
        <>
            <div className="w-full h-64 px-2">{chart}</div>

            <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-gradient-to-b from-gray-50/80 to-white space-y-4">
                {/* Leyenda de composición */}
                <div className="flex items-center justify-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                        <span className="text-[10px] font-bold text-gray-600">Ahorro mensual</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                        <span className="text-[10px] font-bold text-gray-600">Aportes iniciales</span>
                    </div>
                </div>

                {/* KPIs: crecimiento año-a-año + total acumulado */}
                <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-xl border p-3 text-center ${isPositive ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${isPositive ? 'text-emerald-800' : 'text-red-700'}`}>
                            {last.anio} vs {prev ? prev.anio : '—'}
                        </p>
                        <p className={`text-xl font-black leading-none ${isPositive ? 'text-emerald-700' : 'text-red-700'}`}>
                            {prev ? `${isPositive ? '+' : ''}${deviationPct.toFixed(1)}%` : '—'} {prev ? (isPositive ? '▲' : '▼') : ''}
                        </p>
                        <p className={`text-[11px] font-bold mt-1 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                            {prev ? `${isPositive ? '+' : '−'}${fmtCOP(Math.abs(deviation))}` : 'Primer año'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
                        <p className="text-[8px] font-black uppercase tracking-widest mb-1 text-gray-500">Total acumulado</p>
                        <p className="text-xl font-black leading-none text-gray-800 font-mono">{fmtCOP(accumulated)}</p>
                        <p className="text-[11px] font-bold mt-1 text-gray-400">en {rows.length} año{rows.length > 1 ? 's' : ''}</p>
                    </div>
                </div>

                {/* Composición del último año: recurrente vs aportes */}
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Composición {last.anio}</p>
                        <p className="text-[10px] font-bold text-gray-500">{fmtCOP(last.total)}</p>
                    </div>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div style={{ width: `${mensualPct}%`, backgroundColor: '#10b981' }} />
                        <div style={{ width: `${aportesPct}%`, backgroundColor: '#f59e0b' }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] font-bold">
                        <span className="text-emerald-700">Mensual {mensualPct.toFixed(0)}%</span>
                        <span className="text-amber-600">Aportes {aportesPct.toFixed(0)}%</span>
                    </div>
                </div>

                {/* Veredicto del experto */}
                {verdict && (
                    <div className={`flex items-start gap-2 p-3 rounded-xl border ${isPositive ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <ShieldCheck className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isPositive ? 'text-emerald-600' : 'text-amber-600'}`} />
                        <p className={`text-[11px] font-semibold leading-relaxed ${isPositive ? 'text-emerald-900' : 'text-amber-900'}`}>{verdict}</p>
                    </div>
                )}

                {/* Desglose por año (mensual + aportes) */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Ahorrado cada año (mensual + aportes)</p>
                    <div className="space-y-1.5">
                        {rows.map((r) => (
                            <div key={r.anio} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-gray-700 font-bold w-10">{r.anio}</span>
                                <span className="text-[9px] text-gray-400 font-mono flex-1 text-right">
                                    <span className="text-emerald-600">{fmtCOP(r.mensual)}</span>
                                    {r.aportes > 0 && <span className="text-amber-500"> + {fmtCOP(r.aportes)}</span>}
                                </span>
                                <span className="font-black text-emerald-700 font-mono w-28 text-right">{fmtCOP(r.total)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
};


// ─── NUEVO: COMPONENTE DE GRÁFICA PROFESIONAL ────────────────────────────────────────────────────────
const FinancialChart = ({ stats }) => {
    const [expandDonut, setExpandDonut] = useState(false);
    const [expandComp, setExpandComp] = useState(null);

    if (!stats) return null;

    // Calcular valores principales
    const disponible = (stats.saldoEnBanco || 0) + (stats.rentabilidadCajaNU || 0);
    const mora = stats.moraCarteraEP || 0;
    // carteraDia viene del backend: cuotas Pendiente en el rango de años cuya fechaPagoMax >= hoy
    const prestadoVigente = stats.carteraDia || 0;

    const data = [
        { name: 'Disponible', value: disponible, color: '#a855f7' },
        { name: 'Cartera al Día', value: prestadoVigente, color: '#3b82f6' },
    ].filter(d => d.value > 0);

    const total = disponible + prestadoVigente;

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const percentage = ((data.value / total) * 100).toFixed(1);
            return (
                <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-lg">
                    <p className="text-sm font-bold text-gray-700 mb-1">{data.name}</p>
                    <p className="text-sm font-mono text-gray-900">
                        Valor: <span className="font-bold flex-1 text-right" style={{ color: data.color }}>${Number(data.value).toLocaleString('es-CO')}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Representa el {percentage}% del capital</p>
                </div>
            );
        }
        return null;
    };

    const riskIndex = total > 0 ? ((mora / total) * 100).toFixed(1) : 0;
    const liquidity = total > 0 ? ((disponible / total) * 100).toFixed(1) : 0;

    // Cálculo de Rentabilidad Histórica (2025) vs Actual
    const rentabilidadActual = (stats.totalInteresesPagados || 0) + (stats.rentabilidadCajaNU || 0) + (stats.totalPenaltyValue || 0);
    const rentabilidad2025 = 2448052;
    const achievement = (rentabilidadActual / rentabilidad2025) * 100; // Porcentaje de cumplimiento de la meta
    const growthValue = achievement - 100; // Crecimiento real

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

    // --- CÁLCULOS DE PROYECCIÓN A DICIEMBRE 2026 ---
    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    const remainingDays = Math.max(0, Math.ceil((endOfYear - today) / (1000 * 60 * 60 * 24)));
    const currentDayOfYear = Math.max(1, Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)));

    // 1. Intereses: total de intereses amortizados agendados en 2026 (pagados + pendientes).
    //    Es el techo real del portafolio actual; no incluye préstamos nuevos que se disbursén.
    //    Aplicamos factor 95% para absorber posibles moras o incumplimientos (~5% de cartera).
    const proyeccionIntereses = (stats.totalIntereses || 0) * 0.95;

    // 2. Caja NU: proyección lineal al ritmo diario real observado en lo que va del año.
    //    La fórmula anterior (balance × tasa × días restantes) sobreestimaba porque:
    //    a) El balance actual baja cada vez que se desembolsa un préstamo nuevo.
    //    b) rentabilidadCajaNU está hardcodeado y no refleja la tasa cambiante del balance.
    //    Proyección lineal es más conservadora y realista al ritmo actual del fondo.
    const dailyNURate = (stats.rentabilidadCajaNU || 0) / currentDayOfYear;
    const proyeccionCajaNU = (stats.rentabilidadCajaNU || 0) + dailyNURate * remainingDays;

    // 3. Penalidad: proyección lineal al ritmo diario del año (ya era correcta).
    const proyeccionPenalidad = ((stats.totalPenaltyValue || 0) / currentDayOfYear) * 365;

    // 4. Rentabilidad Total Proyectada
    const proyeccionTotal = proyeccionIntereses + proyeccionCajaNU + proyeccionPenalidad;

    // Función auxiliar para obtener estilos de variación
    const getVariationStyles = (actual, historical) => {
        const achievement = (actual / historical) * 100;
        if (achievement < 80) return "bg-red-50 text-red-700 border-red-100";
        if (achievement < 100) return "bg-orange-50 text-orange-700 border-orange-100";
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
    };

    return (
        <div className="flex flex-col w-full">
            {/* KPIs — Rediseño ejecutivo */}
            <div className="grid grid-cols-1 md:grid-cols-3 border-b border-gray-100">
                {/* KPI 1: Capital Total */}
                <div className="bg-gradient-to-br from-emerald-50 to-white p-6 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-gray-100">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Capital Total</p>
                            <p className="text-[30px] font-black text-gray-900 font-mono leading-none mt-1">
                                ${Number(total).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                        <div className="bg-emerald-100 p-3 rounded-2xl flex-shrink-0">
                            <DollarSign className="h-5 w-5 text-emerald-600" />
                        </div>
                    </div>

                    {/* Barra segmentada */}
                    <div>
                        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
                            <div className="bg-purple-500 rounded-l-full transition-all" style={{ width: `${total > 0 ? (disponible / total) * 100 : 0}%` }} />
                            <div className="bg-blue-500 rounded-r-full transition-all" style={{ width: `${total > 0 ? (prestadoVigente / total) * 100 : 0}%` }} />
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Disponible</span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Al Día</span>
                        </div>
                    </div>

                    {/* ¿Cómo se calcula? */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <p className="text-[9px] font-black text-gray-700 uppercase tracking-widest mb-2.5">¿Cómo se calcula?</p>
                        <div className="space-y-1.5 text-[11px]">
                            {[
                                { label: 'Saldo en Banco', value: stats.saldoEnBanco || 0, color: '#10b981', bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' },
                                { label: 'Rentabilidad NU', value: stats.rentabilidadCajaNU || 0, color: '#8b5cf6', bgClass: 'bg-purple-100', textClass: 'text-purple-700' },
                                { label: 'Cartera al Día', value: prestadoVigente, color: '#3b82f6', bgClass: 'bg-blue-100', textClass: 'text-blue-700' },
                            ].map((item) => (
                                <div key={item.label} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                                        <span className="text-gray-600 font-bold">{item.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2 ml-auto">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.bgClass} ${item.textClass}`}>
                                            {total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'}%
                                        </span>
                                        <span className="font-black text-gray-800 font-mono">${Number(item.value).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                                    </div>
                                </div>
                            ))}
                            <div className="border-t border-gray-300 pt-1.5 mt-1.5 flex items-center justify-between">
                                <span className="font-black text-gray-800 uppercase tracking-wide text-[11px]">Total</span>
                                <span className="font-black text-emerald-700 font-mono text-[12px]">${Number(total).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI 2: Índice de Riesgo */}
                <div className={`p-6 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-gray-100 ${parseFloat(riskIndex) > 5 ? 'bg-gradient-to-br from-red-50 to-white' : 'bg-gradient-to-br from-blue-50 to-white'}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Índice de Riesgo</p>
                            <p className="text-[38px] font-black font-mono leading-none mt-1 text-gray-900">
                                {riskIndex}<span className="text-xl font-bold text-gray-400 ml-0.5">%</span>
                            </p>
                        </div>
                        <div className={`p-3 rounded-2xl flex-shrink-0 ${parseFloat(riskIndex) > 5 ? 'bg-red-100' : 'bg-blue-100'}`}>
                            {parseFloat(riskIndex) > 5 ? <AlertTriangle className="h-5 w-5 text-red-600" /> : <ShieldCheck className="h-5 w-5 text-blue-600" />}
                        </div>
                    </div>

                    {/* Gauge de zonas */}
                    <div>
                        <div className="relative flex h-3 rounded-full overflow-hidden">
                            <div className="bg-emerald-400 w-[33%]" />
                            <div className="bg-amber-400 w-[17%]" />
                            <div className="bg-red-400 flex-1" />
                            <div
                                className="absolute top-0 bottom-0 w-1 bg-gray-900 rounded-full shadow-md"
                                style={{ left: `${Math.min(parseFloat(riskIndex) * 2, 98)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[9px] font-bold mt-1">
                            <span className="text-emerald-600">Sano (0–5%)</span>
                            <span className="text-amber-600">Alerta</span>
                            <span className="text-red-600">Crítico (&gt;10%)</span>
                        </div>
                    </div>

                    <p className="text-[10px] text-gray-500 leading-snug">
                        Del total administrado, el <strong>{riskIndex}%</strong> corresponde a cuotas vencidas o en cobro.
                    </p>

                    <div className="mt-auto">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full ${parseFloat(riskIndex) > 5 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {parseFloat(riskIndex) > 5 ? '⚠️ Requiere atención' : '✓ Cartera sana'}
                        </span>
                    </div>
                </div>

                {/* KPI 3: Liquidez — Panel Unificado */}
                <div className="bg-gradient-to-br from-purple-50 to-white p-6 flex flex-col gap-4">
                    {/* Encabezado */}
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Liquidez del Fondo</p>
                            <p className="text-[38px] font-black font-mono leading-none mt-1 text-gray-900">
                                {liquidity}<span className="text-xl font-bold text-gray-400 ml-0.5">%</span>
                            </p>
                            <p className="text-[10px] text-gray-500 font-bold mt-0.5">del capital está disponible ahora mismo</p>
                        </div>
                        <div className="bg-purple-100 p-3 rounded-2xl flex-shrink-0">
                            <ActivitySquare className="h-5 w-5 text-purple-600" />
                        </div>
                    </div>

                    {/* Barras: Disponible y Colocado */}
                    <div className="space-y-2.5">
                        {[
                            { label: 'Libre (disponible)', pct: total > 0 ? (disponible / total) * 100 : 0, bar: 'bg-purple-500', text: 'text-purple-700', value: disponible },
                            { label: 'En préstamos activos', pct: total > 0 ? (prestadoVigente / total) * 100 : 0, bar: 'bg-blue-400', text: 'text-blue-600', value: prestadoVigente },
                        ].map(bar => (
                            <div key={bar.label}>
                                <div className="flex justify-between text-[10px] font-bold mb-1">
                                    <span className="text-gray-600">{bar.label}</span>
                                    <span className={bar.text}>{bar.pct.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-700 ${bar.bar}`} style={{ width: `${bar.pct}%` }} />
                                </div>
                                <p className="text-[9px] text-gray-400 font-bold mt-0.5">${Number(bar.value).toLocaleString('es-CO')}</p>
                            </div>
                        ))}
                    </div>

                    {/* Badge de estado */}
                    {(() => {
                        const liq = parseFloat(liquidity);
                        const s = liq >= 50
                            ? { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', label: '● Óptima', msg: `¡El fondo está muy bien! Hay $${Number(disponible).toLocaleString('es-CO')} libres para nuevos préstamos sin ningún problema.` }
                            : liq >= 30
                            ? { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700', label: '● Saludable', msg: `La liquidez está en un nivel adecuado. Se puede seguir aprobando préstamos con normalidad.` }
                            : { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', label: '▲ Baja', msg: `La liquidez está ajustada. Conviene cobrar las cuotas pendientes antes de aprobar más préstamos.` };
                        return (
                            <div className={`rounded-xl p-3 border ${s.bg}`}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest">¿Cómo estamos?</span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                                </div>
                                <p className={`text-[10px] font-bold leading-relaxed ${s.text}`}>{s.msg}</p>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Gráficos — 3 columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 border-b border-gray-100">

                {/* Chart 2: Barras — Origen de los fondos */}
                <div className="p-6 flex flex-col">
                    <div className="mb-3">
                        <h3 className="text-[12px] font-black text-gray-800">¿De dónde viene el dinero?</h3>
                        {(() => {
                            const tf = (stats.totalInitialContributions || 0) + Math.max(0, (stats.totalSavings || 0) - (stats.totalPenaltyValue || 0));
                            const ahorroPct = tf > 0 ? ((Math.max(0, (stats.totalSavings || 0) - (stats.totalPenaltyValue || 0)) / tf) * 100).toFixed(0) : 0;
                            const aportePct = tf > 0 ? (((stats.totalInitialContributions || 0) / tf) * 100).toFixed(0) : 0;
                            return (
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                    {ahorroPct >= 60
                                        ? `El ahorro mensual es el motor del fondo — financia el ${ahorroPct}% del capital. Los aportes iniciales aportan el ${aportePct}% restante como base patrimonial fija.`
                                        : ahorroPct >= 40
                                            ? `Fondeo equilibrado entre ahorros (${ahorroPct}%) y aportes (${aportePct}%). Estimular el ahorro mensual incrementaría la capacidad prestable del fondo.`
                                            : `Los aportes iniciales dominan el fondeo (${aportePct}%). Fortalecer el hábito de ahorro mensual haría al fondo menos dependiente del capital inicial.`
                                    }
                                </p>
                            );
                        })()}
                    </div>

                    <div className="flex-1 min-h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={[
                                    { name: 'Aportes', value: stats.totalInitialContributions || 0, fill: '#f59e0b' },
                                    { name: 'Ahorros', value: Math.max(0, (stats.totalSavings || 0) - (stats.totalPenaltyValue || 0)), fill: '#10b981' }
                                ]}
                                layout="vertical"
                                margin={{ top: 0, right: 60, left: 10, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f3f4f6" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 700 }} width={65} />
                                <Tooltip
                                    cursor={{ fill: '#f9fafb' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload;
                                            const tf = (stats.totalInitialContributions || 0) + Math.max(0, (stats.totalSavings || 0) - (stats.totalPenaltyValue || 0));
                                            const pct = tf > 0 ? ((d.value / tf) * 100).toFixed(1) : 0;
                                            return (
                                                <div className="bg-white p-2 border border-gray-100 shadow-lg rounded-lg">
                                                    <p className="text-xs font-bold text-gray-700">{d.name}</p>
                                                    <p className="text-xs font-mono font-black" style={{ color: d.fill }}>${Number(d.value).toLocaleString('es-CO')}</p>
                                                    <p className="text-[10px] text-gray-400">{pct}% del fondeo</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={34}>
                                    <LabelList
                                        dataKey="value"
                                        position="right"
                                        style={{ fill: '#374151', fontSize: 10, fontWeight: 700 }}
                                        formatter={(v) => {
                                            const tf = (stats.totalInitialContributions || 0) + Math.max(0, (stats.totalSavings || 0) - (stats.totalPenaltyValue || 0));
                                            return tf > 0 ? `${((v / tf) * 100).toFixed(0)}%` : '';
                                        }}
                                    />
                                    {[
                                        { fill: '#f59e0b' },
                                        { fill: '#10b981' }
                                    ].map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Pills de resumen */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-center">
                            <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Aportes</p>
                            <p className="text-[12px] font-black text-amber-800">${Number(stats.totalInitialContributions || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-center">
                            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Ahorros</p>
                            <p className="text-[12px] font-black text-emerald-800">${Math.max(0, (stats.totalSavings || 0) - (stats.totalPenaltyValue || 0)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                        </div>
                    </div>
                </div>


                {/* Chart 3: Rentabilidad — col-span-2 con donut a la derecha */}
                <div className="lg:col-span-2 p-6 flex flex-col">
                    {(() => {
                        const rentSources = [
                            { label: 'Intereses de préstamos', value: stats.totalInteresesPagados || 0, hex: '#3b82f6', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', bar: 'bg-blue-400' },
                            { label: 'Rendimiento cuenta NU',  value: stats.rentabilidadCajaNU || 0,     hex: '#8b5cf6', bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700', bar: 'bg-violet-400' },
                            { label: 'Cobros por mora',        value: stats.totalPenaltyValue || 0,      hex: '#ef4444', bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-600',    bar: 'bg-red-400' },
                        ];
                        const totalRent = rentSources.reduce((s, x) => s + x.value, 0);
                        const sorted = [...rentSources].sort((a, b) => b.value - a.value);

                        return (
                            <>
                            <div className="flex gap-6 h-full">
                                {/* Columna izquierda: título + banner + tarjetas + total */}
                                <div className="w-1/2 flex flex-col">
                                    <div className="mb-3 flex items-start justify-between gap-2">
                                        <div>
                                            <h3 className="text-[12px] font-black text-gray-800">¿Cuánto está ganando el fondo?</h3>
                                            <p className="text-[10px] text-gray-400 mt-0.5">Fuentes de ingresos acumuladas en lo que va del año</p>
                                        </div>
                                        <button onClick={() => setExpandDonut(true)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700 flex-shrink-0" title="Ampliar y analizar">
                                            <Maximize2 className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Tarjetas ordenadas de mayor a menor */}
                                    <div className="flex-1 space-y-2">
                                        {sorted.map((item, idx) => {
                                            const pct = totalRent > 0 ? (item.value / totalRent) * 100 : 0;
                                            return (
                                                <div key={item.label} className={`${item.bg} rounded-xl p-3`}
                                                    style={{ border: `${idx === 0 ? 2 : 1}px solid ${item.hex}${idx === 0 ? '70' : '30'}` }}>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <div className="flex items-center gap-1.5">
                                                            {idx === 0 && (
                                                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: item.hex }}>
                                                                    #1
                                                                </span>
                                                            )}
                                                            <span className={`text-[10px] font-black ${item.text} uppercase tracking-wide`}>{item.label}</span>
                                                        </div>
                                                        <span className={`text-[12px] font-black ${item.text} font-mono`}>
                                                            ${Number(item.value).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${item.bar}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <p className={`text-[9px] font-bold mt-1 ${item.text} opacity-70`}>{pct.toFixed(0)}% del total</p>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Panel total */}
                                    <div className="mt-3 flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex flex-col items-center justify-center shadow-sm relative overflow-hidden">
                                        <div className="relative z-10 text-center">
                                            <p className="text-[13px] font-black text-emerald-700 uppercase tracking-wide mb-2">
                                                Ganancia Total a corte {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </p>
                                            <p className="text-[32px] font-black text-emerald-800 font-mono leading-none">
                                                ${Math.round(totalRent).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                            </p>
                                        </div>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                            <img src={logo} alt="Credifuturo" className="h-12 w-12 object-contain rounded-full border border-emerald-200 shadow-sm relative z-10" />
                                        </div>
                                    </div>

                                    {/* Análisis condensado */}
                                    {(() => {
                                        const topPct = totalRent > 0 ? ((sorted[0].value / totalRent) * 100).toFixed(0) : 0;
                                        const secondPct = totalRent > 0 ? ((sorted[1].value / totalRent) * 100).toFixed(0) : 0;
                                        const texts = {
                                            'Intereses de préstamos': <>La <strong>cartera de préstamos</strong> es el motor del fondo ({topPct}% del ingreso) — señal de operación <strong>sana y activa</strong>. Se recomienda mantener la <strong>mora controlada</strong> y diversificar hacia instrumentos financieros para no depender únicamente del crédito.</>,
                                            'Rendimiento cuenta NU': <>El fondo <strong>genera más por depósito que por crédito</strong> ({topPct}% vs {secondPct}%), lo que indica <strong>subutilización del capital</strong>. Se recomienda aumentar la <strong>colocación de préstamos</strong>; el rendimiento NU debe ser complementario, no la fuente dominante.</>,
                                            'Cobros por mora': <><strong>Alerta:</strong> los ingresos por mora lideran ({topPct}%), lo que indica <strong>estrés en la cartera</strong>. Se recomienda revisar criterios de crédito, implementar <strong>cobro preventivo</strong> y reducir esta fuente — no es sostenible ni saludable para el fondo.</>,
                                        };
                                        return (
                                            <div className="mt-2 rounded-xl px-4 py-3 bg-gray-50 border border-gray-100">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Análisis</p>
                                                <p className="text-[13px] text-gray-600 leading-relaxed">
                                                    {texts[sorted[0].label] || texts['Intereses de préstamos']}
                                                </p>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Columna derecha: donut grande centrado */}
                                <div className="w-1/2 flex flex-col items-center justify-center">
                                    <div className="relative w-full" style={{ height: 420 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart margin={{ top: 8, right: 52, bottom: 8, left: 52 }}>
                                                <Pie
                                                    data={rentSources}
                                                    cx="50%" cy="50%"
                                                    innerRadius="42%" outerRadius="68%"
                                                    dataKey="value" nameKey="label"
                                                    startAngle={90} endAngle={-270} paddingAngle={3}
                                                    label={({ cx, cy, midAngle, outerRadius, payload, percent }) => {
                                                        const RADIAN = Math.PI / 180;
                                                        const r = outerRadius + 20;
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
                                                                <p className="text-gray-400">{pct}%</p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        {/* Centro del donut */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Total</span>
                                            <span className="text-[20px] font-black text-gray-900 font-mono leading-tight">${Math.round(totalRent).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                                            <span className="text-[10px] text-gray-400 font-bold mt-0.5">en {new Date().getFullYear()}</span>
                                        </div>
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
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="w-full md:w-1/4">
                        <h3 className="text-base font-extrabold text-gray-900">¿Cuánto está ganando el fondo?</h3>
                        <p className="inline-block mt-1 text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wide">Comparado con 2025</p>

                        <div className={`mt-3 ${growthBgClass} border rounded-xl p-4 flex flex-col items-center justify-center shadow-sm transition-all duration-500`}>
                            <span className={`text-[10px] ${growthLabelClass} font-black uppercase tracking-widest mb-1`}>Resultado total</span>
                            <span className={`text-3xl font-black ${growthTextClass} font-mono`}>
                                {growthValue > 0 ? '+' : ''}{growthValue.toFixed(1)}%
                            </span>
                            <span className={`text-[9px] mt-1 ${growthLabelClass} font-semibold`}>
                                {growthValue >= 0 ? 'Mejor que el año pasado' : 'Por debajo del año pasado'}
                            </span>
                        </div>
                    </div>

                    <div className="w-full md:w-3/4 bg-white rounded-xl p-1 border border-gray-200 shadow-sm overflow-x-auto">
                        <table className="w-full text-sm min-w-[600px] border-collapse">
                            <thead>
                                <tr className="bg-gray-100 text-gray-800 uppercase tracking-wider text-[11px]">
                                    <th className="text-left font-extrabold p-3 rounded-tl-lg">Fuente de ingreso</th>
                                    <th className="text-right font-extrabold p-3">Lo que ganamos en 2025</th>
                                    <th className="text-right font-extrabold p-3">Lo que llevamos en 2026</th>
                                    <th className="text-right font-extrabold p-3">¿Subió o bajó?</th>
                                    <th className="text-right font-extrabold p-3 text-brand-primary rounded-tr-lg">Estimado al cierre del año</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3 text-gray-900 font-bold">
                                        Intereses de préstamos
                                        <p className="text-[10px] text-emerald-700 font-semibold">Lo que pagan los socios por sus préstamos</p>
                                    </td>
                                    <td className="p-3 text-right text-blue-700 font-black bg-gray-50/50">${(1206913).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                    <td className="p-3 text-right font-black text-blue-700">${Math.round(stats.totalInteresesPagados || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                    <td className={`p-3 text-right text-sm font-black border-l ${getVariationStyles((stats.totalInteresesPagados || 0), 1206913)}`}>
                                        {(((stats.totalInteresesPagados || 0) / 1206913) * 100 - 100).toFixed(1)}%
                                    </td>
                                    <td className={`p-3 text-right font-black border-l ${getVariationStyles((stats.totalInteresesPagados || 0), 1206913)}`}>
                                        ${Math.round(stats.totalIntereses || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                    </td>
                                </tr>
                                <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3 text-gray-900 font-bold">
                                        Rendimiento cuenta NU
                                        <p className="text-[10px] text-emerald-700 font-semibold">Intereses que genera el dinero guardado en NU</p>
                                    </td>
                                    <td className="p-3 text-right text-purple-700 font-black bg-gray-50/50">${(1029139).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                    <td className="p-3 text-right font-black text-purple-700">${Math.round(stats.rentabilidadCajaNU || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                    <td className={`p-3 text-right text-sm font-black border-l ${getVariationStyles((stats.rentabilidadCajaNU || 0), 1029139)}`}>
                                        {(((stats.rentabilidadCajaNU || 0) / 1029139) * 100 - 100).toFixed(1)}%
                                    </td>
                                    <td className={`p-3 text-right font-black border-l ${getVariationStyles((stats.rentabilidadCajaNU || 0), 1029139)}`}>
                                        ${Math.round(proyeccionCajaNU).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                    </td>
                                </tr>
                                <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3 text-gray-900 font-bold">
                                        Cobros por pagos tardíos
                                        <p className="text-[10px] text-emerald-700 font-semibold">Recargo aplicado a socios con cuotas vencidas</p>
                                    </td>
                                    <td className="p-3 text-right text-red-600 font-black bg-gray-50/50">${(212000).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                    <td className="p-3 text-right font-black text-red-600">${Math.round(stats.totalPenaltyValue || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                    <td className={`p-3 text-right text-sm font-black border-l ${getVariationStyles((stats.totalPenaltyValue || 0), 212000)}`}>
                                        {(((stats.totalPenaltyValue || 0) / 212000) * 100 - 100).toFixed(1)}%
                                    </td>
                                    <td className={`p-3 text-right font-black border-l ${getVariationStyles((stats.totalPenaltyValue || 0), 212000)}`}>
                                        ${Math.round(proyeccionPenalidad).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                    </td>
                                </tr>
                                <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                                    <td className="p-3 text-emerald-900 font-black text-base uppercase tracking-wider">Ganancia total del fondo</td>
                                    <td className="p-3 text-right text-emerald-800 font-black text-lg">${(2448052).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                    <td className="p-3 text-right font-black text-emerald-700 text-lg">${Math.round((stats.totalInteresesPagados || 0) + (stats.rentabilidadCajaNU || 0) + (stats.totalPenaltyValue || 0)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                    <td className={`p-3 text-right text-lg font-black border-l shadow-inner ${getVariationStyles(((stats.totalInteresesPagados || 0) + (stats.rentabilidadCajaNU || 0) + (stats.totalPenaltyValue || 0)), 2448052)}`}>
                                        {((((stats.totalInteresesPagados || 0) + (stats.rentabilidadCajaNU || 0) + (stats.totalPenaltyValue || 0)) / 2448052) * 100 - 100).toFixed(1)}%
                                    </td>
                                    <td className={`p-3 text-right font-black text-lg border-l rounded-br-lg ${getVariationStyles(((stats.totalInteresesPagados || 0) + (stats.rentabilidadCajaNU || 0) + (stats.totalPenaltyValue || 0)), 2448052)}`}>
                                        ${Math.round(proyeccionTotal).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Resultados del Año */}
            <div className="p-6 bg-slate-50/80 border-t border-gray-200" data-pdf-section="true">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-brand-primary rounded-lg shadow-lg shadow-brand-primary/20">
                        <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 leading-none">Resultados del Año — Fondo Credifuturo</h3>
                        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-tighter mt-1">¿Cómo vamos en 2026 comparado con lo que logramos en 2025?</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SavingsByYearChart
                        data={stats.ahorroPorAnio}
                        title="Ahorro de los Socios por Año"
                        onExpand={() => setExpandComp('ahorro')}
                    />
                    <ComparativeChart
                        title="Préstamos Entregados"
                        historic={29750000}
                        current={stats.totalPrestamos || 0}
                        color="#3b82f6"
                        labelHistoric="2025"
                        labelCurrent="2026"
                        counts={{ historic: 13, current: stats.totalPrestamosCount || 0 }}
                        onExpand={() => setExpandComp('prestamos')}
                    />
                    <ComparativeChart
                        title="Patrimonio del Fondo"
                        historic={36126201}
                        current={total}
                        color="#f59e0b"
                        labelHistoric="2025"
                        labelCurrent="2026"
                        projection={36126201 + proyeccionTotal}
                        detail={[
                            { label: 'Saldo en Banco', value: stats.saldoEnBanco || 0, color: '#10b981' },
                            { label: 'Rentabilidad NU', value: stats.rentabilidadCajaNU || 0, color: '#8b5cf6' },
                            { label: 'Cartera al Día', value: prestadoVigente, color: '#3b82f6' },
                        ]}
                        onExpand={() => setExpandComp('patrimonio')}
                    />
                    <ComparativeChart
                        title="Ganancias por Intereses de los préstamos"
                        historic={1206913}
                        current={stats.totalInteresesPagados || 0}
                        color="#8b5cf6"
                        labelHistoric="2025"
                        labelCurrent="2026"
                        projection={proyeccionIntereses}
                        note={`Adicionalmente, hay $${Number(Math.max(0, (stats.totalIntereses || 0) - (stats.totalInteresesPagados || 0))).toLocaleString('es-CO', { maximumFractionDigits: 0 })} en Intereses por Cobrar (cuotas aún no pagadas por los socios). Cuando se paguen, este valor aumentará el total de ganancias del fondo.`}
                        onExpand={() => setExpandComp('intereses')}
                    />
                </div>

                {/* ── Modales de expansión de gráficas comparativas ── */}
                <ChartExpandModal isOpen={expandComp === 'ahorro'} onClose={() => setExpandComp(null)}
                    title="Ahorro de los Socios por Año — Análisis"
                    analysisResult={(() => {
                        const arr = stats.ahorroPorAnio || [];
                        const last = arr[arr.length - 1];
                        const prev = arr[arr.length - 2];
                        if (!last) return null;
                        const hist = prev ? prev.total : 0;
                        return analyzeComparativeChart({
                            title: `Ahorro ${last.anio} vs ${prev ? prev.anio : 'año anterior'}`,
                            historic: hist,
                            current: last.total,
                            progressPct: hist > 0 ? Math.min((last.total / hist) * 100, 150) : 100
                        });
                    })()}>
                    <SavingsByYearChart compact data={stats.ahorroPorAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'prestamos'} onClose={() => setExpandComp(null)}
                    title="Préstamos Entregados — Análisis vs 2025"
                    analysisResult={analyzeComparativeChart({ title: 'Préstamos Entregados', historic: 29750000, current: stats.totalPrestamos || 0, progressPct: Math.min(((stats.totalPrestamos || 0) / 29750000) * 100, 150) })}>
                    <ComparativeChart compact title="Préstamos Entregados" historic={29750000} current={stats.totalPrestamos || 0} color="#3b82f6" labelHistoric="2025" labelCurrent="2026" />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'patrimonio'} onClose={() => setExpandComp(null)}
                    title="Patrimonio del Fondo — Análisis vs 2025"
                    analysisResult={analyzeComparativeChart({ title: 'Patrimonio del Fondo', historic: 36126201, current: total, projectedYearEnd: 36126201 + proyeccionTotal, progressPct: Math.min((total / 36126201) * 100, 150) })}>
                    <ComparativeChart compact title="Patrimonio del Fondo" historic={36126201} current={total} color="#f59e0b" labelHistoric="2025" labelCurrent="2026" />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'intereses'} onClose={() => setExpandComp(null)}
                    title="Ganancias por Intereses — Análisis vs 2025"
                    analysisResult={analyzeComparativeChart({ title: 'Ganancias por Intereses', historic: 1206913, current: stats.totalInteresesPagados || 0, projectedYearEnd: proyeccionIntereses, progressPct: Math.min(((stats.totalInteresesPagados || 0) / 1206913) * 100, 150) })}>
                    <ComparativeChart compact title="Ganancias por Intereses" historic={1206913} current={stats.totalInteresesPagados || 0} color="#8b5cf6" labelHistoric="2025" labelCurrent="2026" />
                </ChartExpandModal>

                {/* ── Análisis Económico Ejecutivo ── */}
                {(() => {
                    // Ahorro por año (no acumulable): comparamos el último año vs el anterior
                    const ahorroArr = stats.ahorroPorAnio || [];
                    const ahorroLast = ahorroArr[ahorroArr.length - 1];
                    const ahorroPrev = ahorroArr[ahorroArr.length - 2];
                    const ahorroYearActual = ahorroLast ? ahorroLast.anio : new Date().getFullYear();
                    const ahorroYearPrev = ahorroPrev ? ahorroPrev.anio : ahorroYearActual - 1;
                    const ahorroMeta = ahorroPrev ? ahorroPrev.total : 0;
                    const ahorroActual = ahorroLast ? ahorroLast.total : 0;
                    const ahorroPct = ahorroMeta > 0 ? ((ahorroActual / ahorroMeta) * 100).toFixed(1) : '0.0';
                    const ahorroDiff = ahorroActual - ahorroMeta;

                    const prestamoMeta = 29750000;
                    const prestamoActual = stats.totalPrestamos || 0;
                    const prestamoPct = ((prestamoActual / prestamoMeta) * 100).toFixed(1);

                    const fondoMeta = 36126201;
                    const fondoActual = total;
                    const fondoPct = ((fondoActual / fondoMeta) * 100).toFixed(1);

                    // Intereses Recaudados
                    const interesesMeta = 1206913;
                    const interesesActual = stats.totalInteresesPagados || 0;
                    const interesesPct = ((interesesActual / interesesMeta) * 100).toFixed(1);
                    const interesesDiff = interesesActual - interesesMeta;

                    const today = new Date();
                    const dayOfYear = Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24));
                    const pctYearElapsed = ((dayOfYear / 365) * 100).toFixed(0);

                    // Ritmo proporcional de intereses (pace vs año)
                    const interesesPaceTarget = interesesMeta * (dayOfYear / 365);
                    const interesesAheadOfPace = interesesActual >= interesesPaceTarget;
                    const interesesPacePct = ((interesesActual / interesesPaceTarget) * 100).toFixed(1);

                    // Diagnósticos dinámicos
                    const ahorroHealthy = ahorroPct >= 95;
                    const prestamoModerate = prestamoPct <= 50;
                    const fondoOnTrack = fondoPct >= 85;
                    const interesesHealthy = interesesPct >= (pctYearElapsed * 0.9);

                    return (
                        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" data-pdf-section="true">
                            {/* Header del análisis */}
                            <div className="px-6 py-5 bg-gradient-to-r from-brand-primary to-emerald-800 flex items-center gap-4">
                                <div className="bg-white/20 p-2.5 rounded-full backdrop-blur-sm flex-shrink-0">
                                    <ShieldCheck className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h4 className="text-xl font-black text-white tracking-wide">¿Qué nos dicen los números?</h4>
                                    <p className="text-sm text-emerald-200 font-semibold mt-0.5">Resumen del fondo al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} — llevamos el {pctYearElapsed}% del año</p>
                                </div>
                            </div>

                            <div className="p-6 space-y-5">
                                {/* 1. Ahorro */}
                                <div className="flex items-start gap-4">
                                    <div className={`flex-shrink-0 mt-1 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black ${ahorroHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`}>1</div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h5 className="text-base font-black text-gray-900">¿Están ahorrando los socios?</h5>
                                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${ahorroHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {ahorroHealthy ? '● Bien' : '● Revisar'}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-800 leading-relaxed">
                                            En {ahorroYearPrev} los socios ahorraron en total <strong className="text-gray-800">${Number(ahorroMeta).toLocaleString('es-CO')}</strong> (ahorro mensual + aportes de ese año).
                                            En {ahorroYearActual} llevan <strong className="text-emerald-700">${Number(ahorroActual).toLocaleString('es-CO')}</strong>,
                                            que es el <strong className={ahorroHealthy ? 'text-emerald-700' : 'text-amber-700'}>{ahorroPct}%</strong> de lo ahorrado en {ahorroYearPrev}.
                                            {ahorroDiff >= 0
                                                ? <> Es <strong className="text-emerald-600">${Number(ahorroDiff).toLocaleString('es-CO')} más</strong> que el año pasado — los socios están cumpliendo con sus aportes y eso hace el fondo más fuerte.</>
                                                : <> Es <strong className="text-amber-600">${Number(Math.abs(ahorroDiff)).toLocaleString('es-CO')} menos</strong> que el año pasado. Vale la pena revisar si hay socios que bajaron o dejaron de hacer sus aportes.</>
                                            }
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-dashed border-gray-200"></div>

                                {/* 2. Préstamos */}
                                <div className="flex items-start gap-4">
                                    <div className={`flex-shrink-0 mt-1 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black ${prestamoModerate ? 'bg-blue-500' : 'bg-emerald-500'}`}>2</div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h5 className="text-base font-black text-gray-900">¿Cuánto hemos prestado?</h5>
                                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${prestamoModerate ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {prestamoModerate ? '● Ritmo Normal' : '● Ritmo Alto'}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-800 leading-relaxed">
                                            En 2025 se entregaron <strong className="text-gray-800">${Number(prestamoMeta).toLocaleString('es-CO')}</strong> en préstamos.
                                            Este año llevamos <strong className="text-blue-700">${Number(prestamoActual).toLocaleString('es-CO')}</strong> —
                                            el <strong className="text-blue-700">{prestamoPct}%</strong> de lo del año pasado.
                                            {prestamoModerate
                                                ? <> Con el {pctYearElapsed}% del año cumplido, el ritmo es {prestamoPct > (pctYearElapsed * 100) ? 'un poco más alto' : 'similar'} al de 2025. Esto es positivo: el fondo tiene liquidez disponible para seguir aprobando préstamos en lo que queda del año sin arriesgar el dinero de los socios.</>
                                                : <> El ritmo de préstamos este año es más alto que en 2025. Hay que estar atentos a que los socios estén pagando a tiempo para no comprometer la liquidez del fondo.</>
                                            }
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-dashed border-gray-200"></div>

                                {/* 3. Patrimonio */}
                                <div className="flex items-start gap-4">
                                    <div className={`flex-shrink-0 mt-1 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black ${fondoOnTrack ? 'bg-amber-500' : 'bg-red-500'}`}>3</div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h5 className="text-base font-black text-gray-900">¿Cuánto vale el fondo hoy?</h5>
                                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${fondoOnTrack ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                {fondoOnTrack ? '● En Crecimiento' : '● Verificar'}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-800 leading-relaxed">
                                            Al cierre de 2025 el fondo valía <strong className="text-gray-800">${Number(fondoMeta).toLocaleString('es-CO')}</strong> sumando ahorros mensuales y aportes iniciales.
                                            Hoy el patrimonio (ahorros + aportes) llega a <strong className={fondoOnTrack ? 'text-amber-700' : 'text-red-700'}>${Number(fondoActual).toLocaleString('es-CO')}</strong>, el <strong className={fondoOnTrack ? 'text-amber-700' : 'text-red-700'}>{fondoPct}%</strong> de ese valor.
                                            {fondoOnTrack
                                                ? <> El fondo va bien. Sumando los intereses que nos pagan los préstamos y los rendimientos de la cuenta NU, esperamos cerrar 2026 con más dinero que el año pasado.</>
                                                : <> Todavía estamos por debajo del total de 2025. Conviene revisar si hubo retiros grandes, y asegurarse de que los rendimientos de los préstamos e intereses compensen la diferencia antes de diciembre.</>
                                            }
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-dashed border-gray-200"></div>

                                {/* 4. Intereses */}
                                <div className="flex items-start gap-4">
                                    <div className={`flex-shrink-0 mt-1 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black ${interesesHealthy ? 'bg-purple-500' : 'bg-amber-500'}`}>4</div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h5 className="text-base font-black text-gray-900">¿Cuánto ganamos por los préstamos?</h5>
                                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${interesesHealthy ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {interesesHealthy ? '● Buena Ganancia' : '● Revisar Ingresos'}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-800 leading-relaxed">
                                            En 2025 el fondo recibió <strong className="text-gray-800">${Number(interesesMeta).toLocaleString('es-CO')}</strong> en intereses de los préstamos.
                                            Este año llevamos <strong className="text-purple-700">${Number(interesesActual).toLocaleString('es-CO')}</strong> —
                                            el <strong className={interesesHealthy ? 'text-purple-700' : 'text-amber-700'}>{interesesPct}%</strong> de lo del año pasado.
                                            {interesesDiff >= 0
                                                ? <> Estamos ganando <strong className="text-emerald-600">${Number(interesesDiff).toLocaleString('es-CO')} más</strong> que en 2025. Esto significa que hay más préstamos activos pagando intereses, lo cual es bueno para el crecimiento del fondo.</>
                                                : (interesesAheadOfPace
                                                    ? <> Aunque aún no llegamos al total de 2025, el ritmo es bueno para esta época del año ({interesesPacePct}% de lo esperado). Si seguimos así, vamos a acercarnos al cierre de 2025.</>
                                                    : <> Estamos recibiendo menos intereses que el año pasado y el ritmo también es más lento. Conviene revisar qué préstamos están atrasados o si las tasas están generando los ingresos esperados.</>
                                                )
                                            }
                                        </p>
                                    </div>
                                </div>

                                {/* Resumen final */}
                                <div className="mt-4 p-5 bg-gradient-to-r from-brand-primary/5 to-slate-100 rounded-xl border border-brand-primary/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <ActivitySquare className="h-5 w-5 text-brand-primary" />
                                        <h5 className="text-sm font-black text-brand-primary uppercase tracking-wider">En resumen</h5>
                                    </div>
                                    <p className="text-sm text-gray-800 leading-relaxed font-medium">
                                        {ahorroHealthy && fondoOnTrack
                                            ? <>El fondo <strong className="text-brand-primary">Credifuturo</strong> va bien al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}. Los socios están ahorrando más que el año pasado, los préstamos se están entregando a buen ritmo y el dinero del fondo sigue creciendo. {interesesHealthy ? <>Los intereses que recibimos de los préstamos también van bien, lo cual ayuda a fortalecer el fondo.</> : <>Los ingresos por intereses de préstamos están un poco más bajos que el año pasado — vale la pena revisarlos.</>} La recomendación es seguir aprobando préstamos con cuidado, asegurándose de que los socios estén al día con sus pagos, para cerrar 2026 mejor que 2025.</>
                                            : <>El fondo <strong className="text-brand-primary">Credifuturo</strong> tiene algunas señales que merecen atención al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}. Se recomienda reunirse con el equipo directivo para revisar: (1) por qué algunos indicadores están por debajo del año pasado, (2) si hay préstamos que no se están pagando a tiempo, (3) si los ingresos por intereses son suficientes, y (4) qué acciones tomar para cerrar el año de la mejor manera posible.</>
                                        }
                                    </p>
                                </div>
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
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Actualizado automáticamente</p>
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
        recentPayments: []
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
                    ahorroPorAnio: res.data.ahorroPorAnio || [],
                    totalPenaltyDays: res.data.totalPenaltyDays || 0,
                    totalPenaltyValue: res.data.totalPenaltyValue || 0,
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
            const totalPages = numPages + 1; // +1 por la página de Cartera en Mora EP

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

            // ── Página adicional: Detalle de Cartera en Mora EP ────────────────
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

            {/* --- SECCIÓN 1: SOCIOS Y AHORROS --- */}
            <div className="mb-8">
                <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
                    <PiggyBank className="w-5 h-5 text-emerald-600" /> Gestión de Socios y Ahorros
                </h2>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <StatCard
                        title="Total Socios"
                        value={loading ? '...' : (stats?.clientsCount || 0)}
                        description={
                            statusFilter === 'Todos'
                                ? `${stats?.activeClientsCount || 0} Activos, ${stats?.inactiveClientsCount || 0} Inactivos`
                                : `Socios ${statusFilter}`
                        }
                        icon={Users}
                        color="text-blue-500"
                        onClick={() => handleCardClick('/admin/clients/list')}
                    />
                    <StatCard
                        title="Capital Ahorrado"
                        value={loading ? '...' : `$${Number(stats?.totalSavings || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Abonos de socios activos"
                        icon={PiggyBank}
                        color="text-green-500"
                        onClick={() => handleCardClick('/admin/savings/list', { type: 'Mensual' })}
                    />
                    <StatCard
                        title="Total Aportes Iniciales"
                        value={loading ? '...' : `$${Number(stats?.totalInitialContributions || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Aportes de socios Activos"
                        icon={Database}
                        color="text-amber-500"
                        onClick={() => handleCardClick('/admin/contributions/initial-list')}
                    />
                    <StatCard
                        title="Total Ahorrado"
                        value={loading ? '...' : `$${Number(stats?.totalAhorradoGeneral || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Aportes + Abonos de activos"
                        icon={PiggyBank}
                        color="text-emerald-700"
                        onClick={() => handleCardClick('/admin/savings/list')}
                    />
                    <StatCard
                        title="Días de Penalización"
                        value={loading ? '...' : (stats?.totalPenaltyDays || 0)}
                        description="Acumulado (Año actual)"
                        icon={AlertCircle}
                        color="text-rose-500"
                        textColor={stats?.totalPenaltyDays > 0 ? 'text-rose-600' : 'text-gray-900'}
                        onClick={() => handleCardClick('/admin/savings/list', { status: 'Penalizacion' })}
                    />
                    <StatCard
                        title="Valor Penalizado"
                        value={loading ? '...' : `$${Number(stats?.totalPenaltyValue || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Total recargos (Año actual)"
                        icon={DollarSign}
                        color="text-amber-500"
                        onClick={() => setShowPenaltyModal(true)}
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
                        title="Total Valor Prestado"
                        value={loading ? '...' : `$${Number(stats?.totalPrestamos || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description={`${stats?.totalPrestamosCount || 0} préstamos desembolsados`}
                        icon={DollarSign}
                        color="text-emerald-500"
                        onClick={() => handleCardClick('/admin/disbursed-loans/list')}
                    />
                    <StatCard
                        title="Cartera Activa"
                        value={loading ? '...' : `$${Number(stats?.carteraDia || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description={`${stats?.carteraDiaCount || 0} cuotas al día`}
                        icon={TrendingUp}
                        color="text-emerald-600"
                        onClick={() => handleCardClick('/admin/payments/list', { estadoPrestamo: 'Activo' })}
                    />
                    <StatCard
                        title="Total Cuotas Pagadas"
                        value={loading ? '...' : `$${Number(stats?.totalCuotasPagadas || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description={`${stats?.recaudoCuotasCount || 0} cuotas recaudadas`}
                        icon={CheckCircle}
                        color="text-blue-600"
                        onClick={() => handleCardClick('/admin/payments/list')}
                    />
                    <StatCard
                        title="Cartera en Mora"
                        value={loading ? '...' : `$${Number(stats?.moraCarteraEP || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Cuotas con fecha vencida"
                        icon={AlertTriangle}
                        color="text-red-500"
                        customBg="linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
                        onClick={() => setShowMoraEPModal(true)}
                    />
                </div>
                {/* Fila 2: flujo de intereses */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        title="Total Préstamos + Intereses"
                        value={loading ? '...' : `$${Number(stats?.totalPrestamosMasIntereses || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Capital + intereses acumulados"
                        icon={Activity}
                        color="text-rose-500"
                    />
                    <StatCard
                        title="Intereses Esperados"
                        value={loading ? '...' : `$${Number(stats?.totalIntereses || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Total intereses agendados"
                        icon={BarChart3}
                        color="text-purple-500"
                        onClick={() => handleCardClick('/admin/payments/list')}
                    />
                    <StatCard
                        title="Intereses Recaudados"
                        value={loading ? '...' : `$${Number(stats?.totalInteresesPagados || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Intereses cobrados"
                        icon={TrendingUp}
                        color="text-brand-primary"
                        onClick={() => handleCardClick('/admin/payments/list', { estado: 'Pago' })}
                    />
                    <StatCard
                        title="Intereses por Cobrar"
                        value={loading ? '...' : `$${Math.max(0, (stats?.totalIntereses || 0) - (stats?.totalInteresesPagados || 0)).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Intereses pendientes de cobro"
                        icon={Clock}
                        color="text-indigo-500"
                        customBg="linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)"
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
                        title="Saldo en Banco"
                        value={loading ? '...' : `$${Number(stats?.saldoEnBanco || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Total Ahorrado - Prestado + Pagado"
                        icon={nuLogo}
                        customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)"
                        isDark={false}
                    />
                    <StatCard
                        title="Rentabilidad Caja NU"
                        value={loading ? '...' : `$${Number(stats?.rentabilidadCajaNU || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Rendimientos generados"
                        icon={nuLogo}
                        customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)"
                        isDark={false}
                    />
                    <StatCard
                        title="Saldo Banco + Rentabilidad Caja NU"
                        value={loading ? '...' : `$${Number((stats?.saldoEnBanco || 0) + (stats?.rentabilidadCajaNU || 0)).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        description="Balance total consolidado"
                        icon={nuLogo}
                        customBg="linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)"
                        isDark={false}
                    />
                </div>
            </div>

            {/* Charts Row */}
            <div className="w-full">
                <Card className="border-none shadow-md">
                    <CardHeader className="bg-gray-50 border-b border-gray-100 pb-3 rounded-t-xl">
                        <CardTitle className="text-brand-primary flex items-center gap-2 font-black text-lg">
                            <Activity className="h-5 w-5 text-brand-primary" />
                            Panel de Inteligencia Financiera & Actividad
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 bg-white rounded-b-xl overflow-hidden">
                        <FinancialChart stats={stats} />
                    </CardContent>
                </Card>
            </div>

            {/* Modals */}
            {showModal && <ValidateModal result={validateResult} onClose={() => setShowModal(false)} />}
            {showMoraModal && <MoraModal details={stats?.detalleMora} onClose={() => setShowMoraModal(false)} />}
            {showMoraEPModal && <MoraEPModal details={stats?.detalleMoraEP} onClose={() => setShowMoraEPModal(false)} />}
            {showPenaltyModal && <PenaltyModal details={stats?.detallePenalidad} onClose={() => setShowPenaltyModal(false)} />}

        </div>
    );
};
export default DashboardHome;
