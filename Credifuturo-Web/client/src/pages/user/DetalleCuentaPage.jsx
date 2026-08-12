import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';
import { cn } from '../../utils/cn';
import { calcVerdict } from '../../utils/loanCapacity';
import { useUi } from '../../context/UiContext';
import ChartExpandModal, { analyzeMonthlyTrend, analyzeSavingsComposition } from '../../components/ChartExpandModal';
import { AccountSummaryChart, MonthlySavingsTrendChart } from '../admin/SavingsSummaryPage';
import * as XLSX from 'xlsx';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RTooltip, LabelList, LineChart, Line, ReferenceLine
} from 'recharts';
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

// ── Estilo por tipo de movimiento ──────────────────────────────────────
// Cada tipo tiene un color propio porque el socio los vive como cosas distintas:
// verde lo que ahorra, dorado lo que aportó, azul los intereses que le distribuye
// el fondo, rojo lo que el fondo le devuelve y naranja lo que se le descuenta.
const TIPO_META = {
    ahorro:       { label: 'Ahorro',       chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    aporte:       { label: 'Aporte',       chip: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400' },
    distribucion: { label: 'Distribución', chip: 'bg-sky-50 text-sky-700',         dot: 'bg-sky-500' },
    devolucion:   { label: 'Devolución',   chip: 'bg-red-50 text-red-600',         dot: 'bg-red-500' },
    // Un descuento por mora y una devolución son cosas OPUESTAS: en el primero el
    // socio pierde plata por pagar tarde, en el segundo el fondo se la entrega.
    // Antes ambos caían en "Devolución" porque se clasificaba por el signo del
    // importe, así que el extracto le decía a un socio que le habían devuelto un
    // dinero que en realidad se le había descontado. Naranja, no rojo: es una
    // salida, pero de distinta naturaleza que la devolución.
    descuento:    { label: 'Descuento',    chip: 'bg-orange-50 text-orange-700',   dot: 'bg-orange-500' },
    // Un negativo cuyo estado no reconocemos. No se afirma que sea devolución ni
    // descuento — decir cualquiera de las dos sería inventar.
    salida:       { label: 'Salida',       chip: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-400' },
};

// Los estados de un ahorro vienen del histórico en Excel y no tienen una
// redacción única: conviven "Devolucion Total Intereses Ahorros Mensuales",
// "Distribucion Intereses Ahorros Mensuales", variantes con tilde y filas sin
// estado. Comparar contra frases exactas dejaba fuera cualquier redacción no
// prevista, así que primero se normaliza y luego se decide por concepto.
const normaliza = (s) => String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

// Clasifica un movimiento POR SU ESTADO, con independencia del signo.
//
// El estado es el dato autoritativo: es el mismo campo con el que la
// administración arma sus propias pantallas (p. ej. "Devoluciones de Ahorros"
// filtra exactamente por 'Devolucion Total Intereses Ahorros Mensuales'). Si
// aquí se clasificara por el signo del importe, la pantalla del socio y la del
// administrador podrían discrepar sobre el mismo registro.
//
// Mirar el estado y no el signo importa además porque la distribución de
// intereses puede venir en positivo (abonada al ahorro) o en negativo (girada
// al socio), y en ambos casos es el mismo concepto.
//
// Devuelve `null` cuando la fila es un ahorro corriente.
const clasificarMovimiento = (status, esNegativo) => {
    const t = normaliza(status);
    // El descuento se comprueba primero porque es lo único que se afirma con
    // certeza: que el socio PERDIÓ ese dinero por pagar tarde.
    if (t.includes('descuento') || t.includes('penaliz')) {
        return { tipo: 'descuento', concepto: 'Descuento anual por penalización' };
    }
    // Devolución de ahorros: solo la recibe quien la solicita. Mismo criterio
    // que la página "Devoluciones de Ahorros" del administrador.
    if (t.includes('devolucion')) {
        return { tipo: 'devolucion', concepto: 'Devolución de ahorros' };
    }
    // Distribución de intereses: la reciben todos los socios.
    if (t.includes('distribucion')) {
        return { tipo: 'distribucion', concepto: 'Distribución de intereses' };
    }
    // Un negativo con un estado que no reconocemos sigue siendo una salida del
    // saldo, pero no se le pone nombre: se conserva el estado tal cual.
    if (esNegativo) {
        return { tipo: 'salida', concepto: String(status || '').trim() || 'Movimiento de salida' };
    }
    return null;
};

// Agrupa por año los movimientos de un tipo y devuelve el total de cada año.
//
// Se acumula el importe CON SIGNO y solo al final se toma el valor absoluto:
// así un movimiento reversado resta en vez de sumar, y el resultado se lee en
// positivo —que es como el socio piensa "cuánto me entregaron"— sin importar
// con qué signo esté guardado el registro.
//
// Las filas sin fecha utilizable no se descartan: se agrupan aparte. Si se
// omitieran, el total quedaría por debajo de las filas que la propia pestaña
// está listando.
const agruparPorAnio = (filas) => {
    const porAnio = new Map();
    filas.forEach(r => {
        const anio = r.fecha ? r.fecha.getFullYear() : null;
        const acum = porAnio.get(anio) || { anio, total: 0, veces: 0 };
        acum.total += r.neto;
        acum.veces += 1;
        porAnio.set(anio, acum);
    });
    const lista = [...porAnio.values()]
        .map(x => ({ ...x, total: Math.abs(x.total) }))
        .sort((x, y) => (y.anio ?? -Infinity) - (x.anio ?? -Infinity));
    return { lista, total: lista.reduce((s, x) => s + x.total, 0) };
};

// Cabecera de resumen de una pestaña del extracto: el total grande, una frase que
// explica qué es esa cifra y el desglose por año. La comparten Distribución,
// Devolución y Descuentos para que las tres no puedan divergir en presentación.
const TONOS_RESUMEN = {
    sky:     { fondo: 'bg-sky-50/50',     rotulo: 'text-sky-700',     cifra: 'text-sky-900',     borde: 'border-sky-100' },
    emerald: { fondo: 'bg-emerald-50/40', rotulo: 'text-emerald-700', cifra: 'text-emerald-800', borde: 'border-emerald-100' },
    orange:  { fondo: 'bg-orange-50/50',  rotulo: 'text-orange-700',  cifra: 'text-orange-900',  borde: 'border-orange-100' },
};

const ResumenPestana = ({ tono, rotulo, total, explicacion, tarjetas = [], nota }) => {
    const c = TONOS_RESUMEN[tono];
    return (
        <div className={cn('px-5 py-4 border-b border-gray-100', c.fondo)}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                    <p className={cn('text-[10px] font-black uppercase tracking-widest', c.rotulo)}>{rotulo}</p>
                    <p className={cn('text-2xl font-black tabular-nums leading-none mt-1', c.cifra)}>{fmt(total)}</p>
                </div>
                <p className="text-[11px] text-gray-500 max-w-md leading-snug">{explicacion}</p>
            </div>

            {tarjetas.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
                    {tarjetas.map(t => (
                        <div key={t.clave} className={cn('bg-white rounded-xl border px-3 py-2.5', c.borde)}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t.titulo}</p>
                            <p className="text-sm font-black text-gray-900 tabular-nums mt-0.5">{fmt(t.valor)}</p>
                            <p className="text-[10px] text-gray-400">{t.detalle}</p>
                        </div>
                    ))}
                </div>
            )}

            {nota && <p className="text-[11px] text-gray-500 mt-3">{nota}</p>}
        </div>
    );
};

// Estado vacío de una pestaña. Que una pestaña esté vacía no siempre es una
// carencia: no haber solicitado devolución es lo normal, y el texto lo dice así
// en vez de sonar a que al socio le falta algo.
const VacioPestana = ({ titulo, detalle }) => (
    <div className="px-5 py-6 border-b border-gray-100">
        <p className="text-sm text-gray-500">{titulo}</p>
        <p className="text-[11px] text-gray-400 mt-1">{detalle}</p>
    </div>
);

// "Pagado (bruto)" es lo que el socio consignó de su bolsillo. Solo el ahorro
// mensual y el aporte inicial lo son; la distribución, la devolución, el
// descuento y las salidas las mueve el fondo, y mostrar ahí un importe le diría
// al socio que él pagó un dinero que nunca consignó.
const CONSIGNADO_POR_EL_SOCIO = new Set(['ahorro', 'aporte']);
const tieneBruto = (tipo) => CONSIGNADO_POR_EL_SOCIO.has(tipo);

// La pestaña de Descuentos reúne dos cosas que el socio vive como una sola —
// "¿qué me ha costado pagar tarde?": el descuento anual y las penalizaciones que
// se le restaron a cada abono. Esas últimas viven en filas de tipo Ahorro, así
// que una igualdad de tipo no las alcanzaría.
const coincideTipo = (r, filtro) => {
    if (filtro === 'Todos') return true;
    if (filtro === 'descuento') return r.tipo === 'descuento' || r.recargo > 0;
    return r.tipo === filtro;
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
            const acreditado = Number(s.valorAhorrado ?? s.amount ?? 0);
            // Se miran los DOS importes: hay filas históricas que dejaron
            // `amount` en cero y guardaron el valor solo en `valorAhorrado`.
            const esNegativo = bruto < 0 || acreditado < 0;
            const clasif = clasificarMovimiento(s.status, esNegativo);
            // Una fila con concepto propio (devolución, distribución, descuento)
            // vale su importe tal cual; solo el ahorro corriente lleva descontado
            // el recargo, y por eso ese usa `valorAhorrado`.
            const neto = clasif ? (bruto !== 0 ? bruto : acreditado) : acreditado;
            const mesNum = parseMes(s.mesAbonado);
            rows.push({
                id: `s-${s.id}`,
                fecha: parseFecha(s.date),
                tipo: clasif ? clasif.tipo : 'ahorro',
                concepto: clasif
                    ? clasif.concepto
                    : `Ahorro mensual${mesNum ? ` · abona ${MESES_ABR[mesNum - 1]} ${s.anioAbonado || ''}`.trimEnd() : ''}`,
                bruto,
                // Solo el ahorro corriente puede traer recargo. Mantenerlo en cero
                // para el resto es lo que evita contarlo dos veces en el resumen
                // de descuentos, que suma el descuento anual MÁS los recargos.
                recargo: clasif ? 0 : Math.max(0, bruto - neto),
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
            // Un aporte inicial casi siempre es positivo, pero si algún día existe
            // una corrección o reversa debe tratarse como salida y no como si
            // fuera un aporte más — la misma prueba que en el bucle de ahorros.
            const clasif = clasificarMovimiento(a.status, v < 0);
            rows.push({
                id: `a-${a.id}`, fecha: parseFecha(a.date), tipo: clasif ? clasif.tipo : 'aporte',
                concepto: clasif ? clasif.concepto : 'Aporte inicial', bruto: v, recargo: 0, dias: 0, neto: v,
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
            const acreditado = Number(s.valorAhorrado ?? s.amount ?? 0);
            // Se usa el MISMO clasificador que el extracto. Antes esta serie
            // decidía por el signo del importe mientras la tabla decidía por el
            // estado, así que la gráfica y el extracto podían atribuirle valores
            // distintos al mismo registro.
            const clasif = clasificarMovimiento(s.status, bruto < 0 || acreditado < 0);
            const neto = clasif ? (bruto !== 0 ? bruto : acreditado) : acreditado;
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
            .filter(r => coincideTipo(r, tipoFilter))
    ), [movimientos, yearFilter, tipoFilter]);

    // ── Resúmenes por año de las dos entregas del fondo ────────────────
    // En el extracto estos movimientos pueden ir en negativo porque salen del
    // saldo de ahorros, y eso lee como una pérdida. Aquí se presentan en
    // positivo, que es lo que de verdad ocurrió: el fondo entregó ese dinero.
    //
    // Se calculan sobre el historial completo y no sobre `visibles`, porque la
    // pregunta que responden es "¿cuánto me han entregado?", no "¿cuánto en el
    // año que tengo filtrado?".
    const devolucionesPorAnio = useMemo(
        () => agruparPorAnio(movimientos.filter(r => r.tipo === 'devolucion')),
        [movimientos]
    );

    const distribucionesPorAnio = useMemo(
        () => agruparPorAnio(movimientos.filter(r => r.tipo === 'distribucion')),
        [movimientos]
    );

    // ── Lo que le ha costado pagar tarde ───────────────────────────────
    // Los dos conjuntos son disjuntos por construcción: una fila de tipo
    // 'descuento' lleva `recargo` en cero, así que nada se cuenta dos veces.
    const descuentosResumen = useMemo(() => {
        const anuales = movimientos.filter(r => r.tipo === 'descuento');
        const conRecargo = movimientos.filter(r => r.recargo > 0);
        const totalAnual = Math.abs(anuales.reduce((s, r) => s + r.neto, 0));
        const totalRecargos = conRecargo.reduce((s, r) => s + r.recargo, 0);
        return {
            totalAnual,
            totalRecargos,
            total: totalAnual + totalRecargos,
            vecesAnual: anuales.length,
            vecesRecargo: conRecargo.length,
            dias: conRecargo.reduce((s, r) => s + r.dias, 0),
        };
    }, [movimientos]);

    const FILAS_INICIALES = 30;
    const visiblesLimitados = verTodo ? visibles : visibles.slice(0, FILAS_INICIALES);

    // ── Mi posición (siempre historial completo) ─────────────────────
    const patrimonioNeto = movimientos.length > 0 ? movimientos[0].saldo : 0;
    const heroTotals = useMemo(() => ({
        ahorros: movimientos.filter(r => r.tipo === 'ahorro').reduce((s, r) => s + r.neto, 0),
        aportes: movimientos.filter(r => r.tipo === 'aporte').reduce((s, r) => s + r.neto, 0),
        // Cada concepto va por separado porque significan cosas distintas para el
        // socio: la distribución y la devolución son dinero que RECIBIÓ, el
        // descuento es dinero que PERDIÓ por pagar tarde.
        //
        // Se reutiliza el total que ya calcularon los resúmenes de cada pestaña
        // en vez de volver a sumar aquí. Sumar por separado parecía inofensivo,
        // pero las dos cuentas no son la misma: el resumen toma el valor absoluto
        // POR AÑO y el hero lo tomaría sobre el total, de modo que a un socio con
        // un año en positivo y otro en negativo el hero y su propia pestaña le
        // habrían mostrado cifras distintas.
        distribuciones: distribucionesPorAnio.total,
        devoluciones: devolucionesPorAnio.total,
        descuentos: descuentosResumen.totalAnual,
    }), [movimientos, distribucionesPorAnio, devolucionesPorAnio, descuentosResumen]);

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
            'Valor Bruto': tieneBruto(r.tipo) ? r.bruto : '',
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

    // ── Tendencia mensual (últimos 12 meses, por fecha de consignación) ──
    const trend12 = useMemo(() => {
        const buckets = {};
        movimientos.filter(r => r.tipo !== 'aporte' && r.fecha).forEach(r => {
            const key = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, '0')}`;
            buckets[key] = (buckets[key] || 0) + r.neto;
        });
        const rows = Object.entries(buckets)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-12)
            .map(([k, v]) => ({ mes: k.slice(2).replace('-', '/'), valor: v }));
        const positivos = rows.filter(r => r.valor > 0);
        const avg = positivos.length ? positivos.reduce((s, r) => s + r.valor, 0) / positivos.length : 0;
        const latest = rows[rows.length - 1]?.valor || 0;
        return { rows, avg, deltaPct: avg > 0 ? ((latest - avg) / avg) * 100 : 0 };
    }, [movimientos]);

    // ── Evolución de ahorros por año (neto acreditado por año de consignación) ──
    const porAnio = useMemo(() => {
        const buckets = {};
        movimientos.filter(r => r.tipo !== 'aporte' && r.fecha).forEach(r => {
            const y = r.fecha.getFullYear();
            buckets[y] = (buckets[y] || 0) + r.neto;
        });
        return Object.keys(buckets).sort((a, b) => a - b).map(y => ({ name: String(y), ahorros: buckets[y] }));
    }, [movimientos]);

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
                {/* Sin título propio: lo da el encabezado del layout. Queda solo
                    la fecha de corte, que es lo único que el encabezado no puede
                    saber y que sí cambia lo que el socio está leyendo. */}
                <p className="text-gray-500 text-sm">Datos al {fmtFecha(hoy)}</p>
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
                    {/* Una casilla por concepto: antes la tercera rotulaba
                        "Penalizaciones" pero pintaba el total DEVUELTO, dos cifras
                        de signo opuesto para el socio. Cada una muestra ahora lo
                        que su rótulo dice, y la distribución de intereses va
                        aparte porque no es un ahorro que el socio haya hecho. */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4 pt-4 border-t border-white/10">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Ahorros mensuales</p>
                            <p className="text-sm lg:text-lg font-extrabold tabular-nums">{fmt(heroTotals.ahorros)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Aportes iniciales</p>
                            <p className="text-sm lg:text-lg font-extrabold tabular-nums">{fmt(heroTotals.aportes)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Intereses distribuidos</p>
                            <p className="text-sm lg:text-lg font-extrabold tabular-nums text-sky-300">{fmt(heroTotals.distribuciones)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Devuelto por el fondo</p>
                            <p className="text-sm lg:text-lg font-extrabold tabular-nums text-brand-gold">{fmt(heroTotals.devoluciones)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Penalizaciones</p>
                            <p className="text-sm lg:text-lg font-extrabold tabular-nums">{fmt(heroTotals.descuentos)}</p>
                        </div>
                    </div>
                    <p className="text-[10px] text-white/40 mt-2">
                        Histórico completo, neto de recargos · el patrimonio es la suma de todos tus movimientos
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

            {/* Tendencia 12 meses + Evolución por año (siempre historial completo) */}
            {(trend12.rows.length > 1 || porAnio.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
                    {trend12.rows.length > 1 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col" style={{ height: 300 }}>
                            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                <h2 className="text-base font-bold text-brand-primary flex items-center gap-2">
                                    <Activity className="h-5 w-5" /> Tendencia Mensual · últimos {trend12.rows.length} meses
                                </h2>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${trend12.deltaPct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                                    Último mes: {trend12.deltaPct >= 0 ? '+' : ''}{trend12.deltaPct.toFixed(0)}% vs promedio
                                </span>
                            </div>
                            <div className="flex-1 min-h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trend12.rows} margin={{ top: 26, right: 24, left: 8, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={52} />
                                        <RTooltip formatter={(v) => fmt(v)} labelFormatter={(l) => `Mes ${l}`} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                                        {trend12.avg > 0 && <ReferenceLine y={trend12.avg} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `Prom: ${fmt(trend12.avg)}`, position: 'insideTopRight', fill: '#94a3b8', fontSize: 10 }} />}
                                        <Line type="monotone" dataKey="valor" name="Neto acreditado" stroke="#166534" strokeWidth={2.5} dot={{ fill: '#166534', r: 4 }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">Capital neto acreditado mes a mes (fecha de consignación). La línea punteada es tu promedio del período.</p>
                        </div>
                    )}
                    {porAnio.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col" style={{ height: 300 }}>
                            <h2 className="text-base font-bold text-brand-primary flex items-center gap-2 mb-2">
                                <BarChart3 className="h-5 w-5" /> Evolución de Ahorros por Año
                            </h2>
                            <div className="flex-1 min-h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={porAnio} margin={{ top: 26, right: 20, left: 8, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `$${(v / 1000000).toFixed(1)}M` : '$0'} tick={{ fill: '#9ca3af', fontSize: 10 }} width={48} />
                                        <RTooltip formatter={(v) => [fmt(v), 'Ahorros']} cursor={{ fill: 'rgba(22,101,52,0.06)' }} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                                        <Bar dataKey="ahorros" fill="#166534" radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="ahorros" position="top" fill="#052e16" fontSize={10} fontWeight="bold" formatter={(v) => fmt(v)} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">Ahorro neto acreditado por año (incluye devoluciones en negativo). Unidad: $ COP.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Extracto de movimientos con saldo corrido */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                    <div>
                        <h2 className="text-base font-bold text-gray-800">Extracto de movimientos</h2>
                        <p className="text-[11px] text-gray-400">
                            Todos tus movimientos con el fondo en una sola línea de tiempo, con saldo corrido
                            {yearFilter !== 'Todos' ? ` · mostrando ${yearFilter}` : ''} · {visibles.length} registro{visibles.length === 1 ? '' : 's'}
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5 flex-wrap print:hidden">
                        {[['Todos', 'Todos'], ['ahorro', 'Ahorros'], ['aporte', 'Aportes'], ['distribucion', 'Distribución de intereses'], ['devolucion', 'Devolución anual'], ['descuento', 'Descuentos']].map(([val, label]) => (
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

                {/* Resúmenes por pestaña. Solo aparecen en la suya: en la vista
                    general serían cifras sueltas sin contexto. El resumen cubre
                    todo el historial y la tabla obedece al filtro de año, así que
                    cuando hay un año elegido se dice, o las dos cifras parecerían
                    contradecirse. */}
                {(() => {
                    const notaAnio = yearFilter !== 'Todos'
                        ? `El resumen cubre todo tu historial. Abajo estás viendo solo el detalle de ${yearFilter}.`
                        : null;
                    const tarjetasDe = (resumen) => resumen.lista.map(d => ({
                        clave: d.anio ?? 'sin-fecha',
                        titulo: d.anio ?? 'Sin fecha',
                        valor: d.total,
                        detalle: `${d.veces} movimiento${d.veces === 1 ? '' : 's'}`,
                    }));

                    if (tipoFilter === 'distribucion') {
                        return distribucionesPorAnio.lista.length === 0 ? (
                            <VacioPestana
                                titulo="Todavía no tienes intereses distribuidos."
                                detalle="Cada año el fondo reparte entre los socios los intereses que generó el ahorro."
                            />
                        ) : (
                            <ResumenPestana
                                tono="sky"
                                rotulo="Total de intereses distribuidos"
                                total={distribucionesPorAnio.total}
                                explicacion="Es tu parte de los intereses que generó el fondo. Se reparte entre todos los socios según lo que cada uno tenga ahorrado."
                                tarjetas={tarjetasDe(distribucionesPorAnio)}
                                nota={notaAnio}
                            />
                        );
                    }

                    if (tipoFilter === 'devolucion') {
                        return devolucionesPorAnio.lista.length === 0 ? (
                            <VacioPestana
                                titulo="No has solicitado devolución de ahorros."
                                detalle="Aquí aparecerá el valor que el fondo te entregue el año en que la solicites."
                            />
                        ) : (
                            <ResumenPestana
                                tono="emerald"
                                rotulo="Total devuelto por el fondo"
                                total={devolucionesPorAnio.total}
                                explicacion="Es el ahorro que pediste que te devolvieran. En el detalle de abajo va en negativo porque sale de tu saldo acumulado."
                                tarjetas={tarjetasDe(devolucionesPorAnio)}
                                nota={notaAnio}
                            />
                        );
                    }

                    if (tipoFilter === 'descuento') {
                        return descuentosResumen.total === 0 ? (
                            <VacioPestana
                                titulo="Nunca has pagado recargos."
                                detalle="Ni descuentos anuales ni penalizaciones por pagar tarde. Disciplina perfecta."
                            />
                        ) : (
                            <ResumenPestana
                                tono="orange"
                                rotulo="Lo que te ha costado pagar tarde"
                                total={descuentosResumen.total}
                                explicacion="Suma el descuento anual y las penalizaciones que se le restaron a cada abono. Es dinero que perdiste, no algo que el fondo te haya entregado."
                                tarjetas={[
                                    {
                                        clave: 'anual',
                                        titulo: 'Descuento anual',
                                        valor: descuentosResumen.totalAnual,
                                        detalle: `${descuentosResumen.vecesAnual} movimiento${descuentosResumen.vecesAnual === 1 ? '' : 's'}`,
                                    },
                                    {
                                        clave: 'recargos',
                                        titulo: 'Penalizaciones',
                                        valor: descuentosResumen.totalRecargos,
                                        detalle: descuentosResumen.vecesRecargo > 0
                                            ? `${descuentosResumen.vecesRecargo} abono(s) tarde · ${descuentosResumen.dias} día(s)`
                                            : 'Ninguna',
                                    },
                                ]}
                                nota={notaAnio}
                            />
                        );
                    }

                    return null;
                })()}

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
                                        <th className="px-3 py-3 text-right">Penalizaciones</th>
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
                                                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{tieneBruto(r.tipo) ? fmt(r.bruto) : '—'}</td>
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
                                                <p className="text-[10px] text-red-500 mt-0.5">Penalizaciones −{fmt(r.recargo)}{r.dias > 0 ? ` · ${r.dias} día(s) tarde` : ''}</p>
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


            {/* Definiciones */}
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
                <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                    <b className="text-gray-600">Definiciones:</b> <b>Pagado (bruto)</b> = valor que consignaste. <b>Acreditado (neto)</b> = lo que suma a tu patrimonio (bruto menos penalizaciones por mora).
                    La <b>distribución de intereses</b> es tu parte de lo que rindió el fondo y la reciben todos los socios; la <b>devolución de ahorros</b> es distinta: solo la recibe quien la solicita, y es el ahorro que se le entrega.
                    Ambas se totalizan en positivo en su pestaña —que es lo que recibiste— aunque en el extracto puedan ir en negativo, porque salen de tu saldo acumulado.
                    Un <b>descuento</b> es lo contrario: dinero que se te resta por pagar tarde. Su pestaña reúne el descuento anual y las penalizaciones de cada abono, que es todo lo que te ha costado pagar fuera de plazo.
                    El saldo corrido se calcula sobre tu historial completo; el filtro por año solo cambia qué movimientos y gráficos ves.
                    La tendencia mensual usa el <b>mes abonado</b> (el período que cubre cada pago), no la fecha de consignación.
                </p>
            </div>
        </div>
    );
};

export default DetalleCuentaPage;
