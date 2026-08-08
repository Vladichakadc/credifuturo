// Extraído de DashboardHome.jsx (Panel Principal) para poder reutilizarlo tal
// cual en pages/admin/FinancialIntelligencePage.jsx — la página dedicada para
// socios que muestra este mismo análisis sin el resto del Panel Principal
// (StatCards, modales de mora, exportación de informe) alrededor. Recibe
// exactamente los mismos props que antes, así que ambos lugares muestran
// siempre las mismas cifras: nunca dos lecturas distintas del mismo dato.
import React, { useState } from 'react';
import {
    DollarSign, AlertTriangle, BarChart3, TrendingUp, Activity, ShieldCheck,
    ActivitySquare, Maximize2, Edit2, LineChart as LineChartIcon
} from 'lucide-react';
import ChartExpandModal, { analyzeComparativeChart, analyzeIncomeDistribution } from '../ChartExpandModal';
import { computeFundProjection } from '../../utils/fundProjection';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import logo from '../../assets/logo.jpg';
import YearComparisonChart from './YearComparisonChart';
import YearProgressCard from './YearProgressCard';

const FinancialChart = ({ stats, execStats, yearCmp, yearCmpError = false, selectedYears = [], onEditMeta }) => {
    // Etiqueta del período que cubren las cifras (regla de gobernanza: declarar el período)
    const periodoLabel = selectedYears.length > 0 ? selectedYears.join(' – ') : 'todos los años';
    const [expandDonut, setExpandDonut] = useState(false);
    const [expandComp, setExpandComp] = useState(null);

    if (!stats) return null;

    // Calcular valores principales
    const disponible = (stats.saldoEnBanco || 0) + (stats.rentabilidadCajaNU || 0);
    const mora = stats.moraCarteraEP || 0;
    // carteraDia viene del backend: cuotas Pendiente en el rango de años cuya fechaPagoMax >= hoy
    const prestadoVigente = stats.carteraDia || 0;

    const total = disponible + prestadoVigente;

    // (Se eliminaron aquí el array `data` y el componente `CustomTooltip`: restos de
    // un PieChart retirado hace tiempo, sin ninguna referencia en el render. Además
    // definían una paleta —Disponible púrpura, Cartera azul— que contradecía la que
    // sí se pinta en la leyenda del KPI de Capital Total.)

    const riskIndex = total > 0 ? ((mora / total) * 100).toFixed(1) : 0;
    const liquidity = total > 0 ? ((disponible / total) * 100).toFixed(1) : 0;

    // Baselines del año anterior — calculados por el backend desde la BD y AppSettings
    // (plan de mejora de gráficas: sin cifras congeladas en el código; los valores
    // 2025 quedan como semilla por defecto en dashboard-stats si AppSettings está vacío).
    const baselinePrestamos = Number(stats?.baselines?.prestamos) || 29750000;
    const baselinePatrimonio = Number(stats?.baselines?.patrimonio) || 36126201;
    const baselineIntereses = Number(stats?.baselines?.intereses) || 1206913;
    const baselineAnio = stats?.baselines?.anio || 2025;
    // NU: sin serie histórica por año (saldo único editado manualmente) — gobernado
    // por AppSetting rentabilidadCajaNUCierre{año}, igual patrón que patrimonioCierre.
    // Mora: sí tiene serie histórica real (Saving.valorAPenalizar por año) — dinámico.
    const baselineNU = Number(stats?.baselines?.nu) || 1029139;
    const baselineMora = Number(stats?.baselines?.mora) || 0;
    // Ganancia REAL del año anterior = suma de los 3 baselines de arriba. Distinto,
    // a propósito, de "rentabilidad2025"/metaGanancia más abajo — esa es la META del
    // comité para el año EN CURSO, no el resultado real del año anterior; mezclarlas
    // hacía que "Ganancia total del fondo · 2025" no coincidiera con la suma real de
    // sus 3 filas apenas alguno de los 3 baselines dejara de ser el valor congelado.
    const gananciaReal2025 = baselineIntereses + baselineNU + baselineMora;

    // ── Ganancia del año en curso (YTD) ───────────────────────────────────────
    // Se toma de fundProjection.js, la fuente ÚNICA del fondo, igual que hacen el
    // Panel Ejecutivo y el Ranking de Ahorro. Antes este panel sumaba sus propios
    // campos, lo que arrastraba dos errores: contaba intereses de cuotas de 2027 ya
    // pagadas (el selector de años de la página trae [año actual, año siguiente]) y
    // usaba solo estado 'Pago' mientras el baseline del año anterior usa
    // ('Pago','Abono'). El fallback conserva el cálculo anterior por si la serie del
    // Panel Ejecutivo no cargó.
    const anioActualProyeccion = new Date().getFullYear();
    const proyeccionFondo = computeFundProjection({ exec: execStats, stats, anioActual: anioActualProyeccion });
    const rentabilidadActual = proyeccionFondo?.gananciaRealYtd
        ?? ((stats.totalInteresesPagados || 0) + (stats.rentabilidadCajaNU || 0)
            + (stats.totalPenaltyValue || 0) + (stats.descuentoAnualVigente || 0));

    // ── Comparación honesta contra el año anterior ────────────────────────────
    // El error que esto corrige: se dividía la ganancia ACUMULADA del año en curso
    // (unos pocos meses) entre la ganancia COMPLETA de 12 meses del año anterior. Con
    // el fondo rindiendo exactamente igual que el año pasado, ese cociente marca
    // "-40%" en agosto y solo llegaría a 0% el 31 de diciembre: medía el calendario,
    // no el desempeño. Ahora se compara contra el MISMO CORTE del año anterior
    // (enero → mes actual), que es la única comparación entre iguales.
    //
    // Intereses y mora tienen serie mensual real, así que su corte es medido. El
    // rendimiento de la cuenta NU no tiene histórico mensual (el admin edita un único
    // saldo), así que se prorratea su cierre anual y se declara como estimado en la UI
    // en vez de fingir un dato que no existe.
    const cmpCorte = yearCmp?.corte || null;
    const fraccionAnio = cmpCorte?.fraccionAnio ?? null;
    const seriePrev = yearCmp?.series?.find(s => Number(s.anio) === Number(baselineAnio)) || null;

    // ── Base de comparación: el RITMO del año anterior ────────────────────────
    // Se compara la ganancia acumulada de este año contra la del año anterior
    // prorrateada a la misma fracción de calendario transcurrida.
    //
    // Por qué no se usa el tramo ene–<mes> MEDIDO del año anterior: porque cuando
    // ese tramo es pequeño el porcentaje se dispara y deja de informar. Caso real
    // de este fondo: en 2025 casi todo el interés venció en el segundo semestre,
    // así que su tramo hasta agosto fue de apenas ~$127 mil frente a ~$1,5 M del
    // año completo. Dividir la ganancia de este año entre esa base daba +2.308%:
    // aritméticamente cierto, pero ilegible y alarmante sin motivo.
    //
    // El prorrateo del año COMPLETO da una base estable (nunca cerca de cero) y
    // responde justo lo que la tarjeta promete: si el fondo va por encima o por
    // debajo del ritmo con que cerró el año pasado. Además usa `gananciaReal2025`,
    // la misma cifra que la tabla muestra en la columna del año completo, así que
    // no puede desalinearse con ella (antes el NU del comparador podía valer 0 si
    // faltaba su AppSetting de cierre, mientras la tabla mostraba el valor de
    // respaldo — dos números distintos para lo mismo).
    const gananciaPrevRitmo = (gananciaReal2025 > 0 && fraccionAnio !== null)
        ? gananciaReal2025 * fraccionAnio
        : null;
    // Avance sobre el TOTAL del año anterior: sigue siendo útil ("llevamos el 65% de lo
    // que ganamos en todo 2025"), pero es un porcentaje de avance, nunca una caída.
    const avanceSobreAnioCompleto = gananciaReal2025 > 0 ? (rentabilidadActual / gananciaReal2025) * 100 : null;
    const nombreMesCorte = cmpCorte
        ? new Date(cmpCorte.anioActual, cmpCorte.mes - 1, cmpCorte.dia).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
        : null;

    // Cortes por fuente. `null` significa "no hay serie para comparar" — se propaga
    // hasta la UI para mostrar "—" en vez de un 0 que se leería como una caída total.
    const interesesPrevYtd = seriePrev ? seriePrev.ytdAlCorte.intereses : null;
    const serieActual = yearCmp?.series?.find(s => s.esAnioEnCurso) || null;
    // Intereses de préstamos — bug real detectado y corregido: esta celda usaba
    // serieActual.ytdAlCorte.intereses, que corta las cuotas por su FECHA DE
    // VENCIMIENTO (fechaPagoMax) hasta el día de hoy. LoanPayment no guarda
    // fecha de pago real, solo la de vencimiento — así que cuando un socio paga
    // por adelantado una cuota con vencimiento posterior a hoy, ese corte la
    // excluye aunque el dinero YA esté cobrado. Consecuencia verificada: la fila
    // de la tabla mostraba $1.642.748 mientras "Ganancia total del fondo" (que sí
    // usa intCobradosAnio, sin cortar por día) sumaba $3.051.668 — las filas no
    // cuadraban con el total de su propia tabla, por $343.266 exactos: el valor
    // de las cuotas futuras ya pagadas. Se prioriza ahora intCobradosAnio (lo
    // realmente cobrado este año), que es lo que la columna promete ("lo que
    // llevamos") y lo mismo que ya usa el encabezado de ganancia — así ambas
    // cifras vuelven a sumar exacto. ytdAlCorte queda de respaldo si el endpoint
    // de comparación no cargó.
    const interesesActualYtd = proyeccionFondo?.intCobradosAnio
        ?? serieActual?.ytdAlCorte.intereses
        ?? (stats.totalInteresesPagados || 0);
    const moraActualYtd = serieActual?.ytdAlCorte.mora
        ?? proyeccionFondo?.moraYtdReal
        ?? (stats.totalPenaltyValue || 0);
    const colocacionPrevYtd = seriePrev ? seriePrev.ytdAlCorte.colocacion : null;
    const colocacionActualYtd = serieActual ? serieActual.ytdAlCorte.colocacion : (stats.totalPrestamos || 0);

    // Ahorro: mismo criterio que Préstamos/Intereses — el año anterior siempre
    // está cerrado (12 meses) y el año en curso es naturalmente parcial mientras
    // dure el año, así que ahorroPorAnio ya trae exactamente lo que
    // YearProgressCard espera sin necesidad de un corte adicional.
    const ahorroPorAnioArr = stats.ahorroPorAnio || [];
    const ahorroFilaPrev = ahorroPorAnioArr.find(a => Number(a.anio) === baselineAnio);
    const ahorroFilaActual = ahorroPorAnioArr.find(a => Number(a.anio) === baselineAnio + 1);
    const ahorroPrevTotal = ahorroFilaPrev?.total || 0;
    const ahorroActualTotal = ahorroFilaActual?.total || 0;
    const ahorroComposicionNota = (() => {
        if (!ahorroFilaActual || !ahorroFilaActual.total) return null;
        const mensualPct = Math.round((ahorroFilaActual.mensual / ahorroFilaActual.total) * 100);
        const aportesPct = 100 - mensualPct;
        return aportesPct > 0
            ? `${mensualPct}% es ahorro mensual recurrente y ${aportesPct}% son aportes iniciales de socios nuevos.`
            : 'El 100% proviene del ahorro mensual recurrente de los socios — la señal más sana de disciplina de ahorro.';
    })();
    // El numerador es la MISMA cifra que la tarjeta muestra en grande (la ganancia
    // acumulada del año, incluida la cuenta NU), para que el porcentaje y el monto
    // no puedan contar historias distintas.
    //
    // Guarda de arranque de año: en enero la fracción transcurrida es tan pequeña
    // que cualquier cociente se dispara. Antes de que haya un mes corrido no se
    // muestra porcentaje, se dice que aún es pronto.
    const FRACCION_MINIMA = 0.08; // ≈ un mes
    const baseComparableValida = gananciaPrevRitmo !== null
        && gananciaPrevRitmo > 0
        && fraccionAnio >= FRACCION_MINIMA;
    const growthVsPrevYtd = baseComparableValida
        ? ((rentabilidadActual / gananciaPrevRitmo) * 100 - 100)
        : null;
    const comparacionPrematura = fraccionAnio !== null && fraccionAnio < FRACCION_MINIMA;
    // Un crecimiento enorme se comunica mejor como múltiplo: "3,4× el ritmo de 2025"
    // en vez de "+240,0%", que a partir de cierto tamaño se lee como un error.
    // Ritmo del año anterior para una magnitud dada: su total prorrateado al
    // calendario transcurrido. Es la base que usan las tarjetas y los análisis.
    const ritmoPrev = (totalAnterior) => (fraccionAnio > 0 ? totalAnterior * fraccionAnio : totalAnterior);
    const fmtVariacion = (pct) => pct >= 200
        ? `${(1 + pct / 100).toFixed(1).replace('.', ',')}×`
        : `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`;

    // Dos % de cumplimiento por fila de la tabla "Fuente de ingreso", pedidos
    // explícitamente por el comité para no depender solo de las cifras en pesos:
    //
    // 1. "vs ritmo {año anterior}": compara lo que llevamos contra el RITMO del
    //    año anterior (su total prorrateado a la fracción de calendario ya
    //    transcurrida) — el mismo criterio "manzana con manzana" que usa el resto
    //    del panel, nunca contra el año anterior completo. `masEsMejor=false`
    //    invierte el color en Mora, donde crecer es una mala señal, no un logro.
    // 2. "% del estimado ya en caja": cuánto de la proyección de cierre ya está
    //    cobrado — responde "¿qué tan lejos vamos de la meta del año?", una
    //    pregunta distinta a la comparación con el año anterior.
    const badgeRitmo = (actual, baseline, masEsMejor = true) => {
        const base = ritmoPrev(baseline);
        if (!(base > 0) || comparacionPrematura) return null;
        const pct = ((actual / base) - 1) * 100;
        const favorable = masEsMejor ? pct >= 0 : pct < 0;
        return (
            <span className={`block text-[10px] font-bold mt-0.5 ${favorable ? 'text-emerald-600' : 'text-red-600'}`}>
                {pct >= 0 ? '▲' : '▼'} {fmtVariacion(pct)} vs ritmo {baselineAnio}
            </span>
        );
    };
    const badgeAvance = (actual, estimado) => {
        if (!(estimado > 0)) return null;
        const pct = Math.min(999, (actual / estimado) * 100);
        return (
            <span className="block text-[10px] font-semibold text-gray-400 mt-0.5">
                {pct.toFixed(0)}% del estimado ya en caja
            </span>
        );
    };

    const rentabilidad2025 = Number(stats?.baselines?.metaGanancia) || 2448052;
    const achievement = (rentabilidadActual / rentabilidad2025) * 100; // Porcentaje de cumplimiento de la meta
    const growthValue = achievement - 100; // Avance sobre la meta anual (NO es "vs año anterior")

    let growthBgClass = "bg-gray-50 border-gray-200 text-gray-500";
    let growthTextClass = "text-gray-900";
    let growthLabelClass = "text-gray-500";

    if (achievement < 80) {
        growthBgClass = "bg-red-50 border-red-100"; // Rojo muy suave (estilo Cartera en Mora)
        growthTextClass = "text-red-700";
        growthLabelClass = "text-red-600/70";
    } else if (achievement >= 80 && achievement < 100) {
        growthBgClass = "bg-orange-50 border-orange-100"; // Naranja suave
        growthTextClass = "text-orange-700";
        growthLabelClass = "text-orange-600/70";
    } else {
        growthBgClass = "bg-emerald-50 border-emerald-100"; // Verde suave
        growthTextClass = "text-emerald-700";
        growthLabelClass = "text-emerald-600/70";
    }

    // --- ESTIMADO AL CIERRE DE AÑO — mismo modelo que ExecutivePanelPage.jsx (utils/fundProjection.js) ---
    // Antes: proyeccionIntereses = stats.totalIntereses * 0.95, donde totalIntereses suma
    // TODOS los intereses agendados en el rango del selector de años de esta página (por
    // defecto año actual + año siguiente) — es decir, mezclaba intereses de 2027 en la
    // "proyección de cierre 2026" apenas alguien tocara ese filtro, o incluso por defecto
    // si hay cuotas ya agendadas para el año siguiente. El nuevo modelo usa únicamente
    // cobrado/agendado del año calendario en curso (independiente del selector de arriba)
    // más la tasa de recaudo real observada — igual que en el Panel Ejecutivo, para que
    // ambos paneles nunca muestren cifras distintas de "cuánto ganará el fondo este año".
    // Se muestra el escenario conservador (no "base"/optimista) en todas las
    // filas por decisión explícita: un solo número prudente, sin rangos ni notas.
    // (anioActualProyeccion y proyeccionFondo se calculan arriba, junto a la ganancia YTD)
    const proyeccionIntereses = proyeccionFondo?.intereses?.conservador ?? 0;
    const proyeccionCajaNU = proyeccionFondo?.nu?.conservador ?? 0;
    const proyeccionPenalidad = proyeccionFondo?.penalidad?.conservador ?? 0;
    const proyeccionTotal = proyeccionFondo?.total?.conservador ?? 0;


    return (
        <div className="flex flex-col w-full">
            {/* ── VEREDICTO EJECUTIVO ──────────────────────────────────────────── */}
            {(() => {
                const _aArr = stats.ahorroPorAnio || [];
                const _aLast = _aArr[_aArr.length - 1];
                const _aPrev = _aArr[_aArr.length - 2];
                const _aActual = _aLast ? _aLast.total : 0;
                const _aMeta = _aPrev ? _aPrev.total : 0;
                const _aOk = _aMeta > 0 ? (_aActual / _aMeta) >= 0.85 : true;
                const _score = [_aOk, parseFloat(riskIndex) <= 5, parseFloat(liquidity) >= 30, total >= baselinePatrimonio * 0.85, achievement >= 80].filter(Boolean).length;
                const _v = _score >= 4
                    ? { from: 'from-emerald-600', to: 'to-emerald-800', icon: '✓', title: 'Fondo Saludable', desc: 'Los indicadores clave están en zona positiva. El fondo opera con normalidad.', badgeTxt: 'ESTADO NORMAL' }
                    : _score >= 3
                    ? { from: 'from-amber-500', to: 'to-amber-700', icon: '▲', title: 'Requiere Revisión', desc: 'Algunos indicadores están fuera del rango óptimo. Revisar cartera y liquidez.', badgeTxt: 'ATENCIÓN' }
                    : { from: 'from-red-600', to: 'to-red-800', icon: '⚠', title: 'Alerta Operativa', desc: 'Múltiples indicadores requieren atención inmediata. Convocar revisión del comité.', badgeTxt: 'CRÍTICO' };
                return (
                    <div className={`bg-gradient-to-r ${_v.from} ${_v.to} px-6 py-4 flex items-center justify-between gap-4`}>
                        <div className="flex items-center gap-4">
                            <div className="bg-white/15 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">
                                <span className="text-xl font-black text-white">{_v.icon}</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white leading-none">{_v.title}</h3>
                                <p className="text-sm text-white/75 font-medium mt-0.5">{_v.desc}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-[11px] font-black px-3 py-1 rounded-full bg-white/20 text-white">{_v.badgeTxt}</span>
                            <div className="text-right">
                                <p className="text-[11px] text-white/50 font-bold uppercase tracking-wide">Actualizado</p>
                                <p className="text-[11px] font-black text-white">{new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── KPIs EJECUTIVOS — 5 métricas con delta vs 2025 ────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 border-b border-gray-100">
                {/* KPI 1: Capital Total */}
                <div className="bg-gradient-to-br from-emerald-50 to-white p-5 flex flex-col gap-3 border-b md:border-b-0 border-r border-gray-100">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Capital Total</p>
                        <div className="bg-emerald-100 p-1.5 rounded-xl"><DollarSign className="h-3.5 w-3.5 text-emerald-600" /></div>
                    </div>
                    <p className="text-[22px] font-black text-gray-900 font-mono leading-none">
                        ${Number(total).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </p>
                    {/* Aquí SÍ es válido comparar contra el año completo: el capital es un
                        saldo a una fecha (un stock), no un acumulado del período. Contrastar
                        el saldo de hoy con el saldo de cierre del año anterior compara dos
                        fotos equivalentes. Solo se corrige el año fijo en el texto. */}
                    {(() => {
                        const ref = baselinePatrimonio;
                        const pct = ((total / ref) * 100 - 100).toFixed(1);
                        const up = total >= ref;
                        return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{up ? '▲' : '▼'} {Math.abs(pct)}% vs cierre {baselineAnio}</span>;
                    })()}
                    <div>
                        <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                            <div className="bg-lime-500 rounded-l-full" style={{ width: `${total > 0 ? (disponible / total) * 100 : 0}%` }} />
                            <div className="bg-emerald-700 rounded-r-full flex-1" />
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold">
                            <span className="text-lime-600">● Disponible</span>
                            <span className="text-emerald-700">● Cartera</span>
                        </div>
                    </div>
                </div>

                {/* KPI 2: Liquidez — paleta semántica: verde = salud financiera, ámbar = atención */}
                <div className={`p-5 flex flex-col gap-3 border-b md:border-b-0 border-r border-gray-100 ${parseFloat(liquidity) >= 30 ? 'bg-gradient-to-br from-emerald-50 to-white' : 'bg-gradient-to-br from-amber-50 to-white'}`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Liquidez</p>
                        <div className={`p-1.5 rounded-xl ${parseFloat(liquidity) >= 30 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                            <ActivitySquare className={`h-3.5 w-3.5 ${parseFloat(liquidity) >= 30 ? 'text-emerald-600' : 'text-amber-600'}`} />
                        </div>
                    </div>
                    <p className="text-[26px] font-black text-gray-900 font-mono leading-none">
                        {liquidity}<span className="text-sm font-bold text-gray-400 ml-0.5">%</span>
                    </p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${parseFloat(liquidity) >= 50 ? 'bg-emerald-100 text-emerald-700' : parseFloat(liquidity) >= 30 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {parseFloat(liquidity) >= 50 ? '● Óptima' : parseFloat(liquidity) >= 30 ? '● Saludable' : '▲ Ajustada'}
                    </span>
                    <div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${parseFloat(liquidity) >= 30 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${liquidity}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold mt-1">${Number(disponible).toLocaleString('es-CO')} disponibles</p>
                    </div>
                </div>

                {/* KPI 3: Mora en Cartera */}
                <div className={`p-5 flex flex-col gap-3 border-b md:border-b-0 border-r border-gray-100 ${parseFloat(riskIndex) > 5 ? 'bg-gradient-to-br from-red-50 to-white' : 'bg-gradient-to-br from-blue-50 to-white'}`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Mora Cartera</p>
                        <div className={`p-1.5 rounded-xl ${parseFloat(riskIndex) > 5 ? 'bg-red-100' : 'bg-blue-100'}`}>
                            {parseFloat(riskIndex) > 5 ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> : <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />}
                        </div>
                    </div>
                    <p className="text-[26px] font-black text-gray-900 font-mono leading-none">
                        {riskIndex}<span className="text-sm font-bold text-gray-400 ml-0.5">%</span>
                    </p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${parseFloat(riskIndex) <= 3 ? 'bg-emerald-100 text-emerald-700' : parseFloat(riskIndex) <= 5 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                        {parseFloat(riskIndex) <= 3 ? '● Bajo' : parseFloat(riskIndex) <= 5 ? '● Aceptable' : '⚠ Atención'}
                    </span>
                    <div>
                        <div className="relative flex h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-400 w-[33%]" />
                            <div className="bg-amber-400 w-[17%]" />
                            <div className="bg-red-400 flex-1" />
                            <div className="absolute top-0 bottom-0 w-0.5 bg-gray-900 rounded-full" style={{ left: `${Math.min(parseFloat(riskIndex) * 2, 98)}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold mt-1">${Number(mora).toLocaleString('es-CO')} en mora</p>
                    </div>
                </div>

                {/* KPI 4: Ganancia YTD */}
                <div className={`p-5 flex flex-col gap-3 border-b md:border-b-0 border-r border-gray-100 bg-gradient-to-br ${achievement >= 100 ? 'from-emerald-50' : achievement >= 80 ? 'from-amber-50' : 'from-red-50'} to-white`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Ganancia {new Date().getFullYear()}</p>
                        <div className={`p-1.5 rounded-xl ${achievement >= 80 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                            <TrendingUp className={`h-3.5 w-3.5 ${achievement >= 80 ? 'text-emerald-600' : 'text-amber-600'}`} />
                        </div>
                    </div>
                    <p className="text-[19px] font-black text-gray-900 font-mono leading-none">
                        ${Math.round(rentabilidadActual).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </p>
                    {/* Antes esta insignia decía "vs {año anterior}" pero dividía entre la META
                        anual, no entre lo ganado el año anterior: dos tarjetas del panel podían
                        mostrar porcentajes distintos con la misma etiqueta. Ahora compara contra
                        el año anterior AL MISMO CORTE, que es lo que la etiqueta promete. */}
                    {growthVsPrevYtd !== null ? (
                        <span
                            title={`Ganancia acumulada de este año frente al ritmo de ${baselineAnio}: se compara contra el resultado de ese año prorrateado al ${fraccionAnio !== null ? (fraccionAnio * 100).toFixed(0) : '—'}% del calendario ya transcurrido.`}
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start border ${growthVsPrevYtd >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                            {growthVsPrevYtd >= 0 ? '▲' : '▼'} {growthVsPrevYtd >= 200 ? fmtVariacion(growthVsPrevYtd) : `${Math.abs(growthVsPrevYtd).toFixed(1)}%`} vs ritmo {baselineAnio}
                        </span>
                    ) : (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full self-start border bg-gray-50 text-gray-600 border-gray-200">
                            {comparacionPrematura ? 'Aún es pronto para comparar' : `Sin comparativo de ${baselineAnio}`}
                        </span>
                    )}
                    <div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${achievement >= 100 ? 'bg-emerald-500' : achievement >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(achievement, 100)}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold mt-1">{achievement.toFixed(0)}% de meta anual</p>
                    </div>
                </div>

                {/* KPI 5: Proyección Dic */}
                <div className="bg-gradient-to-br from-slate-50 to-white p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Proyección Dic</p>
                        <div className="bg-slate-100 p-1.5 rounded-xl"><BarChart3 className="h-3.5 w-3.5 text-slate-600" /></div>
                    </div>
                    <p className="text-[19px] font-black text-gray-900 font-mono leading-none">
                        ${Math.round(proyeccionTotal).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </p>
                    {/* Este porcentaje divide entre la META anual (AppSettings.metaGananciaAnual),
                        no entre lo ganado el año anterior. Decía "vs 2025" y coincidía solo porque
                        la meta se sembró con el resultado real de 2025; en cuanto el comité edite
                        la meta, la etiqueta habría mentido. */}
                    {(() => {
                        const pctExacto = (proyeccionTotal / rentabilidad2025) * 100 - 100;
                        const up = proyeccionTotal >= rentabilidad2025;
                        // Cuando la proyección cae casi exactamente sobre la meta, el
                        // redondeo a un decimal daba "▼ 0.0% vs meta anual": una flecha
                        // hacia abajo junto a un cero, que se lee como si el indicador
                        // estuviera roto. Por debajo de medio punto se dice lo que
                        // realmente ocurre — que va en línea con la meta.
                        if (Math.abs(pctExacto) < 0.5) {
                            return (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full self-start bg-emerald-100 text-emerald-700">
                                    ≈ En línea con la meta
                                </span>
                            );
                        }
                        return (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full self-start ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {up ? '▲' : '▼'} {Math.abs(pctExacto).toFixed(1)}% vs meta anual
                            </span>
                        );
                    })()}
                    <div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="bg-slate-500 h-full rounded-full" style={{ width: `${Math.min((proyeccionTotal / rentabilidad2025) * 100, 100)}%` }} />
                        </div>
                        {onEditMeta ? (
                            <button onClick={onEditMeta} className="text-[10px] text-gray-500 font-bold mt-1 hover:text-brand-primary transition-colors flex items-center gap-1" title="Editar meta anual">
                                Meta: ${Number(rentabilidad2025).toLocaleString('es-CO')} <Edit2 className="w-2.5 h-2.5" />
                            </button>
                        ) : (
                            <p className="text-[10px] text-gray-500 font-bold mt-1">Meta: ${Number(rentabilidad2025).toLocaleString('es-CO')}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Gráficos — 3 columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 border-b border-gray-100">

                {/* Chart 2: Capital del Fondo — composición patrimonial */}
                {(() => {
                    const aportes = stats.totalInitialContributions || 0;
                    const ahorros = Math.max(0, (stats.totalSavings || 0) - (stats.totalPenaltyValue || 0));
                    const tf = aportes + ahorros;
                    const ahorroPct = tf > 0 ? ((ahorros / tf) * 100) : 0;
                    const aportePct = tf > 0 ? ((aportes / tf) * 100) : 0;

                    const diagnostico = ahorroPct >= 60
                        ? { signal: '✓ Fondeo sano', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100', txt: `El ahorro recurrente (${ahorroPct.toFixed(0)}%) sostiene el capital — la base más robusta para una cooperativa. Cada peso de ahorro mensual adicional se traduce directamente en mayor cupo crediticio para los socios.` }
                        : ahorroPct >= 40
                        ? { signal: '● Fondeo mixto', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100', txt: `Balance entre ahorros (${ahorroPct.toFixed(0)}%) y aportes (${aportePct.toFixed(0)}%). Incrementar el ahorro mensual ampliaría la capacidad prestable de forma sostenible.` }
                        : { signal: '▲ Revisar fondeo', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100', txt: `Los aportes dominan (${aportePct.toFixed(0)}%). Fortalecer el ahorro mensual es la palanca de crecimiento más importante — convierte el fondo de capitalización puntual a acumulación continua.` };

                    return (
                        <div className="p-6 flex flex-col gap-4">
                            {/* Encabezado */}
                            <div>
                                <h3 className="text-[12px] font-black text-gray-800">Capital del Fondo</h3>
                                <p className="text-[10px] text-gray-400 mt-0.5">Composición del patrimonio · socios activos · ahorro neto de recargos por mora</p>
                            </div>

                            {/* Patrimonio total centrado */}
                            <div className="text-center py-2">
                                <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1">Patrimonio Total</p>
                                <p className="text-[26px] font-black text-gray-900 font-mono leading-none">
                                    ${Number(tf).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                </p>
                            </div>

                            {/* Barra de composición apilada */}
                            <div>
                                <div className="flex h-7 rounded-full overflow-hidden shadow-inner">
                                    <div className="bg-amber-400 flex items-center justify-center transition-all"
                                        style={{ width: `${aportePct}%` }}>
                                        {aportePct >= 15 && <span className="text-[11px] font-black text-white">{aportePct.toFixed(0)}%</span>}
                                    </div>
                                    <div className="bg-emerald-500 flex items-center justify-center flex-1 transition-all">
                                        <span className="text-[11px] font-black text-white">{ahorroPct.toFixed(0)}%</span>
                                    </div>
                                </div>
                                <div className="flex justify-between mt-2 text-[11px] font-bold">
                                    <span className="flex items-center gap-1 text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Base Patrimonial</span>
                                    <span className="flex items-center gap-1 text-emerald-600">Ahorro Recurrente<span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /></span>
                                </div>
                            </div>

                            {/* Stat cards */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                    <p className="text-[11px] font-black text-amber-600 uppercase tracking-wider">Aportes Iniciales</p>
                                    <p className="text-[13px] font-black text-amber-800 font-mono mt-0.5">${Number(aportes).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                                    <p className="text-[11px] text-amber-600/70 mt-0.5">{aportePct.toFixed(0)}% del capital</p>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                                    <p className="text-[11px] font-black text-emerald-600 uppercase tracking-wider">Ahorros Mensuales</p>
                                    <p className="text-[13px] font-black text-emerald-800 font-mono mt-0.5">${Number(ahorros).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                                    <p className="text-[11px] text-emerald-600/70 mt-0.5">{ahorroPct.toFixed(0)}% del capital</p>
                                </div>
                            </div>

                            {/* Diagnóstico condensado */}
                            <div className={`rounded-xl px-3 py-2.5 border mt-auto ${diagnostico.bg}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[11px] font-black uppercase tracking-widest ${diagnostico.color}`}>{diagnostico.signal}</span>
                                </div>
                                <p className={`text-[10px] leading-relaxed ${diagnostico.color.replace('700', '600')}`}>{diagnostico.txt}</p>
                            </div>
                        </div>
                    );
                })()}


                {/* Chart 3: Rentabilidad — col-span-2, nuevo layout: titular → donut izq + cards der */}
                <div className="lg:col-span-2 flex flex-col">
                    {(() => {
                        const rentSources = [
                            { label: 'Intereses de préstamos', value: stats.totalInteresesPagados || 0, hex: '#3b82f6', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', bar: 'bg-blue-400' },
                            { label: 'Rendimiento cuenta NU',  value: stats.rentabilidadCajaNU || 0,     hex: '#8b5cf6', bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700', bar: 'bg-violet-400' },
                            { label: 'Cobros por mora',        value: stats.totalPenaltyValue || 0,      hex: '#ef4444', bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-600',    bar: 'bg-red-400' },
                        ];
                        const totalRent = rentSources.reduce((s, x) => s + x.value, 0);
                        const sorted = [...rentSources].sort((a, b) => b.value - a.value);
                        const topPct = totalRent > 0 ? ((sorted[0].value / totalRent) * 100).toFixed(0) : 0;
                        const secondPct = totalRent > 0 ? ((sorted[1].value / totalRent) * 100).toFixed(0) : 0;

                        const analysisTexts = {
                            'Intereses de préstamos': <>La <strong>cartera crediticia</strong> lidera los ingresos con el {topPct}% — la estructura más sana para una cooperativa. Esta concentración es deseable pero concentra el riesgo: <strong>una caída en colocación o aumento de mora impacta el flujo directamente</strong>. El rendimiento NU ({secondPct}%) complementa como buffer. <strong>Acción clave:</strong> mora &lt;5%, sostener colocación y explorar instrumentos complementarios.</>,
                            'Rendimiento cuenta NU': <><strong className="text-amber-700">Señal de alerta:</strong> el NU lidera ({topPct}%) sobre la cartera ({secondPct}%). En una cooperativa sana el NU es complementario (15–25%), no estructural. Capital estacionado pierde la diferencia de 12–20 puntos entre tasa activa y rendimiento NU. <strong>Acción prioritaria:</strong> revisar política de aprobación y fijar meta mensual de colocación.</>,
                            'Cobros por mora': <><strong className="text-red-700">Alerta crítica:</strong> mora lidera ingresos ({topPct}%). Las penalidades no son sostenibles — erosionan la confianza y ocultan deterioro patrimonial. <strong>Plan urgente:</strong> auditar cartera vencida, cobro preventivo 15 días antes del vencimiento y revisar criterios de aprobación.</>,
                        };

                        return (
                            <>
                            {/* HOOK: Titular ganancia total */}
                            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-[12px] font-black text-gray-800">¿Cuánto está ganando el fondo?</h3>
                                    {/* El período es el AÑO EN CURSO, no el selector de años de la página:
                                        esta cifra viene de fundProjection.js, que siempre acota al año
                                        calendario vigente. Antes el rótulo decía "2026 – 2027" y sugería
                                        que la ganancia incluía el año siguiente. */}
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        Intereses y recargos de {anioActualProyeccion} al {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })} · Cta. NU: valor acumulado ingresado manualmente
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Ganancia Total</p>
                                        <p className="text-[26px] font-black text-emerald-700 font-mono leading-none">
                                            ${Math.round(totalRent).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                        </p>
                                    </div>
                                    <button onClick={() => setExpandDonut(true)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700 flex-shrink-0" title="Ampliar y analizar">
                                        <Maximize2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* BODY: Donut izquierda + fuentes derecha */}
                            <div className="flex flex-col md:flex-row flex-1">
                                {/* Donut — LEFT (visual principal) */}
                                <div className="md:w-[45%] flex items-center justify-center p-4 border-b md:border-b-0 md:border-r border-gray-100">
                                    <div className="relative w-full" style={{ height: 260 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart margin={{ top: 8, right: 40, bottom: 8, left: 40 }}>
                                                <Pie
                                                    data={rentSources}
                                                    cx="50%" cy="50%"
                                                    innerRadius="44%" outerRadius="70%"
                                                    dataKey="value" nameKey="label"
                                                    startAngle={90} endAngle={-270} paddingAngle={3}
                                                    label={({ cx, cy, midAngle, outerRadius, payload, percent }) => {
                                                        const RADIAN = Math.PI / 180;
                                                        const r = outerRadius + 18;
                                                        const x = cx + r * Math.cos(-midAngle * RADIAN);
                                                        const y = cy + r * Math.sin(-midAngle * RADIAN);
                                                        const anchor = x > cx ? 'start' : 'end';
                                                        const shortNames = { 'Intereses de préstamos': 'Intereses', 'Rendimiento cuenta NU': 'Cta. NU', 'Cobros por mora': 'Mora' };
                                                        if (percent < 0.04) return null;
                                                        return (
                                                            <g>
                                                                <text x={x} y={y - 12} textAnchor={anchor} fill={payload.hex} fontSize={12} fontWeight="800">{shortNames[payload.label]}</text>
                                                                <text x={x} y={y + 2} textAnchor={anchor} fill="#6b7280" fontSize={11} fontWeight="700">{(percent * 100).toFixed(0)}%</text>
                                                                <text x={x} y={y + 15} textAnchor={anchor} fill="#9ca3af" fontSize={10} fontWeight="600">${Math.round(payload.value).toLocaleString('es-CO')}</text>
                                                            </g>
                                                        );
                                                    }}
                                                    labelLine={{ stroke: '#d1d5db', strokeWidth: 1.5 }}
                                                >
                                                    {rentSources.map((s, i) => (
                                                        <Cell key={i} fill={s.hex} strokeWidth={0} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={({ active, payload }) => {
                                                    if (active && payload?.length) {
                                                        const d = payload[0];
                                                        const pct = totalRent > 0 ? ((d.value / totalRent) * 100).toFixed(1) : 0;
                                                        return (
                                                            <div className="bg-white p-2 border border-gray-100 shadow-lg rounded-lg text-xs">
                                                                <p className="font-bold text-gray-700">{d.payload.label}</p>
                                                                <p className="font-mono font-black" style={{ color: d.payload.hex }}>${Number(d.value).toLocaleString('es-CO')}</p>
                                                                <p className="text-gray-400">{pct}% del total</p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Total</span>
                                            <span className="text-[17px] font-black text-gray-900 font-mono leading-tight">${Math.round(totalRent).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                                            <span className="text-[11px] text-gray-400 font-bold">{new Date().getFullYear()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Fuentes + análisis — RIGHT */}
                                <div className="md:w-[55%] p-5 flex flex-col gap-3">
                                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Desglose por Fuente</p>

                                    {/* Source bars — compactos */}
                                    <div className="space-y-2">
                                        {sorted.map((item, idx) => {
                                            const pct = totalRent > 0 ? (item.value / totalRent) * 100 : 0;
                                            return (
                                                <div key={item.label} className={`rounded-xl p-2.5 ${item.bg}`}
                                                    style={{ border: `${idx === 0 ? 2 : 1}px solid ${item.hex}${idx === 0 ? '50' : '25'}` }}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-1.5">
                                                            {idx === 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: item.hex }}>#1</span>}
                                                            <span className={`text-[11px] font-black ${item.text} uppercase tracking-wide`}>{item.label}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] font-bold ${item.text} opacity-70`}>{pct.toFixed(0)}%</span>
                                                            <span className={`text-[11px] font-black ${item.text} font-mono`}>${Number(item.value).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-1 bg-white/60 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${item.bar}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Análisis del experto */}
                                    <div className="rounded-xl px-3 py-2.5 bg-gray-50 border border-gray-100 mt-auto">
                                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1">Análisis del Experto</p>
                                        <p className="text-[11px] text-gray-600 leading-relaxed">
                                            {analysisTexts[sorted[0].label] || analysisTexts['Intereses de préstamos']}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <ChartExpandModal
                                isOpen={expandDonut}
                                onClose={() => setExpandDonut(false)}
                                title="¿Cuánto está ganando el fondo? — Distribución de Ingresos"
                                analysisResult={analyzeIncomeDistribution({ totalInteresesPagados: stats.totalInteresesPagados, rentabilidadCajaNU: stats.rentabilidadCajaNU, totalPenaltyValue: stats.totalPenaltyValue })}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={rentSources} cx="50%" cy="50%" innerRadius="35%" outerRadius="60%" dataKey="value" nameKey="label" paddingAngle={3}
                                            label={({ cx, cy, midAngle, outerRadius, payload, percent }) => {
                                                const RADIAN = Math.PI / 180;
                                                const r = outerRadius + 22;
                                                const x = cx + r * Math.cos(-midAngle * RADIAN);
                                                const y = cy + r * Math.sin(-midAngle * RADIAN);
                                                const anchor = x > cx ? 'start' : 'end';
                                                const shortNames = { 'Intereses de préstamos': 'Intereses', 'Rendimiento cuenta NU': 'Cta. NU', 'Cobros por mora': 'Mora' };
                                                return (
                                                    <g>
                                                        <text x={x} y={y - 7} textAnchor={anchor} fill={payload.hex} fontSize={13} fontWeight="800">{shortNames[payload.label]}</text>
                                                        <text x={x} y={y + 9} textAnchor={anchor} fill="#6b7280" fontSize={12} fontWeight="700">{(percent * 100).toFixed(0)}%</text>
                                                    </g>
                                                );
                                            }}
                                            labelLine={{ stroke: '#d1d5db', strokeWidth: 1.5 }}
                                        >
                                            {rentSources.map((s, i) => <Cell key={i} fill={s.hex} strokeWidth={0} />)}
                                        </Pie>
                                        <Tooltip formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} contentStyle={{ fontSize: '11px', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </ChartExpandModal>
                            </>
                        );
                    })()}
                </div>
            </div>

            {/* Fila Inferior: ¿Cuánto está ganando el fondo? */}
            <div className="p-4 bg-gray-50/50 border-t border-gray-100">
                {(() => {
                    // El indicador principal compara contra el RITMO del año anterior
                    // (su resultado completo prorrateado al tiempo transcurrido). Si no
                    // hay con qué comparar, se declara así en vez de inventar un número.
                    const growthOk = growthVsPrevYtd === null || growthVsPrevYtd >= 0;

                    return (
                        <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                            <div className="w-full md:w-1/4">
                                {/* El título "¿Cuánto está ganando el fondo?" ya encabeza el bloque del
                                    donut, unas líneas más arriba dentro de esta misma tarjeta. Aquí se
                                    nombra lo que realmente hace esta sección: comparar contra el año
                                    anterior, en vez de repetir la misma pregunta dos veces. */}
                                <h3 className="text-base font-extrabold text-gray-900">¿Vamos mejor que el año pasado?</h3>
                                <p className="inline-block mt-1 text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wide">
                                    {fraccionAnio !== null
                                        ? `vs el ritmo de ${baselineAnio} · ${(fraccionAnio * 100).toFixed(0)}% del año`
                                        : `Comparado con ${baselineAnio}`}
                                </p>

                                <div className={`mt-3 border rounded-xl p-4 flex flex-col items-center justify-center shadow-sm transition-all duration-500 ${growthVsPrevYtd === null ? 'bg-gray-50 border-gray-200' : growthOk ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${growthVsPrevYtd === null ? 'text-gray-500' : growthOk ? 'text-emerald-600/70' : 'text-red-600/70'}`}>Resultado total</span>
                                    <span className={`text-3xl font-black font-mono ${growthVsPrevYtd === null ? 'text-gray-900' : growthOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {growthVsPrevYtd === null ? '—' : fmtVariacion(growthVsPrevYtd)}
                                    </span>
                                    {/* El % solo dice "cuánto más rápido"; el socio también necesita
                                        "cuánto más rápido EN PESOS" — la diferencia real entre lo
                                        acumulado y el ritmo del año anterior a esta misma altura. */}
                                    {gananciaPrevRitmo !== null && (
                                        <span className={`text-sm font-black font-mono mt-0.5 ${growthOk ? 'text-emerald-700/90' : 'text-red-700/90'}`}>
                                            {growthOk ? '+' : '−'}${Math.round(Math.abs(rentabilidadActual - gananciaPrevRitmo)).toLocaleString('es-CO')}
                                        </span>
                                    )}
                                    <span className={`text-[10px] mt-1 font-semibold text-center leading-snug ${growthVsPrevYtd === null ? 'text-gray-500' : growthOk ? 'text-emerald-700/80' : 'text-red-700/80'}`}>
                                        {growthVsPrevYtd === null
                                            ? (comparacionPrematura
                                                ? 'Aún es pronto en el año para comparar'
                                                : `Sin datos de ${baselineAnio} para comparar`)
                                            : growthOk
                                                ? `Vamos por encima del ritmo de ${baselineAnio}`
                                                : `Vamos por debajo del ritmo de ${baselineAnio}`}
                                    </span>
                                    <span className="text-[11px] mt-1.5 font-bold text-gray-500 text-center leading-snug">
                                        {gananciaPrevRitmo !== null
                                            ? `Ritmo de ${baselineAnio} a esta altura: $${Math.round(gananciaPrevRitmo).toLocaleString('es-CO')} · llevamos $${Math.round(rentabilidadActual).toLocaleString('es-CO')}`
                                            : 'Intereses + mora + cuenta NU'}
                                    </span>
                                </div>

                                {/* Avance sobre el año completo: dato útil, pero rotulado como lo que
                                    es (progreso), nunca como una caída. */}
                                {avanceSobreAnioCompleto !== null && (
                                    <div className="mt-2 bg-white border border-gray-200 rounded-xl p-3">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Avance del año</span>
                                            <span className="text-sm font-black font-mono text-gray-800">{avanceSobreAnioCompleto.toFixed(0)}%</span>
                                        </div>
                                        <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-brand-primary transition-all duration-700"
                                                style={{ width: `${Math.min(avanceSobreAnioCompleto, 100)}%` }} />
                                        </div>
                                        <p className="text-[10px] text-gray-500 font-semibold mt-1.5 leading-snug">
                                            Llevamos el {avanceSobreAnioCompleto.toFixed(0)}% de lo que se ganó en todo {baselineAnio}
                                            {fraccionAnio !== null && `, con el ${(fraccionAnio * 100).toFixed(0)}% del año transcurrido`}.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="w-full md:w-3/4 bg-white rounded-xl p-1 border border-gray-200 shadow-sm overflow-x-auto">
                                <table className="w-full text-sm min-w-[600px] border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100 text-gray-800 uppercase tracking-wider text-[11px]">
                                            <th className="text-left font-extrabold p-3 rounded-tl-lg">Fuente de ingreso</th>
                                            <th className="text-right font-extrabold p-3">{baselineAnio} completo</th>
                                            <th className="text-right font-extrabold p-3">Lo que llevamos en {baselineAnio + 1}</th>
                                            <th className="text-right font-extrabold p-3 text-brand-primary rounded-tr-lg">Estimado al cierre del año</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="p-3 text-gray-900 font-bold">
                                                Intereses de préstamos
                                                <p className="text-[10px] text-emerald-700 font-semibold">Lo que pagan los socios por sus préstamos</p>
                                            </td>
                                            <td className="p-3 text-right text-gray-500 font-bold bg-gray-50/50">${baselineIntereses.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-blue-700 border-l">
                                                ${Math.round(interesesActualYtd).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                {badgeRitmo(interesesActualYtd, baselineIntereses)}
                                            </td>
                                            <td className="p-3 text-right font-black border-l text-brand-primary">
                                                ${Math.round(proyeccionIntereses).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                {badgeAvance(interesesActualYtd, proyeccionIntereses)}
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="p-3 text-gray-900 font-bold">
                                                Rendimiento cuenta NU
                                                <p className="text-[10px] text-emerald-700 font-semibold">Intereses que genera el dinero guardado en NU</p>
                                            </td>
                                            <td className="p-3 text-right text-gray-500 font-bold bg-gray-50/50">${baselineNU.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-purple-700 border-l">
                                                ${Math.round(stats.rentabilidadCajaNU || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                {badgeRitmo(stats.rentabilidadCajaNU || 0, baselineNU)}
                                            </td>
                                            <td className="p-3 text-right font-black border-l text-brand-primary">
                                                ${Math.round(proyeccionCajaNU).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                {badgeAvance(stats.rentabilidadCajaNU || 0, proyeccionCajaNU)}
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="p-3 text-gray-900 font-bold">
                                                Cobros por pagos tardíos
                                                <p className="text-[10px] text-emerald-700 font-semibold">Recargo aplicado a socios con cuotas vencidas</p>
                                            </td>
                                            <td className="p-3 text-right text-gray-500 font-bold bg-gray-50/50">${baselineMora.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-red-600 border-l">
                                                ${Math.round(moraActualYtd).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                {badgeRitmo(moraActualYtd, baselineMora, false)}
                                            </td>
                                            <td className="p-3 text-right font-black border-l text-brand-primary">
                                                ${Math.round(proyeccionPenalidad).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                {badgeAvance(moraActualYtd, proyeccionPenalidad)}
                                            </td>
                                        </tr>
                                        <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                                            <td className="p-3 text-emerald-900 font-black text-base uppercase tracking-wider">Ganancia total del fondo</td>
                                            <td className="p-3 text-right text-gray-500 font-bold text-base">${gananciaReal2025.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                            <td className="p-3 text-right font-black text-emerald-700 text-lg border-l">
                                                ${Math.round(rentabilidadActual).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                {badgeRitmo(rentabilidadActual, gananciaReal2025)}
                                            </td>
                                            <td className="p-3 text-right font-black text-lg border-l rounded-br-lg text-emerald-800">
                                                ${Math.round(proyeccionTotal).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                {badgeAvance(rentabilidadActual, proyeccionTotal)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <p className="text-[11px] text-gray-500 font-semibold px-3 py-2 leading-snug">
                                    La columna de {baselineAnio} es el año <strong>completo</strong> (12 meses); la del año
                                    en curso es lo acumulado hasta hoy, así que aún le faltan meses. El porcentaje bajo cada
                                    fila de <strong>"lo que llevamos"</strong> compara contra el <strong>ritmo</strong> de
                                    {' '}{baselineAnio} (su resultado completo prorrateado a lo que ha transcurrido del año) —
                                    nunca contra el año anterior completo, que siempre marcaría "por debajo" hasta diciembre.
                                    El de <strong>"estimado al cierre"</strong> dice qué porcentaje de esa proyección ya está
                                    cobrado. El <strong>rendimiento de la cuenta NU</strong> entra en el total.
                                </p>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* ── Comparador interanual ─────────────────────────────────────── */}
            <div className="p-6 bg-white border-t border-gray-200" data-pdf-section="true">
                <div className="flex items-start gap-3 mb-5">
                    <div className="p-2 bg-brand-primary rounded-lg shadow-lg shadow-brand-primary/20 shrink-0">
                        <LineChartIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 leading-tight">Comparar con años anteriores</h3>
                        <p className="text-xs text-gray-500 font-semibold mt-1 leading-snug">
                            Elige el indicador y los años que quieras contrastar. Cada año se dibuja sobre los mismos
                            meses, así la comparación siempre es entre períodos equivalentes.
                        </p>
                    </div>
                </div>
                <YearComparisonChart data={yearCmp} error={yearCmpError} />
            </div>

            {/* Resultados del Año */}
            <div className="p-6 bg-slate-50/80 border-t border-gray-200" data-pdf-section="true">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-brand-primary rounded-lg shadow-lg shadow-brand-primary/20">
                        <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 leading-none">Resultados del Año — Fondo Credifuturo</h3>
                        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-tighter mt-1">
                            {nombreMesCorte
                                ? `Año en curso frente a ${baselineAnio}, medido hasta el ${nombreMesCorte} en ambos años`
                                : `¿Cómo vamos comparado con ${baselineAnio}?`}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <YearProgressCard
                        title="Ahorro de los Socios"
                        subtitle="Ahorro mensual + aportes iniciales, por año"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={ahorroPrevTotal}
                        actual={ahorroActualTotal}
                        fraccionAnio={fraccionAnio}
                        nota={ahorroComposicionNota}
                        onExpand={() => setExpandComp('ahorro')}
                    />
                    <YearProgressCard
                        title="Préstamos Entregados"
                        subtitle="Dinero colocado en créditos a los socios"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselinePrestamos}
                        actual={colocacionActualYtd}
                        fraccionAnio={fraccionAnio}
                        onExpand={() => setExpandComp('prestamos')}
                    />
                    {/* El patrimonio es un SALDO a una fecha, no un acumulado del
                        período: comparar la foto de hoy con la del cierre anterior sí
                        es válido, y la noción de "ritmo" no aplica. */}
                    <YearProgressCard
                        title="Patrimonio del Fondo"
                        subtitle="Cuánto vale el fondo hoy"
                        tipo="saldo"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselinePatrimonio}
                        actual={total}
                        fraccionAnio={fraccionAnio}
                        onExpand={() => setExpandComp('patrimonio')}
                    />
                    <YearProgressCard
                        title="Ganancias por Intereses"
                        subtitle="Lo que pagan los socios por sus préstamos"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselineIntereses}
                        actual={interesesActualYtd}
                        proyeccion={proyeccionIntereses}
                        fraccionAnio={fraccionAnio}
                        nota={`Además hay ${'$'}${Number(Math.max(0, (stats.totalIntereses || 0) - (stats.totalInteresesPagados || 0))).toLocaleString('es-CO', { maximumFractionDigits: 0 })} en intereses por cobrar: cuotas que los socios aún no han pagado. Cuando se paguen, se sumarán a esta cifra.`}
                        onExpand={() => setExpandComp('intereses')}
                    />
                    {/* NU no tiene serie mensual (el admin edita un único saldo), pero
                        sí un cierre anual guardado — se compara igual que Intereses. */}
                    <YearProgressCard
                        title="Rendimiento Cuenta NU"
                        subtitle="Interés que genera el dinero guardado en NU"
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselineNU}
                        actual={stats.rentabilidadCajaNU || 0}
                        proyeccion={proyeccionCajaNU}
                        fraccionAnio={fraccionAnio}
                        nota="Saldo actualizado a mano por el administrador según el extracto más reciente — no tiene registro mensual, por eso el estimado de cierre es una extrapolación simple."
                        onExpand={() => setExpandComp('nu')}
                    />
                    {/* Mora: tono rojo y masEsMejor=false — aquí crecer es una mala señal. */}
                    <YearProgressCard
                        title="Cobros por Pagos Tardíos"
                        subtitle="Recargo aplicado a socios con cuotas vencidas"
                        tono="rojo"
                        masEsMejor={false}
                        anioPrev={baselineAnio}
                        anioActual={baselineAnio + 1}
                        totalPrev={baselineMora}
                        actual={moraActualYtd}
                        proyeccion={proyeccionPenalidad}
                        fraccionAnio={fraccionAnio}
                        onExpand={() => setExpandComp('mora')}
                    />
                </div>

                {/* ── Modales de expansión de gráficas comparativas ── */}
                <ChartExpandModal isOpen={expandComp === 'ahorro'} onClose={() => setExpandComp(null)}
                    title={`Ahorro de los Socios — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Ahorro de los Socios', historic: ritmoPrev(ahorroPrevTotal), current: ahorroActualTotal, progressPct: Math.min((ahorroActualTotal / (ritmoPrev(ahorroPrevTotal) || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Ahorro de los Socios" subtitle="Ahorro mensual + aportes iniciales, por año" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={ahorroPrevTotal} actual={ahorroActualTotal} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'prestamos'} onClose={() => setExpandComp(null)}
                    title={`Préstamos Entregados — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Préstamos Entregados', historic: ritmoPrev(baselinePrestamos), current: colocacionActualYtd, progressPct: Math.min((colocacionActualYtd / (ritmoPrev(baselinePrestamos) || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Préstamos Entregados" subtitle="Dinero colocado en créditos a los socios" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselinePrestamos} actual={colocacionActualYtd} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'patrimonio'} onClose={() => setExpandComp(null)}
                    title={`Patrimonio del Fondo — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Patrimonio del Fondo', historic: baselinePatrimonio, current: total, projectedYearEnd: baselinePatrimonio + proyeccionTotal, progressPct: Math.min((total / (baselinePatrimonio || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Patrimonio del Fondo" subtitle="Cuánto vale el fondo hoy" tipo="saldo" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselinePatrimonio} actual={total} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'intereses'} onClose={() => setExpandComp(null)}
                    title={`Ganancias por Intereses — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Ganancias por Intereses', historic: ritmoPrev(baselineIntereses), current: interesesActualYtd, projectedYearEnd: proyeccionIntereses, progressPct: Math.min((interesesActualYtd / (ritmoPrev(baselineIntereses) || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Ganancias por Intereses" subtitle="Lo que pagan los socios por sus préstamos" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselineIntereses} actual={interesesActualYtd} proyeccion={proyeccionIntereses} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'nu'} onClose={() => setExpandComp(null)}
                    title={`Rendimiento Cuenta NU — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Rendimiento Cuenta NU', historic: ritmoPrev(baselineNU), current: stats.rentabilidadCajaNU || 0, projectedYearEnd: proyeccionCajaNU, progressPct: Math.min(((stats.rentabilidadCajaNU || 0) / (ritmoPrev(baselineNU) || 1)) * 100, 150) })}>
                    <YearProgressCard compact title="Rendimiento Cuenta NU" subtitle="Interés que genera el dinero guardado en NU" anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselineNU} actual={stats.rentabilidadCajaNU || 0} proyeccion={proyeccionCajaNU} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>
                <ChartExpandModal isOpen={expandComp === 'mora'} onClose={() => setExpandComp(null)}
                    title={`Cobros por Pagos Tardíos — Análisis vs ${baselineAnio}`}
                    analysisResult={analyzeComparativeChart({ title: 'Cobros por Pagos Tardíos', historic: ritmoPrev(baselineMora), current: moraActualYtd, projectedYearEnd: proyeccionPenalidad, progressPct: Math.min((moraActualYtd / (ritmoPrev(baselineMora) || 1)) * 100, 150), masEsMejor: false })}>
                    <YearProgressCard compact title="Cobros por Pagos Tardíos" subtitle="Recargo aplicado a socios con cuotas vencidas" tono="rojo" masEsMejor={false} anioPrev={baselineAnio} anioActual={baselineAnio + 1} totalPrev={baselineMora} actual={moraActualYtd} proyeccion={proyeccionPenalidad} fraccionAnio={fraccionAnio} />
                </ChartExpandModal>

                {/* ── Diagnóstico Financiero — 3 Insight Cards ─────────────────── */}
                {(() => {
                    const ahorroArr = stats.ahorroPorAnio || [];
                    const ahorroLast = ahorroArr[ahorroArr.length - 1];
                    const ahorroPrev = ahorroArr[ahorroArr.length - 2];
                    const ahorroYearActual = ahorroLast ? ahorroLast.anio : new Date().getFullYear();
                    const ahorroYearPrev = ahorroPrev ? ahorroPrev.anio : ahorroYearActual - 1;
                    const ahorroMeta = ahorroPrev ? ahorroPrev.total : 0;
                    const ahorroActual = ahorroLast ? ahorroLast.total : 0;
                    const ahorroPct = ahorroMeta > 0 ? ((ahorroActual / ahorroMeta) * 100).toFixed(1) : '0.0';
                    const ahorroDiff = ahorroActual - ahorroMeta;
                    const ahorroHealthy = parseFloat(ahorroPct) >= 95;

                    const prestamoMeta = baselinePrestamos;
                    const prestamoActual = stats.totalPrestamos || 0;
                    const prestamoPct = ((prestamoActual / (prestamoMeta || 1)) * 100).toFixed(1);

                    const interesesMeta = baselineIntereses;
                    const interesesActual = stats.totalInteresesPagados || 0;

                    const today = new Date();
                    const dayOfYear = Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24));
                    const pctYearElapsed = ((dayOfYear / 365) * 100).toFixed(0);

                    const interesesPaceTarget = interesesMeta * (dayOfYear / 365);
                    const interesesAheadOfPace = interesesActual >= interesesPaceTarget;
                    const interesesPacePct = interesesPaceTarget > 0 ? ((interesesActual / interesesPaceTarget) * 100).toFixed(1) : '0.0';

                    return (
                        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" data-pdf-section="true">
                            {/* Header */}
                            <div className="px-6 py-4 bg-gradient-to-r from-brand-primary to-emerald-800 flex items-center gap-3">
                                <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm flex-shrink-0">
                                    <ShieldCheck className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white">Diagnóstico Financiero — ¿Qué nos dicen los números?</h4>
                                    <p className="text-xs text-emerald-200 font-semibold mt-0.5">Análisis al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} · Llevamos el {pctYearElapsed}% del año</p>
                                </div>
                            </div>

                            {/* 3 Insight Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">

                                {/* Card 1: Ahorros */}
                                <div className={`p-5 flex flex-col gap-3 ${ahorroHealthy ? '' : 'bg-amber-50/40'}`}>
                                    <div className="flex items-start gap-2">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5 ${ahorroHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                                            {ahorroHealthy ? '✓' : '!'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Módulo 1 · Ahorro</p>
                                            <h5 className="text-sm font-black text-gray-900 leading-snug">¿Están ahorrando los socios?</h5>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${ahorroHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {ahorroHealthy ? 'BIEN' : 'REVISAR'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        En {ahorroYearPrev} los socios ahorraron <strong>${Number(ahorroMeta).toLocaleString('es-CO')}</strong>. Este año llevan <strong className={ahorroHealthy ? 'text-emerald-700' : 'text-amber-700'}>${Number(ahorroActual).toLocaleString('es-CO')}</strong> ({ahorroPct}% del año anterior).
                                        {ahorroDiff >= 0 ? ` Hay $${Number(ahorroDiff).toLocaleString('es-CO')} más que el año pasado.` : ` Hay $${Number(Math.abs(ahorroDiff)).toLocaleString('es-CO')} menos que el año pasado.`}
                                    </p>
                                    <div className={`rounded-lg p-3 mt-auto border ${ahorroHealthy ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                                        <p className="text-[11px] font-black uppercase tracking-wider mb-1 text-gray-500">Recomendación</p>
                                        <p className="text-[10px] font-semibold text-gray-700 leading-snug">
                                            {ahorroHealthy
                                                ? 'Mantener el ritmo. Reconocer públicamente a los socios cumplidos para sostener el hábito de ahorro.'
                                                : 'Identificar socios con aportes pendientes y hacer seguimiento personalizado antes del cierre de mes.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Card 2: Crédito y Cartera */}
                                <div className={`p-5 flex flex-col gap-3 ${parseFloat(riskIndex) > 5 ? 'bg-red-50/30' : ''}`}>
                                    <div className="flex items-start gap-2">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5 ${parseFloat(riskIndex) <= 5 ? 'bg-blue-500' : 'bg-red-500'}`}>
                                            {parseFloat(riskIndex) <= 5 ? '✓' : '!'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Módulo 2 · Crédito</p>
                                            <h5 className="text-sm font-black text-gray-900 leading-snug">¿Cómo está la cartera?</h5>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${parseFloat(riskIndex) <= 3 ? 'bg-emerald-100 text-emerald-700' : parseFloat(riskIndex) <= 5 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                            {parseFloat(riskIndex) <= 3 ? 'BAJO RIESGO' : parseFloat(riskIndex) <= 5 ? 'NORMAL' : 'ATENCIÓN'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Préstamos entregados: <strong className="text-blue-700">${Number(prestamoActual).toLocaleString('es-CO')}</strong> ({prestamoPct}% del nivel 2025).
                                        Mora actual: <strong className={parseFloat(riskIndex) > 5 ? 'text-red-700' : 'text-blue-700'}>{riskIndex}%</strong> del capital (<strong>${Number(mora).toLocaleString('es-CO')}</strong> en cuotas vencidas).
                                    </p>
                                    <div className={`rounded-lg p-3 mt-auto border ${parseFloat(riskIndex) <= 5 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                        <p className="text-[11px] font-black uppercase tracking-wider mb-1 text-gray-500">Recomendación</p>
                                        <p className="text-[10px] font-semibold text-gray-700 leading-snug">
                                            {parseFloat(riskIndex) <= 3
                                                ? 'Cartera saludable. Evaluar aprobación de nuevos préstamos — la liquidez lo permite.'
                                                : parseFloat(riskIndex) <= 5
                                                ? 'Mora aceptable. Activar recordatorios preventivos para cuotas próximas a vencer.'
                                                : 'Mora elevada. Priorizar gestión de cobro. Pausar nuevos préstamos hasta reducir el índice.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Card 3: Rentabilidad */}
                                <div className={`p-5 flex flex-col gap-3 ${achievement < 80 ? 'bg-red-50/30' : ''}`}>
                                    <div className="flex items-start gap-2">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5 ${achievement >= 100 ? 'bg-emerald-500' : achievement >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}>
                                            {achievement >= 80 ? '✓' : '!'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Módulo 3 · Rentabilidad</p>
                                            <h5 className="text-sm font-black text-gray-900 leading-snug">¿Está ganando el fondo?</h5>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${achievement >= 100 ? 'bg-emerald-100 text-emerald-700' : achievement >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                            {achievement >= 100 ? 'META' : achievement >= 80 ? 'EN CURSO' : 'REVISAR'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Ganancia acumulada: <strong className={achievement >= 80 ? 'text-emerald-700' : 'text-amber-700'}>${Math.round(rentabilidadActual).toLocaleString('es-CO')}</strong> ({achievement.toFixed(0)}% de meta).
                                        {interesesAheadOfPace
                                            ? ` Ritmo de intereses positivo (${interesesPacePct}% del esperado).`
                                            : ` Ritmo de intereses por debajo de lo esperado.`}
                                        Proyección dic: <strong>${Math.round(proyeccionTotal).toLocaleString('es-CO')}</strong>.
                                    </p>
                                    <div className={`rounded-lg p-3 mt-auto border ${achievement >= 100 ? 'bg-emerald-50 border-emerald-100' : achievement >= 80 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
                                        <p className="text-[11px] font-black uppercase tracking-wider mb-1 text-gray-500">Recomendación</p>
                                        <p className="text-[10px] font-semibold text-gray-700 leading-snug">
                                            {achievement >= 100
                                                ? 'Meta superada. Evaluar distribución del excedente o incremento del fondo de reserva.'
                                                : achievement >= 80
                                                ? `Ritmo adecuado para el ${pctYearElapsed}% del año. Mantener colocación y controlar mora.`
                                                : 'Revisar cuotas atrasadas y nivel de colocación para recuperar el ritmo de ingresos.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Acciones Prioritarias */}
                            <div className="mx-5 mb-4 mt-4 rounded-xl border border-gray-100 overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2 border-b border-gray-100">
                                    <Activity className="h-4 w-4 text-brand-primary" />
                                    <h5 className="text-[10px] font-black text-gray-700 uppercase tracking-wider">Acciones Prioritarias</h5>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {[
                                        {
                                            severity: parseFloat(riskIndex) > 5 ? 'high' : parseFloat(riskIndex) > 3 ? 'medium' : 'low',
                                            icon: '💳',
                                            title: 'Gestión de Cartera en Mora',
                                            action: parseFloat(riskIndex) > 5
                                                ? `Mora de ${riskIndex}% requiere atención urgente. Contactar socios deudores. Monto: $${Number(mora).toLocaleString('es-CO')}.`
                                                : `Mora en ${riskIndex}% — nivel aceptable. Activar recordatorios a socios con cuotas próximas a vencer.`
                                        },
                                        {
                                            severity: parseFloat(liquidity) < 30 ? 'high' : parseFloat(liquidity) < 50 ? 'medium' : 'low',
                                            icon: '💰',
                                            title: 'Gestión de Liquidez',
                                            action: parseFloat(liquidity) >= 50
                                                ? `Liquidez óptima (${liquidity}%). $${Number(disponible).toLocaleString('es-CO')} disponibles — evaluar nuevos préstamos.`
                                                : parseFloat(liquidity) >= 30
                                                ? `Liquidez saludable (${liquidity}%). Continuar aprobando préstamos con normalidad.`
                                                : `Liquidez ajustada (${liquidity}%). Priorizar cobro antes de aprobar nuevos créditos.`
                                        },
                                        {
                                            severity: achievement < 80 ? 'high' : achievement < 100 ? 'medium' : 'low',
                                            icon: '📈',
                                            title: 'Cumplimiento de Meta de Rentabilidad',
                                            action: achievement >= 100
                                                ? `Meta anual superada (${achievement.toFixed(0)}%). Evaluar distribución de excedentes.`
                                                : `Se lleva el ${achievement.toFixed(0)}% de la meta con el ${pctYearElapsed}% del año. Mantener ritmo para alcanzar $${Number(rentabilidad2025).toLocaleString('es-CO')}.`
                                        },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-start gap-3 px-4 py-3">
                                            <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${item.severity === 'high' ? 'bg-red-500' : item.severity === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                            <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-gray-800">{item.title}</p>
                                                <p className="text-[10px] text-gray-500 font-medium leading-snug mt-0.5">{item.action}</p>
                                            </div>
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full self-start flex-shrink-0 ${item.severity === 'high' ? 'bg-red-100 text-red-700' : item.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {item.severity === 'high' ? 'URGENTE' : item.severity === 'medium' ? 'ESTA SEMANA' : 'EN ORDEN'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* En Resumen */}
                            <div className="mx-5 mb-5 p-4 bg-gradient-to-r from-brand-primary/5 to-slate-100 rounded-xl border border-brand-primary/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <ActivitySquare className="h-4 w-4 text-brand-primary" />
                                    <h5 className="text-[10px] font-black text-brand-primary uppercase tracking-wider">En Resumen</h5>
                                </div>
                                <p className="text-[11px] text-gray-700 leading-relaxed font-medium">
                                    {ahorroHealthy && parseFloat(riskIndex) <= 5 && achievement >= 80
                                        ? <>El fondo <strong className="text-brand-primary">Credifuturo</strong> está operando bien al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}. Los socios ahorran, la mora es controlada y los ingresos van en la dirección correcta. La recomendación es mantener el ritmo de colocación y hacer seguimiento a socios con cuotas atrasadas para cerrar 2026 mejor que 2025.</>
                                        : <>El fondo <strong className="text-brand-primary">Credifuturo</strong> tiene señales que requieren atención al {today.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}. Revisar los indicadores marcados y ejecutar las acciones prioritarias listadas arriba para retomar el ritmo esperado y cerrar el año en positivo.</>
                                    }
                                </p>
                            </div>
                        </div>
                    );
                })()}

                <div className="mt-6 p-4 bg-white/60 border border-white rounded-2xl backdrop-blur-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <img src={logo} alt="Credifuturo" className="h-8 w-8 object-contain opacity-50 grayscale" />
                        <p className="text-[10px] text-gray-400 font-medium italic max-w-md">
                            * Los valores de "2025" son el cierre real del año anterior. Los valores de "2026" se actualizan automáticamente. El estimado usa: intereses agendados ×95% (absorbe posibles moras), NU al ritmo diario real observado, y penalidades en proyección lineal.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Actualizado automáticamente</p>
                        <p className="text-[10px] font-bold text-brand-primary">Panel de Gestión Credifuturo v2.0</p>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default FinancialChart;
