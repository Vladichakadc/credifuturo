import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../config/api';
import { Search, RefreshCw, CreditCard, AlertTriangle, Inbox, Download, DollarSign, Hash, Layers, TrendingUp, TrendingDown, ShieldCheck, Wallet, ChevronLeft, ChevronRight, Users, CheckCircle, Plus, Edit, Trash2, X, Save, Calendar, User, Loader2, Calculator, ChevronDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, FormField } from '../../components/ui/Input';
import { useUi } from '../../context/UiContext';
import ListHeader from '../../components/admin/ListHeader';
import YearMultiSelect from '../../components/admin/YearMultiSelect';
import StatusMultiSelect from '../../components/admin/StatusMultiSelect';
import PillSingleSelect from '../../components/admin/PillSingleSelect';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { useSortTable, SortIcon } from '../../utils/useSortTable';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Legend } from 'recharts';
import { notifyUpdate } from '../../utils/sync';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../../utils/banks';
import { calcVerdict } from '../../utils/loanCapacity';
import { hoyISO } from '../../utils/fechas';

const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Configuración de columnas — T1-orders_table_prestamos_desembolsados
// NOTA DE ARQUITECTURA:
//   - 'id'          → ID autoincremental interno de DB (técnico, no usar como FK de negocio)
//   - 'idVm'        → Consecutivo de préstamo (SOL##) — identificador funcional del préstamo
const TABLE_COLUMNS = [
    { key: 'idVm', label: 'ID Préstamo', align: 'center', minWidth: '100px', highlight: true },
    { key: 'clientCustomerId', label: 'Customer ID', align: 'center', minWidth: '100px', highlight: true },
    { key: 'clientName', label: 'Socio', align: 'left', minWidth: '160px' },
    { key: 'clientCedula', label: 'Cédula', align: 'left', minWidth: '120px' },
    { key: 'estado', label: 'Estado', align: 'center', minWidth: '110px', isBadge: true },
    { key: 'fechaPrestamo', label: 'Fecha Préstamo', align: 'center', minWidth: '130px', isDate: true },
    { key: 'mesDesembolso', label: 'Mes Desembolso', align: 'center', minWidth: '130px' },
    { key: 'anioDesembolso', label: 'Año Desembolso', align: 'center', minWidth: '120px', isNumber: true },
    { key: 'valorPrestado', label: 'Valor Prestado', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'cuotas', label: '# Cuotas', align: 'center', minWidth: '90px', isNumber: true },
    { key: 'interesMensual', label: 'Interés Mensual', align: 'right', minWidth: '120px', isPercent: true },
    { key: 'diasPagoMax', label: 'Días Pago Max', align: 'center', minWidth: '110px', isNumber: true },
    { key: 'itemQuantity', label: 'Item Qty', align: 'center', minWidth: '80px', isNumber: true },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '130px' },
    { key: 'numeroTransaccion', label: '# Transacción', align: 'left', minWidth: '130px' },
    { key: 'cuentaAhorros', label: 'Cuenta Ahorros', align: 'left', minWidth: '130px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '180px' },
];

const ITEMS_PER_PAGE = 15;


// ——— Status Badge ———
const LoanStatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-400 text-xs italic">—</span>;
    const normalized = value.trim().toLowerCase();
    const colorMap = {
        'vigente': 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        'activo': 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        'desembolsado': 'bg-blue-100 text-blue-800 ring-blue-200',
        'pendiente': 'bg-amber-100 text-amber-800 ring-amber-200',
        'cancelado': 'bg-red-100 text-red-700 ring-red-200',
        'mora': 'bg-orange-100 text-orange-800 ring-orange-200',
    };
    const dotMap = {
        'vigente': 'bg-emerald-500',
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

// ——— Cell Renderer ———
const CellValue = ({ column, value }) => {
    if (column.isBadge) return <LoanStatusBadge value={value} />;
    if (column.isDate) {
        return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    }
    if (value === null || value === undefined || value === '') {
        return <span className="text-gray-300 text-xs italic">—</span>;
    }
    // ID técnico: mostrar en gris tenue para no confundir con Customer ID
    if (column.isTechId) {
        return <span className="font-mono text-xs text-gray-400 tabular-nums">{value}</span>;
    }
    if (column.isCurrency) {
        const num = parseFloat(value);
        return <span className="font-medium text-gray-900 tabular-nums">${!isNaN(num) ? num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</span>;
    }
    if (column.isPercent) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            return <span className="tabular-nums text-gray-700">{(num * 100).toFixed(2)}%</span>;
        }
        return <span className="text-gray-700">{value}</span>;
    }
    if (column.isNumber) {
        return <span className="tabular-nums text-gray-700">{value}</span>;
    }
    if (column.highlight) {
        return <span className="font-semibold text-gray-900">{value}</span>;
    }
    return <span className="text-gray-700">{value}</span>;
};

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

