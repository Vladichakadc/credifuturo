import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, CreditCard, AlertTriangle, Inbox, Download, DollarSign, Hash, Layers, TrendingUp, TrendingDown, ShieldCheck, Wallet, ChevronLeft, ChevronRight, Users, CheckCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import ListHeader from '../../components/admin/ListHeader';
import YearMultiSelect from '../../components/admin/YearMultiSelect';
import StatusMultiSelect from '../../components/admin/StatusMultiSelect';
import PillSingleSelect from '../../components/admin/PillSingleSelect';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { useSortTable, SortIcon } from '../../utils/useSortTable';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Legend } from 'recharts';

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
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState([]);
    const [selectedYears, setSelectedYears] = useState([new Date().getFullYear(), new Date().getFullYear() + 1]);
    const [totalFromServer, setTotalFromServer] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [capacityData, setCapacityData] = useState(null);

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
    useEffect(() => {
        const fetchCapacity = async () => {
            try {
                const res = await api.get('/admin/loans-capacity-analysis');
                if (res.data && res.data.ok) setCapacityData(res.data);
            } catch (err) {
                console.error('Error fetching capacity analysis:', err);
            }
        };
        fetchCapacity();
    }, []);

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
                        title="Lista de Préstamos"
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
        </div>
    );
};

export default LoansListPage;
