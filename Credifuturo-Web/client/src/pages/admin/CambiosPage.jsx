import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Save, RotateCcw, Info, CheckCircle2, MapPin, Landmark, TrendingUp } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useVisibilidad } from '../../context/VisibilidadContext';
import { SECCIONES, esSeccionVisible } from '../../utils/seccionesVisibles';
import MiPosicionFondo from '../../components/admin/MiPosicionFondo';

// Réplicas estáticas para secciones sin página propia donde comprobar el efecto
// real de ocultarlas (el admin siempre las ve, sin importar el interruptor — ver
// el comentario `ruta: null` de cada una en seccionesVisibles.js). No están en
// ese catálogo porque son puramente de presentación, específicas de esta pantalla.
const MOCKS_ESTATICOS = {
    'menu.nuestroFondo': {
        etiqueta: 'Así se vería en su menú lateral',
        Mock: () => (
            <div className="inline-flex items-center gap-2 bg-brand-dark text-white text-sm font-semibold px-3.5 py-2.5 rounded-lg w-fit">
                <Landmark className="h-5 w-5 text-white/80" /> Nuestro Fondo
            </div>
        ),
    },
    'menu.evolucionAhorros': {
        etiqueta: 'Así se vería en su menú lateral, dentro de Ahorros',
        Mock: () => (
            <div className="inline-flex items-center gap-2 bg-brand-dark text-white text-sm font-semibold px-3.5 py-2.5 rounded-lg w-fit">
                <TrendingUp className="h-5 w-5 text-white/80" /> Evolución
            </div>
        ),
    },
    'evolucion.todoElFondo': {
        etiqueta: 'Así se vería el botón, dentro de Evolución de Ahorros',
        Mock: () => (
            <button type="button" disabled
                className="inline-flex items-center gap-1.5 border border-brand-primary bg-brand-primary text-white text-xs font-bold px-4 py-2 rounded-lg w-fit cursor-default"
            >
                Todo el fondo
            </button>
        ),
    },
};

/**
 * "Cambios" — control de qué ve el socio.
 *
 * Cada tarjeta, gráfico o menú cuya publicación es una decisión del comité
 * aparece aquí con un interruptor — tanto lo que en su momento se ocultó como lo
 * que hoy está visible pero podría no convenir publicar. Antes, ocultar algo
 * significaba borrar código y volver a mostrarlo exigía otro despliegue; ahora
 * es una decisión reversible del comité, sin pasar por desarrollo.
 *
 * El catálogo NO se define aquí: vive en utils/seccionesVisibles.js, junto a la
 * regla que lo resuelve. Esta página solo lo pinta — así, registrar una sección
 * nueva no obliga a tocar esta pantalla.
 */

