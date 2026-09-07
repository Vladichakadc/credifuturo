import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Grid3x3, RefreshCw, Download, Search, X, Users, CalendarCheck,
    AlertTriangle, Wallet, TrendingUp, CheckCircle2, Info, ChevronDown,
} from 'lucide-react';
import api from '../../config/api';
import { cn } from '../../utils/cn';
import TiraMeses, { CabeceraTira } from '../../components/admin/TiraMeses';
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
/**
 * Qué significa cada cifra de la rejilla.
 *
 * Los filtros —mes, "solo con faltantes", el orden— estaban escritos SOBRE
 * `abonos`, no sobre la cifra que el usuario tiene seleccionada. Mientras solo
 * hubo dos cifras (Abonos y Neto, que comparten el mismo "¿hubo movimiento?")
 * no se notó; al entrar Aportes se rompió de dos maneras opuestas y las dos
 * silenciosas, que es lo peor que le puede pasar a una pantalla de control:
 *
 *   · "Solo con faltantes" seguía filtrando en Aportes con el botón ya oculto:
 *     la rejilla mostraba 8 socios de 9 y el total decía $2.900.000 en vez de
 *     $3.650.000, sin nada en pantalla que explicara los $750.000 que faltaban.
 *   · El filtro de mes NO filtraba nada en Aportes: elegir enero, febrero o
 *     marzo devolvía siempre las mismas 9 filas y el mismo total.
 *
 * Por eso cada cifra declara aquí su lectura, y los filtros preguntan por ella
 * en vez de asumir `abonos`. Añadir una cuarta cifra es añadir una entrada,
 * no repasar seis sitios y olvidarse de dos.
 *
 *   valor     — qué número lleva la casilla
 *   hay       — cuándo la casilla "tiene algo" (para el filtro de mes)
 *   total     — el total del período de una fila
 *   acumulado — el histórico que va en la última columna
 *   exigible  — si un mes vacío es una FALTA. El aporte inicial se paga una
 *               sola vez al entrar, así que no: sin esto, la rejilla acusaría
 *               al socio de no pagar algo que nunca debió.
 */
const LECTURA = {
    abonos: {
        valor: (c) => c.abonos,
        hay: (c) => c.abonos > 0,
        total: (f) => f.abonosAnio,
        acumulado: (f) => f.historico,
        exigible: true,
    },
    neto: {
        valor: (c) => c.neto,
        hay: (c) => c.n > 0,
        total: (f) => f.totalAnio,
        acumulado: (f) => f.historico,
        exigible: true,
    },
    aportes: {
        valor: (c) => c.aportes,
        hay: (c) => c.aportes > 0,
        total: (f) => f.aportesAnio || 0,
        acumulado: (f) => f.historicoAportes || 0,
        exigible: false,
    },
};
const lecturaDe = (modo) => LECTURA[modo] || LECTURA.abonos;

/**
 * El aspecto de una casilla: un solo sitio que decide color y contenido.
 *
 * Lo usan la tabla (pantalla ancha) y la lista de tarjetas (móvil). Si cada una
 * lo dedujera por su cuenta, el mismo mes acabaría pintado de dos colores según
 * el tamaño de la pantalla — y entonces la rejilla dejaría de ser una fuente
 * fiable, que es lo único que tiene que ser.
 */
function aspectoCelda(celda, mes, { modo, lim, ref }) {
    const lec = lecturaDe(modo);
    const hay = lec.hay(celda);
    const vencido = lec.exigible && mes <= lim;
    const soloConcepto = lec.exigible && !hay && celda.n > 0;

    if (hay) return {
        clases: tonoVerde(lec.valor(celda), ref),
        contenido: compacto(lec.valor(celda)),
        activa: true,
        estado: 'abono',
        glifo: '✓',
    };
    if (soloConcepto) return {
        clases: 'bg-amber-100 text-amber-900 border-amber-300',
        contenido: compacto(celda.neto),
        activa: true,
        estado: 'concepto',
        glifo: '~',
    };
    if (vencido) return {
        clases: 'bg-rose-500 text-white border-rose-600',
        contenido: '—',
        activa: true,
        estado: 'falta',
        glifo: '—',
    };
    return {
        clases: 'bg-gray-50 text-gray-300 border-gray-100',
        contenido: '·',
        activa: false,
        estado: 'vacio',
        glifo: '·',
    };
}

