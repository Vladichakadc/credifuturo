import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';
import { calcVerdict } from '../../utils/loanCapacity';
import { useUi } from '../../context/UiContext';
import {
    PiggyBank,
    Wallet,
    TrendingUp,
    CalendarClock,
    CheckCircle2,
    AlertTriangle,
    Scale,
    ChevronRight,
    Landmark,
    Flame,
    HeartPulse,
    CreditCard,
    Sparkles,
    Users,
    ShieldCheck
} from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

// Abreviatura compacta para etiquetas de barras ($1,2M / $145k)
const fmtCorto = (n) => {
    const v = Number(n) || 0;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
    return v > 0 ? String(Math.round(v)) : '';
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

const MiPanelPage = () => {
    const { toast } = useUi();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [balance, setBalance] = useState(null);
    const [savings, setSavings] = useState([]);
    const [aportes, setAportes] = useState([]);
    const [payments, setPayments] = useState([]);
    const [capacity, setCapacity] = useState(null);
    const [fondo, setFondo] = useState(null);

    useEffect(() => {
        const fetchAll = async () => {
            const results = await Promise.allSettled([
                api.get('/admin/my/profile'),
                api.get('/admin/my/balance'),
                api.get('/admin/my/savings'),
                api.get('/admin/my/initial-contributions'),
                api.get('/admin/my/payments'),
                api.get('/admin/my/loan-capacity'),
                api.get('/admin/dashboard-stats'),
            ]);
            const [pRes, bRes, sRes, aRes, payRes, capRes, fRes] = results;
            if (pRes.status === 'fulfilled') setProfile(pRes.value.data);
            if (bRes.status === 'fulfilled') setBalance(bRes.value.data);
            if (sRes.status === 'fulfilled') setSavings(sRes.value.data?.data || []);
            if (aRes.status === 'fulfilled') setAportes(aRes.value.data?.data || []);
            if (payRes.status === 'fulfilled') setPayments(payRes.value.data?.data || []);
            if (capRes.status === 'fulfilled') setCapacity(capRes.value.data);
            if (fRes.status === 'fulfilled') setFondo(fRes.value.data);
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

    // ── 1 · Patrimonio ────────────────────────────────────────────────
    const patrimonio = useMemo(() => {
        const total = Number(balance?.totalSavings || 0);
        const totalAportes = aportes.reduce((s, a) => s + Number(a.amount || 0), 0);
        const totalAhorros = total - totalAportes;
        const anio = hoy.getFullYear();
        const aportadoEsteAnio =
            savings.reduce((s, r) => s + (Number(r.anioAbonado) === anio ? Number(r.amount || 0) : 0), 0) +
            aportes.reduce((s, r) => {
                const f = parseFecha(r.date);
                return s + (f && f.getFullYear() === anio ? Number(r.amount || 0) : 0);
            }, 0);
        const base = total - aportadoEsteAnio;
        const pct = base > 0 ? (aportadoEsteAnio / base) * 100 : null;
        return { total, totalAhorros, totalAportes, aportadoEsteAnio, pct };
    }, [balance, savings, aportes, hoy]);

    // Barras de los últimos 12 meses (valorAhorrado neto acreditado por mes)
    const sparkline = useMemo(() => {
        const map = {};
        savings.forEach(r => {
            const m = parseMes(r.mesAbonado);
            const y = Number(r.anioAbonado);
            if (!m || !y) return;
            const key = y * 12 + (m - 1);
            map[key] = (map[key] || 0) + Number(r.valorAhorrado ?? r.amount ?? 0);
        });
        const actual = hoy.getFullYear() * 12 + hoy.getMonth();
        const bars = [];
        for (let k = actual - 11; k <= actual; k++) {
            bars.push({
                key: k,
                valor: map[k] || 0,
                mesLabel: MESES_ABR[k % 12],
                anio: Math.floor(k / 12),
            });
        }
        const max = Math.max(...bars.map(b => b.valor), 1);
        return bars.map(b => ({ ...b, pct: Math.round((b.valor / max) * 100) }));
    }, [savings, hoy]);

    // ── 2 · Próxima cuota ─────────────────────────────────────────────
    const proximaCuota = useMemo(() => {
        const pendientes = payments
            .filter(p => (p.estado || '').toLowerCase() === 'pendiente')
            .map(p => ({ ...p, fecha: parseFecha(p.fechaPagoMax || p.fechaPago) }))
            .filter(p => p.fecha)
            .sort((a, b) => a.fecha - b.fecha);
        if (pendientes.length === 0) return { tienePrestamo: false };
        const c = pendientes[0];
        const dias = Math.round((c.fecha - hoy) / 86400000);
        return {
            tienePrestamo: true,
            valor: Number(c.valorCuotaVariable || c.valorCuotaPago || 0),
            fecha: c.fecha,
            dias,
            vencida: dias < 0,
            idVm: c.idVm,
            totalPendientes: pendientes.length,
        };
    }, [payments, hoy]);

    // ── 3 · Racha de ahorro mensual ───────────────────────────────────
    const racha = useMemo(() => {
        const abonados = new Set();
        savings.forEach(r => {
            const m = parseMes(r.mesAbonado);
            const y = Number(r.anioAbonado);
            if (m && y) abonados.add(y * 12 + (m - 1));
        });
        const actual = hoy.getFullYear() * 12 + hoy.getMonth();
        // Últimos 6 meses para las casillas
        const casillas = [];
        for (let k = actual - 5; k <= actual; k++) {
            casillas.push({
                key: k,
                label: MESES_ABR[k % 12],
                abonado: abonados.has(k),
                esActual: k === actual,
            });
        }
        // Racha: meses consecutivos con abono, terminando en el mes actual o el anterior
        let streak = 0;
        let cursor = abonados.has(actual) ? actual : actual - 1;
        while (abonados.has(cursor)) { streak++; cursor--; }
        return { casillas, streak, mesActualAbonado: abonados.has(actual) };
    }, [savings, hoy]);

    // ── 4 · Capacidad de crédito ──────────────────────────────────────
    const veredicto = useMemo(
        () => (capacity ? calcVerdict(capacity, { audience: 'user' }) : null),
        [capacity]
    );

    // ── 5 · Proyección de cierre de año ───────────────────────────────
    // Promedio mensual acreditado este año × meses que faltan por abonar.
    const proyeccion = useMemo(() => {
        const anio = hoy.getFullYear();
        const porMes = {};
        savings.forEach(r => {
            const m = parseMes(r.mesAbonado);
            if (m && Number(r.anioAbonado) === anio) {
                porMes[m] = (porMes[m] || 0) + Number(r.valorAhorrado ?? r.amount ?? 0);
            }
        });
        const mesesAbonados = Object.keys(porMes).length;
        if (mesesAbonados === 0) return null;
        const promedio = Object.values(porMes).reduce((s, v) => s + v, 0) / mesesAbonados;
        // Meses del año aún sin abono acreditado (del actual a diciembre)
        let mesesFaltantes = 0;
        for (let m = hoy.getMonth() + 1; m <= 12; m++) if (!porMes[m]) mesesFaltantes++;
        const total = Number(balance?.totalSavings || 0);
        return { promedio, estimado: total + promedio * mesesFaltantes, mesesFaltantes };
    }, [savings, balance, hoy]);

    // ── 6 · Salud financiera (letra A–E desde el score crediticio) ────
    const salud = useMemo(() => {
        if (!veredicto?.score) return null;
        const s = veredicto.score;
        const letras = { EXCELENTE: 'A', BUENO: 'B', ACEPTABLE: 'C', 'DÉBIL': 'D', 'CRÍTICO': 'E' };
        const colores = {
            green:   { text: 'text-emerald-600', ring: '#059669', bg: 'bg-emerald-50' },
            emerald: { text: 'text-emerald-600', ring: '#10b981', bg: 'bg-emerald-50' },
            yellow:  { text: 'text-yellow-600',  ring: '#ca8a04', bg: 'bg-yellow-50' },
            amber:   { text: 'text-amber-600',   ring: '#d97706', bg: 'bg-amber-50' },
            red:     { text: 'text-red-600',     ring: '#dc2626', bg: 'bg-red-50' },
        };
        const deuda = Number(capacity?.totalDeudaPendiente || 0);
        const ahorro = Number(capacity?.ahorroTotal || 0);
        const cobertura = deuda > 0 ? ahorro / deuda : null;
        let resumen;
        if (capacity?.enMoraActual) {
            resumen = 'Tienes cuotas vencidas sin pagar. Regularizar tus pagos mejora tu calificación de inmediato.';
        } else if (deuda === 0) {
            resumen = 'Sin deudas con el fondo y cartera limpia. Tu ahorro trabaja 100% para ti.';
        } else if (cobertura >= 1) {
            resumen = `Tu ahorro cubre ${cobertura.toFixed(1)} veces tu deuda y tu cartera está al día.`;
        } else {
            resumen = `Tu deuda supera tu ahorro (cobertura ${cobertura.toFixed(1)}×). Aumentar tu ahorro mensual equilibra tu perfil.`;
        }
        return { letra: letras[s.nivel] || 'C', nivel: s.nivel, score: s.score, color: colores[s.color] || colores.yellow, resumen };
    }, [veredicto, capacity]);

    // ── 7 · Préstamos en curso con progreso ───────────────────────────
    const prestamos = useMemo(() => {
        const vigentes = capacity?.prestamosVigentes || [];
        if (vigentes.length === 0) return [];
        // Cuotas pagadas por préstamo desde el historial real de pagos
        const pagadasPorVm = {};
        payments.forEach(p => {
            const est = (p.estado || '').toLowerCase();
            if (est === 'pago' || est === 'abono') {
                const vm = (p.idVm || '').trim();
                pagadasPorVm[vm] = (pagadasPorVm[vm] || 0) + 1;
            }
        });
        return vigentes.map(l => {
            const vm = (l.idVm || '').trim();
            const pagadas = pagadasPorVm[vm] || 0;
            const pendientes = (l.cuotasPendientesCount || 0) + (l.cuotasMoraEPCount || 0);
            const totales = l.cuotas || pagadas + pendientes;
            return {
                idVm: vm,
                pagadas,
                totales,
                pct: totales > 0 ? Math.round((pagadas / totales) * 100) : 0,
                saldo: Number(l.saldoPendiente || 0),
                valorPrestado: Number(l.valorPrestado || 0),
                interes: l.interesMensual,
                enMora: l.enMoraEP,
            };
        });
    }, [capacity, payments]);

    // Intereses que el socio ha aportado al fondo (cuotas ya pagadas)
    const interesesPagados = useMemo(() =>
        payments.reduce((s, p) => {
            const est = (p.estado || '').toLowerCase();
            return (est === 'pago' || est === 'abono')
                ? s + Number(p.valorInteresesAmortizados || 0)
                : s;
        }, 0), [payments]);

    const nombre = profile?.name || 'Socio';
    const anioIngreso = profile?.fechaIngreso ? String(profile.fechaIngreso).slice(0, 4) : null;

    // Socio nuevo (< 3 meses): aún no puede pedir préstamo (Resolución #13) y
    // se beneficia de un resumen de las reglas más relevantes de sus primeros meses.
    const esSocioNuevo = capacity?.mesesComoSocio != null && capacity.mesesComoSocio < 3;

    if (loading) {
        return (
            <div className="space-y-4 max-w-5xl mx-auto">
                <div className="h-8 w-56 bg-gray-200 rounded-lg animate-pulse" />
                <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
                <div className="grid gap-4 md:grid-cols-2">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
            {/* Saludo */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
                        Hola, {nombre} 👋
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {profile?.customerId ? `Socio ${profile.customerId}` : 'Socio'}
                        {anioIngreso ? ` · desde ${anioIngreso}` : ''}
                        {racha.streak > 0 && (
                            <span className="inline-flex items-center gap-1 ml-2 text-brand-primary font-semibold">
                                <Flame className="h-3.5 w-3.5" />
                                {racha.streak} {racha.streak === 1 ? 'mes' : 'meses'} ahorrando
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {/* 0 · Bienvenida (solo socios con menos de 3 meses en el fondo) */}
            {esSocioNuevo && (
                <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 shadow-card p-4 lg:p-5">
                    <p className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-brand-primary" />
                        Bienvenido al fondo, {nombre}
                    </p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Llevas {capacity.mesesComoSocio === 0 ? 'menos de un mes' : `${capacity.mesesComoSocio} mes${capacity.mesesComoSocio === 1 ? '' : 'es'}`} como socio. Esto es lo que debes saber por ahora:
                    </p>
                    <ul className="mt-2.5 space-y-1.5 text-xs text-gray-600">
                        <li className="flex items-start gap-2">
                            <CalendarClock className="h-3.5 w-3.5 text-brand-primary mt-0.5 flex-shrink-0" />
                            Tu aporte mensual se paga dentro de los primeros 10 días del mes — desde el día 11 el fondo cobra recargo por mora.
                        </li>
                        <li className="flex items-start gap-2">
                            <Scale className="h-3.5 w-3.5 text-brand-primary mt-0.5 flex-shrink-0" />
                            Puedes solicitar tu primer préstamo a partir del mes 3 como socio (Resolución #13).
                        </li>
                        <li className="flex items-start gap-2">
                            <ShieldCheck className="h-3.5 w-3.5 text-brand-primary mt-0.5 flex-shrink-0" />
                            Todas las reglas vigentes del fondo están en Estatutos y Resoluciones — vale la pena leerlas.
                        </li>
                    </ul>
                    <Link to="/dashboard/resolutions" className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-dark mt-3 transition-colors">
                        Ver Estatutos y Resoluciones <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            )}

            {/* 1 · Mi Patrimonio */}
            <div className="rounded-2xl overflow-hidden shadow-card relative"
                 style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 70%, #14532d 100%)' }}>
                <div className="p-5 lg:p-6 text-white relative z-10">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Mi patrimonio en el fondo</p>
                    <p className="text-3xl lg:text-4xl font-extrabold mt-1 tracking-tight">{fmt(patrimonio.total)}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-white/75">
                        <span className="flex items-center gap-1.5">
                            <PiggyBank className="h-3.5 w-3.5 text-brand-light" />
                            Ahorros {fmt(patrimonio.totalAhorros)}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Wallet className="h-3.5 w-3.5 text-brand-gold" />
                            Aportes {fmt(patrimonio.totalAportes)}
                        </span>
                        {patrimonio.aportadoEsteAnio > 0 && (
                            <span className="flex items-center gap-1 font-semibold text-brand-light">
                                <TrendingUp className="h-3.5 w-3.5" />
                                +{fmt(patrimonio.aportadoEsteAnio)} en {hoy.getFullYear()}
                                {patrimonio.pct != null && isFinite(patrimonio.pct) ? ` (+${patrimonio.pct.toFixed(1)}%)` : ''}
                            </span>
                        )}
                    </div>
                    {/* Sparkline últimos 12 meses con etiquetas */}
                    <div className="flex items-end gap-1 mt-4">
                        {sparkline.map((b, i) => (
                            <div
                                key={b.key}
                                className="flex-1 flex flex-col items-center min-w-0"
                                title={`${b.mesLabel} ${b.anio}: ${fmt(b.valor)}`}
                            >
                                <span className={`text-[8px] font-bold leading-none mb-1 truncate max-w-full ${
                                    i === sparkline.length - 1 ? 'text-brand-gold' : 'text-white/60'
                                }`}>
                                    {fmtCorto(b.valor)}&nbsp;
                                </span>
                                <div className="w-full h-10 flex items-end">
                                    <div
                                        className={`w-full rounded-t-sm transition-all ${i === sparkline.length - 1 ? 'bg-brand-gold' : 'bg-white/30'}`}
                                        style={{ height: `${Math.max(b.pct, 4)}%` }}
                                    />
                                </div>
                                <span className={`text-[8px] font-bold leading-none mt-1 uppercase ${
                                    i === sparkline.length - 1 ? 'text-brand-gold' : 'text-white/40'
                                }`}>
                                    {b.mesLabel}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-white/40 mt-1.5">
                        Ahorro acreditado por mes ($ COP) · {sparkline[0]?.mesLabel} {sparkline[0]?.anio} – {sparkline[11]?.mesLabel} {sparkline[11]?.anio}
                    </p>
                    {proyeccion && proyeccion.mesesFaltantes > 0 && (
                        <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/10">
                            <Sparkles className="h-3.5 w-3.5 text-brand-gold flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-white/70 leading-relaxed">
                                A tu ritmo de <b className="text-white">{fmt(proyeccion.promedio)}/mes</b>, cerrarías {hoy.getFullYear()} con
                                <b className="text-brand-gold"> ≈ {fmt(proyeccion.estimado)}</b>
                                <span className="text-white/40"> · estimado, no garantizado</span>
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* 2 · Próxima cuota */}
            {proximaCuota.tienePrestamo ? (
                <div className={`rounded-2xl border shadow-card p-4 lg:p-5 border-l-4 ${
                    proximaCuota.vencida
                        ? 'bg-red-50 border-red-200 border-l-red-500'
                        : proximaCuota.dias <= 7
                            ? 'bg-amber-50 border-amber-200 border-l-amber-500'
                            : 'bg-white border-gray-200 border-l-brand-primary'
                }`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg flex-shrink-0 ${
                                proximaCuota.vencida ? 'bg-red-100' : proximaCuota.dias <= 7 ? 'bg-amber-100' : 'bg-brand-primary/10'
                            }`}>
                                {proximaCuota.vencida
                                    ? <AlertTriangle className="h-5 w-5 text-red-600" />
                                    : <CalendarClock className={`h-5 w-5 ${proximaCuota.dias <= 7 ? 'text-amber-600' : 'text-brand-primary'}`} />}
                            </div>
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                    Próxima cuota de tu préstamo{proximaCuota.idVm ? ` · ${proximaCuota.idVm}` : ''}
                                </p>
                                <p className="text-xl font-extrabold text-gray-900 mt-0.5">{fmt(proximaCuota.valor)}</p>
                                <p className={`text-xs font-semibold mt-0.5 ${
                                    proximaCuota.vencida ? 'text-red-600' : proximaCuota.dias <= 7 ? 'text-amber-700' : 'text-gray-500'
                                }`}>
                                    {proximaCuota.vencida
                                        ? `Venció hace ${Math.abs(proximaCuota.dias)} día(s) — regulariza tu pago`
                                        : proximaCuota.dias === 0
                                            ? 'Vence hoy'
                                            : `Vence el ${proximaCuota.fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })} · faltan ${proximaCuota.dias} día(s)`}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/dashboard/payments"
                            className="inline-flex items-center gap-1 bg-brand-primary hover:bg-brand-dark text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors min-h-[40px]"
                        >
                            Ver mis pagos
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 shadow-card p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm text-emerald-800 font-medium">
                        Estás al día: no tienes cuotas de préstamo pendientes.
                    </p>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {/* 3 · Racha de ahorro */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">
                        Tu ahorro mensual · últimos 6 meses
                    </p>
                    <div className="flex gap-1.5">
                        {racha.casillas.map(c => (
                            <div key={c.key} className="flex-1 text-center">
                                <div className={`h-9 rounded-lg flex items-center justify-center text-sm font-bold border ${
                                    c.abonado
                                        ? 'bg-brand-primary/10 border-transparent text-brand-primary'
                                        : c.esActual
                                            ? 'border-dashed border-amber-400 text-amber-500 bg-amber-50/50'
                                            : 'bg-gray-50 border-gray-200 text-gray-300'
                                }`}>
                                    {c.abonado ? '✓' : '·'}
                                </div>
                                <p className={`text-[10px] font-bold mt-1 ${c.esActual ? 'text-amber-600' : 'text-gray-400'}`}>
                                    {c.label}
                                </p>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                        {racha.mesActualAbonado ? (
                            <>¡{MESES_ABR[hoy.getMonth()]} ya está al día! {racha.streak > 1 && <>Llevas <b className="text-brand-primary">{racha.streak} meses seguidos</b> ahorrando.</>}</>
                        ) : (
                            <>{MESES_ABR[hoy.getMonth()]} aún está pendiente. Ahorrar a tiempo evita la penalización{racha.streak > 0 && <> y mantiene tu racha de <b className="text-brand-primary">{racha.streak} {racha.streak === 1 ? 'mes' : 'meses'}</b></>}.</>
                        )}
                    </p>
                    <Link to="/dashboard/cuenta" className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-dark mt-2 transition-colors">
                        Ver mis ahorros <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                {/* 4 · Capacidad de crédito */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">
                        Tu capacidad de crédito
                    </p>
                    {veredicto ? (
                        <>
                            <p className="text-2xl font-extrabold text-gray-900">
                                {fmt(Math.max(0, veredicto.capacidadDisponible))}
                                <span className="text-xs font-bold text-gray-400 ml-1.5">disponibles</span>
                            </p>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${veredicto.montoMaxSinVotacion > 0
                                            ? Math.min(100, Math.max(0, (veredicto.capacidadDisponible / veredicto.montoMaxSinVotacion) * 100))
                                            : 0}%`,
                                        background: 'linear-gradient(90deg, #166534, #84cc16)'
                                    }}
                                />
                            </div>
                            <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
                                <span>Cupo 3× tu ahorro: <b className="text-gray-700">{fmt(veredicto.montoMaxSinVotacion)}</b></span>
                                <span>Deuda: <b className="text-gray-700">{fmt(capacity?.totalDeudaPendiente || 0)}</b></span>
                            </div>
                            {capacity?.tasaAsignada > 0 && (
                                <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 leading-snug">
                                    Tu tasa asignada: <b className="text-gray-700">{capacity.tasaAsignada}% mensual</b> — regla de devoluciones del fondo: menor si mantuviste tu ahorro el año anterior, mayor si lo retiraste.
                                </p>
                            )}
                            <Link
                                to="/dashboard/loan-capacity"
                                className="inline-flex items-center gap-1.5 mt-3 border border-brand-primary text-brand-primary hover:bg-brand-primary/5 text-xs font-bold px-4 py-2 rounded-lg transition-colors min-h-[38px]"
                            >
                                <Scale className="h-3.5 w-3.5" />
                                Ver análisis completo
                            </Link>
                        </>
                    ) : (
                        <p className="text-sm text-gray-400">Análisis no disponible en este momento.</p>
                    )}
                </div>
            </div>

            {/* Salud financiera + Préstamo en curso */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* 5 · Mi salud financiera */}
                {salud && (
                    <div className={`bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5 ${prestamos.length === 0 ? 'md:col-span-2' : ''}`}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
                            <HeartPulse className="h-3.5 w-3.5" />
                            Mi salud financiera
                        </p>
                        <div className="flex items-center gap-4">
                            <div
                                className="w-16 h-16 rounded-full flex-shrink-0 grid place-items-center"
                                style={{ background: `conic-gradient(${salud.color.ring} ${salud.score}%, #f3f4f6 ${salud.score}% 100%)` }}
                            >
                                <div className="w-12 h-12 rounded-full bg-white grid place-items-center">
                                    <span className={`text-xl font-extrabold ${salud.color.text}`}>{salud.letra}</span>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <p className={`text-sm font-extrabold ${salud.color.text}`}>
                                    {salud.nivel} · {salud.score}/100
                                </p>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{salud.resumen}</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-3">
                            Calificación del fondo: capacidad, cumplimiento, antigüedad, lealtad y constancia de ahorro.
                        </p>
                    </div>
                )}

                {/* 6 · Préstamos en curso */}
                {prestamos.map(l => (
                    <div key={l.idVm} className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
                            <CreditCard className="h-3.5 w-3.5" />
                            Préstamo {l.idVm} en curso
                            {l.enMora && <span className="ml-1 text-red-600 normal-case">· con cuota vencida</span>}
                        </p>
                        <div className="flex items-baseline justify-between">
                            <p className="text-lg font-extrabold text-gray-900">
                                {l.pagadas} <span className="text-sm font-bold text-gray-400">de {l.totales} cuotas</span>
                            </p>
                            <p className="text-xs font-bold text-brand-primary">{l.pct}%</p>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                            <div
                                className={`h-full rounded-full transition-all ${l.enMora ? 'bg-red-400' : ''}`}
                                style={{
                                    width: `${l.pct}%`,
                                    background: l.enMora ? undefined : 'linear-gradient(90deg, #166534, #84cc16)'
                                }}
                            />
                        </div>
                        <div className="flex justify-between text-[11px] text-gray-500 mt-2">
                            <span>Saldo: <b className="text-gray-700">{fmt(l.saldo)}</b></span>
                            {l.valorPrestado > 0 && <span>Prestado: <b className="text-gray-700">{fmt(l.valorPrestado)}</b></span>}
                            {l.interes > 0 && <span>Interés: <b className="text-gray-700">{Number(l.interes).toFixed(1)}% mes</b></span>}
                        </div>
                        {interesesPagados > 0 && (
                            <p className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5 text-brand-primary/60 flex-shrink-0" />
                                Has aportado <b className="text-brand-primary">{fmt(interesesPagados)}</b>&nbsp;en intereses a las ganancias del fondo
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {/* 7 · Acceso al panel del fondo con mini-indicadores */}
            <Link
                to="/dashboard/fondo"
                className="block bg-white rounded-2xl border border-gray-200 shadow-card p-4 hover:border-brand-primary/40 hover:shadow-card-hover transition-all group"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-brand-primary/10">
                            <Landmark className="h-5 w-5 text-brand-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">Nuestro Fondo</p>
                            <p className="text-xs text-gray-500">Indicadores y transparencia de todo el fondo Credifuturo</p>
                        </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                {fondo && (
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                        <div className="text-center">
                            <p className="text-base font-extrabold text-gray-900 flex items-center justify-center gap-1">
                                <Users className="h-3.5 w-3.5 text-brand-primary/50" />
                                {fondo.activeClientsCount || 0}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Socios activos</p>
                        </div>
                        <div className="text-center">
                            <p className="text-base font-extrabold text-gray-900">{fmt(fondo.totalNetoActivos || 0)}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Patrimonio</p>
                        </div>
                        <div className="text-center">
                            <p className={`text-base font-extrabold ${Number(fondo.moraCarteraEP || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {fmt(fondo.moraCarteraEP || 0)}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">En mora</p>
                        </div>
                    </div>
                )}
            </Link>
        </div>
    );
};

export default MiPanelPage;
