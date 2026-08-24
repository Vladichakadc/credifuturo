import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Grid3x3, RefreshCw, Download, Search, X, Landmark, CalendarCheck,
    AlertTriangle, Wallet, TrendingUp, CheckCircle2, Info, ChevronDown, Clock,
} from 'lucide-react';
import api from '../../config/api';
import { useUi } from '../../context/UiContext';
import { Button } from '../../components/ui/Button';
import { exportToExcel } from '../../utils/excelUtils';

/**
 * Matriz de control de cuotas: préstamos en las filas, meses en las columnas.
 *
 * Es la hermana de la matriz de ahorros y comparte su estructura y su lectura,
 * pero el dominio obliga a dos diferencias que no son cosméticas.
 *
 * ── LA FILA ES EL PRÉSTAMO, NO EL SOCIO ──────────────────────────────
 *
 * Un socio con dos créditos tiene dos cuotas en el mismo mes. Sumarlas en una
 * celda daría un número y borraría lo único que se viene a mirar: si cada una
 * está pagada. Por eso cada fila es un crédito, con el nombre del socio como
 * etiqueta.
 *
 * ── UNA CASILLA VACÍA NO ES UNA FALTA ────────────────────────────────
 *
 * En ahorros, un mes vencido sin movimiento es un socio que no aportó. En
 * préstamos puede ser, simplemente, que ese crédito no tenía cuota ese mes:
 * empezó en julio, o ya terminó. Pintarlo de rojo acusaría al socio de no pagar
 * algo que nunca debió. De ahí que el estado se decida mirando primero si HAY
 * cuota y solo después si está pagada.
 */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const compacto = (n) => {
    const v = Math.round(Number(n) || 0);
    const abs = Math.abs(v);
    if (abs === 0) return '0';
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
    if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
    return String(v);
};

/**
 * El estado de una casilla, en el orden en que hay que preguntárselo.
 *
 * El orden importa por dos motivos. El primero: si se preguntara antes que nada
 * "¿está pagada?", una casilla sin cuota caería en el "no" y se pintaría de
 * rojo, acusando al socio de no pagar algo que nunca debió.
 *
 * El segundo es más sutil y costó verlo. Un mes puede tener DOS cuotas del
 * mismo crédito —pasa con los retanqueos y con los cronogramas migrados—, y
 * bastaba con que una estuviera pagada para que la celda se pintara de verde y
 * escondiera la otra. El resumen contaba cinco cuotas en descubierto y la
 * rejilla no mostraba ninguna. Por eso lo primero que se mira es la COBERTURA:
 * cuántas de las cuotas del mes están cubiertas, no si alguna lo está.
 */
function estadoCelda(celda, mes, mesLimite) {
    if (celda.n === 0) return 'sin-cuota';
    const cubiertas = celda.pagadas + celda.prepago;
    if (cubiertas >= celda.n) {
        if (celda.prepago >= celda.n) return 'prepagada';
        return celda.excedente > 0 ? 'abono' : 'pagada';
    }
    if (celda.mora > 0) return 'mora';
    if (mes > mesLimite) return 'pendiente';
    // Vencido y con parte del mes sin cubrir: si algo se pagó, la casilla no
    // puede decir ni "pagada" ni "sin pagar" sin mentir en una de las dos.
    return cubiertas > 0 ? 'parcial' : 'vencida';
}

/**
 * Qué cifra enseña la casilla.
 *
 * Una cuota que todavía no se ha pagado no tiene "valor pagado": tiene valor a
 * pagar. Mostrar el cero de lo cobrado en una cuota pendiente no informa de
 * nada, y encima invita a leerla como si no debiera nada. Así que mientras la
 * cuota siga sin cubrirse, la casilla muestra lo que hay que pagar; cuando se
 * paga, pasa a mostrar lo que se pagó — y de gris a verde, que es la señal que
 * de verdad se busca al recorrer la rejilla.
 *
 * El interruptor Pagado/Programado gobierna los totales y las cuotas ya
 * cobradas, no esta regla: lo pendiente siempre se enseña como deuda.
 */
function contenidoCelda(estado, celda, modo) {
    if (estado === 'sin-cuota') return '';
    if (estado === 'prepagada') return '—';
    if (estado === 'parcial') return `${celda.pagadas + celda.prepago}/${celda.n}`;
    if (estado === 'pendiente' || estado === 'vencida' || estado === 'mora') return compacto(celda.programado);
    return compacto(modo === 'programado' ? celda.programado : celda.pagado);
}

