import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';
import { calcVerdict } from '../../utils/loanCapacity';
import { useUi } from '../../context/UiContext';
import ChartExpandModal, { analyzeMonthlyTrend, analyzeSavingsComposition } from '../../components/ChartExpandModal';
import { AccountSummaryChart, MonthlySavingsTrendChart } from '../admin/SavingsSummaryPage';
import * as XLSX from 'xlsx';
import {
    PiggyBank,
    FileSpreadsheet,
    Scale,
    CalendarClock,
    ArrowDownCircle,
    ArrowUpCircle,
    AlertTriangle,
    HandCoins,
    ChevronRight,
    Loader2,
    Info,
    Download,
    BarChart3,
    TrendingUp,
    Maximize2,
    CreditCard,
    Activity,
} from 'lucide-react';

/**
 * DetalleCuentaPage — vista única de Ahorros del socio.
 * Fusiona tres páginas: "Detalle de la Cuenta" (gráficos analíticos + préstamos),
 * "Detalle de Cuenta (beta)" (extracto con saldo corrido, recargos, relación con
 * el fondo) y "Lista de Ahorros" (KPIs de comportamiento, Excel, filtros).
 * Un solo lugar, sin datos repetidos.
 */

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtSigned = (n) => {
    const v = Math.round(Number(n) || 0);
    return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('es-CO')}`;
};

const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_NOMBRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// mesAbonado puede venir numérico (7) o como nombre ("Julio") según el origen del dato
const parseMes = (m) => {
    if (m == null) return null;
    const n = Number(m);
    if (!isNaN(n) && n >= 1 && n <= 12) return n;
    const idx = MESES_NOMBRE.indexOf(String(m).trim().toLowerCase());
    return idx >= 0 ? idx + 1 : null;
};

const parseFecha = (f) => {
    if (!f) return null;
    const s = String(f).split('T')[0];
    const d = new Date(s + 'T00:00:00');
    return isNaN(d) ? null : d;
};

const fmtFecha = (d) => d ? `${d.getDate()} ${MESES_ABR[d.getMonth()]} ${d.getFullYear()}` : '—';

// ── Estilo por tipo de movimiento (verde=ahorro, dorado=aporte, rojo=salidas) ──
const TIPO_META = {
    ahorro:     { label: 'Ahorro',     chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    aporte:     { label: 'Aporte',     chip: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400' },
    devolucion: { label: 'Devolución', chip: 'bg-red-50 text-red-600',         dot: 'bg-red-500' },
};

const PosicionCard = ({ icon: Icon, label, value, sub, to, accent = 'text-brand-primary' }) => {
    const body = (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-full flex flex-col justify-between transition-all hover:shadow-md">
            <div className="flex items-center gap-2 mb-2">
                <div className="bg-brand-primary/10 rounded-lg p-1.5">
                    <Icon className="h-4 w-4 text-brand-primary" />
                </div>
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
                {to && <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />}
            </div>
            <p className={`text-xl font-black leading-none ${accent}`}>{value}</p>
            {sub && <p className="text-[11px] text-gray-500 mt-1.5 leading-tight">{sub}</p>}
        </div>
    );
    return to ? <Link to={to} className="block h-full">{body}</Link> : body;
};

const DetalleCuentaPage = () => {
    const { toast } = useUi();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [savings, setSavings] = useState([]);
    const [aportes, setAportes] = useState([]);
    const [payments, setPayments] = useState([]);
    const [loans, setLoans] = useState([]);
    const [capacity, setCapacity] = useState(null);
    const [utilidades, setUtilidades] = useState(null);
    const [yearFilter, setYearFilter] = useState('Todos');
    const [tipoFilter, setTipoFilter] = useState('Todos');
    const [verTodo, setVerTodo] = useState(false);
    const [expandCompo, setExpandCompo] = useState(false);
    const [expandTrend, setExpandTrend] = useState(false);

    useEffect(() => {
        const fetchAll = async () => {
            const results = await Promise.allSettled([
                api.get('/admin/my/profile'),
                api.get('/admin/my/savings'),
                api.get('/admin/my/initial-contributions'),
                api.get('/admin/my/payments'),
                api.get('/admin/my/loans'),
                api.get('/admin/my/loan-capacity'),
                api.get('/admin/my/utilidades-estimadas'),
            ]);
            const [pfRes, sRes, aRes, pRes, lRes, cRes, uRes] = results;
            if (pfRes.status === 'fulfilled') setProfile(pfRes.value.data?.data ?? pfRes.value.data ?? null);
            if (sRes.status === 'fulfilled') setSavings(sRes.value.data?.data || []);
            if (aRes.status === 'fulfilled') setAportes(aRes.value.data?.data || []);
            if (pRes.status === 'fulfilled') setPayments(pRes.value.data?.data || []);
            if (lRes.status === 'fulfilled') setLoans(lRes.value.data?.data || []);
            if (cRes.status === 'fulfilled') setCapacity(cRes.value.data);
            if (uRes.status === 'fulfilled') setUtilidades(uRes.value.data?.data || null);
            if (results.every(r => r.status === 'rejected')) {
                toast.error('No se pudo cargar tu información. Intenta de nuevo.');
            }
            setLoading(false);
        };
        fetchAll();
    }, [toast]);

    const hoy = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }, []);
    const currentYear = hoy.getFullYear();

    const socio = profile || (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
    const nombreCompleto = `${socio?.name || 'Socio'} ${socio?.surname1 || ''} ${socio?.surname2 || ''}`.replace(/\s+/g, ' ').trim();

    // ── Extracto unificado: ahorros + aportes + devoluciones con saldo corrido ──
    // El saldo corrido se calcula SIEMPRE sobre el historial completo (neto acreditado);
    // el filtro por año solo decide qué filas se muestran, nunca altera el saldo.
    const movimientos = useMemo(() => {
        const rows = [];
        savings.forEach(s => {
            const bruto = Number(s.amount || 0);
            const esDevolucion = String(s.status || '').toLowerCase().includes('devolucion') || bruto < 0;
            const neto = esDevolucion ? bruto : Number(s.valorAhorrado ?? s.amount ?? 0);
            const mesNum = parseMes(s.mesAbonado);
            rows.push({
                id: `s-${s.id}`,
                fecha: parseFecha(s.date),
                tipo: esDevolucion ? 'devolucion' : 'ahorro',
                concepto: esDevolucion
                    ? 'Devolución de intereses'
                    : `Ahorro mensual${mesNum ? ` · abona ${MESES_ABR[mesNum - 1]} ${s.anioAbonado || ''}`.trimEnd() : ''}`,
                bruto,
                recargo: esDevolucion ? 0 : Math.max(0, bruto - neto),
                dias: Number(s.diasPenalizacion || 0),
                neto,
                // Campos crudos para la exportación a Excel (no se muestran en pantalla)
                externalId: s.externalId || '', estado: s.status || '',
                banco: s.banco || '', observaciones: s.observaciones || '',
                periodo: mesNum ? `${MESES_ABR[mesNum - 1]} ${s.anioAbonado || ''}`.trim() : '',
            });
        });
        aportes.forEach(a => {
            const v = Number(a.amount || 0);
            rows.push({
                id: `a-${a.id}`, fecha: parseFecha(a.date), tipo: 'aporte',
                concepto: 'Aporte inicial', bruto: v, recargo: 0, dias: 0, neto: v,
                externalId: a.externalId || '', estado: a.status || '',
                banco: a.banco || '', observaciones: a.observaciones || '', periodo: '',
            });
        });
        rows.sort((x, y) => (x.fecha?.getTime() || 0) - (y.fecha?.getTime() || 0));
        let saldo = 0;
        rows.forEach(r => { saldo += r.neto; r.saldo = saldo; });
        return rows.reverse(); // más reciente primero
    }, [savings, aportes]);

    // ── Tendencia mensual por mes ABONADO (comportamiento real de ahorro) ──
    // Incluye devoluciones (negativos visibles): son eventos financieros reales.
    const trendInfo = useMemo(() => {
        const src = [];
        savings.forEach(s => {
            if (s.type && s.type !== 'Mensual') return;
            const bruto = Number(s.amount || 0);
            const esDevolucion = String(s.status || '').toLowerCase().includes('devolucion') || bruto < 0;
            const neto = esDevolucion ? bruto : Number(s.valorAhorrado ?? s.amount ?? 0);
            const fecha = parseFecha(s.date);
            const mi = parseMes(s.mesAbonado) || Number(s.monthInt) || (fecha ? fecha.getMonth() + 1 : null);
            const yr = String(s.anioAbonado || s.year || (fecha ? fecha.getFullYear() : '') || '');
            if (!mi || mi < 1 || mi > 12 || !yr) return;
            src.push({ mi, yr, neto });
        });
        const years = [...new Set(src.map(r => r.yr))].sort((a, b) => Number(b) - Number(a));
        const rows = MESES_ABR.map((name) => {
            const base = { name, monto: 0 };
            years.forEach(y => { base[y] = 0; });
            return base;
        });
        src.forEach(r => {
            if (yearFilter !== 'Todos' && r.yr !== String(yearFilter)) return;
            rows[r.mi - 1].monto += r.neto;
            if (rows[r.mi - 1][r.yr] !== undefined) rows[r.mi - 1][r.yr] += r.neto;
        });
        return { rows, years };
    }, [savings, yearFilter]);

    // Años disponibles para el filtro: unión de años de transacción y años abonados
    const availableYears = useMemo(() => {
        const ys = new Set(trendInfo.years);
        movimientos.forEach(r => { if (r.fecha) ys.add(String(r.fecha.getFullYear())); });
        return [...ys].sort((a, b) => Number(b) - Number(a));
    }, [trendInfo.years, movimientos]);

    const visibles = useMemo(() => (
        movimientos
            .filter(r => yearFilter === 'Todos' || r.fecha?.getFullYear() === Number(yearFilter))
            .filter(r => tipoFilter === 'Todos' || r.tipo === tipoFilter)
    ), [movimientos, yearFilter, tipoFilter]);

    const FILAS_INICIALES = 30;
    const visiblesLimitados = verTodo ? visibles : visibles.slice(0, FILAS_INICIALES);

    // ── Mi posición (siempre historial completo) ─────────────────────
    const patrimonioNeto = movimientos.length > 0 ? movimientos[0].saldo : 0;
    const heroTotals = useMemo(() => ({
        ahorros: movimientos.filter(r => r.tipo === 'ahorro').reduce((s, r) => s + r.neto, 0),
        aportes: movimientos.filter(r => r.tipo === 'aporte').reduce((s, r) => s + r.neto, 0),
        devoluciones: movimientos.filter(r => r.tipo === 'devolucion').reduce((s, r) => s + Math.abs(r.neto), 0),
    }), [movimientos]);

    // Composición para el gráfico: sigue el filtro de año (capital neto incluye devoluciones)
    const chartStats = useMemo(() => {
        const inYear = (r) => yearFilter === 'Todos' || r.fecha?.getFullYear() === Number(yearFilter);
        const totalSavings = movimientos.filter(r => r.tipo !== 'aporte' && inYear(r)).reduce((s, r) => s + r.neto, 0);
        const totalInitialContributions = movimientos.filter(r => r.tipo === 'aporte' && inYear(r)).reduce((s, r) => s + r.neto, 0);
        return { totalSavings, totalInitialContributions, totalAhorradoGeneral: totalSavings + totalInitialContributions };
    }, [movimientos, yearFilter]);

    const cupo = useMemo(() => {
        if (!capacity) return null;
        return calcVerdict(capacity, { audience: 'user' });
    }, [capacity]);

    const proximaCuota = useMemo(() => {
        const pendientes = payments
            .filter(p => (p.estado || '').toLowerCase() === 'pendiente')
            .map(p => ({ ...p, fecha: parseFecha(p.fechaPagoMax || p.fechaPago) }))
            .filter(p => p.fecha)
            .sort((a, b) => a.fecha - b.fecha);
        if (pendientes.length === 0) return null;
        const c = pendientes[0];
        return {
            valor: Number(c.valorCuotaVariable || c.valorCuotaPago || 0),
            fecha: c.fecha,
            dias: Math.round((c.fecha - hoy) / 86400000),
        };
    }, [payments, hoy]);

    // ── Recargos, constancia y relación con el fondo ─────────────────
    const recargos = useMemo(() => {
        const conRecargo = movimientos.filter(r => r.recargo > 0);
        return {
            total: conRecargo.reduce((s, r) => s + r.recargo, 0),
            dias: conRecargo.reduce((s, r) => s + r.dias, 0),
            registros: conRecargo.length,
        };
    }, [movimientos]);

    // Diagnóstico de constancia sobre el año seleccionado (o el actual si "Todos")
    const constancia = useMemo(() => {
        const yr = yearFilter === 'Todos' ? String(currentYear) : String(yearFilter);
        const montos = trendInfo.rows.map(r => Number(r[yr] || 0));
        const transcurridos = Number(yr) === currentYear ? hoy.getMonth() + 1 : 12;
        const conAhorro = montos.slice(0, transcurridos).filter(v => v > 0).length;
        // Promedio de los meses CON ahorro: coincide con la línea "Prom" del gráfico
        const positivos = montos.filter(v => v > 0);
        const promedio = positivos.length ? positivos.reduce((a, b) => a + b, 0) / positivos.length : 0;
        // Racha: meses seguidos con ahorro contando hacia atrás; el mes en curso
        // no rompe la racha si aún no registra (puede estar por pagar).
        let inicio = transcurridos - 1;
        if (montos[inicio] <= 0 && Number(yr) === currentYear) inicio -= 1;
        let racha = 0;
        for (let i = inicio; i >= 0 && montos[i] > 0; i--) racha++;
        return { anio: yr, conAhorro, transcurridos, promedio, racha };
    }, [trendInfo.rows, yearFilter, currentYear, hoy]);

    // Cumplimiento histórico: % de aportes de ahorro pagados sin recargo (toda la historia)
    const cumplimiento = useMemo(() => {
        const ahorros = movimientos.filter(r => r.tipo === 'ahorro');
        const aTiempo = ahorros.filter(r => r.recargo === 0).length;
        const ultimo = ahorros.reduce((max, r) => (!max || (r.fecha && r.fecha > max)) ? r.fecha : max, null);
        return {
            pct: ahorros.length > 0 ? Math.round((aTiempo / ahorros.length) * 100) : 100,
            aTiempo,
            total: ahorros.length,
            ultimoAporte: ultimo,
            diasDesdeUltimo: ultimo ? Math.floor((hoy - ultimo) / 86400000) : null,
        };
    }, [movimientos, hoy]);

    // Exportación a Excel: el libro completo de movimientos con columnas crudas
    const exportarExcel = () => {
        if (movimientos.length === 0) { toast.error('No hay movimientos para exportar.'); return; }
        const cronologico = [...movimientos].reverse(); // más antiguo primero, como un libro contable
        const data = cronologico.map(r => ({
            'Fecha': r.fecha ? r.fecha.toISOString().split('T')[0] : '',
            'Tipo': TIPO_META[r.tipo]?.label || r.tipo,
            'Concepto': r.concepto,
            'Periodo abonado': r.periodo,
            'Id_VM': r.externalId,
            'Estado': r.estado,
            'Valor Bruto': r.tipo === 'devolucion' ? '' : r.bruto,
            'Recargo': r.recargo > 0 ? -r.recargo : '',
            'Días de atraso': r.dias > 0 ? r.dias : '',
            'Valor Neto': r.neto,
            'Saldo Acumulado': r.saldo,
            'Banco': r.banco,
            'Observaciones': r.observaciones,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mis Ahorros');
        XLSX.writeFile(wb, `Mis_Ahorros_${hoy.toISOString().split('T')[0]}.xlsx`);
        toast.success('Excel exportado exitosamente');
    };

    const relacion = useMemo(() => {
        const interesesPagados = payments
            .filter(p => ['pago', 'abono'].includes((p.estado || '').toLowerCase()))
            .reduce((s, p) => s + Number(p.valorInteresesAmortizados || 0), 0);
        const devoluciones = movimientos
            .filter(r => r.tipo === 'devolucion')
            .reduce((s, r) => s + Math.abs(r.neto), 0);
        return { interesesPagados, devoluciones, neta: devoluciones - interesesPagados };
    }, [payments, movimientos]);

    // ── Resumen compacto de préstamos (el detalle vive en sus propias páginas) ──
    const prestamos = useMemo(() => {
        const porPrestamo = loans.map(l => {
            const cuotas = payments.filter(p => String(p.idVm) === String(l.idVm));
            const pagadas = cuotas.filter(p => (p.estado || '').toLowerCase() === 'pago').length;
            const pendientes = cuotas.filter(p => (p.estado || '').toLowerCase() === 'pendiente');
            const saldo = pendientes.reduce((s, p) => s + Number(p.valorCuotaVariable || 0), 0);
            const mora = pendientes.some(p => {
                const f = parseFecha(p.fechaPagoMax);
                return f && f < hoy;
            });
            const activo = ['activo', 'vigente'].includes((l.estado || '').toLowerCase());
            return { ...l, totalCuotas: cuotas.length || Number(l.cuotas) || 0, pagadas, saldo, mora, activo };
        }).sort((a, b) => Number(b.activo) - Number(a.activo));
        return {
            lista: porPrestamo,
            saldoPendiente: porPrestamo.reduce((s, l) => s + l.saldo, 0),
            totalPrestado: porPrestamo.reduce((s, l) => s + Number(l.valorPrestado || 0), 0),
            enMora: porPrestamo.some(l => l.mora),
        };
    }, [loans, payments, hoy]);

    const trendHeight = trendInfo.years.length > 1 && yearFilter === 'Todos' ? 420 : 350;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-brand-primary/40" />
                <p className="text-sm text-gray-400 font-semibold animate-pulse uppercase tracking-widest">Preparando tu estado de cuenta...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            {/* CSS de impresión: el layout usa contenedores con overflow que recortan
                el contenido al imprimir (gotcha conocido) — se neutralizan acá. */}
            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 12mm 14mm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
                    * { overflow: visible !important; max-height: none !important; }
                    .print\\:hidden { display: none !important; }
                    .shadow-sm, .shadow-md, .shadow-card { box-shadow: none !important; }
                    tr, .rounded-2xl { page-break-inside: avoid !important; }
                    thead { display: table-header-group !important; }
                    .recharts-responsive-container { width: 100% !important; }
                }
            `}</style>

            {/* Encabezado solo para el PDF impreso */}
            <div className="hidden print:block mb-4 pb-3 border-b-4 border-brand-primary">
                <h1 className="text-2xl font-black uppercase tracking-widest text-brand-primary">Estado de Cuenta</h1>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Credifuturo · {nombreCompleto}{socio?.cedula ? ` · C.C. ${socio.cedula}` : ''} · generado el {fmtFecha(hoy)} · valores netos de recargos
                </p>
            </div>

            {/* Encabezado + filtro de año */}
            <div className="flex flex-wrap items-center gap-3 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                        <PiggyBank className="h-6 w-6 text-emerald-600" />
                        Mis Ahorros
                    </h1>
                    <p className="text-gray-600 text-sm mt-1">
                        Detalle completo de tu cuenta · datos al {fmtFecha(hoy)}
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {['Todos', ...availableYears].map(y => (
                            <button
                                key={y}
                                onClick={() => { setYearFilter(y); setVerTodo(false); }}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors min-h-[32px] ${
                                    String(yearFilter) === String(y)
                                        ? 'bg-brand-primary text-white'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={exportarExcel}
                        className="bg-white border-2 border-brand-primary/20 hover:border-brand-primary/50 text-brand-primary px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 min-h-[44px]"
                    >
                        <FileSpreadsheet className="h-4 w-4" /> Excel
                    </button>
                    <button
                        onClick={() => { setVerTodo(true); setTimeout(() => window.print(), 150); }}
                        className="bg-brand-primary hover:bg-brand-dark text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-primary/20 transition-all active:scale-95 flex items-center gap-2 min-h-[44px]"
                    >
                        <Download className="h-4 w-4" /> Informe PDF
                    </button>
                </div>
            </div>

            {/* Hero del socio: identidad + patrimonio (siempre histórico completo) */}
            <div className="rounded-2xl overflow-hidden shadow-card"
                 style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 70%, #14532d 100%)' }}>
                <div className="p-5 lg:p-6 text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white/15 ring-2 ring-white/20 flex items-center justify-center font-black text-lg flex-shrink-0">
                            {(socio?.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-lg font-extrabold leading-tight truncate">{nombreCompleto}</p>
                            <p className="text-xs text-white/60 font-mono mt-0.5">
                                {socio?.cedula ? `C.C. ${socio.cedula}` : ''}{socio?.customerId ? ` · ${socio.customerId}` : ''}
                            </p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Patrimonio neto</p>
                            <p className="text-xl lg:text-2xl font-black text-brand-gold tabular-nums">{fmt(patrimonioNeto)}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/10">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Ahorros mensuales</p>
                            <p className="text-sm lg:text-lg font-extrabold tabular-nums">{fmt(heroTotals.ahorros)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Aportes iniciales</p>
                            <p className="text-sm lg:text-lg font-extrabold tabular-nums">{fmt(heroTotals.aportes)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Devoluciones recibidas</p>
                            <p className="text-sm lg:text-lg font-extrabold tabular-nums text-brand-gold">{fmt(heroTotals.devoluciones)}</p>
                        </div>
                    </div>
                    <p className="text-[10px] text-white/40 mt-2">
                        Histórico completo, neto de recargos · patrimonio = ahorros + aportes − devoluciones
                        {cumplimiento.ultimoAporte && ` · último aporte: ${fmtFecha(cumplimiento.ultimoAporte)} (hace ${cumplimiento.diasDesdeUltimo} día${cumplimiento.diasDesdeUltimo === 1 ? '' : 's'})`}
                    </p>
                </div>
            </div>

            {/* Tarjetas de decisión */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PosicionCard
                    icon={Scale}
                    label="Cupo disponible"
                    value={cupo ? fmt(Math.max(0, cupo.capacidadDisponible)) : '—'}
                    sub={cupo ? 'Crédito sin votación (regla 3×) · toca para simular' : 'Análisis no disponible'}
                    to="/dashboard/loan-capacity-beta"
                />
                <PosicionCard
                    icon={CalendarClock}
                    label="Próxima cuota"
                    value={proximaCuota ? fmt(proximaCuota.valor) : 'Sin cuotas'}
                    sub={proximaCuota
                        ? (proximaCuota.dias < 0
                            ? `⚠ Venció hace ${Math.abs(proximaCuota.dias)} día(s) — ${fmtFecha(proximaCuota.fecha)}`
                            : `Vence en ${proximaCuota.dias} día(s) · ${fmtFecha(proximaCuota.fecha)}`)
                        : 'No tienes préstamos con cuotas pendientes'}
                    accent={proximaCuota && proximaCuota.dias < 0 ? 'text-red-600' : 'text-brand-primary'}
                />
                <PosicionCard
                    icon={AlertTriangle}
                    label="Recargos por mora"
                    value={fmt(recargos.total)}
                    sub={recargos.total > 0
                        ? `${recargos.registros} aporte(s) tarde · ${recargos.dias} día(s) acumulados. Pagar a tiempo evita este costo.`
                        : 'Nunca has pagado recargos. Disciplina perfecta — sigue así.'}
                    accent={recargos.total > 0 ? 'text-red-600' : 'text-emerald-600'}
                />
            </div>

            {/* Gráficos analíticos */}
            {chartStats.totalAhorradoGeneral > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col" style={{ height: 320 }}>
                        <h2 className="text-base font-bold text-brand-primary mb-3 flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" /> Composición del Patrimonio
                            <span className="text-[10px] font-bold text-gray-400 uppercase">{yearFilter === 'Todos' ? 'Histórico' : yearFilter}</span>
                            <button onClick={() => setExpandCompo(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-primary to-blue-600 text-white text-xs font-bold shadow-md shadow-brand-primary/30 hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 print:hidden" title="Ampliar y analizar">
                                <Maximize2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Ampliar y analizar</span>
                            </button>
                        </h2>
                        <div className="flex-1 min-h-[200px]"><AccountSummaryChart stats={chartStats} /></div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col" style={{ height: trendHeight }}>
                        <h2 className="text-base font-bold text-brand-primary mb-1 flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" /> Mi Ahorro Mes a Mes
                            <button onClick={() => setExpandTrend(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-primary to-blue-600 text-white text-xs font-bold shadow-md shadow-brand-primary/30 hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 print:hidden" title="Ampliar y analizar">
                                <Maximize2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Ampliar y analizar</span>
                            </button>
                        </h2>
                        {/* Diagnóstico de constancia del año en foco + disciplina histórica */}
                        <div className="flex items-center gap-2 flex-wrap mb-2 print:hidden">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                <Activity className="h-3 w-3" /> {constancia.anio}: ahorró {constancia.conAhorro} de {constancia.transcurridos} meses
                            </span>
                            {constancia.racha > 1 && (
                                <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold">
                                    Racha: {constancia.racha} meses seguidos
                                </span>
                            )}
                            {constancia.promedio > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                                    Promedio mensual: {fmt(constancia.promedio)}
                                </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                cumplimiento.pct >= 90 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                                Cumplimiento histórico: {cumplimiento.pct}% ({cumplimiento.aTiempo} de {cumplimiento.total} a tiempo)
                            </span>
                        </div>
                        <div className="flex-1 min-h-[220px]">
                            <MonthlySavingsTrendChart data={trendInfo.rows} availableYears={trendInfo.years} selectedYear={yearFilter} />
                        </div>
                    </div>
                </div>
            )}
            <ChartExpandModal
                isOpen={expandCompo}
                onClose={() => setExpandCompo(false)}
                title="Composición del Patrimonio — Capital Ahorrado vs Aportes"
                analysisResult={analyzeSavingsComposition(chartStats)}
            >
                <AccountSummaryChart stats={chartStats} />
            </ChartExpandModal>
            <ChartExpandModal
                isOpen={expandTrend}
                onClose={() => setExpandTrend(false)}
                title="Ahorro Mensual — Tendencia por Mes Abonado"
                analysisResult={analyzeMonthlyTrend(
                    trendInfo.rows,
                    yearFilter,
                    trendInfo.years,
                    savings,
                    { name: nombreCompleto, customerId: socio?.customerId }
                )}
            >
                <MonthlySavingsTrendChart data={trendInfo.rows} availableYears={trendInfo.years} selectedYear={yearFilter} />
            </ChartExpandModal>

            {/* Extracto de movimientos con saldo corrido */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                    <div>
                        <h2 className="text-base font-bold text-gray-800">Extracto de movimientos</h2>
                        <p className="text-[11px] text-gray-400">
                            Ahorros, aportes y devoluciones en una sola línea de tiempo, con saldo corrido
                            {yearFilter !== 'Todos' ? ` · mostrando ${yearFilter}` : ''} · {visibles.length} registro{visibles.length === 1 ? '' : 's'}
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5 flex-wrap print:hidden">
                        {[['Todos', 'Todos'], ['ahorro', 'Ahorros'], ['aporte', 'Aportes'], ['devolucion', 'Devoluciones']].map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => { setTipoFilter(val); setVerTodo(false); }}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors min-h-[32px] ${
                                    tipoFilter === val
                                        ? 'bg-brand-primary text-white'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {visibles.length === 0 ? (
                    <div className="p-10 text-center text-sm text-gray-400">Sin movimientos para este período.</div>
                ) : (
                    <>
                        {/* Desktop: tabla */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                        <th className="px-5 py-3">Fecha</th>
                                        <th className="px-3 py-3">Movimiento</th>
                                        <th className="px-3 py-3 text-right">Pagado (bruto)</th>
                                        <th className="px-3 py-3 text-right">Recargo</th>
                                        <th className="px-3 py-3 text-right">Acreditado (neto)</th>
                                        <th className="px-5 py-3 text-right">Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiblesLimitados.map((r, i) => {
                                        const meta = TIPO_META[r.tipo];
                                        return (
                                            <tr key={r.id} className={`border-t border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                                                <td className="px-5 py-2.5 whitespace-nowrap text-gray-500 text-xs">{fmtFecha(r.fecha)}</td>
                                                <td className="px-3 py-2.5">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.chip}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                                                        {meta.label}
                                                    </span>
                                                    <span className="ml-2 text-xs text-gray-700">{r.concepto}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{r.tipo === 'devolucion' ? '—' : fmt(r.bruto)}</td>
                                                <td className={`px-3 py-2.5 text-right tabular-nums ${r.recargo > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
                                                    {r.recargo > 0 ? `−${fmt(r.recargo)}` : '—'}
                                                    {r.recargo > 0 && r.dias > 0 && <span className="block text-[10px] font-normal text-red-400">{r.dias} día(s) tarde</span>}
                                                </td>
                                                <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${r.neto < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtSigned(r.neto)}</td>
                                                <td className="px-5 py-2.5 text-right font-black text-brand-primary tabular-nums">{fmt(r.saldo)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Móvil: tarjetas */}
                        <div className="md:hidden divide-y divide-gray-50">
                            {visiblesLimitados.map(r => {
                                const meta = TIPO_META[r.tipo];
                                return (
                                    <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                                        <span className={`mt-0.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${meta.chip}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                                            {meta.label}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-gray-800 leading-tight">{r.concepto}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">{fmtFecha(r.fecha)}</p>
                                            {r.recargo > 0 && (
                                                <p className="text-[10px] text-red-500 mt-0.5">Recargo −{fmt(r.recargo)}{r.dias > 0 ? ` · ${r.dias} día(s) tarde` : ''}</p>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className={`text-sm font-black tabular-nums ${r.neto < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtSigned(r.neto)}</p>
                                            <p className="text-[10px] text-gray-400 tabular-nums">Saldo {fmt(r.saldo)}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Paginación progresiva: primeros 30, botón para el resto */}
                        {!verTodo && visibles.length > FILAS_INICIALES && (
                            <div className="px-5 py-3 border-t border-gray-100 text-center print:hidden">
                                <button
                                    onClick={() => setVerTodo(true)}
                                    className="text-xs font-bold text-brand-primary hover:text-brand-dark underline min-h-[36px] px-4"
                                >
                                    Ver los {visibles.length - FILAS_INICIALES} movimiento(s) restantes
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Relación con el fondo + Mis préstamos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <HandCoins className="h-4 w-4 text-amber-500" />
                        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Mi relación con el fondo</h3>
                    </div>
                    <div className="flex items-end gap-6">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                <ArrowUpCircle className="h-3 w-3 text-gray-400" /> Intereses pagados
                            </p>
                            <p className="text-lg font-black text-gray-800 tabular-nums">{fmt(relacion.interesesPagados)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                <ArrowDownCircle className="h-3 w-3 text-emerald-500" /> Devoluciones recibidas
                            </p>
                            <p className="text-lg font-black text-emerald-600 tabular-nums">{fmt(relacion.devoluciones)}</p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 leading-snug">
                        {relacion.interesesPagados === 0 && relacion.devoluciones === 0
                            ? 'Aún no registras intereses pagados ni devoluciones.'
                            : relacion.neta >= 0
                                ? `El fondo te ha devuelto ${fmt(relacion.neta)} más de lo que has pagado en intereses — tu ahorro también trabaja para ti.`
                                : `Has aportado ${fmt(Math.abs(relacion.neta))} netos en intereses al fondo; esa ganancia se redistribuye entre todos los socios, incluido tú.`}
                        {relacion.devoluciones > 0 && heroTotals.ahorros > 0 && (
                            ` Las devoluciones equivalen a un ${((relacion.devoluciones / heroTotals.ahorros) * 100).toFixed(1).replace('.', ',')}% sobre tu ahorro mensual neto.`
                        )}
                    </p>
                    {utilidades && (
                        <div className="mt-3 pt-3 border-t border-gray-50">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                Tu participación estimada en las utilidades {utilidades.anio || ''}
                            </p>
                            <p className="text-lg font-black text-amber-600 tabular-nums">
                                {fmt(utilidades.valorEstimado)}
                                <span className="ml-2 text-xs font-bold text-gray-400">({utilidades.participacionPct.toFixed(2).replace('.', ',')}% de {fmt(utilidades.utilidades)})</span>
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                                Proporcional a tu ahorro neto abonado en {utilidades.anio || 'el año'} · referencia: ganancia total del fondo a la fecha
                                {utilidades.componentes && ` (intereses ${fmt(utilidades.componentes.intereses)} + Cta. NU ${fmt(utilidades.componentes.rentabilidadNU)} + recargos ${fmt(utilidades.componentes.recargos)})`}
                                {' '}· estimación, no constituye promesa de pago.
                            </p>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4 text-brand-primary" />
                        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Mis préstamos</h3>
                        {prestamos.enMora && (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">Cuota vencida</span>
                        )}
                    </div>
                    {prestamos.lista.length === 0 ? (
                        <p className="text-xs text-gray-400 mt-2">No registras préstamos. Tu cupo disponible te espera arriba.</p>
                    ) : (
                        <>
                            <div className="flex items-end gap-6 mb-3">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total prestado</p>
                                    <p className="text-lg font-black text-gray-800 tabular-nums">{fmt(prestamos.totalPrestado)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Saldo pendiente</p>
                                    <p className={`text-lg font-black tabular-nums ${prestamos.saldoPendiente > 0 ? 'text-brand-primary' : 'text-emerald-600'}`}>{fmt(prestamos.saldoPendiente)}</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {prestamos.lista.map(l => (
                                    <div key={l.idVm || l.id} className="flex items-center gap-2 text-xs">
                                        <span className="font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded text-[11px] shrink-0">{l.idVm || `#${l.id}`}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                            l.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                        }`}>{l.estado || '—'}</span>
                                        <span className="text-gray-600 tabular-nums shrink-0">{fmt(l.valorPrestado)}</span>
                                        <div className="flex-1 min-w-[60px] h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${l.mora ? 'bg-red-400' : 'bg-emerald-500'}`}
                                                style={{ width: `${l.totalCuotas > 0 ? Math.min(100, Math.round((l.pagadas / l.totalCuotas) * 100)) : 0}%` }}
                                            />
                                        </div>
                                        <span className="text-gray-400 tabular-nums shrink-0">{l.pagadas}/{l.totalCuotas}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-3">
                                Detalle completo en{' '}
                                <Link to="/dashboard/loans" className="text-brand-primary font-semibold underline">Lista de Préstamos</Link>
                                {' '}y{' '}
                                <Link to="/dashboard/payments" className="text-brand-primary font-semibold underline">Lista de Pagos</Link>.
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* Definiciones */}
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
                <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                    <b className="text-gray-600">Definiciones:</b> <b>Pagado (bruto)</b> = valor que consignaste. <b>Acreditado (neto)</b> = lo que suma a tu patrimonio (bruto menos recargos por mora).
                    Las <b>devoluciones de intereses</b> son giros del fondo hacia ti y se muestran en negativo porque salen de tu saldo acumulado.
                    El saldo corrido se calcula sobre tu historial completo; el filtro por año solo cambia qué movimientos y gráficos ves.
                    La tendencia mensual usa el <b>mes abonado</b> (el período que cubre cada pago), no la fecha de consignación.
                </p>
            </div>
        </div>
    );
};

export default DetalleCuentaPage;
