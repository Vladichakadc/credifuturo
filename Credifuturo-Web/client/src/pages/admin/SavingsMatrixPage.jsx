import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Grid3x3, RefreshCw, Download, Search, X, Users, CalendarCheck,
    AlertTriangle, Wallet, TrendingUp, CheckCircle2, Info, ChevronDown,
} from 'lucide-react';
import api from '../../config/api';
import { useUi } from '../../context/UiContext';
import { Button } from '../../components/ui/Button';
import { exportToExcel } from '../../utils/excelUtils';

/**
 * Matriz de control de ahorros: socios en las filas, meses en las columnas.
 *
 * ── QUÉ RESUELVE ─────────────────────────────────────────────────────
 *
 * La lista de ahorros responde "qué movimientos hubo"; esta pantalla responde
 * "quién no ha aportado". Son preguntas distintas y la segunda no se puede
 * contestar leyendo una lista: hay que ver los doce meses de cada socio a la
 * vez. De ahí la rejilla.
 *
 * ── TRES ESTADOS, NO DOS ─────────────────────────────────────────────
 *
 * Lo natural sería pintar verde donde hay aporte y rojo donde no, pero eso
 * marcaría en rojo diciembre en pleno agosto. Un mes que aún no ha vencido no
 * es una falta: es un mes que no ha llegado. Por eso hay un tercer estado,
 * neutro, para lo que está por venir — sin él la matriz se llena de alarmas
 * falsas y deja de servir para lo único que sirve, que es detectar las de
 * verdad.
 *
 * ── DOS CIFRAS POR CELDA ─────────────────────────────────────────────
 *
 * El servidor devuelve el abono del socio y el neto del mes por separado.
 * Mezclarlos escondería faltas: a un socio que no aportó en marzo pero recibió
 * una devolución ese mes, el neto le daría un número y la celda se pintaría
 * verde. El modo "Abonos" es el de control; el modo "Neto" es el que cuadra
 * con el ahorro acumulado.
 */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
/** En las celdas no cabe el número entero: se abrevia sin perder la magnitud. */
const compacto = (n) => {
    const v = Math.round(Number(n) || 0);
    const abs = Math.abs(v);
    if (abs === 0) return '0';
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
    if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
    return String(v);
};

/**
 * Intensidad del verde según lo aportado frente a lo habitual del propio socio.
 *
 * Un verde plano confirma que hubo aporte y nada más. Graduarlo contra la
 * mediana del socio convierte la rejilla en un diagnóstico: se ve quién aportó
 * de menos sin dejar de aportar, que es la señal que precede a una mora.
 */
function tonoVerde(valor, referencia) {
    if (!(referencia > 0)) return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    const r = valor / referencia;
    if (r >= 1.35) return 'bg-emerald-700 text-white border-emerald-800';
    if (r >= 0.95) return 'bg-emerald-500 text-white border-emerald-600';
    if (r >= 0.6) return 'bg-emerald-200 text-emerald-900 border-emerald-300';
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
}

