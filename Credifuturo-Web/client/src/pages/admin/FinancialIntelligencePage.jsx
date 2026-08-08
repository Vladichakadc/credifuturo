import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import { Activity, Printer, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import FinancialChart from '../../components/admin/FinancialChart';
import RiskReturnIndicators from '../../components/admin/RiskReturnIndicators';
import YearMultiSelect from '../../components/admin/YearMultiSelect';

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
    const [selectedYears, setSelectedYears] = useState([new Date().getFullYear(), new Date().getFullYear() + 1]);
    const [stats, setStats] = useState(null);
    const [execStats, setExecStats] = useState(null);
    const [yearCmp, setYearCmp] = useState(null);
    const [yearCmpError, setYearCmpError] = useState(false);
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
        setLoading(false);
        setRefrescando(false);
    }, [selectedYears]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Refresco automático cada 2 minutos, igual que el Panel Ejecutivo — el dato
    // se refresca de verdad en vez de prometer "en vivo" sobre un fetch único.
    useEffect(() => {
        const id = setInterval(() => fetchAll({ esRefresco: true }), 120000);
        return () => clearInterval(id);
    }, [fetchAll]);

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

            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Inteligencia Financiera</h1>
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
                    <p className="text-sm text-gray-500 mt-0.5">
                        Comparativo contra años anteriores, diagnóstico y riesgo del fondo — el mismo análisis del Panel Principal, sin el resto alrededor.
                    </p>
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

            <Card className="border-none shadow-md">
                <CardHeader className="bg-gray-50 border-b border-gray-100 pb-3 rounded-t-xl">
                    <CardTitle className="text-brand-primary flex items-center gap-2 font-black text-lg">
                        <Activity className="h-5 w-5 text-brand-primary" />
                        Panel de Inteligencia Financiera & Actividad
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0 bg-white rounded-b-xl overflow-hidden">
                    {/* Sin onEditMeta: editar la meta anual es una acción administrativa
                        que ya vive en el Panel Principal del admin — esta página es de
                        solo lectura para cualquier rol que la visite. */}
                    <FinancialChart
                        stats={stats}
                        execStats={execStats}
                        yearCmp={yearCmp}
                        yearCmpError={yearCmpError}
                        selectedYears={selectedYears}
                    />
                </CardContent>
            </Card>

            {/* Sin onSociosMoraClick: el detalle nominal (nombre + cédula de cada
                socio en mora) es exclusivo del admin, y esta página es de solo
                lectura para cualquier rol. Sin el callback, la tarjeta "Socios en
                Mora" no se pinta clicable — nunca promete un detalle que no puede
                abrir. */}
            <RiskReturnIndicators stats={stats} loading={loading} />
        </div>
    );
};

export default FinancialIntelligencePage;
