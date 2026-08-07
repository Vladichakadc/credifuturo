import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer, LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell
} from 'recharts';
import { TrendingUp, Calendar, Info } from 'lucide-react';

/**
 * Comparador interanual del fondo.
 *
 * Existe para responder la pregunta que el panel no podía responder antes:
 * "¿vamos mejor o peor que el año pasado?". La comparación anterior enfrentaba
 * lo acumulado del año en curso contra el total de 12 meses del año anterior,
 * así que el año en curso siempre parecía peor hasta el 31 de diciembre.
 *
 * Aquí la lectura es directa: cada año es una línea sobre el mismo eje de meses,
 * y una marca vertical señala el punto del calendario en el que estamos hoy.
 * Todo lo que quede a la izquierda de esa marca es comparable entre años; lo de
 * la derecha, en el año en curso, simplemente todavía no ha ocurrido.
 *
 * @param {object} data Respuesta de GET /admin/year-comparison
 */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Paleta corporativa (tailwind.config.js → theme.extend.colors):
//   brand.primary #166534 · brand.blue #1e40af · brand.light #84cc16
//   brand.gold #fbbf24 · state.error #ef4444
// Cada indicador conserva su color en todo el panel para que el usuario lo
// reconozca sin leer la leyenda.
const BRAND = {
    primary: '#166534',
    dark: '#052e16',
    light: '#84cc16',
    gold: '#fbbf24',
    blue: '#1e40af',
    error: '#ef4444',
};

const METRICAS = [
    { key: 'intereses', label: 'Intereses de préstamos', corto: 'Intereses', color: BRAND.primary },
    { key: 'ahorro', label: 'Ahorro de los socios', corto: 'Ahorro', color: BRAND.blue },
    { key: 'colocacion', label: 'Préstamos entregados', corto: 'Préstamos', color: BRAND.dark },
    // La mora es riesgo, no logro: lleva el rojo de estado, no un color de marca.
    { key: 'mora', label: 'Cobros por pagos tardíos', corto: 'Mora', color: BRAND.error },
];

// Color por ROL del año, no por antigüedad ordinal: el año en curso lleva el
// color de marca del indicador; el año de referencia (el inmediatamente
// anterior — la comparación que de verdad importa) lleva el dorado
// corporativo, para que se distinga a simple vista sin leer la leyenda; los
// años más atrás quedan en un gris neutro deliberadamente recesivo (siempre
// con su año escrito en el eje y en el tooltip, así que nunca dependen solo
// del color para identificarse).
//
// El dorado de marca (`brand.gold` #fbbf24) es demasiado claro para una línea
// sobre fondo blanco — falla el piso de contraste del validador de paletas.
// `AMBAR` es un paso más oscuro de la misma familia que sí lo pasa. Contra el
// rojo de mora, `AMBAR` queda a solo ΔE 11,8 (por debajo del piso de 15 —
// casi indistinguible incluso con visión de color normal, porque ámbar y rojo
// son vecinos en el círculo cromático); `AMBAR_MORA`, un tono más oscuro y
// terroso, sí se separa del rojo. Ambos verificados con
// scripts/validate_palette.js del skill de visualización de datos.
const AMBAR = '#d97706';
const AMBAR_MORA = '#854d0e';
const GRIS_ANTIGUO = '#94a3b8';

const fmtCOP = (v) => `$${Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

// Un crecimiento muy grande se lee mejor como múltiplo que como porcentaje:
// "11,8× lo del año pasado" comunica; "+1.083,8%" parece un error del sistema.
// Ocurre de verdad cuando el año anterior arrancó lento y su tramo comparable es
// diminuto — el cociente es correcto, pero el formato porcentual deja de servir.
const fmtVariacion = (pct) => {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
    if (pct >= 200) return `${(1 + pct / 100).toFixed(1).replace('.', ',')}×`;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
};
const fmtEje = (v) => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${n}`;
};