const mediana = (nums) => {
    const v = nums.filter((n) => n > 0).sort((a, b) => a - b);
    if (v.length === 0) return 0;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Tarjeta de resumen. Comparte lenguaje con el resto del panel, pero con la cifra en mono. */
function Tarjeta({ icon: Icon, titulo, valor, nota, acento = 'emerald', alerta = false }) {
    const tonos = {
        emerald: 'text-emerald-600 bg-emerald-50 ring-emerald-100',
        amber: 'text-amber-600 bg-amber-50 ring-amber-100',
        rose: 'text-rose-600 bg-rose-50 ring-rose-100',
        slate: 'text-slate-600 bg-slate-100 ring-slate-200',
    };
    return (
        <div className={`rounded-xl border bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover ${alerta ? 'border-rose-200' : 'border-ui-border'}`}>
            <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{titulo}</p>
                <span className={`rounded-lg p-1.5 ring-1 ${tonos[acento]}`}><Icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-brand-dark">{valor}</p>
            {nota && <p className="mt-1 text-xs leading-snug text-gray-500">{nota}</p>}
        </div>
    );
}

export default function SavingsMatrixPage() {
    const { toast } = useUi();
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    const [anio, setAnio] = useState(null);          // null hasta la primera carga
    const [modo, setModo] = useState('abonos');       // 'abonos' | 'neto'
    const [busqueda, setBusqueda] = useState('');
    const [mesFoco, setMesFoco] = useState(null);     // 1..12, o null para todos
    const [soloFaltantes, setSoloFaltantes] = useState(false);
    const [soloActivos, setSoloActivos] = useState(true);
    const [orden, setOrden] = useState({ campo: 'nombre', dir: 'asc' });
    const [celda, setCelda] = useState(null);         // {socio, mes} — detalle
    const [cruz, setCruz] = useState({ fila: null, col: null });
    const contenedor = useRef(null);

    const cargar = useCallback(async (anioPedido) => {
        setCargando(true);
        setError(null);
        try {
            const q = anioPedido === 'todos' ? '?anio=todos' : anioPedido ? `?anio=${anioPedido}` : '';
            const res = await api.get(`/admin/savings/matriz${q}`);
            if (!res.data?.ok) throw new Error(res.data?.error || 'Respuesta inesperada del servidor');
            setDatos(res.data);
            if (anio === null) setAnio(res.data.anio ?? 'todos');
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'No se pudo cargar la matriz');
            setDatos(null);
        } finally {
            setCargando(false);
        }
        // `anio` solo se usa para sembrar el valor inicial; incluirlo recargaría en bucle.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { cargar(null); }, [cargar]);

    const cambiarAnio = (nuevo) => { setAnio(nuevo); cargar(nuevo); };

    // ── Filas visibles ────────────────────────────────────────────────
    const filas = useMemo(() => {
        if (!datos) return [];
        const q = busqueda.trim().toLowerCase();
        let f = datos.data.filter((s) => {
            if (soloActivos && s.estatus !== 'Activo') return false;
            if (q && !`${s.nombre} ${s.cedula} ${s.customerId}`.toLowerCase().includes(q)) return false;
            return true;
        });

        // Un socio sin un solo movimiento en toda su historia no es un faltante:
        // es un registro que nunca ahorró (el propio admin, por ejemplo).
        f = f.filter((s) => s.historico !== 0 || s.totalAnio !== 0);

        const faltaEn = (s, m) => s.meses[m - 1].abonos <= 0 && m <= datos.mesLimite;
        if (soloFaltantes) {
            f = f.filter((s) => (mesFoco ? faltaEn(s, mesFoco) : s.meses.some((_, i) => faltaEn(s, i + 1))));
        }
        if (mesFoco) f = f.filter((s) => s.meses[mesFoco - 1].n > 0 || faltaEn(s, mesFoco));

        const valor = (s) => {
            if (orden.campo === 'nombre') return s.nombre.toLowerCase();
            if (orden.campo === 'total') return modo === 'neto' ? s.totalAnio : s.abonosAnio;
            if (orden.campo === 'historico') return s.historico;
            if (orden.campo === 'cobertura') return s.mesesConAbono;
            if (typeof orden.campo === 'number') return s.meses[orden.campo][modo];
            return 0;
        };
        return [...f].sort((a, b) => {
            const va = valor(a); const vb = valor(b);
            const cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
            return orden.dir === 'asc' ? cmp : -cmp;
        });
    }, [datos, busqueda, soloActivos, soloFaltantes, mesFoco, orden, modo]);

    // ── Resumen ───────────────────────────────────────────────────────
    const resumen = useMemo(() => {
        if (!datos) return null;
        const lim = datos.mesLimite;
        const totalPeriodo = filas.reduce((s, f) => s + (modo === 'neto' ? f.totalAnio : f.abonosAnio), 0);
        const historico = filas.reduce((s, f) => s + f.historico, 0);
        const huecos = filas.reduce((s, f) => s + f.meses.filter((c, i) => c.abonos <= 0 && i + 1 <= lim).length, 0);
        const alDia = filas.filter((f) => f.meses.every((c, i) => i + 1 > lim || c.abonos > 0)).length;
        const conceptos = filas.reduce((s2, f) => s2 + f.meses.reduce((a, c) => a + c.conceptos, 0), 0);
        const mesRef = mesFoco || lim;
        const delMes = mesRef >= 1 ? filas.reduce((s, f) => s + f.meses[mesRef - 1][modo], 0) : 0;
        const previo = mesRef >= 2 ? filas.reduce((s, f) => s + f.meses[mesRef - 2][modo], 0) : 0;
        const variacion = previo > 0 ? ((delMes - previo) / previo) * 100 : null;
        return {
            totalPeriodo, historico, huecos, alDia, mesRef, delMes, variacion, conceptos,
            celdasExigibles: filas.length * lim,
            cobertura: filas.length * lim > 0 ? ((filas.length * lim - huecos) / (filas.length * lim)) * 100 : 100,
            // El cuadre solo puede afirmarse mirando todos los años y en modo
            // neto: en modo abonos la fila suma únicamente lo que consignaron
            // los socios, y el acumulado del fondo incluye además devoluciones y
            // descuentos. La diferencia entre ambos no es un descuadre, es esa
            // partida — y decirlo vale más que esconderla.
            cuadra: anio === 'todos' && modo === 'neto' && Math.abs(totalPeriodo - historico) < 1,
            explicaDiferencia: anio === 'todos' && modo === 'abonos'
                && Math.abs(totalPeriodo + conceptos - historico) < 1,
        };
    }, [datos, filas, modo, mesFoco, anio]);

    const ordenar = (campo) => setOrden((o) => ({
        campo,
        dir: o.campo === campo && o.dir === 'asc' ? 'desc' : 'asc',
    }));

    const exportar = () => {
        if (!datos) return;
        const etiqueta = anio === 'todos' ? 'historico' : anio;
        exportToExcel(
            filas.map((f) => ({
                Socio: f.nombre,
                Cédula: f.cedula,
                'Id Socio': f.customerId,
                ...Object.fromEntries(MESES_LARGOS.map((m, i) => [m, f.meses[i][modo]])),
                'Total período': modo === 'neto' ? f.totalAnio : f.abonosAnio,
                'Acumulado histórico': f.historico,
                'Meses con aporte': f.mesesConAbono,
            })),
            `matriz_ahorros_${etiqueta}`,
            'Matriz de Ahorros',
            Object.fromEntries([...MESES_LARGOS, 'Total período', 'Acumulado histórico']
                .map((c) => [c, '"$"#,##0']))
        );
        toast.success('Matriz exportada.');
    };

    const totalesColumna = useMemo(() => (
        Array.from({ length: 12 }, (_, i) => ({
            valor: filas.reduce((s, f) => s + f.meses[i][modo], 0),
            socios: filas.filter((f) => f.meses[i].abonos > 0).length,
        }))
    ), [filas, modo]);

    if (error) {
        return (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
                <p className="font-semibold text-rose-900">No se pudo cargar la matriz de ahorros</p>
                <p className="mt-1 text-sm text-rose-800">{error}</p>
                <Button className="mt-4" size="sm" onClick={() => cargar(anio)}>Reintentar</Button>
            </div>
        );
    }

    const lim = datos?.mesLimite ?? 12;

    return (
        <div className="space-y-6">
            {/* ── Encabezado ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="rounded-lg bg-brand-primary/10 p-2 text-brand-primary ring-1 ring-brand-primary/15">
                            <Grid3x3 className="h-5 w-5" />
                        </span>
                        <h1 className="text-2xl font-bold text-brand-primary">Matriz de Ahorros</h1>
                    </div>
                    <p className="mt-1.5 max-w-2xl text-sm text-gray-600">
                        Control mes a mes del ahorro de cada socio. En verde lo aportado, en rojo el mes vencido sin
                        aporte, y en gris el que todavía no ha llegado.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => cargar(anio)} className="gap-1.5" disabled={cargando}>
                        <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
                    </Button>
                    <Button size="sm" onClick={exportar} className="gap-1.5" disabled={!datos || filas.length === 0}>
                        <Download className="h-3.5 w-3.5" /> Exportar Excel
                    </Button>
                </div>
            </div>

            {/* ── Tarjetas de resumen ────────────────────────────────── */}
            {resumen && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <Tarjeta
                        icon={Wallet}
                        titulo={anio === 'todos' ? 'Ahorro histórico' : `Ahorro ${anio}`}
                        valor={pesos(resumen.totalPeriodo)}
                        nota={modo === 'neto' ? 'Neto, con devoluciones y descuentos' : 'Solo abonos de los socios'}
                    />
                    <Tarjeta
                        icon={CalendarCheck}
                        titulo="Cobertura del período"
                        valor={`${resumen.cobertura.toFixed(1)}%`}
                        nota={`${resumen.celdasExigibles - resumen.huecos} de ${resumen.celdasExigibles} meses-socio cubiertos`}
                        acento={resumen.cobertura >= 95 ? 'emerald' : 'amber'}
                    />
                    <Tarjeta
                        icon={AlertTriangle}
                        titulo="Meses sin aporte"
                        valor={resumen.huecos.toLocaleString('es-CO')}
                        nota={resumen.huecos > 0 ? 'Casillas rojas por revisar' : 'Ningún mes vencido sin aporte'}
                        acento={resumen.huecos > 0 ? 'rose' : 'emerald'}
                        alerta={resumen.huecos > 0}
                    />
                    <Tarjeta
                        icon={Users}
                        titulo="Socios al día"
                        valor={`${resumen.alDia} / ${filas.length}`}
                        nota="Sin ningún mes vencido en descubierto"
                        acento={resumen.alDia === filas.length ? 'emerald' : 'amber'}
                    />
                    <Tarjeta
                        icon={TrendingUp}
                        titulo={resumen.mesRef >= 1 ? `Recaudo de ${MESES_LARGOS[resumen.mesRef - 1]}` : 'Recaudo del mes'}
                        valor={pesos(resumen.delMes)}
                        nota={resumen.variacion === null ? 'Sin mes anterior con qué comparar'
                            : `${resumen.variacion >= 0 ? '+' : ''}${resumen.variacion.toFixed(1)}% frente al mes anterior`}
                        acento={resumen.variacion === null || resumen.variacion >= 0 ? 'emerald' : 'amber'}
                    />
                </div>
            )}

            {/* ── Filtros ────────────────────────────────────────────── */}
            <div className="rounded-xl border border-ui-border bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-end gap-4">
                    <label className="min-w-[240px] flex-1">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Socio, cédula o id</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar socio…"
                                className="w-full rounded-lg border border-ui-border py-2 pl-9 pr-8 text-sm outline-none transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
                            />
                            {busqueda && (
                                <button onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </label>

                    <label>
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Año</span>
                        <div className="relative">
                            <select
                                value={anio ?? ''}
                                onChange={(e) => cambiarAnio(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
                                className="appearance-none rounded-lg border border-ui-border py-2 pl-3 pr-9 text-sm font-medium outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
                            >
                                {(datos?.anios || []).map((a) => <option key={a} value={a}>{a}</option>)}
                                <option value="todos">Todos los años</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        </div>
                    </label>

                    <label>
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Mes</span>
                        <div className="relative">
                            <select
                                value={mesFoco ?? ''}
                                onChange={(e) => setMesFoco(e.target.value ? Number(e.target.value) : null)}
                                className="appearance-none rounded-lg border border-ui-border py-2 pl-3 pr-9 text-sm font-medium outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
                            >
                                <option value="">Todos los meses</option>
                                {MESES_LARGOS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        </div>
                    </label>

                    <div>
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Cifra</span>
                        <div className="flex rounded-lg border border-ui-border p-0.5">
                            {[['abonos', 'Abonos'], ['neto', 'Neto']].map(([v, etiqueta]) => (
                                <button
                                    key={v}
                                    onClick={() => setModo(v)}
                                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${modo === v ? 'bg-brand-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    {etiqueta}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pb-0.5">
                        {[
                            [soloFaltantes, setSoloFaltantes, 'Solo con faltantes'],
                            [soloActivos, setSoloActivos, 'Solo socios activos'],
                        ].map(([valor, set, etiqueta]) => (
                            <button
                                key={etiqueta}
                                onClick={() => set(!valor)}
                                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${valor
                                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                    : 'border-ui-border text-gray-600 hover:border-gray-300'}`}
                            >
                                {etiqueta}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Leyenda: sin ella la rejilla es un mosaico de colores sin significado. */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ui-border pt-3 text-xs text-gray-600">
                    <span className="font-semibold uppercase tracking-wider text-gray-500">Lectura</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-700" /> por encima de lo habitual</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-500" /> aporte habitual</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-200" /> por debajo</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-rose-500" /> mes vencido sin aporte</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-gray-100 ring-1 ring-inset ring-gray-200" /> aún no vence</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-amber-100 ring-1 ring-inset ring-amber-300" /> movimiento del fondo</span>
                </div>
            </div>

            {/* ── La matriz ──────────────────────────────────────────── */}
            <div className="overflow-hidden rounded-xl border border-ui-border bg-white shadow-card">
                {cargando ? (
                    <div className="space-y-2 p-6">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-9 animate-pulse rounded bg-gray-100" style={{ animationDelay: `${i * 60}ms` }} />
                        ))}
                    </div>
                ) : filas.length === 0 ? (
                    <div className="p-12 text-center">
                        <Grid3x3 className="mx-auto h-10 w-10 text-gray-300" />
                        <p className="mt-3 font-medium text-gray-700">No hay socios que mostrar</p>
                        <p className="mt-1 text-sm text-gray-500">Prueba a quitar algún filtro.</p>
                    </div>
                ) : (
                    <div ref={contenedor} className="max-h-[68vh] overflow-auto" onMouseLeave={() => setCruz({ fila: null, col: null })}>
                        <table className="w-full border-separate border-spacing-0 text-sm">
                            <thead>
                                <tr>
                                    <th
                                        onClick={() => ordenar('nombre')}
                                        className="sticky left-0 top-0 z-30 min-w-[230px] cursor-pointer border-b border-r border-ui-border bg-brand-dark px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-white/90 hover:text-white"
                                    >
                                        Socio
                                    </th>
                                    {MESES.map((m, i) => (
                                        <th
                                            key={m}
                                            onClick={() => ordenar(i)}
                                            onMouseEnter={() => setCruz((c) => ({ ...c, col: i }))}
                                            className={`sticky top-0 z-20 min-w-[74px] cursor-pointer border-b border-ui-border px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider transition-colors
                                                ${cruz.col === i ? 'bg-brand-primary text-white' : 'bg-brand-dark text-white/90'}
                                                ${i + 1 > lim ? 'opacity-60' : ''}`}
                                        >
                                            {m}
                                        </th>
                                    ))}
                                    <th
                                        onClick={() => ordenar('total')}
                                        className="sticky right-[138px] top-0 z-30 w-[128px] min-w-[128px] cursor-pointer border-b border-l border-white/15 bg-brand-dark px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-white/90 hover:text-white"
                                    >
                                        Total {anio === 'todos' ? '' : anio}
                                    </th>
                                    <th
                                        onClick={() => ordenar('historico')}
                                        className="sticky right-0 top-0 z-30 w-[138px] min-w-[138px] cursor-pointer border-b border-l border-white/15 bg-brand-dark px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-white/90 hover:text-white"
                                    >
                                        Acumulado
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {filas.map((s, idx) => {
                                    const ref = mediana(s.meses.map((c) => c.abonos));
                                    const total = modo === 'neto' ? s.totalAnio : s.abonosAnio;
                                    const activa = cruz.fila === idx;
                                    return (
                                        <tr key={s.clientId} onMouseEnter={() => setCruz((c) => ({ ...c, fila: idx }))}>
                                            <th
                                                scope="row"
                                                className={`sticky left-0 z-10 border-b border-r border-ui-border px-4 py-2 text-left align-middle transition-colors
                                                    ${activa ? 'bg-emerald-50' : 'bg-white'}`}
                                            >
                                                <span className="block truncate font-semibold text-gray-800">{s.nombre}</span>
                                                <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] tabular-nums text-gray-500">
                                                    <span>#{s.customerId}</span>
                                                    <span className="text-gray-300">·</span>
                                                    <span>{s.cedula}</span>
                                                    {s.estatus !== 'Activo' && (
                                                        <span className="rounded bg-gray-100 px-1.5 font-sans text-[10px] font-medium text-gray-500">
                                                            {s.estatus}
                                                        </span>
                                                    )}
                                                </span>
                                            </th>

                                            {s.meses.map((c, i) => {
                                                const valor = c[modo];
                                                const vencido = i + 1 <= lim;
                                                const hayAbono = c.abonos > 0;
                                                const soloConcepto = !hayAbono && c.n > 0;
                                                const enCruz = cruz.col === i || activa;

                                                let clases;
                                                let contenido;
                                                if (hayAbono) {
                                                    clases = tonoVerde(c.abonos, ref);
                                                    contenido = compacto(valor);
                                                } else if (soloConcepto) {
                                                    // Hubo movimiento del fondo pero el socio no aportó: ni verde
                                                    // ni rojo, porque las dos lecturas serían falsas.
                                                    clases = 'bg-amber-100 text-amber-900 border-amber-300';
                                                    contenido = compacto(c.neto);
                                                } else if (vencido) {
                                                    clases = 'bg-rose-500 text-white border-rose-600';
                                                    contenido = '—';
                                                } else {
                                                    clases = 'bg-gray-50 text-gray-300 border-gray-100';
                                                    contenido = '·';
                                                }

                                                return (
                                                    <td
                                                        key={i}
                                                        onMouseEnter={() => setCruz({ fila: idx, col: i })}
                                                        onClick={() => (c.n > 0 || vencido) && setCelda({ socio: s, mes: i + 1 })}
                                                        title={`${s.nombre} · ${MESES_LARGOS[i]}\n${hayAbono ? `Abonó ${pesos(c.abonos)}` : vencido ? 'Sin aporte' : 'Mes no vencido'}${c.conceptos ? `\nMovimientos del fondo: ${pesos(c.conceptos)}` : ''}`}
                                                        className={`cursor-pointer border-b border-r p-0 text-center transition-[filter] ${enCruz ? 'brightness-105' : ''}`}
                                                    >
                                                        <span className={`m-[3px] flex h-8 items-center justify-center rounded-md border font-mono text-[12px] font-semibold tabular-nums ${clases}`}>
                                                            {contenido}
                                                        </span>
                                                    </td>
                                                );
                                            })}

                                            <td className={`sticky right-[138px] z-10 border-b border-l border-ui-border px-3 py-2 text-right font-mono text-[13px] font-bold tabular-nums text-brand-dark ${activa ? 'bg-emerald-50' : 'bg-white'}`}>
                                                {pesos(total)}
                                            </td>
                                            <td className={`sticky right-0 z-10 border-b border-l border-ui-border px-3 py-2 text-right font-mono text-[13px] tabular-nums text-gray-600 ${activa ? 'bg-emerald-50' : 'bg-white'}`}>
                                                {pesos(s.historico)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>

                            {/* Totales por columna: la otra mitad del control — cuánto entró
                                al fondo cada mes y de cuántos socios vino. */}
                            <tfoot>
                                <tr>
                                    <th className="sticky bottom-0 left-0 z-30 border-t-2 border-r border-brand-primary bg-emerald-50 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-brand-dark">
                                        Total del mes
                                    </th>
                                    {totalesColumna.map((t, i) => (
                                        <td key={i} className={`sticky bottom-0 z-20 border-t-2 border-r border-brand-primary px-2 py-2 text-center ${cruz.col === i ? 'bg-emerald-100' : 'bg-emerald-50'}`}>
                                            <span className="block font-mono text-[12px] font-bold tabular-nums text-brand-dark">{compacto(t.valor)}</span>
                                            <span className="block font-mono text-[10px] tabular-nums text-emerald-700">{t.socios} soc.</span>
                                        </td>
                                    ))}
                                    <td className="sticky bottom-0 right-[138px] z-30 border-l border-t-2 border-brand-primary bg-emerald-50 px-3 py-2 text-right font-mono text-[13px] font-bold tabular-nums text-brand-dark">
                                        {pesos(resumen?.totalPeriodo || 0)}
                                    </td>
                                    <td className="sticky bottom-0 right-0 z-30 border-l border-t-2 border-brand-primary bg-emerald-50 px-3 py-2 text-right font-mono text-[13px] font-bold tabular-nums text-brand-dark">
                                        {pesos(resumen?.historico || 0)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* Cuadre: la suma de los doce meses tiene que dar el acumulado del fondo.
                Con un año concreto no puede cuadrar —falta el resto de años—, así que
                la comprobación solo se afirma cuando se miran todos. */}
            {resumen && (
                <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm ${resumen.cuadra || resumen.explicaDiferencia
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-ui-border bg-white text-gray-600'}`}>
                    {resumen.cuadra || resumen.explicaDiferencia
                        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        : <Info className="h-5 w-5 shrink-0 text-gray-400" />}
                    {resumen.cuadra ? (
                        <p>
                            <strong className="font-semibold">Cuadra.</strong> La suma de los doce meses —
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.totalPeriodo)}</span> — coincide
                            exactamente con lo ahorrado por estos socios desde que se creó el fondo.
                        </p>
                    ) : resumen.explicaDiferencia ? (
                        <p>
                            <strong className="font-semibold">Cuadra.</strong> Los socios consignaron
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.totalPeriodo)}</span>; el fondo movió
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.conceptos)}</span> en devoluciones y descuentos,
                            y de ahí sale el acumulado de
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.historico)}</span>.
                            {' '}Cambia a «Neto» para verlo mes a mes.
                        </p>
                    ) : anio === 'todos' ? (
                        <p>
                            La suma de los meses da
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.totalPeriodo)}</span> frente a un acumulado de
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.historico)}</span>.
                            {' '}Hay una diferencia de
                            <span className="font-mono font-semibold tabular-nums"> {pesos(Math.abs(resumen.historico - resumen.totalPeriodo))}</span> que
                            no explican los movimientos del fondo: conviene revisar los registros con mes o año sin acreditar.
                        </p>
                    ) : (
                        <p>
                            Estás viendo el año {anio}, así que la fila suma solo ese ejercicio:
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.totalPeriodo)}</span> frente a un acumulado histórico de
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.historico)}</span>.
                            {' '}Elige «Todos los años» para comprobar que la matriz cuadra con el acumulado del fondo.
                        </p>
                    )}
                </div>
            )}

            {/* ── Detalle de una celda ───────────────────────────────── */}
            {celda && (
                <DetalleCelda
                    socio={celda.socio}
                    mes={celda.mes}
                    anio={anio}
                    onCerrar={() => setCelda(null)}
                />
            )}
        </div>
    );
}

