import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../config/api';
import { Activity, Printer, RefreshCw } from 'lucide-react';
import SectionHeader from '../../components/ui/SectionHeader';
import FinancialChart from '../../components/admin/FinancialChart';
import RiskReturnIndicators from '../../components/admin/RiskReturnIndicators';
import { useVisibilidad } from '../../context/VisibilidadContext';
import YearMultiSelect from '../../components/admin/YearMultiSelect';
import MovimientoMensualChart from '../../components/admin/MovimientoMensualChart';
import { buildSerieMensual } from '../../utils/savingsSeries';

/**
 * Página dedicada del "Panel de Inteligencia Financiera & Actividad" — el
 * comparador interanual, el diagnóstico financiero y los indicadores de riesgo
 * y rendimiento que antes solo vivían dentro del Panel Principal.
 *
 * Existe porque el Panel Principal ("Nuestro Fondo") mezcla esta lectura de
 * fondo con otras dos cosas: las StatCard operativas por área y las acciones
 * de administración (guardar cambios, informe en PDF, modales de mora). El
 * Panel Ejecutivo, por su parte, es donde la Junta y los socios ya deciden —
 * añadirle este análisis lo habría saturado sin necesidad, cuando ya tiene su
 * propio comparador y su propio veredicto. Este menú es el tercer lugar: solo
 * el análisis, sin nada alrededor.
 *
 * Reutiliza el mismo componente `FinancialChart` que pinta el Panel Principal
 * (extraído de DashboardHome.jsx a components/admin/FinancialChart.jsx) para
 * que esta página nunca pueda mostrar una cifra distinta de la que ya conoce
 * un socio que entra por "Nuestro Fondo".
 */