const TooltipComparador = ({ active, payload, label, acumulado, metrica }) => {
    if (!active || !payload?.length) return null;
    const filas = payload.filter(p => p.value !== null && p.value !== undefined);
    if (!filas.length) return null;
    // Se ordena de mayor a menor para que el año líder quede arriba.
    const orden = [...filas].sort((a, b) => (b.value || 0) - (a.value || 0));
    const base = orden.length > 1 ? orden[orden.length - 1].value : null;

    return (
        <div className="bg-white/95 backdrop-blur p-3 rounded-xl border border-gray-200 shadow-xl min-w-[210px]">
            <p className="text-xs font-black text-gray-800 mb-2">
                {label} · {acumulado ? 'acumulado del año' : 'del mes'}
            </p>
            <div className="space-y-1.5">
                {orden.map((p) => {
                    const dif = base && base > 0 && p.value !== base ? ((p.value / base - 1) * 100) : null;
                    return (
                        <div key={p.dataKey} className="flex items-center justify-between gap-4 text-xs">
                            <span className="flex items-center gap-1.5 font-bold text-gray-600">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                {p.name}
                            </span>
                            <span className="font-black font-mono text-gray-900">
                                {fmtCOP(p.value)}
                                {dif !== null && (
                                    <span className={`ml-1.5 font-bold ${dif >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {dif >= 0 ? '+' : ''}{dif.toFixed(0)}%
                                    </span>
                                )}
                            </span>
                        </div>
                    );
                })}
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-2 pt-2 border-t border-gray-100">
                {METRICAS.find(m => m.key === metrica)?.label} · pesos colombianos
            </p>
        </div>
    );
};

const YearComparisonChart = ({ data, error = false }) => {
    const aniosDisponibles = useMemo(
        () => (data?.series || []).map(s => s.anio).sort((a, b) => b - a),
        [data]
    );

    const [metrica, setMetrica] = useState('intereses');
    const [acumulado, setAcumulado] = useState(true);
    // Por defecto se muestran el año en curso y el anterior: la comparación que
    // el gerente hace todos los días. Los demás años quedan a un clic.
    const [aniosActivos, setAniosActivos] = useState(null);

    const activos = aniosActivos ?? aniosDisponibles.slice(0, 2);

    const toggleAnio = (anio) => {
        const yaEsta = activos.includes(anio);
        // Nunca dejar el gráfico sin ninguna serie: un lienzo vacío no comunica nada.
        if (yaEsta && activos.length === 1) return;
        setAniosActivos(yaEsta ? activos.filter(a => a !== anio) : [...activos, anio].sort((a, b) => b - a));
    };

    const mesCorte = data?.corte?.mes ?? null;
    const anioEnCurso = data?.corte?.anioActual ?? null;

    const chartData = useMemo(() => {
        if (!data?.series?.length) return [];
        return MESES.map((nombre, i) => {
            const mes = i + 1;
            const fila = { mes: nombre, mesNum: mes };
            data.series.forEach(serie => {
                if (!activos.includes(serie.anio)) return;
                // En el año en curso no se dibujan los meses que aún no han llegado:
                // una línea que cae a cero en septiembre se leería como un desplome.
                const esFuturo = serie.esAnioEnCurso && mesCorte !== null && mes > mesCorte;
                if (esFuturo) { fila[String(serie.anio)] = null; return; }
                fila[String(serie.anio)] = acumulado
                    ? serie.meses.filter(m => m.mes <= mes).reduce((s, m) => s + (m[metrica] || 0), 0)
                    : (serie.meses.find(m => m.mes === mes)?.[metrica] || 0);
            });
            return fila;
        });
    }, [data, activos, metrica, acumulado, mesCorte]);

    // Resumen al corte: el número que responde "¿vamos mejor o peor?".
    const resumen = useMemo(() => {
        if (!data?.series?.length || mesCorte === null) return null;
        const enCurso = data.series.find(s => s.esAnioEnCurso);
        const previos = activos.filter(a => a !== anioEnCurso).sort((a, b) => b - a);
        if (!enCurso || !previos.length) return null;
        const prev = data.series.find(s => s.anio === previos[0]);
        if (!prev) return null;
        const actual = enCurso.ytdAlCorte?.[metrica] ?? 0;
        const anterior = prev.ytdAlCorte?.[metrica] ?? 0;
        if (!anterior) return null;
        return { anioPrev: prev.anio, actual, anterior, pct: (actual / anterior - 1) * 100 };
    }, [data, activos, metrica, mesCorte, anioEnCurso]);

    const metaMetrica = METRICAS.find(m => m.key === metrica);
    const ambarDeReferencia = metrica === 'mora' ? AMBAR_MORA : AMBAR;

    // Año en curso → color de marca del indicador. Año de referencia (el
    // inmediatamente anterior, p. ej. 2025 visto desde 2026) → dorado
    // corporativo, para que la comparación que de verdad importa se distinga
    // a simple vista. Cualquier año más atrás → gris neutro, recesivo.
    const colorDe = (anio) => {
        if (anio === anioEnCurso) return metaMetrica.color;
        if (anio === anioEnCurso - 1) return ambarDeReferencia;
        return GRIS_ANTIGUO;
    };

    if (error) {
        return (
            <div className="py-12 text-center">
                <Info className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-bold">No se pudo cargar la comparación entre años.</p>
                <p className="text-xs text-gray-500 font-semibold mt-1">
                    Actualiza la página para reintentar. El resto del panel sigue funcionando.
                </p>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="py-16 text-center text-gray-500 text-sm font-semibold">
                Cargando la comparación entre años…
            </div>
        );
    }
    if (!aniosDisponibles.length) {
        return (
            <div className="py-16 text-center">
                <Calendar className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 font-bold">Aún no hay historial suficiente para comparar años.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── Controles ─────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 mr-1">Indicador</span>
                    {METRICAS.map(m => (
                        <button
                            key={m.key}
                            onClick={() => setMetrica(m.key)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                metrica === m.key
                                    ? 'text-white border-transparent shadow-sm'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                            style={metrica === m.key ? { backgroundColor: m.color } : undefined}
                        >
                            {m.corto}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 mr-1">Años</span>
                    {aniosDisponibles.map((anio) => {
                        const on = activos.includes(anio);
                        return (
                            <button
                                key={anio}
                                onClick={() => toggleAnio(anio)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${
                                    on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: on ? colorDe(anio) : '#d1d5db' }} />
                                {anio}
                                {anio === anioEnCurso && <span className="text-[9px] opacity-70">en curso</span>}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                    <button
                        onClick={() => setAcumulado(true)}
                        className={`px-3 py-1.5 rounded-l-lg text-xs font-bold border transition-all ${
                            acumulado ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-600 border-gray-200'
                        }`}
                    >
                        Acumulado
                    </button>
                    <button
                        onClick={() => setAcumulado(false)}
                        className={`-ml-1.5 px-3 py-1.5 rounded-r-lg text-xs font-bold border transition-all ${
                            !acumulado ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-600 border-gray-200'
                        }`}
                    >
                        Mes a mes
                    </button>
                </div>
            </div>

            {/* ── Lectura al corte ──────────────────────────────────────────── */}
            {resumen && (
                <div className={`rounded-xl border p-3 flex flex-wrap items-center gap-x-6 gap-y-2 ${
                    resumen.pct >= 0 ? 'bg-emerald-50/70 border-emerald-100' : 'bg-red-50/70 border-red-100'
                }`}>
                    <div className="flex items-center gap-2">
                        <TrendingUp className={`h-4 w-4 ${resumen.pct >= 0 ? 'text-emerald-600' : 'text-red-500 rotate-180'}`} />
                        <span className={`text-xl font-black font-mono ${resumen.pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {fmtVariacion(resumen.pct)}
                        </span>
                    </div>
                    <p className="text-xs font-bold text-gray-700 leading-snug">
                        {metaMetrica.label} de {anioEnCurso}: <span className="font-black font-mono">{fmtCOP(resumen.actual)}</span>
                        <span className="text-gray-400 font-semibold"> vs </span>
                        <span className="font-black font-mono">{fmtCOP(resumen.anterior)}</span> en {resumen.anioPrev},
                        <span className="text-gray-500 font-semibold"> hasta el mismo mes del calendario.</span>
                    </p>
                </div>
            )}

            {/* ── Gráfico ───────────────────────────────────────────────────── */}
            <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {acumulado ? (
                        <LineChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
                            <CartesianGrid stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="mes" tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }}
                                axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                            <YAxis tickFormatter={fmtEje} tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }}
                                axisLine={false} tickLine={false} width={64} domain={[0, 'auto']} />
                            <Tooltip content={<TooltipComparador acumulado={acumulado} metrica={metrica} />} />
                            <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }} iconType="plainline" />
                            {mesCorte !== null && (
                                <ReferenceLine x={MESES[mesCorte - 1]} stroke="#9ca3af" strokeDasharray="4 4"
                                    label={{ value: 'hoy', position: 'top', fontSize: 10, fontWeight: 800, fill: '#6b7280' }} />
                            )}
                            {activos.map((anio) => {
                                const esActual = anio === anioEnCurso;
                                return (
                                    <Line key={anio} type="monotone" dataKey={String(anio)} name={String(anio)}
                                        stroke={colorDe(anio)} strokeWidth={esActual ? 3 : 2}
                                        dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                                        connectNulls={false} />
                                );
                            })}
                        </LineChart>
                    ) : (
                        <BarChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
                            <CartesianGrid stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="mes" tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }}
                                axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                            <YAxis tickFormatter={fmtEje} tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }}
                                axisLine={false} tickLine={false} width={64} domain={[0, 'auto']} />
                            <Tooltip content={<TooltipComparador acumulado={acumulado} metrica={metrica} />}
                                cursor={{ fill: '#f3f4f6' }} />
                            <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }} />
                            {activos.map((anio) => (
                                <Bar key={anio} dataKey={String(anio)} name={String(anio)}
                                    fill={colorDe(anio)} radius={[4, 4, 0, 0]} maxBarSize={26} />
                            ))}
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>

            <p className="text-[11px] text-gray-500 font-semibold flex items-start gap-1.5 leading-snug">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gray-400" />
                <span>
                    Cifras en pesos colombianos. La línea punteada marca el mes en curso: solo lo que queda
                    a su izquierda es comparable entre años.
                    {metrica === 'intereses' && ' Los intereses se imputan al mes de vencimiento de la cuota.'}
                    {(metrica === 'ahorro' || metrica === 'mora') && ' El ahorro y la mora se imputan al período acreditado (mes abonado), no a la fecha de la transacción.'}
                </span>
            </p>
        </div>
    );
};

export default YearComparisonChart;