const CambiosPage = () => {
    const { toast } = useUi();
    const navigate = useNavigate();
    const { mapa, cargando, esVisible, guardar, recargar, previewIds, activarVistaPrevia, salirVistaPrevia } = useVisibilidad();
    // Secciones sin página propia (ver MOCKS_ESTATICOS): su vista previa es una
    // réplica estática que se expande aquí mismo, sin pasar por
    // VisibilidadContext — por id, para que abrir una no expanda las demás.
    const [mocksAbiertos, setMocksAbiertos] = useState({});
    const alternarMock = (id) => setMocksAbiertos(prev => ({ ...prev, [id]: !prev[id] }));

    // Entrar a Cambios cierra cualquier vista previa que hubiera quedado activa
    // de una visita anterior (p. ej. si el admin volvió con el botón "atrás" del
    // navegador en vez de "Salir de vista previa"): esta pantalla es el único
    // lugar desde el que tiene sentido activarla, así que también es el punto
    // natural donde se apaga sola.
    useEffect(() => { salirVistaPrevia(); }, [salirVistaPrevia]);

    // Borrador local: los cambios no se aplican hasta pulsar "Guardar", para que
    // el comité pueda revisar varios interruptores antes de que los socios los vean.
    const [borrador, setBorrador] = useState({});
    const [guardando, setGuardando] = useState(false);
    // Marca si el admin ya tocó algún interruptor. Sin esto, cualquier refresco
    // del mapa (incluido el que dispara un guardado fallido) reescribía el
    // borrador y borraba en silencio los cambios que el admin llevaba hechos —
    // `parsearVisibilidad` devuelve SIEMPRE un objeto nuevo, así que el efecto se
    // disparaba aunque el contenido fuera idéntico.
    const [tocado, setTocado] = useState(false);

    // `mapa === null` significa "nunca se pudo leer la configuración" (ni del
    // servidor ni de la caché local). Es distinto de "leída y vacía": en ese
    // estado NO se sabe qué están viendo los socios, así que la página no puede
    // dejar guardar — enviaría el mapa completo con los defaults del catálogo y
    // apagaría secciones que sí estaban aprobadas.
    const configuracionDisponible = mapa !== null;

    useEffect(() => {
        if (tocado) return;   // no pisar el trabajo en curso del admin
        const inicial = {};
        SECCIONES.forEach(s => { inicial[s.id] = esSeccionVisible(mapa, s.id); });
        setBorrador(inicial);
    }, [mapa, tocado]);

    const cambiosPendientes = useMemo(
        () => SECCIONES.filter(s => borrador[s.id] !== esSeccionVisible(mapa, s.id)),
        [borrador, mapa]
    );

    const visiblesCount = SECCIONES.filter(s => borrador[s.id]).length;

    const alternar = (id) => {
        setTocado(true);
        setBorrador(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const descartar = () => {
        const inicial = {};
        SECCIONES.forEach(s => { inicial[s.id] = esSeccionVisible(mapa, s.id); });
        setBorrador(inicial);
        setTocado(false);
    };

    const onGuardar = async () => {
        setGuardando(true);
        try {
            // Se guarda el mapa COMPLETO del catálogo, no solo lo que cambió: así
            // el AppSetting siempre refleja una decisión explícita por sección y no
            // depende de que el default del código nunca cambie. Por eso mismo esta
            // acción está bloqueada mientras la configuración no se haya podido
            // leer: escribir el mapa completo sin conocer el estado real apagaría
            // secciones aprobadas.
            const nuevo = {};
            SECCIONES.forEach(s => { nuevo[s.id] = !!borrador[s.id]; });
            await guardar(nuevo);
            setTocado(false);
            toast.success(`Cambios aplicados · ${visiblesCount} de ${SECCIONES.length} secciones visibles para los socios`);
        } catch (err) {
            // NO se recarga ni se limpia el borrador: los interruptores que el
            // admin marcó siguen en pantalla para que pueda reintentar sin volver
            // a marcarlos uno por uno.
            toast.error(err?.response?.data?.error || 'No se pudieron guardar los cambios. Tus cambios siguen aquí — puedes reintentar.');
        } finally {
            setGuardando(false);
        }
    };

    const hayCambios = cambiosPendientes.length > 0;

    return (
        <div className="space-y-5 max-w-5xl mx-auto animate-fade-in">
            {/* Encabezado */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Qué tarjetas, gráficos y menús ven los socios. Lo que desactives aquí desaparece de su vista, y puedes volver a mostrarlo cuando quieras.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {hayCambios && (
                        <button
                            onClick={descartar}
                            disabled={guardando}
                            className="inline-flex items-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-bold px-4 py-2.5 rounded-lg transition-colors min-h-[44px] disabled:opacity-60"
                        >
                            <RotateCcw className="h-4 w-4" /> Descartar
                        </button>
                    )}
                    <button
                        onClick={onGuardar}
                        disabled={!hayCambios || guardando || !configuracionDisponible}
                        className={`inline-flex items-center gap-2 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors min-h-[44px] ${
                            hayCambios && !guardando && configuracionDisponible
                                ? 'bg-brand-primary hover:bg-brand-dark'
                                : 'bg-gray-300 cursor-not-allowed'
                        }`}
                    >
                        <Save className="h-4 w-4" />
                        {guardando ? 'Guardando…' : hayCambios ? `Guardar (${cambiosPendientes.length})` : 'Sin cambios'}
                    </button>
                </div>
            </div>

            {/* Configuración ilegible: se dice claramente que NO se sabe qué ven
                los socios, en vez de mostrar los interruptores en un estado
                inventado. Guardar queda bloqueado arriba por la misma razón. */}
            {!configuracionDisponible && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <h2 className="text-sm font-black text-amber-900">No se pudo leer la configuración actual</h2>
                            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                                Los interruptores de abajo muestran los valores por defecto, <b>no</b> lo que los socios están viendo ahora.
                                Guardar está bloqueado para no apagar por error secciones que sí estén aprobadas. Reintenta la carga.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={recargar}
                        disabled={cargando}
                        className="inline-flex items-center gap-2 border border-amber-400 text-amber-800 hover:bg-amber-100 text-xs font-bold px-3 py-2 rounded-lg transition-colors min-h-[40px] flex-shrink-0 disabled:opacity-60"
                    >
                        <RotateCcw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
                        {cargando ? 'Cargando…' : 'Reintentar'}
                    </button>
                </div>
            )}

            {/* Resumen del estado actual */}
            <div className={`rounded-2xl px-5 py-4 flex items-center justify-between gap-4 shadow-card ${
                configuracionDisponible ? 'bg-gradient-to-r from-emerald-700 to-emerald-900' : 'bg-gradient-to-r from-gray-500 to-gray-700'
            }`}>
                <div className="flex items-center gap-4 min-w-0">
                    <div className="bg-white/15 rounded-full w-11 h-11 flex items-center justify-center flex-shrink-0">
                        <Eye className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-white leading-tight">
                            {configuracionDisponible
                                ? `${visiblesCount} de ${SECCIONES.length} secciones visibles`
                                : 'Configuración desconocida'}
                        </h2>
                        <p className="text-sm text-white/80 font-medium mt-0.5">
                            {!configuracionDisponible
                                ? 'No se pudo leer qué están viendo los socios.'
                                : hayCambios
                                ? `${cambiosPendientes.length} cambio(s) sin guardar — los socios todavía ven la configuración anterior.`
                                : 'Los socios están viendo exactamente esta configuración.'}
                        </p>
                    </div>
                </div>
                {hayCambios && (
                    <span className="hidden sm:inline text-[10px] font-black px-3 py-1 rounded-full bg-amber-400 text-amber-900 flex-shrink-0">
                        PENDIENTE DE GUARDAR
                    </span>
                )}
            </div>

            {/* Listado de secciones */}
            <div className="space-y-3">
                {SECCIONES.map(seccion => {
                    const visible = !!borrador[seccion.id];
                    const cambiada = visible !== esSeccionVisible(mapa, seccion.id);
                    return (
                        <div
                            key={seccion.id}
                            className={`bg-white rounded-2xl border shadow-card p-4 lg:p-5 transition-colors ${
                                cambiada ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-sm font-black text-gray-900">{seccion.titulo}</h3>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                            visible ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                                        }`}>
                                            {visible ? 'VISIBLE' : 'OCULTA'}
                                        </span>
                                        {cambiada && (
                                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                                                SIN GUARDAR
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] font-bold text-brand-primary mt-1 flex items-center gap-1">
                                        <MapPin className="h-3 w-3 flex-shrink-0" /> {seccion.ubicacion}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{seccion.detalle}</p>
                                    {seccion.motivo && (
                                        <p className="text-[11px] text-gray-500 mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-relaxed flex items-start gap-1.5">
                                            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
                                            {/* El catálogo tiene dos clases de entrada: las que
                                                documentan una decisión ya tomada de ocultar, y las
                                                que nacen visibles y se registran por adelantado
                                                (`visiblePorDefecto: true`). Para estas últimas
                                                "Por qué se ocultó" sería falso — nunca se ocultó. */}
                                            <span>
                                                <b className="text-gray-600">
                                                    {seccion.visiblePorDefecto ? 'Qué implica ocultarla:' : 'Por qué se ocultó:'}
                                                </b> {seccion.motivo}
                                            </span>
                                        </p>
                                    )}

                                    {/* Vista previa: solo para lo que hoy está oculto — ver cómo
                                        luciría antes de decidir si se vuelve a mostrar. */}
                                    {!visible && (
                                        seccion.ruta ? (
                                            <button
                                                onClick={() => {
                                                    activarVistaPrevia(seccion.id);
                                                    navigate(`${seccion.ruta}#${encodeURIComponent(seccion.id)}`);
                                                }}
                                                className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/5 px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                <Eye className="h-3.5 w-3.5" /> Vista previa — verla con datos reales
                                            </button>
                                        ) : seccion.id === 'miPosicion.parteEstimada' ? (
                                            previewIds.includes(seccion.id) ? (
                                                <div className="mt-2.5 bg-gray-50 border border-dashed border-gray-300 rounded-xl p-3">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
                                                        Así se vería · con tus propios datos, a modo de muestra
                                                    </p>
                                                    <MiPosicionFondo nombre="" />
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => activarVistaPrevia(seccion.id)}
                                                    className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/5 px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    <Eye className="h-3.5 w-3.5" /> Vista previa — verla con datos reales
                                                </button>
                                            )
                                        ) : MOCKS_ESTATICOS[seccion.id] ? (() => {
                                            const { etiqueta, Mock } = MOCKS_ESTATICOS[seccion.id];
                                            return (
                                                <div className="mt-2.5">
                                                    <button
                                                        onClick={() => alternarMock(seccion.id)}
                                                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/5 px-3 py-1.5 rounded-lg transition-colors"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" /> {mocksAbiertos[seccion.id] ? 'Ocultar vista previa' : 'Vista previa'}
                                                    </button>
                                                    {mocksAbiertos[seccion.id] && (
                                                        <div className="mt-2">
                                                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">
                                                                {etiqueta}
                                                            </p>
                                                            <Mock />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })() : null
                                    )}
                                </div>

                                {/* Interruptor accesible: es un <button> real con estado
                                    anunciado, no un div con onClick. */}
                                <button
                                    role="switch"
                                    aria-checked={visible}
                                    aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${seccion.titulo} a los socios`}
                                    onClick={() => alternar(seccion.id)}
                                    className={`flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-colors min-h-[44px] ${
                                        visible
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                    }`}
                                >
                                    {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    <span className="hidden sm:inline">{visible ? 'Mostrando' : 'Oculta'}</span>
                                    <span
                                        aria-hidden="true"
                                        className={`relative w-9 h-5 rounded-full transition-colors ${visible ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                    >
                                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${visible ? 'left-[1.15rem]' : 'left-0.5'}`} />
                                    </span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="text-[11px] text-gray-400 leading-snug flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                Los cambios aplican para todos los socios en cuanto guardas. Quien tenga la página abierta la verá actualizada al recargar o al entrar de nuevo.
            </p>
        </div>
    );
};

export default CambiosPage;
