// Extraído de DashboardHome.jsx ("Indicadores de Riesgo y Rendimiento", la
// cuarta sección de "Indicadores por área") para poder mostrarlo también en
// pages/admin/FinancialIntelligencePage.jsx sin duplicar el cálculo de sus
// señales (índice de mora, socios en mora, cobertura de mora). El detalle
// nominal de "Socios en Mora" (nombre + cédula por socio) sigue siendo
// exclusivo del admin: se abre solo si el llamador pasa `onSociosMoraClick`.
// Sin ese prop la tarjeta NO se pinta clicable — antes un socio veía
// cursor-pointer y hover sobre una tarjeta cuyo clic no abría nada, porque
// el backend ya no le envía ese detalle a quien no es admin.
//
// "Retorno del Capital" vivía aquí como cuarta tarjeta; se subió al hero de
// FinancialChart.jsx, junto a "Proyección al Cierre" — ver el comentario
// sobre KPI 6 ahí. Mismo cálculo en los dos lugares, para que nunca muestren
// números distintos.
//
// ── Orden y lenguaje de las tres tarjetas ─────────────────────────────────
// El orden no es arbitrario: va de lo concreto a lo abstracto y termina en la
// tranquilidad, que es como un socio lee esto sin ser financiero.
//   1. Socios en Mora  — ¿a cuántas personas afecta?   (un conteo, lo más fácil)
//   2. Índice de Mora  — ¿cuánto dinero está vencido?  (un % de la cartera)
//   3. Cobertura       — ¿alcanza la caja para cubrirlo? (el veredicto)
// Antes empezaba por el índice: el dato más abstracto de los tres.
//
// Las tres comparten una sola gramática visual — pregunta en español llano,
// cifra, estado, y la MISMA escala de tres zonas con marcador — para que el
// lector aprenda a leerla una vez y le sirva en las tres. Antes la primera
// tarjeta traía una escala de zonas y las otras dos una barra de progreso,
// que se parecen pero significan cosas distintas. Cada escala dice además
// hacia qué lado está lo bueno, porque "11,8×" no se interpreta solo.
import React from 'react';
import { AlertTriangle, Users, ShieldCheck } from 'lucide-react';

const TONOS = {
    ok: { texto: 'text-emerald-700', fondo: 'from-emerald-50', badge: 'bg-emerald-100 text-emerald-700' },
    medio: { texto: 'text-amber-700', fondo: 'from-amber-50', badge: 'bg-amber-100 text-amber-700' },
    malo: { texto: 'text-red-700', fondo: 'from-red-50', badge: 'bg-red-100 text-red-700' },
};

const COP = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`;

// Escala de tres zonas con marcador. `zonas` va siempre de izquierda a derecha
// en el orden en que se pintan; `pos` es 0–100 sobre ese ancho.
const Escala = ({ zonas, pos, mejorHacia, referencia, ariaLabel }) => (
    <div>
        <div className="relative flex h-2 rounded-full overflow-hidden" role="img" aria-label={ariaLabel}>
            {zonas.map((z, i) => (
                <div key={i} className={z.color} style={{ width: `${z.ancho}%` }} />
            ))}
            <div
                className="absolute top-0 bottom-0 w-[3px] bg-gray-900 rounded-full shadow-sm"
                /* Nunca pegada al borde: en 0 o en el tope, la marca se perdería
                   contra el extremo de la barra y no se vería dónde estamos. */
                style={{ left: `${Math.max(1.5, Math.min(pos, 98))}%` }}
            />
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">
                {mejorHacia === 'izquierda' ? '◀ Mejor' : referencia}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">
                {mejorHacia === 'izquierda' ? referencia : 'Mejor ▶'}
            </span>
        </div>
    </div>
);

const Tarjeta = ({
    titulo, pregunta, Icono, tono, loading,
    valor, complemento, badge, zonas, pos, mejorHacia, referencia, ariaEscala, lectura,
    onClick,
}) => {
    const t = TONOS[tono] || TONOS.ok;
    const clicable = Boolean(onClick);
    return (
        <div
            className={`bg-gradient-to-br ${t.fondo} to-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm transition-all duration-200 ${
                clicable ? 'cursor-pointer hover:shadow-md hover:border-brand-primary/20 active:scale-[0.99]' : ''
            }`}
            onClick={onClick}
            title={clicable ? 'Ver detalle' : undefined}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{titulo}</p>
                    {/* La pregunta es lo que convierte un indicador técnico en algo
                        que un socio puede leer sin glosario. Altura fija para que
                        las tres cifras grandes queden alineadas entre columnas. */}
                    <p className="text-[11px] font-semibold text-gray-500 leading-snug mt-1 min-h-[30px]">{pregunta}</p>
                </div>
                <Icono className={`h-4 w-4 shrink-0 ${t.texto}`} />
            </div>

            <div className="flex items-end gap-1.5">
                <p className={`text-[30px] font-black font-mono leading-none ${loading ? 'text-gray-300' : t.texto}`}>
                    {loading ? '…' : valor}
                </p>
                {!loading && complemento && (
                    <p className="text-[13px] font-bold text-gray-400 mb-0.5">{complemento}</p>
                )}
            </div>

            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${t.badge}`}>{badge}</span>

            <Escala zonas={zonas} pos={pos} mejorHacia={mejorHacia} referencia={referencia} ariaLabel={ariaEscala} />

            <p className="text-[11px] text-gray-600 font-semibold leading-snug">{loading ? '' : lectura}</p>
        </div>
    );
};