/**
 * Qué hay detrás de una casilla.
 *
 * Una celda sin explicación obliga a irse a la lista de ahorros y buscar a mano;
 * el detalle trae los movimientos de ese socio en ese mes, que es lo que hace
 * falta para decidir si la casilla roja es un olvido o un error de registro.
 */
function DetalleCelda({ socio, mes, anio, onCerrar }) {
    const [movs, setMovs] = useState(null);
    const celda = socio.meses[mes - 1];

    useEffect(() => {
        let vivo = true;
        api.get('/admin/savings/list', { params: { clientId: socio.clientId } })
            .then((r) => {
                if (!vivo) return;
                const todos = r.data?.data || r.data || [];
                setMovs(todos.filter((m) => {
                    const mm = Number(m.mesAbonado || m.monthInt || 0);
                    const aa = Number(m.anioAbonado || m.year || 0);
                    return mm === mes && (anio === 'todos' || aa === Number(anio));
                }));
            })
            .catch(() => vivo && setMovs([]));
        return () => { vivo = false; };
    }, [socio.clientId, mes, anio]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onCerrar}>
            <div
                className="max-h-[85vh] w-full overflow-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl animate-slide-up"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-ui-border bg-brand-dark px-5 py-4 text-white">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                            {MESES_LARGOS[mes - 1]} {anio === 'todos' ? '· todos los años' : anio}
                        </p>
                        <h3 className="mt-0.5 text-lg font-bold">{socio.nombre}</h3>
                    </div>
                    <button onClick={onCerrar} className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-px border-b border-ui-border bg-ui-border">
                    {[
                        ['Abonó', celda.abonos, 'text-emerald-700'],
                        ['Movimientos del fondo', celda.conceptos, celda.conceptos < 0 ? 'text-rose-600' : 'text-gray-700'],
                        ['Neto del mes', celda.neto, 'text-brand-dark'],
                    ].map(([etiqueta, valor, color]) => (
                        <div key={etiqueta} className="bg-white p-3 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{etiqueta}</p>
                            <p className={`mt-1 font-mono text-sm font-bold tabular-nums ${color}`}>{pesos(valor)}</p>
                        </div>
                    ))}
                </div>

                <div className="p-5">
                    {movs === null ? (
                        <div className="space-y-2">
                            {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />)}
                        </div>
                    ) : movs.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
                            <p className="text-sm font-medium text-gray-700">Sin movimientos registrados en este mes</p>
                            <p className="mt-1 text-xs text-gray-500">
                                Si el socio sí aportó, el registro puede estar acreditado a otro mes.
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {movs.map((m) => (
                                <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-ui-border p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-gray-800">{m.status || 'Ahorro mensual'}</p>
                                        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-gray-500">
                                            {m.monthInt}/{m.year}
                                            {m.diasPenalizacion > 0 && ` · ${m.diasPenalizacion} días de retraso`}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${Number(m.valorAhorrado ?? m.amount) < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                        {pesos(m.valorAhorrado ?? m.amount)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
