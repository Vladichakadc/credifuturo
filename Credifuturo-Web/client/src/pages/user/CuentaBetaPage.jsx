import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';
import { calcVerdict } from '../../utils/loanCapacity';
import { useUi } from '../../context/UiContext';
import {
    Wallet,
    PiggyBank,
    Scale,
    CalendarClock,
    Receipt,
    ArrowDownCircle,
    ArrowUpCircle,
    AlertTriangle,
    HandCoins,
    ChevronRight,
    Loader2,
    Landmark,
    Info
} from 'lucide-react';

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

// ── Estilo por tipo de movimiento (verde=ahorro, dorado=aporte, rojo=solo salidas) ──
const TIPO_META = {
    ahorro:     { label: 'Ahorro',     icon: PiggyBank,       chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    aporte:     { label: 'Aporte',     icon: Wallet,          chip: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400' },
    devolucion: { label: 'Devolución', icon: ArrowDownCircle, chip: 'bg-red-50 text-red-600',         dot: 'bg-red-500' },
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

const CuentaBetaPage = () => {
    const { toast } = useUi();
    const [loading, setLoading] = useState(true);
    const [savings, setSavings] = useState([]);
    const [aportes, setAportes] = useState([]);
    const [payments, setPayments] = useState([]);
    const [capacity, setCapacity] = useState(null);
    const [yearFilter, setYearFilter] = useState('Todos');

    useEffect(() => {
        const fetchAll = async () => {
            const results = await Promise.allSettled([
                api.get('/admin/my/savings'),
                api.get('/admin/my/initial-contributions'),
                api.get('/admin/my/payments'),
                api.get('/admin/my/loan-capacity'),
            ]);
            const [sRes, aRes, pRes, cRes] = results;
            if (sRes.status === 'fulfilled') setSavings(sRes.value.data?.data || []);
            if (aRes.status === 'fulfilled') setAportes(aRes.value.data?.data || []);
            if (pRes.status === 'fulfilled') setPayments(pRes.value.data?.data || []);
            if (cRes.status === 'fulfilled') setCapacity(cRes.value.data);
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
            });
        });
        aportes.forEach(a => {
            const v = Number(a.amount || 0);
            rows.push({
                id: `a-${a.id}`, fecha: parseFecha(a.date), tipo: 'aporte',
                concepto: 'Aporte inicial', bruto: v, recargo: 0, dias: 0, neto: v,
            });
        });
        rows.sort((x, y) => (x.fecha?.getTime() || 0) - (y.fecha?.getTime() || 0));
        let saldo = 0;
        rows.forEach(r => { saldo += r.neto; r.saldo = saldo; });
        return rows.reverse(); // más reciente primero
    }, [savings, aportes]);

    const availableYears = useMemo(() => {
        const ys = new Set(movimientos.map(r => r.fecha?.getFullYear()).filter(Boolean));
        return [...ys].sort((a, b) => b - a);
    }, [movimientos]);

    const visibles = useMemo(() => (
        yearFilter === 'Todos'
            ? movimientos
            : movimientos.filter(r => r.fecha?.getFullYear() === Number(yearFilter))
    ), [movimientos, yearFilter]);

    // ── Mi posición ──────────────────────────────────────────────────
    const patrimonioNeto = movimientos.length > 0 ? movimientos[0].saldo : 0;

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

    // ── Recargos y relación con el fondo ─────────────────────────────
    const recargos = useMemo(() => {
        const conRecargo = movimientos.filter(r => r.recargo > 0);
        return {
            total: conRecargo.reduce((s, r) => s + r.recargo, 0),
            dias: conRecargo.reduce((s, r) => s + r.dias, 0),
            registros: conRecargo.length,
        };
    }, [movimientos]);

    const relacion = useMemo(() => {
        const interesesPagados = payments
            .filter(p => ['pago', 'abono'].includes((p.estado || '').toLowerCase()))
            .reduce((s, p) => s + Number(p.valorInteresesAmortizados || 0), 0);
        const devoluciones = movimientos
            .filter(r => r.tipo === 'devolucion')
            .reduce((s, r) => s + Math.abs(r.neto), 0);
        return { interesesPagados, devoluciones, neta: devoluciones - interesesPagados };
    }, [payments, movimientos]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-brand-primary/40" />
                <p className="text-sm text-gray-400 font-semibold animate-pulse uppercase tracking-widest">Preparando tu extracto...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Encabezado */}
            <div className="flex flex-wrap items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                        <Receipt className="h-6 w-6 text-emerald-600" />
                        Detalle de Cuenta
                        <span className="text-[10px] font-black uppercase tracking-widest bg-lime-100 text-lime-700 px-2 py-0.5 rounded-full">Beta</span>
                    </h1>
                    <p className="text-gray-600 text-sm mt-1">
                        Extracto unificado de tu cuenta · datos al {fmtFecha(hoy)}
                    </p>
                </div>
            </div>

            {/* Mi posición */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PosicionCard
                    icon={Landmark}
                    label="Patrimonio neto"
                    value={fmt(patrimonioNeto)}
                    sub="Saldo actual del extracto · neto de recargos, incluye devoluciones"
                />
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
            </div>

            {/* Extracto */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                    <div>
                        <h2 className="text-base font-bold text-gray-800">Extracto de movimientos</h2>
                        <p className="text-[11px] text-gray-400">Ahorros, aportes y devoluciones en una sola línea de tiempo, con saldo corrido</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                        {['Todos', ...availableYears].map(y => (
                            <button
                                key={y}
                                onClick={() => setYearFilter(y)}
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
                                    {visibles.map((r, i) => {
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
                            {visibles.map(r => {
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
                    </>
                )}
            </div>

            {/* Recargos + Relación con el fondo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className={`rounded-2xl border p-5 ${recargos.total > 0 ? 'bg-red-50/60 border-red-100' : 'bg-white border-gray-100'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className={`h-4 w-4 ${recargos.total > 0 ? 'text-red-500' : 'text-gray-300'}`} />
                        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Recargos por mora pagados</h3>
                    </div>
                    <p className={`text-2xl font-black ${recargos.total > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(recargos.total)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {recargos.total > 0
                            ? `${recargos.registros} aporte(s) pagado(s) tarde · ${recargos.dias} día(s) de atraso acumulados. Pagar antes de la fecha límite evita este costo.`
                            : 'Nunca has pagado recargos por mora. Disciplina perfecta — sigue así.'}
                    </p>
                </div>

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
                    </p>
                </div>
            </div>

            {/* Definiciones */}
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
                <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                    <b className="text-gray-600">Definiciones:</b> <b>Pagado (bruto)</b> = valor que consignaste. <b>Acreditado (neto)</b> = lo que suma a tu patrimonio (bruto menos recargos por mora).
                    Las <b>devoluciones de intereses</b> son giros del fondo hacia ti y se muestran en negativo porque salen de tu saldo acumulado.
                    El saldo corrido se calcula sobre tu historial completo; el filtro por año solo cambia qué movimientos ves.
                    Versión beta en evaluación — la vista actual sigue disponible en <Link to="/dashboard/savings/summary" className="text-brand-primary font-semibold underline">Detalle de la Cuenta</Link>.
                </p>
            </div>
        </div>
    );
};

export default CuentaBetaPage;