// El total del período de una fila, según la cifra que se está mirando. Existe
// para no repetir el mismo ternario en las seis partes que lo necesitan —y para
// que añadir una cifra sea un caso más aquí y no seis descuidos repartidos.
function totalDe(fila, modo) {
    return lecturaDe(modo).total(fila);
}

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
        <div className={`rounded-xl border bg-white p-3 shadow-card transition-shadow hover:shadow-card-hover sm:p-4 ${alerta ? 'border-rose-200' : 'border-ui-border'}`}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-gray-500 sm:text-[11px]">{titulo}</p>
                <span className={`hidden rounded-lg p-1.5 ring-1 sm:inline-flex ${tonos[acento]}`}><Icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-brand-dark sm:mt-2 sm:text-2xl">{valor}</p>
            {/* El pie se guarda en móvil: en una tarjeta de media pantalla, tres
                líneas de explicación pesan más que la cifra que explican. */}
            {nota && <p className="mt-1 hidden text-xs leading-snug text-gray-500 sm:block">{nota}</p>}
        </div>
    );
}

/**
 * `mio` la convierte en la matriz del socio: misma rejilla, mismos colores y
 * misma reconciliación, pero pidiendo `/my/savings/matriz`, que el servidor
 * acota al id del token. Es un prop y no una copia de la página a propósito —
 * dos rejillas de control que se desincronicen harían que el socio y el gerente
 * discutan sobre cifras distintas, que es justo lo que la matriz evita.
 */