// ─── BI: Análisis Financiero de Préstamos ───────────────────────────────────
const LoansBIPanel = ({ loans, selectedYears, searchTerm, capacityData }) => {
    // Si hay búsqueda activa pero no hay resultados, mostrar mensaje
    if (searchTerm && (!loans || loans.length === 0)) {
        return (
            <Card className="overflow-hidden border border-gray-100 shadow-sm">
                <div className="px-6 pt-5 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center">
                            <DollarSign className="h-3 w-3 text-white" />
                        </div>
                        <h2 className="text-base font-bold text-gray-900">Análisis Financiero Inteligente</h2>
                    </div>
                </div>
                <div className="p-10 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                        <AlertTriangle className="h-8 w-8 text-amber-400" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">Sin préstamos registrados</h3>
                    <p className="text-sm text-gray-500 max-w-md">
                        El socio buscado <span className="font-semibold text-gray-700">"{searchTerm}"</span> no tiene préstamos desembolsados registrados en el sistema.
                    </p>
                </div>
            </Card>
        );
    }

    if (!loans || loans.length === 0) return null;

    const isFiltered = !!searchTerm;

    // ── KPIs (sobre los préstamos visibles) ──
    const totalPrestado = loans.reduce((s, l) => s + parseFloat(l.valorPrestado || 0), 0);
    const vigentes = loans.filter(l => (l.estado || '').toLowerCase().trim() === 'vigente');
    const cancelados = loans.filter(l => (l.estado || '').toLowerCase().trim() === 'cancelado');
    const totalVigente = vigentes.reduce((s, l) => s + parseFloat(l.valorPrestado || 0), 0);
    const totalCancelado = cancelados.reduce((s, l) => s + parseFloat(l.valorPrestado || 0), 0);
    const pctVigente = totalPrestado > 0 ? ((totalVigente / totalPrestado) * 100).toFixed(1) : '0.0';

    // ── Volumen por Año Seleccionado (dinámico con filtro) ──
    const currentYear = new Date().getFullYear();
    const selectedYear = (selectedYears && selectedYears.length > 0) ? selectedYears[0] : currentYear;
    const prevYear = selectedYear - 1;
    const loansSelectedYear = loans.filter(l => parseInt(l.anioDesembolso) === selectedYear);
    const selectedYearVal = loansSelectedYear.reduce((s, l) => s + parseFloat(l.valorPrestado || 0), 0);
    const selectedYearVigente = loansSelectedYear.filter(l => (l.estado || '').toLowerCase().trim() === 'vigente').reduce((s, l) => s + parseFloat(l.valorPrestado || 0), 0);
    const selectedYearCancelado = loansSelectedYear.filter(l => (l.estado || '').toLowerCase().trim() === 'cancelado').reduce((s, l) => s + parseFloat(l.valorPrestado || 0), 0);
    const selectedYearCount = loansSelectedYear.length;
    const prevYearLoans = loans.filter(l => parseInt(l.anioDesembolso) === prevYear);
    const prevYearVal = prevYearLoans.reduce((s, l) => s + parseFloat(l.valorPrestado || 0), 0);
    const prevYearCount = prevYearLoans.length;

    // Tendencia interanual
    const tendencia = prevYearVal > 0 ? (((selectedYearVal - prevYearVal) / prevYearVal) * 100).toFixed(1) : null;
    const tendenciaPos = tendencia !== null && parseFloat(tendencia) >= 0;

    // Progress bar: porcentaje del año seleccionado vs total histórico
    const pctOfTotal = totalPrestado > 0 ? ((selectedYearVal / totalPrestado) * 100).toFixed(1) : '0.0';
    // Progress bar: vigente vs cancelado del año seleccionado
    const pctVigenteYear = selectedYearVal > 0 ? ((selectedYearVigente / selectedYearVal) * 100) : 0;

    // ── Donut: Distribución por estado ──
    const donutData = [
        { name: 'Vigente', value: totalVigente, color: '#10b981' },
        { name: 'Cancelado', value: totalCancelado, color: '#ef4444' },
    ].filter(d => d.value > 0);

    // ── Barras: Evolución por año ──
    const yearMap = {};
    loans.forEach(l => {
        const yr = parseInt(l.anioDesembolso);
        if (!isNaN(yr)) yearMap[yr] = (yearMap[yr] || 0) + parseFloat(l.valorPrestado || 0);
    });
    const barData = Object.entries(yearMap)
        .sort(([a], [b]) => a - b)
        .map(([yr, val]) => ({ anio: yr, valor: val }));

    const fmtCOP = (n) => `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

    const DonutTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            const pct = totalPrestado > 0 ? ((d.value / totalPrestado) * 100).toFixed(1) : 0;
            return (
                <div className="bg-white border border-gray-100 shadow-xl rounded-lg p-3">
                    <p className="text-xs font-bold text-gray-700 mb-1">{d.name}</p>
                    <p className="text-xs font-mono font-bold" style={{ color: d.color }}>{fmtCOP(d.value)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{pct}% del total</p>
                </div>
            );
        }
        return null;
    };

    const BarTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white border border-gray-100 shadow-xl rounded-lg p-3">
                    <p className="text-xs font-bold text-gray-700 mb-1">Año {label}</p>
                    <p className="text-xs font-mono font-bold text-emerald-600">{fmtCOP(payload[0].value)}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <Card className="overflow-hidden border border-gray-100 shadow-sm">
            {/* Header */}
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center">
                        <DollarSign className="h-3 w-3 text-white" />
                    </div>
                    <h2 className="text-base font-bold text-gray-900">Análisis Financiero Inteligente</h2>
                </div>
                <p className="text-xs text-gray-500 ml-7">
                    {isFiltered
                        ? <>Análisis de préstamos para: <span className="font-semibold text-gray-700">{searchTerm}</span> — {loans.length} préstamo{loans.length !== 1 ? 's' : ''}</>
                        : 'Métricas clave y comportamiento histórico de tu portafolio de préstamos'
                    }
                </p>
            </div>

            {/* KPIs Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100 bg-white">
                {/* KPI 1: Volumen Total — Power BI Style */}
                <div className="p-5 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-2.5 rounded-lg flex-shrink-0 shadow-sm">
                            <DollarSign className="h-5 w-5 text-white" />
                        </div>
                        <div className="w-full">
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Volumen Total</p>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">{selectedYear}</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500">{selectedYearCount} prést.</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900 font-mono">{fmtCOP(selectedYearVal)}</p>
                        </div>
                    </div>

                    {/* Progress bar: % del total histórico */}
                    <div>
                        <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-gray-400 font-medium">{pctOfTotal}% del histórico total</span>
                            <span className="text-gray-400 font-mono">{fmtCOP(totalPrestado)}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${Math.min(parseFloat(pctOfTotal), 100)}%` }}
                            />
                        </div>
                    </div>

                    {/* Vigente vs Cancelado bar */}
                    <div className="space-y-1.5 border-t border-gray-100 pt-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-gray-600">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                                Vigentes
                            </span>
                            <span className="font-semibold text-emerald-700 font-mono">{fmtCOP(selectedYearVigente)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-red-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${pctVigenteYear}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-gray-600">
                                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                                Cancelados {selectedYear}
                            </span>
                            <span className="font-semibold text-red-600 font-mono">{fmtCOP(selectedYearCancelado)}</span>
                        </div>
                        {/* Total Cancelados histórico */}
                        <div className="flex items-center justify-between text-xs pt-1.5 mt-1.5 border-t border-dashed border-gray-100">
                            <span className="flex items-center gap-1.5 text-gray-500">
                                <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
                                Total Cancelados (histórico)
                            </span>
                            <span className="font-bold text-red-700 font-mono">{fmtCOP(totalCancelado)}</span>
                        </div>
                    </div>

                    {/* Comparación vs año anterior */}
                    {prevYearVal > 0 && (
                        <div className="flex items-center gap-2 pt-1 border-t border-dashed border-gray-100">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tendenciaPos ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                {tendenciaPos ? '▲' : '▼'} {tendenciaPos ? '+' : ''}{tendencia}%
                            </span>
                            <span className="text-[10px] text-gray-400">vs {prevYear} ({fmtCOP(prevYearVal)} · {prevYearCount} prést.)</span>
                        </div>
                    )}
                </div>

                {/* KPI 2: Índice de Solidez */}
                <div className="p-5 flex items-start gap-4">
                    <div className="bg-blue-50 p-2.5 rounded-lg flex-shrink-0">
                        <ShieldCheck className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Índice de Solidez</p>
                        <p className="text-2xl font-bold text-gray-900">
                            {pctVigente}<span className="text-lg text-gray-400 ml-0.5">%</span>
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1.5">Cobertura total de cartera vigente</p>
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                            ✓ Portafolio bajo control
                        </span>
                    </div>
                </div>

                {/* KPI 3: Capacidad de Pago */}
                <div className="p-5 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                        <div className="bg-purple-50 p-2.5 rounded-lg flex-shrink-0">
                            <Wallet className="h-5 w-5 text-purple-600" />
                        </div>
                        <div className="w-full">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Capacidad de Pago</p>
                            {capacityData ? (
                                <>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {(() => {
                                            // Filter capacity data by search term if active
                                            const relevantPartners = searchTerm
                                                ? capacityData.partners.filter(p => p.clientName === searchTerm)
                                                : capacityData.partners;
                                            if (relevantPartners.length === 0) return '—';
                                            const tA = relevantPartners.reduce((s, p) => s + p.ahorrado, 0);
                                            const tP = relevantPartners.reduce((s, p) => s + p.pendiente, 0);
                                            const cob = tP > 0 ? ((tA / tP) * 100).toFixed(1) : '100.0';
                                            return <>{cob}<span className="text-lg text-gray-400 ml-0.5">%</span></>;
                                        })()}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        {searchTerm ? 'Ahorro vs Cartera Pendiente' : 'Cobertura global ahorro / cartera'}
                                    </p>
                                </>
                            ) : (
                                <p className="text-sm text-gray-400 mt-1">Cargando...</p>
                            )}
                        </div>
                    </div>

                    {/* Mini table: top partners by coverage */}
                    {capacityData && (() => {
                        const relevantPartners = searchTerm
                            ? capacityData.partners.filter(p => p.clientName === searchTerm)
                            : capacityData.partners.filter(p => p.pendiente > 0).slice(0, 5);
                        if (relevantPartners.length === 0) return null;
                        return (
                            <div className="space-y-1.5 border-t border-gray-100 pt-2">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                    {searchTerm ? 'Detalle del Socio' : 'Socios con menor cobertura'}
                                </p>
                                {relevantPartners.map((p, i) => {
                                    const cobPct = Math.min(p.cobertura, 100);
                                    const barColor = p.cobertura >= 100 ? 'bg-emerald-500' : p.cobertura >= 50 ? 'bg-amber-500' : 'bg-red-500';
                                    const textColor = p.cobertura >= 100 ? 'text-emerald-700' : p.cobertura >= 50 ? 'text-amber-700' : 'text-red-700';
                                    return (
                                        <div key={p.clientId} className="space-y-0.5">
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="text-gray-600 truncate max-w-[120px]">{p.clientName}</span>
                                                <span className={`font-bold font-mono ${textColor}`}>{p.cobertura.toFixed(0)}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${cobPct}%` }} />
                                            </div>
                                            {searchTerm && (
                                                <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                                                    <span>Ahorrado: <span className="font-semibold text-emerald-600">{fmtCOP(p.ahorrado)}</span></span>
                                                    <span>Pendiente: <span className="font-semibold text-red-600">{fmtCOP(p.pendiente)}</span></span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 border-t border-gray-100">
                {/* Donut: Distribución de Capital */}
                <div className="p-6 flex flex-col items-center">
                    <h3 className="text-sm font-bold text-emerald-600 mb-4 text-center">Distribución de Capital</h3>
                    <div className="w-full relative" style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={donutData}
                                    cx="50%" cy="50%"
                                    innerRadius={68} outerRadius={96}
                                    paddingAngle={3}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {donutData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip content={<DonutTooltip />} />
                                <Legend
                                    verticalAlign="bottom"
                                    height={28}
                                    iconType="circle"
                                    wrapperStyle={{ fontSize: '11px', fontWeight: '600', color: '#4b5563' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Centro del donut */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginTop: '-24px' }}>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">ACTIVOS</span>
                            <span className="text-lg font-bold text-gray-800">{pctVigente}%</span>
                        </div>
                    </div>
                </div>

                {/* Bar: Evolución por año */}
                <div className="p-6">
                    <h3 className="text-sm font-bold text-emerald-600 mb-4 text-center">Evolución de Préstamos por Año</h3>
                    <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis
                                    dataKey="anio"
                                    axisLine={false} tickLine={false}
                                    tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }}
                                />
                                <YAxis
                                    axisLine={false} tickLine={false}
                                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                                />
                                <Tooltip content={<BarTooltip />} cursor={{ fill: '#f0fdf4' }} />
                                <Bar dataKey="valor" fill="#10b981" radius={[4, 4, 0, 0]} barSize={52}>
                                    <LabelList
                                        dataKey="valor"
                                        position="top"
                                        style={{ fill: '#374151', fontSize: 10, fontWeight: 700 }}
                                        formatter={v => fmtCOP(v)}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </Card>
    );
};

const LoansListPage = () => {
    const { toast } = useUi();
    const [searchParams, setSearchParams] = useSearchParams();
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState([]);
    const [selectedYears, setSelectedYears] = useState([new Date().getFullYear(), new Date().getFullYear() + 1]);
    const [totalFromServer, setTotalFromServer] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [capacityData, setCapacityData] = useState(null);

    // ── Estado del modal CRUD "Registrar Nuevo Desembolso" (migrado de LoansPage.jsx) ──
    const [clients, setClients] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formStep, setFormStep] = useState(1); // 1 = Socio | 2 = Condiciones | 3 = Confirmación
    const [clientSearchModal, setClientSearchModal] = useState('');
    const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
    const clientDropdownRef = React.useRef(null);
    React.useEffect(() => {
        const h = (e) => { if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target)) setClientDropdownOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    // Processing overlay
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMsg, setProcessingMsg] = useState({ title: '', lines: [] });

    // Alerta de préstamo activo para refinanciación
    const [activeLoanWarning, setActiveLoanWarning] = useState(null);

    // Capacidad de crédito del socio seleccionado (regla 3× ahorro / mora EP) — misma
    // fuente que el Analizador de Capacidad y que ya bloquea POST /disbursed-loans en
    // el backend. Se trae al elegir socio para advertir en vivo, ANTES de llegar al
    // paso de confirmación y toparse con el rechazo del servidor.
    const [clientCapacity, setClientCapacity] = useState(null);

    // Prellenado desde una solicitud de préstamo aprobada (Aprobaciones de Préstamos → Desembolsar)
    const [prefillRequestId, setPrefillRequestId] = useState(null);

    const [disbursedForm, setDisbursedForm] = useState({
        id: '',
        idVm: '',
        clientId: '',
        nombre: '',
        apellido: '',
        estado: 'Pendiente',
        fechaPrestamo: hoyISO(),
        mesDesembolso: monthNames[new Date().getMonth()],
        anioDesembolso: new Date().getFullYear(),
        valorPrestado: '',
        cuotas: '1',
        interesMensual: '',
        diasPagoMax: '',
        itemQuantity: '1',
        banco: '',
        numeroTransaccion: '',
        cuentaAhorros: '',
        observaciones: ''
    });

    const fetchLoans = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/disbursed-loans/list');
            if (res.data && res.data.ok) {
                setLoans(res.data.data);
                setTotalFromServer(res.data.total);
            } else {
                throw new Error(res.data?.error || 'Respuesta inesperada del servidor');
            }
        } catch (err) {
            console.error('Error fetching loans list:', err);
            setError(err.message || 'Error al conectar con el servidor');
            setLoans([]);
            setTotalFromServer(0);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLoans(); }, [fetchLoans]);

    // Fetch capacity analysis data
    const fetchCapacity = useCallback(async () => {
        try {
            const res = await api.get('/admin/loans-capacity-analysis');
            if (res.data && res.data.ok) setCapacityData(res.data);
        } catch (err) {
            console.error('Error fetching capacity analysis:', err);
        }
    }, []);
    useEffect(() => { fetchCapacity(); }, [fetchCapacity]);

    // Clientes (para el combobox de socio del modal y el autocompletado de nombre/tasa)
    const fetchClients = useCallback(async () => {
        try {
            const res = await api.get('/admin/clients');
            setClients(res.data);
        } catch (err) {
            console.error('Error fetching clients:', err);
        }
    }, []);
    useEffect(() => { fetchClients(); }, [fetchClients]);

    // Único punto que refresca todo tras crear/editar/eliminar/validar — evita que el
    // panel BI, la tabla y el KPI de Capacidad de Pago queden desincronizados entre sí.
    const refreshAll = useCallback(async () => {
        await Promise.all([fetchLoans(), fetchClients(), fetchCapacity()]);
    }, [fetchLoans, fetchClients, fetchCapacity]);

    // AUTO-OPEN: When navigated via sidebar "Ingresar Préstamo" (?action=new)
    useEffect(() => {
        if (searchParams.get('action') === 'new' && !loading && clients.length > 0) {
            handleOpenDisbursedModal(); // Open create modal
            // Clear the param so it doesn't re-trigger on tab change, etc.
            setSearchParams({}, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, loading, clients]);

    // AUTO-PREFILL: When navigated from Aprobaciones de Préstamos → "Desembolsar" (?prefillRequestId=N)
    useEffect(() => {
        const prefillId = searchParams.get('prefillRequestId');
        if (prefillId && !loading && clients.length > 0) {
            api.get(`/admin/loan-requests/${prefillId}`)
                .then(res => {
                    const request = res.data?.data;
                    if (!request) return;
                    setPrefillRequestId(request.id);
                    handleOpenDisbursedModal(null, {
                        clientId: request.clientId,
                        valorPrestado: request.amount,
                        cuotas: request.installments,
                        interesMensual: request.monthlyRate,
                        banco: request.banco || '',
                        cuentaAhorros: request.cuentaAhorros || ''
                    });
                })
                .catch(err => { console.error(err); toast.error('No se pudo cargar la solicitud para prellenar el formulario.'); });
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, loading, clients]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-calculate Month/Year when date changes
    useEffect(() => {
        if (!disbursedForm.fechaPrestamo) return;
        const [yearStr, monthStr] = disbursedForm.fechaPrestamo.split('-');
        const mes = parseInt(monthStr) - 1;
        const anio = parseInt(yearStr);
        setDisbursedForm(prev => ({
            ...prev,
            mesDesembolso: monthNames[mes] || '',
            anioDesembolso: isNaN(anio) ? '' : anio
        }));
    }, [disbursedForm.fechaPrestamo]);

    // Auto-fill Client Name + verificar préstamo activo (solo en modo creación)
    useEffect(() => {
        if (!disbursedForm.clientId) {
            setActiveLoanWarning(null);
            setClientCapacity(null);
            return;
        }
        const client = clients.find(c => c.id.toString() === disbursedForm.clientId.toString());
        if (client) {
            setDisbursedForm(prev => ({
                ...prev,
                nombre: client.name || '',
                apellido: `${client.surname1 || ''} ${client.surname2 || ''}`.trim(),
                // Tasa asignada al socio (regla de devoluciones: 1,6% si retiró
                // ahorros el año anterior, 1,4% si no). Solo en creación; al
                // editar se respeta la tasa pactada del préstamo.
                ...(!isEditing && client.porcentajePrestamo
                    ? { interesMensual: parseFloat((Number(client.porcentajePrestamo) * 100).toFixed(4)) }
                    : {})
            }));
        }
        // Solo verificar en modo creación (no al editar)
        if (isEditing) return;
        setClientCapacity(null);
        // Capacidad de crédito (regla 3× / mora EP) — misma fuente que el Analizador y
        // que ya bloquea el guardado en el backend; se trae para advertir en vivo.
        api.get(`/admin/clients/${disbursedForm.clientId}/loan-capacity`)
            .then(res => setClientCapacity(res.data))
            .catch(() => {}); // silencioso; no bloquea el formulario
    }, [disbursedForm.clientId, clients, isEditing]);

    // Refinanciación: qué se cancela del préstamo vigente. Va en su propio efecto porque
    // depende TAMBIÉN de la fecha del desembolso — el interés causado se cobra por días
    // corridos hasta esa fecha, así que si el gerente la cambia, el aviso tiene que
    // recalcularse. Antes se consultaba una sola vez al elegir el socio y con la fecha de
    // hoy, de modo que la cifra mostrada podía no ser la que se terminaba cobrando.
    useEffect(() => {
        if (isEditing || !disbursedForm.clientId || !disbursedForm.fechaPrestamo) {
            setActiveLoanWarning(null);
            return;
        }
        let vigente = true;
        api.get(`/admin/clients/${disbursedForm.clientId}/active-loan`, {
            params: { fecha: disbursedForm.fechaPrestamo }
        })
            .then(res => {
                if (!vigente) return;
                setActiveLoanWarning(res.data.tienePrestamoActivo ? res.data.prestamo : null);
            })
            .catch(() => {}); // silencioso; no bloquea el formulario
        return () => { vigente = false; };
    }, [disbursedForm.clientId, disbursedForm.fechaPrestamo, isEditing]);

    const handleOpenDisbursedModal = (loan = null, overrides = null) => {
        const today = hoyISO();
        if (loan) {
            setIsEditing(true);
            setDisbursedForm({
                ...loan,
                nombre: loan.nombre || '',
                apellido: loan.apellido || '',
                // La fecha REAL del préstamo, no la de hoy. Ponía `today` y el guardado la
                // persistía: abrir "Editar" para corregir un número de transferencia movía
                // el desembolso al día en curso y regeneraba el cronograma desde ahí. Y como
                // el interés proporcional de un retanqueo se cuenta desde esa fecha, el
                // préstamo dejaba de cobrar lo que le correspondía — $0 si quedaba en hoy.
                fechaPrestamo: (loan.fechaPrestamo || today).toString().slice(0, 10),
                interesMensual: loan.interesMensual ? parseFloat((parseFloat(loan.interesMensual) * 100).toFixed(4)) : ''
            });
        } else {
            setIsEditing(false);
            setDisbursedForm({
                id: '', idVm: '', clientId: '', nombre: '', apellido: '',
                estado: 'Vigente',
                fechaPrestamo: hoyISO(),
                mesDesembolso: monthNames[new Date().getMonth()],
                anioDesembolso: new Date().getFullYear(),
                valorPrestado: '', cuotas: '1', interesMensual: '', diasPagoMax: '',
                itemQuantity: '1', banco: '', numeroTransaccion: '', cuentaAhorros: '', observaciones: '',
                ...(overrides || {})
            });
        }
        setActiveLoanWarning(null);
        setFormStep(1);
        setClientSearchModal('');
        setClientDropdownOpen(false);
        setIsModalOpen(true);
    };

    // gerenteAprueba: true cuando el gerente decide autorizar directamente un monto
    // que supera el cupo 3× sin votación, en vez de pasar por Aprobación de Préstamos.
    const handleSubmitDisbursed = async (e, gerenteAprueba = false) => {
        if (e && e.preventDefault) e.preventDefault();
        if (gerenteAprueba) {
            const ok = window.confirm(
                'Vas a aprobar este préstamo directamente como gerente, sin la votación completa de la Junta Administrativa.\n\n' +
                'Esta decisión queda registrada de forma permanente en el préstamo y en el log de seguridad.\n\n¿Confirmas?'
            );
            if (!ok) return;
        }
        try {
            if (!disbursedForm.valorPrestado || parseFloat(disbursedForm.valorPrestado) <= 0) {
                toast.error('El valor prestado debe ser mayor a 0');
                return;
            }

            const cuotas = parseInt(disbursedForm.cuotas) || 0;
            const interessPct = parseFloat(disbursedForm.interesMensual) || 0;
            const interes = parseFloat((interessPct / 100).toFixed(6));

            if (interessPct < 0 || interessPct > 100) {
                toast.error('El interés mensual debe estar entre 0% y 100%.');
                return;
            }

            // Show processing overlay
            setIsModalOpen(false);
            if (isEditing) {
                setProcessingMsg({
                    title: 'Actualizando préstamo...',
                    lines: [
                        'Guardando cambios del desembolso',
                        `Recalculando ${cuotas} cuotas con interés ${interessPct.toFixed(2)}% mensual`,
                        'Sincronizando tabla Estado de Préstamos',
                    ]
                });
            } else if (activeLoanWarning) {
                setProcessingMsg({
                    title: 'Procesando refinanciación...',
                    lines: [
                        `Cancelando préstamo anterior ${activeLoanWarning.idVm}`,
                        `Saldando ${activeLoanWarning.cuotasPendientes} cuota(s) sin interés`,
                        'Registrando nuevo desembolso',
                        `Generando ${cuotas} cuotas nuevas`,
                    ]
                });
            } else {
                setProcessingMsg({
                    title: 'Procesando nuevo desembolso...',
                    lines: [
                        'Registrando datos del préstamo',
                        `Calculando tabla de amortización para ${cuotas} cuotas`,
                        `Interés mensual: ${interessPct.toFixed(2)}% — generando fechas de pago`,
                        'Guardando en Estado de Préstamos',
                    ]
                });
            }
            if (gerenteAprueba) {
                setProcessingMsg(prev => ({ ...prev, lines: [...prev.lines, 'Aprobación directa del gerente — sin votación de la Junta'] }));
            }
            setIsProcessing(true);

            // loanRequestId: si este desembolso viene de una solicitud ya votada y
            // aprobada por la Junta (Aprobación de Préstamos), el backend la usa para
            // eximir del tope 3× sin votación — ya pasó por el canal de gobierno correcto.
            const payload = { ...disbursedForm, interesMensual: interes, loanRequestId: prefillRequestId || null, gerenteAprueba };

            if (isEditing) {
                await api.put(`/admin/disbursed-loans/${disbursedForm.id}`, payload);
                toast.success('Préstamo actualizado y tabla de cuotas regenerada');
            } else {
                const res = await api.post('/admin/disbursed-loans', payload);
                const ref = res.data.refinanciacion;
                if (ref && ref.idVmAnterior) {
                    const fmt = n => Number(n).toLocaleString('es-CO');
                    const interesCausadoTxt = Number(ref.interesCausado) > 0
                        ? ` Interés cobrado por ${ref.diasTranscurridos} día(s): $${fmt(ref.interesCausado)}.`
                        : ` Sin interés por días (${ref.diasTranscurridos ?? 0} día(s) transcurridos).`;
                    // El neto cierra el mensaje porque es lo único que queda por hacer
                    // después de guardar: transferir esa cantidad, no el valor prestado.
                    const netoTxt = Number(ref.netoEntregado) >= 0
                        ? ` ➜ ENTREGAR AL SOCIO: $${fmt(ref.netoEntregado)}`
                        : ` ➜ EL SOCIO DEBE CONSIGNAR: $${fmt(Math.abs(Number(ref.netoEntregado)))}`;
                    toast.success(
                        `✅ Refinanciación completada — Préstamo anterior ${ref.idVmAnterior} cancelado. ` +
                        `${ref.cuotasSaldadas} cuota(s) saldadas, interés condonado: $${fmt(ref.interesCondonado)}.` +
                        interesCausadoTxt + netoTxt,
                        12000 // mensaje largo, con cifras — 3s por defecto no alcanza a leerse
                    );
                } else if (gerenteAprueba) {
                    toast.success(
                        `✅ Préstamo aprobado directamente por el gerente (sin votación de la Junta) — ${cuotas} cuotas generadas automáticamente.`,
                        9000
                    );
                } else {
                    toast.success(`Préstamo registrado: ${cuotas} cuotas generadas automáticamente`, 6000);
                }
                if (prefillRequestId) {
                    try {
                        await api.put(`/admin/loan-requests/${prefillRequestId}/mark-disbursed`, {
                            disbursedLoanId: res.data.loan.id
                        });
                    } catch (linkErr) {
                        console.error('Error linking loan request to disbursed loan:', linkErr);
                        toast.error('El préstamo se registró pero no se pudo vincular con la solicitud original.');
                    } finally {
                        setPrefillRequestId(null);
                    }
                }
            }
            setActiveLoanWarning(null);
            refreshAll();
            notifyUpdate('loans');
            // Crear/editar un desembolso también crea o regenera sus cuotas — sin esto,
            // PaymentsListPage (Lista de Pagos) solo escucha 'paymentsUpdated' y se queda
            // con datos viejos hasta que el admin la recargue manualmente.
            notifyUpdate('payments');
        } catch (error) {
            console.error('Error saving disbursed loan:', error);
            toast.error('Error al guardar: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteDisbursed = async (loan) => {
        if (window.confirm(`¿Está seguro de eliminar el préstamo ${loan.idVm} y todas sus cuotas asociadas?`)) {
            try {
                setProcessingMsg({
                    title: 'Eliminando préstamo...',
                    lines: [
                        `Eliminando desembolso ${loan.idVm}`,
                        'Borrando cuotas de Estado de Préstamos',
                        'Liberando registros asociados',
                    ]
                });
                setIsProcessing(true);
                const { data } = await api.delete(`/admin/disbursed-loans/${loan.id}`);
                if (data?.restauracion) {
                    toast.success(
                        `Préstamo ${loan.idVm} eliminado. Como era un retanqueo, el préstamo anterior ${data.restauracion.idVmAnterior} volvió a Vigente (${data.restauracion.cuotasRestauradas} cuota(s) de vuelta a Pendiente).`,
                        9000
                    );
                } else {
                    toast.success(`Préstamo ${loan.idVm} y sus cuotas eliminados`);
                }
                refreshAll();
                notifyUpdate('loans');
                notifyUpdate('payments'); // sus cuotas también se borraron — refrescar Lista de Pagos
            } catch (error) {
                toast.error('Error al eliminar: ' + (error.response?.data?.error || error.message));
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleValidateStatuses = async () => {
        try {
            const res = await api.post('/admin/validate-loan-statuses');
            toast.success(res.data.message);
            if (res.data.fixed > 0) {
                refreshAll();
                notifyUpdate('loans');
            }
        } catch (err) {
            toast.error('Error al validar préstamos: ' + (err.response?.data?.error || err.message));
        }
    };

    // Derive available years from data
    const availableYears = useMemo(() => {
        const years = new Set(loans.map(l => l.anioDesembolso).filter(Boolean));
        return Array.from(years).sort((a, b) => b - a); // DESC
    }, [loans]);

    // Derive unique partner names from data
    const availablePartners = useMemo(() => {
        const names = new Set(loans.map(l => l.clientName).filter(Boolean));
        return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
    }, [loans]);

    // Derive available statuses from data
    const availableStatuses = useMemo(() => {
        const statuses = new Set(loans.map(l => l.estado?.trim()).filter(Boolean));
        return Array.from(statuses).sort();
    }, [loans]);

    // Client-side filtering (Partner, Status & Year)
    const filteredLoans = useMemo(() => {
        let results = loans;

        // Apply Year Filter
        if (selectedYears && selectedYears.length > 0) {
            results = results.filter(l => selectedYears.includes(parseInt(l.anioDesembolso, 10)));
        }

        // Apply Status Filter
        if (statusFilter && statusFilter.length > 0) {
            results = results.filter(l =>
                statusFilter.includes((l.estado || '').trim())
            );
        }

        // Apply Partner Filter
        if (searchTerm) {
            results = results.filter(l => l.clientName === searchTerm);
        }

        return results;
    }, [loans, searchTerm, statusFilter, selectedYears]);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, selectedYears]);

    // Paginated data
    const { sortedData: sortedLoans, sortConfig: loansSort, handleSort: handleLoansSort } = useSortTable(filteredLoans);

    const paginatedLoans = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedLoans.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedLoans, currentPage]);

    const totalPages = Math.max(1, Math.ceil(filteredLoans.length / ITEMS_PER_PAGE));

    // Summary calculations (Smart Cards)
    const stats = useMemo(() => {
        return filteredLoans.reduce((acc, curr) => {
            acc.totalPrestado += parseFloat(curr.valorPrestado || 0);
            acc.totalCuotas += parseInt(curr.cuotas || 0);
            acc.totalItemQty += parseInt(curr.itemQuantity || 0);
            acc.cuotasPagas += parseInt(curr.cuotasPagas || 0);
            acc.cuotasPendientes += parseInt(curr.cuotasPendientes || 0);
            return acc;
        }, { totalPrestado: 0, totalCuotas: 0, totalItemQty: 0, cuotasPagas: 0, cuotasPendientes: 0 });
    }, [filteredLoans]);


    const handleExport = () => {
        if (filteredLoans.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const dataToExport = filteredLoans.map(l => ({
            'ID_VM': l.idVm,            // Identificador funcional del préstamo
            'Customer_ID': l.clientCustomerId,  // ✅ customer_id oficial del negocio
            'Socio': l.clientName,
            'Cédula': l.clientCedula,
            'Estado': l.estado,
            'Fecha Préstamo': formatDate(l.fechaPrestamo),
            'Mes Desembolso': l.mesDesembolso,
            'Año Desembolso': l.anioDesembolso,
            'Valor Prestado': l.valorPrestado,
            '# Cuotas': l.cuotas,
            'Interés Mensual': l.interesMensual,
            'Días Pago Max': l.diasPagoMax,
            'Item Qty': l.itemQuantity,
            'Banco': l.banco,
            '# Transacción': l.numeroTransaccion,
            'Cuenta Ahorros': l.cuentaAhorros,
            'Observaciones': l.observaciones,
            '# DB (Técnico)': l.id,   // ID interno de DB — solo referencia técnica
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Préstamos');
        XLSX.writeFile(wb, 'Lista_Prestamos.xlsx');
        toast.success('Reporte exportado exitosamente');
    };

    // ——— LOADING ———
    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
                    <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
                </div>
                <Card><CardContent className="p-6 space-y-4">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="flex gap-4 items-center">
                            <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                            <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                            <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
                            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                        </div>
                    ))}
                </CardContent></Card>
            </div>
        );
    }

    // ——— ERROR ———
    if (error) {
        return (
            <div className="space-y-6">
                <div><h1 className="text-2xl font-bold text-brand-dark">Lista de Préstamos</h1>
                    <p className="text-gray-500">Préstamos desembolsados registrados en el sistema</p></div>
                <Card><CardContent className="p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No se pudo cargar la lista</h3>
                    <p className="text-gray-500 mb-6 max-w-md mx-auto">{error}</p>
                    <Button onClick={fetchLoans} className="bg-brand-primary hover:bg-brand-dark">
                        <RefreshCw className="h-4 w-4 mr-2" /> Reintentar
                    </Button>
                </CardContent></Card>
            </div>
        );
    }

    // ——— TABLE ———
    return (
        <div className="space-y-6">
            {/* Acciones de gestión (crear/validar) */}
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleValidateStatuses} title="Marcar como Cancelado los préstamos con todas sus cuotas pagadas">
                    <CheckCircle className="mr-2 h-4 w-4 text-green-600" /> Validar Estados
                </Button>
                <Button onClick={() => handleOpenDisbursedModal()}>
                    <Plus className="mr-2 h-4 w-4" /> Nuevo Desembolso
                </Button>
            </div>

            {/* BI Panel */}
            <LoansBIPanel loans={filteredLoans} selectedYears={selectedYears} searchTerm={searchTerm} capacityData={capacityData} />
            {/* Smart Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    title="Total Valor Prestado"
                    value={`$${stats.totalPrestado.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    description="Suma bruta de préstamos filtrados"
                    icon={DollarSign}
                    color="text-emerald-500"
                />
                <Card className="transition-all duration-200 overflow-hidden relative">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Total Cuotas</CardTitle>
                        <Hash className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between gap-1">
                            <div className="text-center flex-1">
                                <div className="text-2xl font-bold text-gray-900">{stats.totalCuotas}</div>
                                <p className="text-xs text-gray-400 mt-0.5">Total</p>
                            </div>
                            <div className="h-8 w-px bg-gray-200 self-center" />
                            <div className="text-center flex-1">
                                <div className="text-2xl font-bold text-emerald-600">{stats.cuotasPagas}</div>
                                <p className="text-xs text-gray-400 mt-0.5">Pagas</p>
                            </div>
                            <div className="h-8 w-px bg-gray-200 self-center" />
                            <div className="text-center flex-1">
                                <div className="text-2xl font-bold text-amber-600">{stats.cuotasPendientes}</div>
                                <p className="text-xs text-gray-400 mt-0.5">Pendientes</p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Cuotas proyectadas del período filtrado</p>
                    </CardContent>
                </Card>
                <StatCard
                    title="Cantidad Préstamos (Items)"
                    value={stats.totalItemQty}
                    description="Suma basada en Item Qty"
                    icon={Layers}
                    color="text-amber-500"
                />
            </div>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-brand-primary/10">
                        <CreditCard className="h-5 w-5 text-brand-primary" />
                    </div>
                    <ListHeader
                        source="T1-orders_table_prestamos_desembolsados"
                        totalCount={loans.length}
                        filteredCount={filteredLoans.length}
                        loading={loading}
                        className="mb-0"
                    />
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="flex flex-wrap gap-3 flex-1 lg:flex-none items-end">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Socio</label>
                            <PillSingleSelect
                                options={availablePartners}
                                selectedValue={searchTerm}
                                onChange={setSearchTerm}
                                labelPrefix="Socio"
                                icon={Users}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Año</label>
                            <YearMultiSelect selectedYears={selectedYears} onChange={setSelectedYears} />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Estado</label>
                            <StatusMultiSelect
                                options={availableStatuses}
                                selectedValues={statusFilter}
                                onChange={setStatusFilter}
                                labelPrefix="Estado"
                                icon={CheckCircle}
                            />
                        </div>

                        {(searchTerm || statusFilter.length > 0 || selectedYears.length !== 2 || selectedYears[0] !== new Date().getFullYear() || selectedYears[1] !== new Date().getFullYear() + 1) && (
                            <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); setStatusFilter([]); setSelectedYears([new Date().getFullYear(), new Date().getFullYear() + 1]); }} className="gap-1.5 text-gray-500 hover:text-gray-700 self-end mb-1">
                                Limpiar
                            </Button>
                        )}
                    </div>
                    <Button variant="secondary" onClick={handleExport} title="Exportar a Excel" className="shrink-0">
                        <Download className="h-4 w-4 mr-2" /> Exportar
                    </Button>
                    <Button variant="ghost" onClick={fetchLoans} title="Recargar datos" className="shrink-0 px-2.5">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* EMPTY */}
            {filteredLoans.length === 0 ? (
                <Card><CardContent className="p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                        <Inbox className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Sin registros</h3>
                    <p className="text-gray-500 text-sm">
                        {(searchTerm || statusFilter.length > 0 || selectedYears.length > 0) ? 'No se encontraron préstamos que coincidan con los filtros seleccionados.' : 'No hay préstamos registrados en el sistema.'}
                    </p>
                    {(searchTerm || statusFilter.length > 0 || selectedYears.length > 0) && (
                        <Button variant="ghost" onClick={() => { setSearchTerm(''); setSelectedYears([new Date().getFullYear(), new Date().getFullYear() + 1]); setStatusFilter([]); }} className="mt-4 text-brand-primary hover:text-brand-dark">Limpiar filtros</Button>
                    )}
                </CardContent></Card>
            ) : (
                <>
                    <Card className="overflow-hidden border-none shadow-none bg-transparent">
                        <div className="table-container max-h-[70vh] overflow-y-auto">
                            <table className="premium-table" id="loans-list-table">
                                <thead>
                                    <tr className="bg-brand-primary text-white">
                                        {TABLE_COLUMNS.map(col => (
                                            <th key={col.key} className="sticky top-0 z-10 bg-brand-primary cursor-pointer select-none hover:bg-brand-dark transition-colors" style={{ textAlign: col.align, minWidth: col.minWidth }} onClick={() => handleLoansSort(col.key)}>
                                                <span className="inline-flex items-center gap-1">{col.label}<SortIcon colKey={col.key} sortConfig={loansSort} /></span>
                                            </th>
                                        ))}
                                        <th className="sticky top-0 z-10 bg-brand-primary" style={{ textAlign: 'center', minWidth: '90px' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedLoans.map((loan, rowIdx) => (
                                        <tr key={loan.id} className={`transition-colors duration-150 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                            {TABLE_COLUMNS.map(col => (
                                                <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }} className={col.key === 'id' ? 'font-mono text-xs text-gray-400' : ''}>
                                                    <CellValue column={col} value={loan[col.key]} />
                                                </td>
                                            ))}
                                            <td style={{ textAlign: 'center' }}>
                                                <div className="flex items-center justify-center gap-2">
                                                    <button type="button" onClick={() => handleOpenDisbursedModal(loan)} title="Editar" className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                                                        <Edit className="h-4 w-4 text-blue-500" />
                                                    </button>
                                                    <button type="button" onClick={() => handleDeleteDisbursed(loan)} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-4">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                            </Button>
                            <span className="text-sm text-gray-600 font-medium">
                                Página{' '}
                                <span className="font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-md">
                                    {currentPage}
                                </span>
                                {' '}de {totalPages}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    )}
                </>
            )}

            {/* ──────── MODAL NUEVO DESEMBOLSO (STEPPER) ──────── */}
            {isModalOpen && (() => {
                // ── cálculo en vivo de cuotas — MISMO método que usa el backend al guardar
                // (server/routes/admin.js, sección "CREAR CUOTAS" dentro de POST
                // /disbursed-loans): capital fijo por cuota + interés sobre el saldo que
                // va quedando, NO amortización francesa de cuota constante.
                const P = parseFloat(disbursedForm.valorPrestado) || 0;
                const n = parseInt(disbursedForm.cuotas) || 0;
                const iPct = parseFloat(disbursedForm.interesMensual) || 0;
                const i = iPct / 100;
                let primeraCuota = 0, ultimaCuota = 0, interesTotalEstimado = 0;
                if (P > 0 && n > 0) {
                    const capitalPorCuota = P / n;
                    let saldo = P;
                    for (let k = 1; k <= n; k++) {
                        const interesCuota = saldo * i;
                        const cuota = capitalPorCuota + interesCuota;
                        if (k === 1) primeraCuota = cuota;
                        if (k === n) ultimaCuota = cuota;
                        interesTotalEstimado += interesCuota;
                        saldo -= capitalPorCuota;
                    }
                }
                const fmt = v => Math.round(v).toLocaleString('es-CO');

                // ── liquidación del retanqueo ──────────────────────────────────────────
                // Un retanqueo no mueve dos sumas de dinero: el fondo entrega la DIFERENCIA
                // entre el préstamo nuevo y lo que se salda del viejo. Y lo que se salda es
                // el capital MÁS el interés de los días corridos, no el saldo pelado — ese
                // interés ya queda contabilizado como cobrado (entra a "Intereses de
                // préstamos" y al recaudo de Caja Disponible), así que si no se retiene al
                // entregar el dinero, el fondo reporta un ingreso que nunca entró.
                // Mismas cuentas que hace el servidor al guardar (POST /disbursed-loans).
                const totalACancelar = activeLoanWarning
                    ? (Number(activeLoanWarning.totalACancelar) ||
                       (Number(activeLoanWarning.saldoPendiente) || 0) + (Number(activeLoanWarning.interesCausado) || 0))
                    : 0;
                const netoAEntregar = P - totalACancelar;

                // ── capacidad de crédito (regla 3× / mora EP) — MISMA regla que ya
                // bloquea el guardado en el backend (POST /disbursed-loans).
                let cupoMaximo = 0, capacidadDisponible = 0, excedeCapacidad = false;
                if (clientCapacity && !isEditing) {
                    const verdictBase = calcVerdict(clientCapacity, { audience: 'admin' });
                    cupoMaximo = verdictBase.montoMaxSinVotacion;
                    const saldoQueSeCancela = activeLoanWarning ? Number(activeLoanWarning.saldoPendiente) || 0 : 0;
                    capacidadDisponible = verdictBase.capacidadDisponible + saldoQueSeCancela;
                    excedeCapacidad = P > 0 && P > capacidadDisponible;
                }

                // ── socio seleccionado ──
                const socioSel = clients.find(c => String(c.id) === String(disbursedForm.clientId));
                const clientesFiltrados = clientSearchModal.trim()
                    ? clients.filter(c => `${c.name} ${c.surname1 || ''} ${c.cedula || ''} ${c.customerId || ''}`.toLowerCase().includes(clientSearchModal.toLowerCase()))
                    : clients;

                const steps = ['Socio', 'Condiciones', 'Confirmar'];

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl min-h-[600px] max-h-[92vh] overflow-y-auto flex flex-col" style={{ animation: 'fadeScale .2s ease' }}>

                            {/* ── Header ── */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
                                <div>
                                    <h2 className="text-lg font-extrabold text-gray-900">
                                        {isEditing ? 'Editar Préstamo' : 'Registrar Nuevo Desembolso'}
                                    </h2>
                                    {prefillRequestId && (
                                        <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                                            <CheckCircle className="h-3 w-3" /> Prellenado desde solicitud aprobada
                                        </p>
                                    )}
                                </div>
                                <button onClick={() => { setIsModalOpen(false); setPrefillRequestId(null); }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* ── Stepper pills ── */}
                            <div className="flex items-center gap-0 px-6 pt-5 pb-4">
                                {steps.map((label, idx) => {
                                    const step = idx + 1;
                                    const done = formStep > step;
                                    const active = formStep === step;
                                    return (
                                        <React.Fragment key={step}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                                                    done ? 'bg-brand-primary text-white' :
                                                    active ? 'bg-brand-primary text-white ring-4 ring-brand-primary/20' :
                                                    'bg-gray-100 text-gray-400'
                                                }`}>
                                                    {done ? <CheckCircle className="h-4 w-4" /> : step}
                                                </div>
                                                <span className={`text-xs font-bold hidden sm:block ${
                                                    active ? 'text-gray-900' : done ? 'text-brand-primary' : 'text-gray-400'
                                                }`}>{label}</span>
                                            </div>
                                            {idx < steps.length - 1 && <div className={`flex-1 h-px mx-2 transition-all ${done ? 'bg-brand-primary' : 'bg-gray-200'}`} />}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            {/* ════════ PASO 1 — SOCIO ════════ */}
                            {formStep === 1 && (
                                <div className="px-6 pb-6 flex-1 flex flex-col">
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-500 font-medium">Selecciona el socio al que se le desembolsará el préstamo.</p>

                                    {/* Searchable combobox */}
                                    <div className="relative" ref={clientDropdownRef}>
                                        <button
                                            type="button"
                                            onClick={() => { setClientDropdownOpen(o => !o); setClientSearchModal(''); }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                                                disbursedForm.clientId
                                                    ? 'border-brand-primary bg-brand-primary/5 text-gray-900'
                                                    : 'border-gray-200 bg-white text-gray-400 hover:border-brand-primary/50'
                                            }`}
                                        >
                                            <User className="h-4 w-4 flex-shrink-0" />
                                            <span className="flex-1 text-left">
                                                {socioSel ? `${socioSel.name} ${socioSel.surname1 || ''} ${socioSel.surname2 || ''} · ${socioSel.cedula || socioSel.customerId || ''}` : 'Buscar socio por nombre o cédula...'}
                                            </span>
                                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${clientDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {clientDropdownOpen && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                                <div className="p-3 border-b border-gray-100">
                                                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                                                        <Search className="h-3.5 w-3.5 text-gray-400" />
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            placeholder="Nombre, cédula o ID..."
                                                            value={clientSearchModal}
                                                            onChange={e => setClientSearchModal(e.target.value)}
                                                            className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="max-h-80 overflow-y-auto py-1">
                                                    {clientesFiltrados.length === 0 ? (
                                                        <p className="px-4 py-3 text-sm text-gray-400 text-center">Sin resultados</p>
                                                    ) : clientesFiltrados.map(c => (
                                                        <button
                                                            key={c.id} type="button"
                                                            onClick={() => { setDisbursedForm(prev => ({ ...prev, clientId: String(c.id) })); setClientDropdownOpen(false); }}
                                                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-brand-primary/5 transition-colors flex items-center gap-3 ${
                                                                String(disbursedForm.clientId) === String(c.id) ? 'bg-brand-primary/10 font-bold text-brand-primary' : 'text-gray-700'
                                                            }`}
                                                        >
                                                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500 flex-shrink-0">
                                                                {(c.name || '?')[0].toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-semibold">{c.name} {c.surname1 || ''} {c.surname2 || ''}</p>
                                                                <p className="text-[11px] text-gray-400">{c.cedula || c.customerId || 'Sin cédula'}</p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Tarjeta del socio */}
                                    {socioSel && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center text-xl font-black text-brand-primary flex-shrink-0">
                                                {(socioSel.name || '?')[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-extrabold text-gray-900 text-base">{socioSel.name} {socioSel.surname1 || ''} {socioSel.surname2 || ''}</p>
                                                <p className="text-xs text-gray-500">{socioSel.cedula || socioSel.customerId} · {socioSel.email || 'Sin email'}</p>
                                            </div>
                                            {socioSel.porcentajePrestamo && (
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Tasa asignada</p>
                                                    <p className="text-lg font-extrabold text-brand-primary">{(Number(socioSel.porcentajePrestamo) * 100).toFixed(2)}%</p>
                                                    <p className="text-[10px] text-gray-400">mensual</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Alerta refinanciación */}
                                    {!isEditing && activeLoanWarning && (
                                        <div className="flex gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-4">
                                            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                            <div className="text-sm">
                                                <p className="font-bold text-amber-800 mb-1">⚠️ Préstamo vigente: {activeLoanWarning.idVm}</p>
                                                <p className="text-amber-700 text-xs">Este socio ya tiene un préstamo activo. Si continúas, se aplicará una refinanciación automática. Podrás revisar los detalles en el Paso 3.</p>
                                            </div>
                                        </div>
                                    )}

                                </div>

                                    <div className="flex justify-end pt-2 mt-auto">
                                        <Button type="button" onClick={() => { if (!disbursedForm.clientId) { toast.error('Debes seleccionar un socio'); return; } setFormStep(2); }}>
                                            Siguiente — Condiciones <ChevronDown className="ml-2 h-4 w-4 -rotate-90" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* ════════ PASO 2 — CONDICIONES ════════ */}
                            {formStep === 2 && (
                                <form onSubmit={(e) => { e.preventDefault(); setFormStep(3); }} className="px-6 pb-6 flex-1 flex flex-col">
                                <div className="space-y-5">
                                    <p className="text-sm text-gray-500 font-medium">Define las condiciones financieras y bancarias del desembolso.</p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <FormField label="Fecha de desembolso">
                                            <Input type="date" value={disbursedForm.fechaPrestamo}
                                                onChange={(e) => setDisbursedForm({ ...disbursedForm, fechaPrestamo: e.target.value })} required />
                                        </FormField>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Período</label>
                                            <div className="flex items-center gap-2 h-10 px-3 border border-gray-200 rounded-lg bg-gray-50 text-sm font-semibold text-gray-700">
                                                <Calendar className="h-4 w-4 text-gray-400" />
                                                {disbursedForm.mesDesembolso} {disbursedForm.anioDesembolso}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <FormField label="Valor del préstamo">
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-sm">$</span>
                                                <Input type="number" className="pl-7 font-bold text-green-700" value={disbursedForm.valorPrestado}
                                                    onChange={(e) => setDisbursedForm({ ...disbursedForm, valorPrestado: e.target.value })} required />
                                            </div>
                                        </FormField>
                                        <FormField label="Número de cuotas">
                                            <Input type="number" min="1" className="font-bold" value={disbursedForm.cuotas}
                                                onChange={(e) => setDisbursedForm({ ...disbursedForm, cuotas: e.target.value })} required />
                                        </FormField>
                                        <FormField label="Tasa mensual (%)">
                                            <div className="relative">
                                                <Input type="number" step="0.01" min="0" max="100" className="pr-8" value={disbursedForm.interesMensual}
                                                    onChange={(e) => setDisbursedForm({ ...disbursedForm, interesMensual: e.target.value })} placeholder="Ej: 1.5" />
                                                <span className="absolute right-3 top-2.5 text-gray-400 font-bold text-sm">%</span>
                                            </div>
                                        </FormField>
                                    </div>

                                    {/* Calculadora en vivo — capital fijo, cuota decreciente (igual que el
                                        backend): se muestra la primera y la última cuota en vez de un
                                        número "estimado" constante que no correspondería a ningún pago real. */}
                                    {primeraCuota > 0 && (
                                        <div className="flex items-center gap-4 bg-gradient-to-r from-brand-primary/5 to-green-50 border border-brand-primary/20 rounded-2xl px-5 py-4">
                                            <Calculator className="h-8 w-8 text-brand-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                                    {n > 1 ? 'Cuota: primera → última' : 'Cuota única'}
                                                </p>
                                                <p className="text-2xl font-extrabold text-brand-primary tabular-nums">
                                                    {n > 1 ? `$${fmt(primeraCuota)} → $${fmt(ultimaCuota)}` : `$${fmt(primeraCuota)}`}
                                                </p>
                                                <p className="text-[11px] text-gray-400">
                                                    {n > 1 && 'Capital fijo cada mes, el interés baja con el saldo · '}
                                                    Total a pagar: ${fmt(P + interesTotalEstimado)} · Interés total: ${fmt(interesTotalEstimado)}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Advertencia de cupo: misma regla 3× que ya bloquea el guardado en el
                                        backend — se muestra en vivo para que el admin lo sepa antes de llegar
                                        a la confirmación. */}
                                    {excedeCapacidad && (
                                        <div className="flex gap-3 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                                            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                            <div className="text-sm">
                                                <p className="font-bold text-red-800 mb-1">⚠️ Supera el cupo sin votación</p>
                                                <p className="text-red-700 text-xs">
                                                    ${fmt(P)} supera el cupo máximo de {socioSel?.name} {socioSel?.surname1 || ''} (3× ahorro:
                                                    {' '}${fmt(cupoMaximo)}, disponible: ${fmt(Math.max(0, capacidadDisponible))}).
                                                    Este monto <strong>requiere aprobación de la Junta Administrativa</strong> — el servidor rechazará
                                                    el guardado a menos que se registre primero como solicitud en Aprobación de Préstamos.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <FormField label="Días máximos de pago (gracia)">
                                        <Input type="number" value={disbursedForm.diasPagoMax}
                                            onChange={(e) => setDisbursedForm({ ...disbursedForm, diasPagoMax: e.target.value })} placeholder="Ej: 5" />
                                    </FormField>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <FormField label="Banco receptor">
                                            <select aria-label="Banco receptor"
                                                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                                value={disbursedForm.banco} onChange={(e) => setDisbursedForm({ ...disbursedForm, banco: e.target.value })}>
                                                <option value="">-- Seleccionar --</option>
                                                {COLOMBIAN_BANKS_WITH_OTHER.map(bank => <option key={bank} value={bank}>{bank}</option>)}
                                            </select>
                                        </FormField>
                                        <FormField label="N.° de transferencia">
                                            <Input value={disbursedForm.numeroTransaccion} onChange={(e) => setDisbursedForm({ ...disbursedForm, numeroTransaccion: e.target.value })} />
                                        </FormField>
                                        <FormField label="Cuenta de ahorros">
                                            <Input value={disbursedForm.cuentaAhorros} onChange={(e) => setDisbursedForm({ ...disbursedForm, cuentaAhorros: e.target.value })} />
                                        </FormField>
                                    </div>

                                    <FormField label="Observaciones">
                                        <Input value={disbursedForm.observaciones} onChange={(e) => setDisbursedForm({ ...disbursedForm, observaciones: e.target.value })} placeholder="Opcional..." />
                                    </FormField>

                                </div>

                                    <div className="flex justify-between pt-2 mt-auto">
                                        <Button type="button" variant="ghost" onClick={() => setFormStep(1)}>← Atrás</Button>
                                        <Button type="submit">Revisar y confirmar <ChevronDown className="ml-2 h-4 w-4 -rotate-90" /></Button>
                                    </div>
                                </form>
                            )}

                            {/* ════════ PASO 3 — CONFIRMACIÓN ════════ */}
                            {formStep === 3 && (
                                <div className="px-6 pb-6 flex-1 flex flex-col">
                                <div className="space-y-5">
                                    <p className="text-sm text-gray-500 font-medium">Revisa el resumen antes de registrar el desembolso.</p>

                                    {!isEditing && activeLoanWarning && (
                                        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
                                            <p className="font-bold text-amber-800 flex items-center gap-2 mb-2">
                                                <AlertTriangle className="h-4 w-4" /> Refinanciación — Préstamo {activeLoanWarning.idVm} será cancelado
                                            </p>
                                            <ul className="text-xs text-amber-700 space-y-1 ml-1">
                                                <li>• Capital pendiente: <strong>${Number(activeLoanWarning.saldoPendiente).toLocaleString('es-CO')}</strong></li>
                                                <li>• {activeLoanWarning.cuotasPendientes} cuota(s): Estado Pago <strong>Pendiente → PAGO</strong></li>
                                                {/* La línea se muestra SIEMPRE, también cuando vale cero. Estaba dentro
                                                    de un `> 0` y desaparecía: quien miraba la pantalla no podía distinguir
                                                    «son cero días y es correcto» de «el cálculo no se hizo». En el
                                                    retanqueo de SOL16 el interés salió en $0 y nada lo dijo. */}
                                                {Number(activeLoanWarning.interesCausado) > 0 ? (
                                                    <li>• Interés causado por {activeLoanWarning.diasTranscurridos ?? '—'} día(s) transcurrido(s) (<strong>SÍ se cobra</strong>): <strong>${Number(activeLoanWarning.interesCausado).toLocaleString('es-CO')}</strong></li>
                                                ) : (
                                                    <li>• Interés causado: <strong>$0</strong> — han transcurrido <strong>{activeLoanWarning.diasTranscurridos ?? 0} día(s)</strong> desde que arrancó el período de la próxima cuota, así que no hay interés que cobrar.</li>
                                                )}
                                                <li>• Interés condonado (no cobrado): <strong>${Number(activeLoanWarning.interesCondonable).toLocaleString('es-CO')}</strong></li>
                                                <li>• Total a cancelar de {activeLoanWarning.idVm}: <strong>${fmt(totalACancelar)}</strong></li>
                                                <li>• Préstamo {activeLoanWarning.idVm}: <strong>Vigente → CANCELADO</strong></li>
                                            </ul>

                                            {/* El neto es la instrucción operativa de esta pantalla: el dinero que
                                                de verdad sale de la cuenta del fondo. Va destacado porque la cifra
                                                más visible del aviso —el capital pendiente— es redonda e invita a
                                                restarla sola, dejando por fuera el interés causado que la
                                                contabilidad ya dio por cobrado. */}
                                            {P > 0 && (
                                                netoAEntregar >= 0 ? (
                                                    <div className="mt-3 pt-3 border-t border-amber-300 flex items-baseline justify-between gap-3 flex-wrap">
                                                        <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Neto a entregar al socio</span>
                                                        <span className="text-xl font-extrabold text-amber-900 tabular-nums">${fmt(netoAEntregar)}</span>
                                                    </div>
                                                ) : (
                                                    <div className="mt-3 pt-3 border-t border-amber-300">
                                                        <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-0.5">El socio debe consignar</p>
                                                        <p className="text-xl font-extrabold text-red-700 tabular-nums">${fmt(Math.abs(netoAEntregar))}</p>
                                                        <p className="text-[11px] text-red-600 mt-1">El préstamo nuevo (${fmt(P)}) no alcanza a cubrir lo que se cancela de {activeLoanWarning.idVm} (${fmt(totalACancelar)}). No sale dinero del fondo: entra.</p>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}

                                    {excedeCapacidad && (
                                        <div className="flex gap-3 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                                            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                            <div className="text-sm">
                                                <p className="font-bold text-red-800 mb-1">⚠️ Este monto requiere votación de la Junta</p>
                                                <p className="text-red-700 text-xs">
                                                    ${fmt(P)} supera el cupo disponible sin votación (${fmt(Math.max(0, capacidadDisponible))} de ${fmt(cupoMaximo)}).
                                                    El servidor rechazará el guardado — regístralo primero como solicitud en Aprobación de Préstamos.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                                        <div className="bg-brand-primary px-5 py-3 flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-white" />
                                            <p className="text-white font-bold text-sm">Resumen del Desembolso</p>
                                        </div>
                                        <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-3">
                                            {[
                                                { label: 'Socio', value: `${disbursedForm.nombre} ${disbursedForm.apellido}`, full: true },
                                                { label: 'Fecha', value: `${disbursedForm.mesDesembolso} ${disbursedForm.anioDesembolso}` },
                                                { label: 'Valor prestado', value: `$${fmt(P)}`, bold: true, color: 'text-green-700' },
                                                // En un retanqueo el "valor prestado" NO es el dinero que sale del
                                                // fondo: parte se queda cancelando el préstamo anterior. El neto es
                                                // el número con el que se hace la transferencia, así que va aquí con
                                                // el mismo peso, y no solo en la alerta de arriba.
                                                ...(!isEditing && activeLoanWarning && P > 0 ? [
                                                    { label: `Se cancela de ${activeLoanWarning.idVm}`, value: `− $${fmt(totalACancelar)}` },
                                                    netoAEntregar >= 0
                                                        ? { label: 'Neto a entregar al socio', value: `$${fmt(netoAEntregar)}`, bold: true, color: 'text-amber-700', full: true }
                                                        : { label: 'El socio debe consignar', value: `$${fmt(Math.abs(netoAEntregar))}`, bold: true, color: 'text-red-700', full: true },
                                                ] : []),
                                                { label: 'Cuotas', value: `${n} cuotas` },
                                                { label: 'Tasa mensual', value: `${iPct.toFixed(2)}%` },
                                                { label: n > 1 ? 'Primera cuota' : 'Cuota', value: primeraCuota > 0 ? `$${fmt(primeraCuota)}` : '—', bold: true, color: 'text-brand-primary' },
                                                ...(n > 1 ? [{ label: 'Última cuota', value: ultimaCuota > 0 ? `$${fmt(ultimaCuota)}` : '—' }] : []),
                                                { label: 'Banco receptor', value: disbursedForm.banco || '—' },
                                                { label: 'N.° transferencia', value: disbursedForm.numeroTransaccion || '—' },
                                                { label: 'Cuenta ahorros', value: disbursedForm.cuentaAhorros || '—' },
                                                { label: 'Observaciones', value: disbursedForm.observaciones || '—', full: true },
                                            ].map(({ label, value, bold, color, full }) => (
                                                <div key={label} className={full ? 'col-span-2' : ''}>
                                                    <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{label}</p>
                                                    <p className={`text-sm font-semibold break-words ${color || 'text-gray-800'} ${bold ? 'text-base font-extrabold' : ''}`}>{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                </div>

                                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2 mt-auto">
                                        <Button type="button" variant="ghost" onClick={() => setFormStep(2)}>← Atrás</Button>
                                        <div className="flex flex-col sm:items-end gap-2">
                                            {excedeCapacidad && (
                                                <Button
                                                    type="button"
                                                    onClick={() => handleSubmitDisbursed(null, true)}
                                                    size="lg"
                                                    className="bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 shadow-sm border-0"
                                                >
                                                    <ShieldCheck className="mr-2 h-4 w-4" />
                                                    Aprobar como Gerente y Registrar
                                                </Button>
                                            )}
                                            <Button
                                                type="button"
                                                onClick={() => handleSubmitDisbursed()}
                                                size="lg"
                                                variant={excedeCapacidad ? 'secondary' : 'primary'}
                                                disabled={excedeCapacidad}
                                                title={excedeCapacidad ? 'Supera el cupo sin votación de la Junta — regístralo como solicitud, o usa "Aprobar como Gerente"' : undefined}
                                            >
                                                <Save className="mr-2 h-4 w-4" />
                                                {isEditing ? 'Guardar cambios' : excedeCapacidad ? 'Requiere votación de la Junta' : 'Confirmar y Registrar'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                );
            })()}

            {isProcessing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.82)', backdropFilter: 'blur(6px)' }}>
                    <div className="bg-white rounded-2xl shadow-2xl px-10 py-10 flex flex-col items-center gap-5 min-w-[340px] max-w-md animate-fadeIn">
                        {/* Animated spinner ring */}
                        <div className="relative flex items-center justify-center w-20 h-20">
                            <div className="absolute w-20 h-20 rounded-full border-4 border-blue-100"></div>
                            <div className="absolute w-20 h-20 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
                            <Calculator className="w-8 h-8 text-blue-600" />
                        </div>

                        {/* Title */}
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-brand-primary">{processingMsg.title}</h3>
                            <p className="text-sm text-gray-400 mt-1">Por favor espere...</p>
                        </div>

                        {/* Step list */}
                        <ul className="w-full space-y-2">
                            {processingMsg.lines.map((line, idx) => (
                                <li key={idx} className="flex items-center gap-3 text-sm text-gray-600">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center">
                                        <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" style={{ animationDelay: idx * 0.2 + 's' }} />
                                    </span>
                                    {line}
                                </li>
                            ))}
                        </ul>

                        {/* Footer note */}
                        <p className="text-xs text-gray-400 text-center border-t border-gray-100 pt-3 w-full">
                            Calculando cuotas con las condiciones aprobadas
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoansListPage;