const FinancialIntelligencePage = () => {
    const location = useLocation();
    // Ocultable desde el menú "Cambios". Al apagarse, `slotRiesgo` va en `null` y
    // FinancialChart vuelve a pintar su KPI "Mora Cartera" (seis columnas otra
    // vez): la página cae exactamente al aspecto que tenía antes de subir estas
    // tarjetas, en vez de quedarse sin ninguna señal de mora.
    const { esVisible } = useVisibilidad();
    const riesgoVisible = esVisible('inteligencia.indicadoresRiesgo');

    const [selectedYears, setSelectedYears] = useState([new Date().getFullYear(), new Date().getFullYear() + 1]);
    const [stats, setStats] = useState(null);
    const [execStats, setExecStats] = useState(null);
    const [yearCmp, setYearCmp] = useState(null);
    const [yearCmpError, setYearCmpError] = useState(false);
    // "Movimiento mensual" (antes en Evolución de Ahorros) — siempre de todo el
    // fondo agregado, sin selector de socio: esta página ya es de solo lectura
    // para cualquier rol, así que no expone el desglose de un socio en particular.
    const [savingsEvo, setSavingsEvo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Mismo patrón de refresco real que el Panel Ejecutivo: un fallo transitorio
    // del refresco automático NO debe borrar un panel ya pintado con datos
    // buenos, solo avisar. `statsRef` es lo que le permite a fetchAll saber si
    // ya hay algo en pantalla, sin meter `stats` en las deps del useCallback
    // (eso reiniciaría el intervalo en cada carga).
    const [ultimaCarga, setUltimaCarga] = useState(null);
    const [refrescando, setRefrescando] = useState(false);
    const [falloRefresco, setFalloRefresco] = useState(false);

    const fetchAll = useCallback(async ({ esRefresco = false } = {}) => {
        if (esRefresco) setRefrescando(true);
        const yearsParam = selectedYears.length > 0 ? `&years=${selectedYears.join(',')}` : '';
        const results = await Promise.allSettled([
            api.get(`/admin/dashboard-stats?status=Activo${yearsParam}`),
            api.get('/admin/executive-stats'),
            api.get('/admin/year-comparison'),
            api.get('/admin/savings-evolution'),
        ]);
        const okStats = results[0].status === 'fulfilled';
        if (okStats) {
            setStats(results[0].value.data);
            setError(null);
            setFalloRefresco(false);
            setUltimaCarga(new Date());
        } else if (!esRefresco) {
            setError('No se pudieron cargar los indicadores financieros.');
        } else {
            setFalloRefresco(true);
        }
        if (results[1].status === 'fulfilled') setExecStats(results[1].value.data);
        if (results[2].status === 'fulfilled') { setYearCmp(results[2].value.data); setYearCmpError(false); }
        else setYearCmpError(true);
        // Silencioso a propósito, igual que execStats/yearCmp: un fallo aquí no
        // debe tumbar el resto del panel, solo dejar sin datos esta tarjeta.
        if (results[3].status === 'fulfilled') setSavingsEvo(results[3].value.data);
        setLoading(false);
        setRefrescando(false);
    }, [selectedYears]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const hoyKey = useMemo(() => {
        const d = new Date();
        return d.getFullYear() * 12 + d.getMonth();
    }, []);
    const serieMovimiento = useMemo(() => buildSerieMensual(savingsEvo, hoyKey), [savingsEvo, hoyKey]);

    // Refresco automático cada 2 minutos, igual que el Panel Ejecutivo — el dato
    // se refresca de verdad en vez de prometer "en vivo" sobre un fetch único.
    useEffect(() => {
        const id = setInterval(() => fetchAll({ esRefresco: true }), 120000);
        return () => clearInterval(id);
    }, [fetchAll]);

    // Llega con hash cuando "Cambios" activa la vista previa de una sección
    // oculta. React Router no hace el scroll del navegador, y el ancla no existe
    // en el DOM hasta que hay datos que pintar — de ahí la espera.
    useEffect(() => {
        if (!location.hash || loading) return;
        const id = decodeURIComponent(location.hash.slice(1));
        const timer = setTimeout(() => {
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
        return () => clearTimeout(timer);
    }, [location.hash, loading]);

    if (loading && !stats) {
        return <div className="flex items-center justify-center min-h-[300px] text-gray-400 text-sm">Cargando indicadores financieros…</div>;
    }

    if (error && !stats) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-2">
                <p className="text-sm text-gray-500">{error}</p>
                <p className="text-xs text-gray-400">Verifica que el servidor backend esté actualizado y corriendo.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5 max-w-6xl mx-auto animate-fade-in">
            <style>{`
                @media print {
                    * { overflow: visible !important; max-height: none !important; }
                    .print\\:hidden { display: none !important; }
                    @page { size: A4 landscape; margin: 12mm; }
                }
            `}</style>

            {/* Barra de acciones. El título y la descripción de la pantalla los
                pinta ahora el encabezado del layout (utils/paginasInfo.js), así
                que aquí solo quedan los controles: sello de última carga a la
                izquierda, filtro de años e impresión a la derecha. */}
            <div className="flex items-center justify-between gap-3 flex-wrap bg-white rounded-2xl border border-gray-200 shadow-sm px-3 py-2.5">
                <div>
                    <div className="flex items-center gap-2">
                        {ultimaCarga && (
                            <button
                                onClick={() => fetchAll({ esRefresco: true })}
                                disabled={refrescando}
                                title={falloRefresco
                                    ? 'El último intento de actualizar falló. Los datos que ves son los de la hora indicada.'
                                    : 'Actualizar ahora'}
                                className={`print:hidden text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                                    falloRefresco
                                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                            >
                                <RefreshCw className={`h-3 w-3 ${refrescando ? 'animate-spin' : ''}`} />
                                {refrescando
                                    ? 'Actualizando…'
                                    : `${falloRefresco ? 'Sin conexión · datos' : 'Datos'} de las ${ultimaCarga.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3" data-html2canvas-ignore="true">
                    <div className="print:hidden">
                        <YearMultiSelect selectedYears={selectedYears} onChange={setSelectedYears} />
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="print:hidden inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-dark text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
                    >
                        <Printer className="h-4 w-4" /> Descargar / imprimir
                    </button>
                </div>
            </div>

            {/* Mismo lenguaje que las secciones que contiene (comparador interanual,
                resultados del año): contenedor blanco con borde y el encabezado
                compartido. Antes abría con una barra gris y el título en verde,
                un tercer formato dentro de la misma pantalla. */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
                <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100">
                    <SectionHeader
                        icono={Activity}
                        titulo="Panel de Inteligencia Financiera & Actividad"
                        subtitulo="Estado del fondo, comparativo interanual y diagnóstico"
                    />
                </div>
                <div>
                    {/* Sin onEditMeta: editar la meta anual es una acción administrativa
                        que ya vive en el Panel Principal del admin — esta página es de
                        solo lectura para cualquier rol que la visite. */}
                    <FinancialChart
                        stats={stats}
                        execStats={execStats}
                        yearCmp={yearCmp}
                        yearCmpError={yearCmpError}
                        selectedYears={selectedYears}
                        /* Las tarjetas de riesgo suben aquí, pegadas al veredicto
                           ejecutivo que encabeza el panel: son el detalle que explica
                           esa franja. Antes cerraban la página, después del
                           diagnóstico, donde casi nadie llegaba a leerlas.
                           Sin onSociosMoraClick: el detalle nominal (nombre + cédula
                           de cada socio en mora) es exclusivo del admin, y esta
                           página es de solo lectura para cualquier rol. Sin el
                           callback la tarjeta no se pinta clicable — nunca promete
                           un detalle que no puede abrir. */
                        slotRiesgo={riesgoVisible ? (
                            <div id="inteligencia.indicadoresRiesgo">
                                <RiskReturnIndicators
                                    stats={stats}
                                    loading={loading}
                                    className="px-6 pt-5 pb-6 bg-gray-50/70 border-b border-gray-100"
                                />
                            </div>
                        ) : null}
                    />
                </div>
            </div>

            {/* Trasladado desde Evolución de Ahorros: aquí siempre a nivel de todo
                el fondo (esta página no tiene selector de socio). */}
            {serieMovimiento && (
                <MovimientoMensualChart
                    serie={serieMovimiento.serie}
                    subtitulo="Todo el fondo · abonos en verde, retiros y devoluciones en rojo hacia abajo ($ COP)"
                />
            )}
        </div>
    );
};

export default FinancialIntelligencePage;