export default function SavingsMatrixPage({ mio = false }) {
    const base = mio ? '/admin/my' : '/admin';
    const { toast } = useUi();
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    const [anio, setAnio] = useState(null);          // null hasta la primera carga
    const [modo, setModo] = useState('abonos');       // 'abonos' | 'neto' | 'aportes'
    // El aporte inicial se paga una vez, al entrar: no es una obligación mensual,
    // así que en esa cifra no hay meses "en falta" ni cuadre contra el ahorro.
    const modoAportes = modo === 'aportes';
    const [busqueda, setBusqueda] = useState('');
    const [mesFoco, setMesFoco] = useState(null);     // 1..12, o null para todos
    const [soloFaltantes, setSoloFaltantes] = useState(false);
    const [soloActivos, setSoloActivos] = useState(true);
    const [orden, setOrden] = useState({ campo: 'nombre', dir: 'asc' });
    const [celda, setCelda] = useState(null);         // {socio, mes} — detalle
    const [cruz, setCruz] = useState({ fila: null, col: null });
    const contenedor = useRef(null);
    // El encabezado de ruta (PageHeroRuta) solo existe dentro del panel del
    // socio; en /admin no, así que allí la cabecera propia no sobra.
    const enPanelSocio = typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard');

    const cargar = useCallback(async (anioPedido) => {
        setCargando(true);
        setError(null);
        try {
            const q = anioPedido === 'todos' ? '?anio=todos' : anioPedido ? `?anio=${anioPedido}` : '';
            const res = await api.get(`${base}/savings/matriz${q}`);
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
    }, [base]);

    useEffect(() => { cargar(null); }, [cargar]);

    const cambiarAnio = (nuevo) => { setAnio(nuevo); cargar(nuevo); };

    // ── Filas visibles ────────────────────────────────────────────────
    const filas = useMemo(() => {
        if (!datos) return [];
        const q = busqueda.trim().toLowerCase();
        const lec = lecturaDe(modo);

        let f = datos.data.filter((s) => {
            // En la vista del socio no hay más fila que la suya: aplicar el
            // filtro con el botón oculto sería un filtro invisible activo.
            if (!mio && soloActivos && s.estatus !== 'Activo') return false;
            if (q && !`${s.nombre} ${s.cedula} ${s.customerId}`.toLowerCase().includes(q)) return false;
            return true;
        });

        // Un socio sin un solo movimiento en toda su historia no es un faltante:
        // es un registro que nunca ahorró (el propio admin, por ejemplo).
        f = f.filter((s) => s.historico !== 0 || s.totalAnio !== 0 || (s.historicoAportes || 0) !== 0);

        // Un mes "en falta" solo existe donde la cifra es una obligación
        // mensual. En Aportes no lo es, así que este filtro no se aplica —y su
        // botón tampoco se pinta—, en vez de quedarse filtrando a escondidas.
        const faltaEn = (s, m) => lec.exigible && !lec.hay(s.meses[m - 1]) && m <= datos.mesLimite;
        if (soloFaltantes && lec.exigible) {
            f = f.filter((s) => (mesFoco ? faltaEn(s, mesFoco) : s.meses.some((_, i) => faltaEn(s, i + 1))));
        }
        // El mes se filtra por la cifra que se mira: preguntar por `n` dejaba
        // pasar todas las filas en Aportes, porque `n` cuenta solo los abonos.
        if (mesFoco) f = f.filter((s) => lec.hay(s.meses[mesFoco - 1]) || faltaEn(s, mesFoco));

        const valor = (s) => {
            if (orden.campo === 'nombre') return s.nombre.toLowerCase();
            if (orden.campo === 'total') return totalDe(s, modo);
            if (orden.campo === 'historico') return lec.acumulado(s);
            if (orden.campo === 'cobertura') return s.mesesConAbono;
            if (typeof orden.campo === 'number') return s.meses[orden.campo][modo];
            return 0;
        };
        return [...f].sort((a, b) => {
            const va = valor(a); const vb = valor(b);
            const cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
            return orden.dir === 'asc' ? cmp : -cmp;
        });
    }, [datos, busqueda, soloActivos, soloFaltantes, mesFoco, orden, modo, mio]);

    // ── Resumen ───────────────────────────────────────────────────────
    const resumen = useMemo(() => {
        if (!datos) return null;
        const lim = datos.mesLimite;
        const totalPeriodo = filas.reduce((s, f) => s + totalDe(f, modo), 0);
        const lec = lecturaDe(modo);
        const historico = filas.reduce((s, f) => s + lec.acumulado(f), 0);
        // Sin obligación mensual no hay huecos que contar ni "al día" que medir.
        const huecos = !lec.exigible ? 0
            : filas.reduce((s, f) => s + f.meses.filter((c, i) => !lec.hay(c) && i + 1 <= lim).length, 0);
        const alDia = !lec.exigible ? filas.length
            : filas.filter((f) => f.meses.every((c, i) => i + 1 > lim || lec.hay(c))).length;
        const conceptos = filas.reduce((s2, f) => s2 + f.meses.reduce((a, c) => a + c.conceptos, 0), 0);
        // Lo que movió EL MES elegido. Sin esto, elegir "Marzo" dejaba la tarjeta
        // del período mostrando el total del año entero: el control parecía no
        // hacer nada, y peor, contestaba una pregunta distinta de la que se hizo.
        const totalMes = mesFoco
            ? filas.reduce((s, f) => s + lec.valor(f.meses[mesFoco - 1]), 0)
            : null;
        const mesRef = mesFoco || lim;
        const delMes = mesRef >= 1 ? filas.reduce((s, f) => s + f.meses[mesRef - 1][modo], 0) : 0;
        const previo = mesRef >= 2 ? filas.reduce((s, f) => s + f.meses[mesRef - 2][modo], 0) : 0;
        const variacion = previo > 0 ? ((delMes - previo) / previo) * 100 : null;
        return {
            totalPeriodo, totalMes, historico, huecos, alDia, mesRef, delMes, variacion, conceptos,
            celdasExigibles: filas.length * lim,
            cobertura: filas.length * lim > 0 ? ((filas.length * lim - huecos) / (filas.length * lim)) * 100 : 100,
            // El cuadre solo puede afirmarse mirando todos los años y en modo
            // neto: en modo abonos la fila suma únicamente lo que consignaron
            // los socios, y el acumulado del fondo incluye además devoluciones y
            // descuentos. La diferencia entre ambos no es un descuadre, es esa
            // partida — y decirlo vale más que esconderla.
            cuadra: !mesFoco && anio === 'todos' && modo === 'neto' && Math.abs(totalPeriodo - historico) < 1,
            // Los aportes cuadran contra su propio acumulado, no contra el del
            // ahorro mensual. Sin esta rama, mirar "Aportes" en todos los años
            // caía en el mensaje de descuadre y denunciaba un problema que no
            // existe — la peor avería que puede tener una pantalla de control.
            cuadraAportes: !mesFoco && anio === 'todos' && modo === 'aportes' && Math.abs(totalPeriodo - historico) < 1,
            explicaDiferencia: !mesFoco && anio === 'todos' && modo === 'abonos'
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
                'Total período': totalDe(f, modo),
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

    // Los filtros que de verdad están recortando lo que se ve. Solo entran los
    // que APLICAN a la cifra actual: "solo con faltantes" no filtra en Aportes,
    // así que anunciarlo ahí sería inventar una causa que no existe.
    const filtrosActivos = useMemo(() => {
        const lec = lecturaDe(modo);
        const l = [];
        if (busqueda.trim()) l.push({ etiqueta: `Búsqueda: "${busqueda.trim()}"`, quitar: () => setBusqueda('') });
        if (mesFoco) l.push({ etiqueta: MESES_LARGOS[mesFoco - 1], quitar: () => setMesFoco(null) });
        if (soloFaltantes && lec.exigible) l.push({ etiqueta: 'Solo con faltantes', quitar: () => setSoloFaltantes(false) });
        if (soloActivos && !mio) l.push({ etiqueta: 'Solo socios activos', quitar: () => setSoloActivos(false) });
        return l;
    }, [busqueda, mesFoco, soloFaltantes, soloActivos, modo, mio]);

    const limpiarFiltros = () => {
        setBusqueda(''); setMesFoco(null); setSoloFaltantes(false); setSoloActivos(false);
    };

    const totalesColumna = useMemo(() => (
        Array.from({ length: 12 }, (_, i) => ({
            valor: filas.reduce((s, f) => s + f.meses[i][modo], 0),
            // Contar siempre por `abonos` daba "500k · 0 soc." en la cifra de
            // aportes: la casilla decía que hubo aporte y el total, que no hubo
            // nadie. Se cuenta por la cifra que se está mirando.
            socios: filas.filter((f) => lecturaDe(modo).hay(f.meses[i])).length,
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
            {/* ── Encabezado ─────────────────────────────────────────────
                En el panel del socio y de la Junta, el encabezado de la ruta ya
                nombra y describe esta pantalla: repetirlo aquí es el mismo texto
                dos veces seguidas y, en un teléfono, media pantalla de scroll
                antes de ver un solo dato. En /admin no hay encabezado de ruta,
                así que allí este bloque sigue siendo la cabecera. Los botones
                salen del bloque para no perderse con él. */}
            <div className={cn('flex flex-wrap items-start justify-between gap-4', enPanelSocio && 'hidden sm:flex')}>
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="rounded-lg bg-brand-primary/10 p-2 text-brand-primary ring-1 ring-brand-primary/15">
                            <Grid3x3 className="h-5 w-5" />
                        </span>
                        <h1 className="text-2xl font-bold text-brand-primary">{mio ? 'Mi Matriz de Ahorros' : 'Matriz de Ahorros'}</h1>
                    </div>
                    <p className="mt-1.5 max-w-2xl text-sm text-gray-600">
                        {modoAportes
                            ? `${mio ? 'Tu aporte inicial' : 'El aporte inicial de cada socio'}, en el mes en que se registró. Se paga una sola vez al entrar al fondo, así que los meses en blanco no son faltas.`
                            : `${mio ? 'Tu ahorro mes a mes. ' : 'Control mes a mes del ahorro de cada socio. '}En verde lo aportado, en rojo el mes vencido sin aporte, y en gris el que todavía no ha llegado.`}
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
            {/* Dos por fila en móvil: apiladas a lo ancho ocupaban 1.250px de
                scroll —cinco pantallas de teléfono— antes de llegar a la rejilla. */}
            {resumen && (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
                    <Tarjeta
                        icon={Wallet}
                        titulo={mesFoco
                            ? `${modoAportes ? 'Aportes' : 'Ahorro'} de ${MESES_LARGOS[mesFoco - 1]}`
                            : modoAportes
                                ? (anio === 'todos' ? 'Aporte inicial' : `Aportes ${anio}`)
                                : (anio === 'todos' ? 'Ahorro histórico' : `Ahorro ${anio}`)}
                        valor={pesos(mesFoco ? resumen.totalMes : resumen.totalPeriodo)}
                        nota={mesFoco
                            ? `Solo ese mes · el ${anio === 'todos' ? 'total' : `año ${anio}`} suma ${pesos(resumen.totalPeriodo)}`
                            : modoAportes ? (mio ? 'Lo que aportaste al entrar' : 'Lo aportado al entrar al fondo')
                            : modo === 'neto' ? 'Neto, con devoluciones y descuentos'
                            : (mio ? 'Solo tus abonos' : 'Solo abonos de los socios')}
                    />
                    {/* La cobertura y los meses en falta miden una obligación
                        MENSUAL. El aporte inicial se paga una vez al entrar, así
                        que ahí las dos tarjetas mentirían: dirían 100% y cero
                        faltas por una regla que no se está aplicando. En su lugar
                        cuentan lo que sí tiene sentido — cuántos aportaron. */}
                    <Tarjeta
                        icon={CalendarCheck}
                        titulo={modoAportes ? 'Aportes registrados' : 'Cobertura del período'}
                        valor={modoAportes
                            ? filas.reduce((a, f) => a + f.meses.reduce((b, c) => b + (c.nAportes || 0), 0), 0).toLocaleString('es-CO')
                            : `${resumen.cobertura.toFixed(1)}%`}
                        nota={modoAportes
                            ? (mio ? 'Movimientos de aporte inicial tuyos' : 'Movimientos de aporte inicial en el período')
                            : `${resumen.celdasExigibles - resumen.huecos} de ${resumen.celdasExigibles} ${mio ? 'meses cubiertos' : 'meses-socio cubiertos'}`}
                        acento={modoAportes ? 'emerald' : (resumen.cobertura >= 95 ? 'emerald' : 'amber')}
                    />
                    <Tarjeta
                        icon={AlertTriangle}
                        titulo={modoAportes ? (mio ? 'Socios con aporte' : 'Socios que aportaron') : 'Meses sin aporte'}
                        valor={modoAportes
                            ? `${filas.filter(f => (f.historicoAportes || 0) > 0).length} / ${filas.length}`
                            : resumen.huecos.toLocaleString('es-CO')}
                        nota={modoAportes ? 'Con aporte inicial registrado'
                            : resumen.huecos > 0 ? 'Casillas rojas por revisar' : 'Ningún mes vencido sin aporte'}
                        acento={modoAportes ? 'emerald' : (resumen.huecos > 0 ? 'rose' : 'emerald')}
                        alerta={!modoAportes && resumen.huecos > 0}
                    />
                    {/* "Socios al día: 0 / 1" no dice nada de una sola persona.
                        En la vista del socio la tarjeta responde su pregunta —si
                        él está al día— en vez de contarlo entre un total de uno. */}
                    <Tarjeta
                        icon={Users}
                        titulo={mio ? 'Tu estado' : 'Socios al día'}
                        valor={mio ? (resumen.alDia === filas.length ? 'Al día' : 'Con faltantes')
                            : `${resumen.alDia} / ${filas.length}`}
                        nota={mio
                            ? (resumen.alDia === filas.length ? 'Ningún mes vencido sin aporte' : 'Revisa los meses en rojo')
                            : 'Sin ningún mes vencido en descubierto'}
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
            <div className="rounded-xl border border-ui-border bg-white p-3 shadow-card sm:p-4">
                {/* En móvil los desplegables van a dos por fila: cada uno en su
                    propia línea, con su rótulo encima, ocupaba media pantalla de
                    controles antes de llegar a un solo dato. */}
                <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap sm:gap-4">
                    {/* Buscar entre una sola fila —la propia— no busca nada. */}
                    {!mio && (
                    <label className="col-span-2 sm:min-w-[240px] sm:flex-1">
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
                    )}

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

                    <div className="col-span-2 sm:col-auto">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Cifra</span>
                        <div className="flex rounded-lg border border-ui-border p-0.5">
                            {[['abonos', 'Abonos'], ['neto', 'Neto'], ['aportes', 'Aportes']].map(([v, etiqueta]) => (
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
                            // En aportes no hay "faltantes": no se debe uno cada mes.
                            ...(modoAportes ? [] : [[soloFaltantes, setSoloFaltantes, 'Solo con faltantes']]),
                            // Filtrar "socios activos" sobre una sola fila —la
                            // propia— no filtra nada; en la vista del socio no va.
                            ...(mio ? [] : [[soloActivos, setSoloActivos, 'Solo socios activos']]),
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

                {/* ── Qué se está dejando fuera ──────────────────────────
                    Una cifra recortada por un filtro y un total legítimamente
                    pequeño se ven igual. Esa ambigüedad es la que hizo que
                    "$2.900.000" pasara por el total de aportes cuando el total
                    era $3.650.000 y había un filtro activo. Si algo filtra, se
                    dice aquí y se puede quitar de un clic. */}
                {filtrosActivos.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                            Mostrando {filas.length} de {datos?.data?.length ?? 0}
                        </span>
                        {filtrosActivos.map((fl) => (
                            <button
                                key={fl.etiqueta}
                                onClick={fl.quitar}
                                title={`Quitar: ${fl.etiqueta}`}
                                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                            >
                                {fl.etiqueta}
                                <X className="h-3 w-3" />
                            </button>
                        ))}
                        <button
                            onClick={limpiarFiltros}
                            className="ml-auto text-[11px] font-bold text-amber-800 underline underline-offset-2 hover:text-amber-900"
                        >
                            Quitar todos
                        </button>
                    </div>
                )}

                {/* Leyenda: sin ella la rejilla es un mosaico de colores sin significado. */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ui-border pt-3 text-xs text-gray-600">
                    <span className="font-semibold uppercase tracking-wider text-gray-500">Lectura</span>
                    {modoAportes ? (
                        <>
                            <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-500" /> mes en que se registró el aporte inicial</span>
                            <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-gray-100 ring-1 ring-inset ring-gray-200" /> sin aporte ese mes — no es una falta: se paga una sola vez</span>
                        </>
                    ) : (
                        <>
                            <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-700" /> por encima de lo habitual</span>
                            <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-500" /> aporte habitual</span>
                            <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-emerald-200" /> por debajo</span>
                            <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-rose-500" /> mes vencido sin aporte</span>
                            <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-gray-100 ring-1 ring-inset ring-gray-200" /> aún no vence</span>
                            <span className="flex items-center gap-1.5"><i className="h-3.5 w-5 rounded-sm bg-amber-100 ring-1 ring-inset ring-amber-300" /> movimiento del fondo</span>
                        </>
                    )}
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
                    <>
                    {/* ── En el teléfono: una tarjeta por socio ──────────────
                        La tabla de doce columnas medía 1384px en una pantalla de
                        390px, dentro de un scroll horizontal anidado en el scroll
                        de la página. Aquí el año cabe entero y solo se desplaza
                        en vertical, que es el gesto natural en móvil. */}
                    <div className="sm:hidden">
                        <div className="sticky top-0 z-10 border-b border-ui-border bg-white/95 px-3 pb-1.5 pt-2 backdrop-blur">
                            <CabeceraTira mesFoco={mesFoco} />
                        </div>
                        <div className="space-y-2 p-3">
                            {filas.map((s) => {
                                const ref = mediana(s.meses.map((c) => lecturaDe(modo).valor(c)));
                                return (
                                    <TiraMeses
                                        key={s.clientId}
                                        titulo={s.nombre}
                                        subtitulo={`#${s.customerId} · ${s.cedula}`}
                                        cifra={pesos(totalDe(s, modo))}
                                        cifraEtiqueta={anio === 'todos' ? 'total' : anio}
                                        mesFoco={mesFoco}
                                        onCelda={(mes) => setCelda({ socio: s, mes })}
                                        celdas={s.meses.map((c, i) => {
                                            const a = aspectoCelda(c, i + 1, { modo, lim, ref });
                                            return {
                                                ...a,
                                                // El importe no cabe en 26px —"300k" se salía de la
                                                // casilla—; aquí manda el estado y la cifra exacta
                                                // está a un toque, en el detalle del mes.
                                                contenido: a.glifo,
                                                titulo: `${MESES_LARGOS[i]}: ${a.estado === 'falta' ? 'sin aporte' : pesos(lecturaDe(modo).valor(c))}`,
                                            };
                                        })}
                                        pie={<>Acumulado <strong className="font-mono tabular-nums text-gray-700">{pesos(lecturaDe(modo).acumulado(s))}</strong></>}
                                        insignia={s.estatus !== 'Activo' && (
                                            <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{s.estatus}</span>
                                        )}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    <div ref={contenedor} className="hidden max-h-[68vh] overflow-auto sm:block" onMouseLeave={() => setCruz({ fila: null, col: null })}>
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
                                            className={cn(
                                                'sticky top-0 z-20 min-w-[74px] cursor-pointer border-b border-ui-border px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider transition-colors',
                                                // El mes elegido en el selector ES el sujeto de la pantalla:
                                                // antes se elegía "Marzo" y la columna de marzo se veía igual
                                                // que las once restantes, así que el control no parecía hacer
                                                // nada. Ahora se marca, y las demás se apagan.
                                                mesFoco === i + 1 ? 'bg-brand-gold text-brand-dark ring-2 ring-inset ring-brand-gold'
                                                    : cruz.col === i ? 'bg-brand-primary text-white' : 'bg-brand-dark text-white/90',
                                                mesFoco && mesFoco !== i + 1 && 'opacity-40',
                                                i + 1 > lim && 'opacity-60',
                                            )}
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
                                    const ref = mediana(s.meses.map((c) => lecturaDe(modo).valor(c)));
                                    const total = totalDe(s, modo);
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
                                                const asp = aspectoCelda(c, i + 1, { modo, lim, ref });
                                                const { clases, contenido } = asp;
                                                const hayAbono = asp.estado === 'abono';
                                                const vencido = asp.estado === 'falta';
                                                const enCruz = cruz.col === i || activa;

                                                return (
                                                    <td
                                                        key={i}
                                                        onMouseEnter={() => setCruz({ fila: idx, col: i })}
                                                        onClick={() => ((modoAportes ? c.nAportes > 0 : (c.n > 0 || vencido))) && setCelda({ socio: s, mes: i + 1 })}
                                                        title={modoAportes
                                                            ? `${s.nombre} · ${MESES_LARGOS[i]}\n${c.aportes > 0 ? `Aporte de ${pesos(c.aportes)}` : 'Sin aporte inicial este mes'}`
                                                            : `${s.nombre} · ${MESES_LARGOS[i]}\n${hayAbono ? `Abonó ${pesos(c.abonos)}` : vencido ? 'Sin aporte' : 'Mes no vencido'}${c.conceptos ? `\nMovimientos del fondo: ${pesos(c.conceptos)}` : ''}`}
                                                        className={cn(
                                                            'cursor-pointer border-b border-r p-0 text-center transition-[filter]',
                                                            enCruz && 'brightness-105',
                                                            // Fuera del mes elegido, la casilla se aparta: la
                                                            // rejilla sigue completa para no perder el contexto,
                                                            // pero se ve de qué mes se está hablando.
                                                            mesFoco && mesFoco !== i + 1 && 'opacity-30',
                                                        )}
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
                                                {pesos(lecturaDe(modo).acumulado(s))}
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
                    </>
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
                    {mesFoco ? (
                        <p>
                            Estás viendo solo <strong className="font-semibold">{MESES_LARGOS[mesFoco - 1]}</strong>:
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.totalMes)}</span>.
                            {' '}Quita el filtro de mes para comprobar que la matriz cuadra con el acumulado.
                        </p>
                    ) : resumen.cuadraAportes ? (
                        <p>
                            <strong className="font-semibold">Cuadra.</strong> La suma de los aportes iniciales —
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.totalPeriodo)}</span> — coincide
                            con todo lo aportado al entrar al fondo. El aporte inicial se paga una sola vez, así que
                            los meses en blanco no son faltas.
                        </p>
                    ) : resumen.cuadra ? (
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
                    ) : modoAportes ? (
                        <p>
                            Estás viendo los aportes de {anio}:
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.totalPeriodo)}</span> frente
                            a un total aportado de
                            <span className="font-mono font-semibold tabular-nums"> {pesos(resumen.historico)}</span>.
                            {' '}El aporte inicial se paga una sola vez al entrar, así que lo normal es ver una única
                            casilla por socio.
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
                    base={base}
                    modoAportes={modoAportes}
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
function DetalleCelda({ socio, mes, anio, onCerrar, base = '/admin', modoAportes = false }) {
    const [movs, setMovs] = useState(null);
    // Un fallo de permiso no es lo mismo que "no hubo movimientos": presentarlo
    // como una casilla vacía haría creer que el socio no aportó ese mes. La
    // Junta ve la matriz, pero el detalle movimiento a movimiento sigue siendo
    // del administrador, así que ese caso hay que decirlo tal cual.
    const [sinAcceso, setSinAcceso] = useState(false);
    const celda = socio.meses[mes - 1];

    useEffect(() => {
        let vivo = true;
        // Sin `type`, /savings/list EXCLUYE el aporte inicial por defecto. Al
        // mirar esa cifra, la casilla se abriría vacía sobre un aporte que la
        // rejilla acaba de pintar en verde — que es peor que no abrirla.
        api.get(`${base}/savings/list`, {
            params: { clientId: socio.clientId, ...(modoAportes ? { type: 'Aporte Inicial' } : {}) },
        })
            .then((r) => {
                if (!vivo) return;
                const todos = r.data?.data || r.data || [];
                setMovs(todos.filter((m) => {
                    const mm = Number(m.mesAbonado || m.monthInt || 0);
                    const aa = Number(m.anioAbonado || m.year || 0);
                    return mm === mes && (anio === 'todos' || aa === Number(anio));
                }));
            })
            .catch((err) => {
                if (!vivo) return;
                if (err.response?.status === 403) setSinAcceso(true);
                setMovs([]);
            });
        return () => { vivo = false; };
    }, [socio.clientId, mes, anio, base, modoAportes]);

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
                    ) : sinAcceso ? (
                        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
                            <p className="text-sm font-medium text-amber-900">El detalle movimiento a movimiento es del administrador</p>
                            <p className="mt-1 text-xs text-amber-800">
                                Las cifras del mes que muestra la matriz sí son las tuyas para consultar.
                            </p>
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