const ESTILOS = {
    'abono': 'bg-emerald-700 text-white border-emerald-800',
    'pagada': 'bg-emerald-500 text-white border-emerald-600',
    'prepagada': 'bg-sky-100 text-sky-800 border-sky-300',
    'mora': 'bg-rose-600 text-white border-rose-700',
    'vencida': 'bg-rose-500 text-white border-rose-600',
    'parcial': 'bg-amber-100 text-amber-900 border-amber-400',
    'pendiente': 'bg-slate-50 text-slate-600 border-slate-300',
    'sin-cuota': 'bg-transparent text-gray-200 border-transparent',
};

/** El primer mes con cuota aún sin cubrir que todavía no ha vencido. */
function proximaDe(prestamo, mesLimite) {
    for (let i = mesLimite; i < 12; i++) {
        const c = prestamo.meses[i];
        if (c.n > 0 && c.pagadas + c.prepago < c.n) return i + 1;
    }
    return null;
}

function Tarjeta({ icon: Icon, titulo, valor, nota, acento = 'emerald', alerta = false }) {
    const tonos = {
        emerald: 'text-emerald-600 bg-emerald-50 ring-emerald-100',
        amber: 'text-amber-600 bg-amber-50 ring-amber-100',
        rose: 'text-rose-600 bg-rose-50 ring-rose-100',
        sky: 'text-sky-600 bg-sky-50 ring-sky-100',
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

export default function LoansMatrixPage() {
    const { toast } = useUi();
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    const [anio, setAnio] = useState(null);
    const [modo, setModo] = useState('pagado');       // 'pagado' | 'programado'
    const [busqueda, setBusqueda] = useState('');
    const [mesFoco, setMesFoco] = useState(null);
    const [soloMora, setSoloMora] = useState(false);
    const [soloVigentes, setSoloVigentes] = useState(true);
    const [orden, setOrden] = useState({ campo: 'socio', dir: 'asc' });
    const [cruz, setCruz] = useState({ fila: null, col: null });

    const cargar = useCallback(async (anioPedido) => {
        setCargando(true);
        setError(null);
        try {
            const q = anioPedido === 'todos' ? '?anio=todos' : anioPedido ? `?anio=${anioPedido}` : '';
            const res = await api.get(`/admin/payments/matriz${q}`);
            if (!res.data?.ok) throw new Error(res.data?.error || 'Respuesta inesperada del servidor');
            setDatos(res.data);
            setAnio((a) => (a === null ? (res.data.anio ?? 'todos') : a));
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'No se pudo cargar la matriz');
            setDatos(null);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(null); }, [cargar]);

    const cambiarAnio = (nuevo) => { setAnio(nuevo); cargar(nuevo); };

    const lim = datos?.mesLimite ?? 12;

    const filas = useMemo(() => {
        if (!datos) return [];
        const q = busqueda.trim().toLowerCase();
        let f = datos.data.filter((p) => {
            if (q && !`${p.socio} ${p.cedula} ${p.idVm}`.toLowerCase().includes(q)) return false;
            // Un crédito ya cancelado no ensucia el control del año en curso,
            // pero sigue disponible quitando el filtro.
            if (soloVigentes && p.saldoVigente <= 0) return false;
            return true;
        });

        const enDescubierto = (p, m) => {
            const c = p.meses[m - 1];
            return c.n > 0 && c.pagadas + c.prepago < c.n && m <= lim;
        };
        if (soloMora) {
            f = f.filter((p) => (mesFoco ? enDescubierto(p, mesFoco) : p.meses.some((_, i) => enDescubierto(p, i + 1))));
        }
        if (mesFoco) f = f.filter((p) => p.meses[mesFoco - 1].n > 0);

        const valor = (p) => {
            if (orden.campo === 'socio') return p.socio.toLowerCase();
            if (orden.campo === 'total') return modo === 'programado' ? p.programadoAnio : p.pagadoAnio;
            if (orden.campo === 'saldo') return p.saldoVigente;
            if (typeof orden.campo === 'number') return p.meses[orden.campo][modo];
            return 0;
        };
        return [...f].sort((a, b) => {
            const va = valor(a); const vb = valor(b);
            const cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
            return orden.dir === 'asc' ? cmp : -cmp;
        });
    }, [datos, busqueda, soloMora, soloVigentes, mesFoco, orden, modo, lim]);

    const resumen = useMemo(() => {
        if (!datos) return null;
        const total = filas.reduce((s, p) => s + (modo === 'programado' ? p.programadoAnio : p.pagadoAnio), 0);
        const programado = filas.reduce((s, p) => s + p.programadoAnio, 0);
        const cartera = filas.reduce((s, p) => s + p.saldoVigente, 0);
        const prestado = filas.reduce((s, p) => s + p.valorPrestado, 0);
        const intereses = filas.reduce((s, p) => s + p.interesTotal, 0);
        const programadoTotal = filas.reduce((s, p) => s + p.programadoTotal, 0);

        let exigibles = 0; let cubiertas = 0; let descubiertas = 0; let conAbono = 0;
        for (const p of filas) {
            p.meses.forEach((c, i) => {
                if (c.n === 0 || i + 1 > lim) return;
                exigibles += c.n;
                cubiertas += c.pagadas + c.prepago;
                descubiertas += c.n - c.pagadas - c.prepago;
                if (c.excedente > 0) conAbono += 1;
            });
        }
        // Lo que queda por cobrar: toda cuota sin cubrir, haya vencido o no.
        // Es la contrapartida de "recaudo" y lo que se mira para saber qué
        // entra en lo que queda de año.
        let porCobrar = 0; let proxima = null;
        for (const p of filas) {
            p.meses.forEach((c, i) => {
                if (c.n === 0 || c.pagadas + c.prepago >= c.n) return;
                porCobrar += c.programado * ((c.n - c.pagadas - c.prepago) / c.n);
                if (i + 1 > lim && (proxima === null || i + 1 < proxima)) proxima = i + 1;
            });
        }

        const mesRef = mesFoco || lim;
        const delMes = mesRef >= 1 ? filas.reduce((s, p) => s + p.meses[mesRef - 1][modo], 0) : 0;
        const previo = mesRef >= 2 ? filas.reduce((s, p) => s + p.meses[mesRef - 2][modo], 0) : 0;

        return {
            total, programado, cartera, prestado, intereses, programadoTotal, porCobrar, proxima,
            exigibles, cubiertas, descubiertas, conAbono, mesRef, delMes,
            variacion: previo > 0 ? ((delMes - previo) / previo) * 100 : null,
            cumplimiento: exigibles > 0 ? (cubiertas / exigibles) * 100 : 100,
            alDia: filas.filter((p) => p.meses.every((c, i) => i + 1 > lim || c.n === 0 || c.pagadas + c.prepago >= c.n)).length,
            // Con todos los años a la vista, la suma de las cuotas tiene que ser
            // el capital prestado más los intereses pactados. Es el cuadre
            // equivalente al de la matriz de ahorros.
            cuadra: anio === 'todos' && modo === 'programado'
                && Math.abs(programado - programadoTotal) < 1
                && Math.abs(programadoTotal - (prestado + intereses)) < filas.length + 1,
        };
    }, [datos, filas, modo, mesFoco, anio, lim]);

    const ordenar = (campo) => setOrden((o) => ({ campo, dir: o.campo === campo && o.dir === 'asc' ? 'desc' : 'asc' }));

    const totalesColumna = useMemo(() => (
        Array.from({ length: 12 }, (_, i) => ({
            valor: filas.reduce((s, p) => s + p.meses[i][modo], 0),
            cuotas: filas.reduce((s, p) => s + p.meses[i].n, 0),
            pagadas: filas.reduce((s, p) => s + p.meses[i].pagadas, 0),
        }))
    ), [filas, modo]);

    const exportar = () => {
        if (!datos) return;
        exportToExcel(
            filas.map((p) => ({
                Socio: p.socio,
                Cédula: p.cedula,
                Préstamo: p.idVm,
                ...Object.fromEntries(MESES_LARGOS.map((m, i) => [m, p.meses[i][modo]])),
                'Total período': modo === 'programado' ? p.programadoAnio : p.pagadoAnio,
                'Saldo vigente': p.saldoVigente,
                'Cuotas pagadas': `${p.pagadasTotal}/${p.cuotasTotal}`,
                'Valor prestado': p.valorPrestado,
            })),
            `matriz_cuotas_${anio === 'todos' ? 'historico' : anio}`,
            'Matriz de Cuotas',
            Object.fromEntries([...MESES_LARGOS, 'Total período', 'Saldo vigente', 'Valor prestado']
                .map((c) => [c, '"$"#,##0']))
        );
        toast.success('Matriz exportada.');
    };

    if (error) {
        return (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
                <p className="font-semibold text-rose-900">No se pudo cargar la matriz de cuotas</p>
                <p className="mt-1 text-sm text-rose-800">{error}</p>
                <Button className="mt-4" size="sm" onClick={() => cargar(anio)}>Reintentar</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="rounded-lg bg-brand-primary/10 p-2 text-brand-primary ring-1 ring-brand-primary/15">
                            <Grid3x3 className="h-5 w-5" />
                        </span>
                        <h1 className="text-2xl font-bold text-brand-primary">Matriz de Cuotas</h1>
                    </div>
                    <p className="mt-1.5 max-w-2xl text-sm text-gray-600">
                        Control mes a mes de cada crédito. En verde la cuota pagada, en rojo la vencida sin pagar, en
                        gris la que aún no vence, y en blanco los meses en que ese préstamo no tiene cuota.
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

            {resumen && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <Tarjeta
                        icon={Wallet}
                        titulo={anio === 'todos' ? 'Recaudo histórico' : `Recaudo ${anio}`}
                        valor={pesos(resumen.total)}
                        nota={modo === 'programado' ? 'Lo que dicta el cronograma' : 'Lo que los socios pagaron'}
                    />
                    <Tarjeta
                        icon={CalendarCheck}
                        titulo="Cumplimiento"
                        valor={`${resumen.cumplimiento.toFixed(1)}%`}
                        nota={`${resumen.cubiertas} de ${resumen.exigibles} cuotas vencidas están cubiertas`}
                        acento={resumen.cumplimiento >= 95 ? 'emerald' : 'amber'}
                    />
                    <Tarjeta
                        icon={AlertTriangle}
                        titulo="Cuotas en descubierto"
                        valor={resumen.descubiertas.toLocaleString('es-CO')}
                        nota={resumen.descubiertas > 0 ? 'Vencidas y sin pagar' : 'Ninguna cuota vencida sin pagar'}
                        acento={resumen.descubiertas > 0 ? 'rose' : 'emerald'}
                        alerta={resumen.descubiertas > 0}
                    />
                    <Tarjeta
                        icon={Clock}
                        titulo="Por cobrar en el período"
                        valor={pesos(resumen.porCobrar)}
                        nota={resumen.proxima
                            ? `La próxima vence en ${MESES_LARGOS[resumen.proxima - 1]}`
                            : 'No quedan cuotas por vencer este año'}
                        acento="sky"
                    />
                    <Tarjeta
                        icon={Landmark}
                        titulo="Cartera vigente"
                        valor={pesos(resumen.cartera)}
                        nota={`${filas.length} crédito(s) · ${resumen.alDia} al día`}
                        acento="sky"
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

            <div className="rounded-xl border border-ui-border bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-end gap-4">
                    <label className="min-w-[240px] flex-1">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Socio, cédula o préstamo</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar…"
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
                            {[['pagado', 'Pagado'], ['programado', 'Programado']].map(([v, etiqueta]) => (
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
                            [soloMora, setSoloMora, 'Solo en descubierto'],
                            [soloVigentes, setSoloVigentes, 'Solo créditos vigentes'],
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

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ui-border pt-3 text-xs text-gray-600">
                    <span className="font-semibold uppercase tracking-wider text-gray-500">Lectura</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-700" /> pagada con abono a capital</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-500" /> pagada</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-rose-600" /> en mora</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-rose-500" /> vencida sin pagar</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-amber-100 ring-1 ring-inset ring-amber-400" /> mes con cuotas sin cubrir</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-gray-50 ring-1 ring-inset ring-gray-200" /> aún no vence (muestra lo que se debe)</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-gray-50 ring-2 ring-brand-primary" /> próxima cuota a cobrar</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-sky-100 ring-1 ring-inset ring-sky-300" /> cancelada por prepago</span>
                    <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm ring-1 ring-inset ring-gray-200" /> sin cuota ese mes</span>
                </div>
            </div>

            {/* Cuotas que existen pero cuya fecha no dice en qué mes caen. Sin
                este aviso su casilla sale vacía, igual que un mes en el que el
                préstamo no tenía cuota, y el descubierto pasa inadvertido. */}
            {datos?.sinUbicar?.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                        <div>
                            <p className="font-semibold text-amber-900">
                                {datos.sinUbicar.length} cuota(s) no se pueden ubicar en el calendario
                            </p>
                            <p className="mt-0.5 text-sm text-amber-800">
                                Su fecha de vencimiento no permite saber a qué mes corresponden, así que no aparecen en la
                                rejilla ni suman en los totales. Conviene corregirlas desde Lista Estado Préstamos.
                            </p>
                            <ul className="mt-2 space-y-0.5 font-mono text-[11px] tabular-nums text-amber-900">
                                {datos.sinUbicar.slice(0, 6).map((c, i) => (
                                    <li key={i}>
                                        <span className="font-semibold">{c.idVm}</span>
                                        {c.cuota ? ` · ${c.cuota}` : ''}
                                        {c.socio ? ` · ${c.socio}` : ''}
                                        {' → '}{String(c.fecha || 'sin fecha')}
                                    </li>
                                ))}
                                {datos.sinUbicar.length > 6 && (
                                    <li className="font-sans text-amber-700">… y {datos.sinUbicar.length - 6} más.</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

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
                        <p className="mt-3 font-medium text-gray-700">No hay créditos que mostrar</p>
                        <p className="mt-1 text-sm text-gray-500">Prueba a quitar algún filtro.</p>
                    </div>
                ) : (
                    <div className="max-h-[68vh] overflow-auto" onMouseLeave={() => setCruz({ fila: null, col: null })}>
                        <table className="w-full border-separate border-spacing-0 text-sm">
                            <thead>
                                <tr>
                                    <th
                                        onClick={() => ordenar('socio')}
                                        className="sticky left-0 top-0 z-30 min-w-[240px] cursor-pointer border-b border-r border-ui-border bg-brand-dark px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-white/90 hover:text-white"
                                    >
                                        Socio · Préstamo
                                    </th>
                                    {MESES.map((m, i) => (
                                        <th
                                            key={m}
                                            onClick={() => ordenar(i)}
                                            onMouseEnter={() => setCruz((c) => ({ ...c, col: i }))}
                                            className={`sticky top-0 z-20 min-w-[76px] cursor-pointer border-b border-ui-border px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider transition-colors
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
                                        onClick={() => ordenar('saldo')}
                                        className="sticky right-0 top-0 z-30 w-[138px] min-w-[138px] cursor-pointer border-b border-l border-white/15 bg-brand-dark px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-white/90 hover:text-white"
                                    >
                                        Saldo vigente
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {filas.map((p, idx) => {
                                    const activa = cruz.fila === idx;
                                    const total = modo === 'programado' ? p.programadoAnio : p.pagadoAnio;
                                    return (
                                        <tr key={p.idVm} onMouseEnter={() => setCruz((c) => ({ ...c, fila: idx }))}>
                                            <th
                                                scope="row"
                                                className={`sticky left-0 z-10 border-b border-r border-ui-border px-4 py-2 text-left align-middle transition-colors ${activa ? 'bg-emerald-50' : 'bg-white'}`}
                                            >
                                                <span className="block truncate font-semibold text-gray-800">{p.socio}</span>
                                                <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] tabular-nums text-gray-500">
                                                    <span className="font-semibold text-brand-primary">{p.idVm}</span>
                                                    <span className="text-gray-300">·</span>
                                                    <span>{pesos(p.valorPrestado)}</span>
                                                    <span className="text-gray-300">·</span>
                                                    <span>{p.pagadasTotal}/{p.cuotasTotal}</span>
                                                </span>
                                            </th>

                                            {p.meses.map((c, i) => {
                                                const est = estadoCelda(c, i + 1, lim);
                                                // La primera cuota que queda por vencer de este crédito. Se
                                                // señala porque es la que hay que cobrar ahora; sin marcarla,
                                                // todas las pendientes pesan igual en la mirada.
                                                const esProxima = i + 1 === proximaDe(p, lim);
                                                const enCruz = cruz.col === i || activa;
                                                const titulo = `${p.socio} · ${p.idVm} · ${MESES_LARGOS[i]}\n` + ({
                                                    'sin-cuota': 'Este crédito no tiene cuota en este mes',
                                                    'prepagada': 'Cancelada por prepago o refinanciación',
                                                    'mora': `En mora · cuota de ${pesos(c.programado)}`,
                                                    'vencida': `Vencida sin pagar · cuota de ${pesos(c.programado)}`,
                                                    'pendiente': `Aún no vence · hay que pagar ${pesos(c.programado)}`,
                                                    'parcial': `${c.pagadas + c.prepago} de ${c.n} cuotas cubiertas este mes · programado ${pesos(c.programado)}`,
                                                    'pagada': `Pagada ${pesos(c.pagado)}`,
                                                    'abono': `Pagada ${pesos(c.pagado)} · ${pesos(c.excedente)} de más a capital`,
                                                }[est]);

                                                return (
                                                    <td
                                                        key={i}
                                                        onMouseEnter={() => setCruz({ fila: idx, col: i })}
                                                        title={titulo}
                                                        className={`border-b border-r p-0 text-center transition-[filter] ${enCruz ? 'brightness-105' : ''}`}
                                                    >
                                                        <span className={`m-[3px] flex h-8 items-center justify-center rounded-md border font-mono text-[12px] font-semibold tabular-nums transition-colors duration-500 ${ESTILOS[est]} ${esProxima ? 'ring-2 ring-brand-primary ring-offset-1' : ''}`}>
                                                            {contenidoCelda(est, c, modo)}
                                                        </span>
                                                    </td>
                                                );
                                            })}

                                            <td className={`sticky right-[138px] z-10 border-b border-l border-ui-border px-3 py-2 text-right font-mono text-[13px] font-bold tabular-nums text-brand-dark ${activa ? 'bg-emerald-50' : 'bg-white'}`}>
                                                {pesos(total)}
                                            </td>
                                            <td className={`sticky right-0 z-10 border-b border-l border-ui-border px-3 py-2 text-right font-mono text-[13px] tabular-nums ${p.saldoVigente > 0 ? 'text-gray-700' : 'text-emerald-700'} ${activa ? 'bg-emerald-50' : 'bg-white'}`}>
                                                {p.saldoVigente > 0 ? pesos(p.saldoVigente) : 'cancelado'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>

                            <tfoot>
                                <tr>
                                    <th className="sticky bottom-0 left-0 z-30 border-r border-t-2 border-brand-primary bg-emerald-50 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-brand-dark">
                                        Total del mes
                                    </th>
                                    {totalesColumna.map((t, i) => (
                                        <td key={i} className={`sticky bottom-0 z-20 border-r border-t-2 border-brand-primary px-2 py-2 text-center ${cruz.col === i ? 'bg-emerald-100' : 'bg-emerald-50'}`}>
                                            <span className="block font-mono text-[12px] font-bold tabular-nums text-brand-dark">{compacto(t.valor)}</span>
                                            <span className="block font-mono text-[10px] tabular-nums text-emerald-700">{t.pagadas}/{t.cuotas}</span>
                                        </td>
                                    ))}
                                    <td className="sticky bottom-0 right-[138px] z-30 border-l border-t-2 border-brand-primary bg-emerald-50 px-3 py-2 text-right font-mono text-[13px] font-bold tabular-nums text-brand-dark">
                                        {pesos(resumen?.total || 0)}
                                    </td>
                                    <td className="sticky bottom-0 right-0 z-30 border-l border-t-2 border-brand-primary bg-emerald-50 px-3 py-2 text-right font-mono text-[13px] font-bold tabular-nums text-brand-dark">
                                        {pesos(resumen?.cartera || 0)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* El cuadre de esta matriz: la suma de todas las cuotas es el capital
                prestado más los intereses pactados. Solo puede afirmarse mirando
                todos los años y la cifra programada, igual que en ahorros. */}
            {resumen && (
                <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm ${resumen.cuadra ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-ui-border bg-white text-gray-600'}`}>
                    {resumen.cuadra
                        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        : <Info className="h-5 w-5 shrink-0 text-gray-400" />}
                    {resumen.cuadra ? (
                        <p>
                            <strong className="font-semibold">Cuadra.</strong> Las cuotas de estos créditos suman
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.programado)}</span>:
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.prestado)}</span> de capital prestado más
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.intereses)}</span> de intereses pactados.
                        </p>
                    ) : anio === 'todos' && modo === 'programado' ? (
                        <p>
                            Las cuotas suman
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.programado)}</span>, frente a
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.prestado)}</span> de capital más
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.intereses)}</span> de intereses.
                            {' '}La diferencia indica cronogramas que no corresponden a las condiciones de su préstamo.
                        </p>
                    ) : (
                        <p>
                            Estás viendo {anio === 'todos' ? 'todos los años' : `el año ${anio}`} en cifra
                            {modo === 'pagado' ? ' pagada' : ' programada'}. Elige
                            {' '}<strong className="font-semibold">«Todos los años» + «Programado»</strong> para comprobar que las cuotas
                            suman el capital prestado más los intereses.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