const RiskReturnIndicators = ({ stats, loading = false, onSociosMoraClick, className = 'mb-8' }) => {
    const disponible = (stats?.saldoEnBanco || 0) + (stats?.rentabilidadCajaNU || 0);
    const carteraTotal = (stats?.carteraDia || 0) + (stats?.moraCarteraEP || 0);
    const mora = stats?.moraCarteraEP || 0;
    const sociosMora = stats?.sociosMoraCount || 0;
    const totalSocios = stats?.activeClientsCount || 1;

    // ── 1. Socios en Mora — cuántas personas, y qué parte del padrón son
    const sociosMoraPct = totalSocios > 0 ? (sociosMora / totalSocios) * 100 : 0;
    const sociosTono = sociosMora === 0 ? 'ok' : sociosMoraPct <= 10 ? 'medio' : 'malo';

    // ── 2. Índice de Mora — qué parte de la cartera está vencida
    const indiceMora = carteraTotal > 0 ? (mora / carteraTotal) * 100 : 0;
    const moraTono = indiceMora <= 3 ? 'ok' : indiceMora <= 5 ? 'medio' : 'malo';

    // ── 3. Cobertura de Mora — cuántas veces la caja cubre lo vencido
    const cobertura = mora > 0 ? disponible / mora : null;
    const coberturaTono = cobertura === null || cobertura >= 5 ? 'ok' : cobertura >= 2 ? 'medio' : 'malo';

    return (
        <div className={className}>
            <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-600" /> Indicadores de Riesgo y Rendimiento
            </h2>
            <p className="text-xs text-gray-500 font-semibold mt-1 mb-4">
                Tres señales para saber si el dinero que el fondo prestó se está recuperando bien. En cada escala,
                la marca negra indica dónde estamos hoy.
            </p>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <Tarjeta
                    titulo="Socios en Mora"
                    pregunta="¿A cuántos socios se les venció una cuota sin pagar?"
                    Icono={Users}
                    tono={sociosTono}
                    loading={loading}
                    valor={sociosMora}
                    complemento={`de ${totalSocios}`}
                    badge={sociosMora === 0 ? '✓ Ninguno' : `${sociosMoraPct.toFixed(0)}% del total`}
                    zonas={[
                        { color: 'bg-emerald-400', ancho: 10 },
                        { color: 'bg-amber-400', ancho: 15 },
                        { color: 'bg-red-400', ancho: 75 },
                    ]}
                    pos={Math.min(sociosMoraPct, 100)}
                    mejorHacia="izquierda"
                    referencia="Alerta sobre 10%"
                    ariaEscala={`${sociosMoraPct.toFixed(0)}% de los socios activos está en mora`}
                    lectura={sociosMora === 0
                        ? 'Todos los socios están al día con sus cuotas.'
                        : `${sociosMora} de ${totalSocios} socios activos (${sociosMoraPct.toFixed(0)}%) tiene cuotas vencidas.`}
                    onClick={onSociosMoraClick && sociosMora > 0 ? onSociosMoraClick : undefined}
                />

                <Tarjeta
                    titulo="Índice de Mora"
                    pregunta="¿Qué parte del dinero prestado está vencido sin cobrar?"
                    Icono={AlertTriangle}
                    tono={moraTono}
                    loading={loading}
                    valor={`${indiceMora.toFixed(1)}%`}
                    badge={indiceMora <= 3 ? '● Bajo' : indiceMora <= 5 ? '▲ Moderado' : '⚠ Alto'}
                    zonas={[
                        { color: 'bg-emerald-400', ancho: 12 },
                        { color: 'bg-amber-400', ancho: 8 },
                        { color: 'bg-red-400', ancho: 80 },
                    ]}
                    pos={indiceMora * 4}
                    mejorHacia="izquierda"
                    referencia="Alerta sobre 5%"
                    ariaEscala={`Índice de mora de ${indiceMora.toFixed(1)}% sobre la cartera`}
                    lectura={`${COP(mora)} vencidos de ${COP(carteraTotal)} prestados en total.`}
                />

                <Tarjeta
                    titulo="Cobertura de Mora"
                    pregunta="¿Cuántas veces alcanza la caja para cubrir lo vencido?"
                    Icono={ShieldCheck}
                    tono={coberturaTono}
                    loading={loading}
                    valor={cobertura === null ? '∞' : `${cobertura.toFixed(1)}×`}
                    badge={cobertura === null ? '✓ Sin mora' : cobertura >= 5 ? '✓ Sólida' : cobertura >= 2 ? '● Adecuada' : '⚠ Débil'}
                    zonas={[
                        { color: 'bg-red-400', ancho: 20 },
                        { color: 'bg-amber-400', ancho: 30 },
                        { color: 'bg-emerald-400', ancho: 50 },
                    ]}
                    pos={cobertura === null ? 100 : Math.min((cobertura / 10) * 100, 100)}
                    mejorHacia="derecha"
                    referencia="Débil bajo 2×"
                    ariaEscala={cobertura === null
                        ? 'Sin deuda vencida que cubrir'
                        : `La caja cubre ${cobertura.toFixed(1)} veces la mora`}
                    lectura={cobertura === null
                        ? 'No hay deuda vencida que cubrir.'
                        : `${COP(disponible)} disponibles en caja frente a ${COP(mora)} en mora.`}
                />
            </div>
        </div>
    );
};

export default RiskReturnIndicators;
