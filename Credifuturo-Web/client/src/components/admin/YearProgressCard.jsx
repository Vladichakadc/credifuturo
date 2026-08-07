import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Maximize2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * Tarjeta de avance anual de un indicador del fondo.
 *
 * Reemplaza al comparativo anterior, que enfrentaba el acumulado del año en curso
 * contra el mismo tramo MEDIDO del año anterior. Ese tramo puede ser diminuto —en
 * 2025 los intereses hasta agosto fueron $104.460 frente a $1.206.913 del año
 * completo, porque el fondo colocó casi todo en el segundo semestre— y dividir
 * entre él producía cifras como "+1.472,6%": correctas pero ilegibles.
 *
 * Aquí la lectura se apoya en dos referencias que un socio entiende sin explicación:
 *   · cuánto llevamos frente a TODO lo del año pasado (avance);
 *   · si vamos por encima o por debajo del RITMO del año pasado (veredicto),
 *     comparando contra su resultado anual prorrateado al tiempo transcurrido.
 *
 * `tipo='saldo'` es para magnitudes que son una foto a una fecha (el patrimonio):
 * ahí sí corresponde comparar el saldo de hoy con el de cierre anterior, y no
 * aplica la noción de ritmo.
 */

// Rampa ordinal verde — validada con el verificador de paletas del proyecto:
// luminosidad monótona, saltos visibles y extremo claro por encima del piso de
// contraste. Termina en el verde corporativo #166534.
const RAMPA_VERDE = ['#6db88c', '#3a8560', '#166534'];
// Rampa ordinal roja para la mora, donde crecer no es un logro. También validada.
const RAMPA_ROJA = ['#e88a8a', '#d14545', '#b91c1c'];

const fmtCOP = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-CO')}`;
const fmtEje = (v) => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${n}`;
};
// Un crecimiento muy grande se lee mejor como múltiplo: "2,3×" comunica una
// magnitud; "+126,4%" a partir de cierto tamaño parece un error del sistema.
const fmtCambio = (pct) => {
    if (pct === null || !Number.isFinite(pct)) return '—';
    if (pct >= 200) return `${(1 + pct / 100).toFixed(1).replace('.', ',')}×`;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`;
};

const TooltipBarra = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl">
            <p className="text-xs font-black text-gray-800">{d.name}</p>
            <p className="text-sm font-black font-mono text-gray-900 mt-0.5">{fmtCOP(d.value)}</p>
            {d.nota && <p className="text-[11px] text-gray-500 font-semibold mt-1 max-w-[190px] leading-snug">{d.nota}</p>}
        </div>
    );
};

const YearProgressCard = ({
    title,
    subtitle,
    anioPrev,
    anioActual,
    totalPrev,          // resultado COMPLETO del año anterior
    actual,             // acumulado del año en curso (o saldo actual si tipo='saldo')
    proyeccion,         // estimado al cierre del año en curso (opcional)
    fraccionAnio,       // fracción de calendario transcurrida (0–1)
    tipo = 'flujo',     // 'flujo' | 'saldo'
    tono = 'verde',     // 'verde' | 'rojo'
    masEsMejor = true,
    nota,
    onExpand,
    // Modo compacto: solo el gráfico de barras, sin cifra grande ni veredicto ni
    // texto — para insertarse en un contenedor de altura fija ajena (el modal de
    // ChartExpandModal reserva 300px exactos para su children y superpone su
    // propio panel de análisis debajo; si aquí se renderiza la tarjeta completa,
    // el contenido se sale de esos 300px y queda debajo del panel).
    compact = false,
}) => {
    const rampa = tono === 'rojo' ? RAMPA_ROJA : RAMPA_VERDE;

    const m = useMemo(() => {
        const prev = Number(totalPrev) || 0;
        const act = Number(actual) || 0;

        // Avance sobre el año anterior completo. Es un porcentaje de PROGRESO
        // ("llevamos el 136% de lo del año pasado"), nunca una caída: que falten
        // meses no significa que el fondo vaya mal.
        const avancePct = prev > 0 ? (act / prev) * 100 : null;

        // Ritmo: el resultado del año anterior prorrateado al tiempo transcurrido.
        // Base estable, nunca cerca de cero — a diferencia del tramo medido, que en
        // un año de arranque lento puede ser casi nulo y disparar el cociente.
        const esperadoAhora = (tipo === 'flujo' && prev > 0 && fraccionAnio > 0)
            ? prev * fraccionAnio
            : null;
        const ritmoPct = esperadoAhora > 0 ? (act / esperadoAhora) * 100 - 100 : null;

        // Para un saldo, la comparación válida es directa contra el cierre anterior.
        const saldoPct = (tipo === 'saldo' && prev > 0) ? (act / prev) * 100 - 100 : null;

        const cambio = tipo === 'saldo' ? saldoPct : ritmoPct;
        const bueno = cambio === null ? null : (masEsMejor ? cambio >= 0 : cambio <= 0);

        // `eje` es la etiqueta corta del eje X: debe distinguir las barras del mismo
        // año (lo que llevamos vs el estimado), que si no quedarían rotuladas igual.
        const barras = [
            { name: `${anioPrev} (año completo)`, eje: `${anioPrev}`, value: prev, tono: 0, nota: 'Resultado final del año anterior' },
            {
                name: `${anioActual} (hasta hoy)`, eje: `${anioActual} hoy`, value: act, tono: 2,
                nota: tipo === 'saldo' ? 'Saldo a la fecha' : `Acumulado con el ${Math.round((fraccionAnio || 0) * 100)}% del año transcurrido`,
            },
            ...(proyeccion ? [{ name: `${anioActual} (estimado al cierre)`, eje: `${anioActual} est.`, value: Number(proyeccion) || 0, tono: 1, nota: 'Proyección prudente si se mantiene el ritmo' }] : []),
        ];

        return { prev, act, avancePct, esperadoAhora, cambio, bueno, barras };
    }, [totalPrev, actual, proyeccion, fraccionAnio, tipo, masEsMejor, anioPrev, anioActual]);

    const Icono = m.cambio === null ? Minus : (m.bueno ? TrendingUp : TrendingDown);
    const colorVeredicto = m.cambio === null
        ? { texto: 'text-gray-600', fondo: 'bg-gray-50', borde: 'border-gray-200' }
        : m.bueno
            ? { texto: 'text-emerald-700', fondo: 'bg-emerald-50', borde: 'border-emerald-100' }
            : { texto: 'text-red-700', fondo: 'bg-red-50', borde: 'border-red-100' };

    // Frase en lenguaje llano: es lo que realmente lee un socio.
    const frase = (() => {
        if (m.prev <= 0) return 'Es el primer año con datos de este indicador, así que todavía no hay con qué compararlo.';
        if (tipo === 'saldo') {
            const dif = m.act - m.prev;
            return dif >= 0
                ? `El saldo de hoy es ${fmtCOP(dif)} mayor que al cierre de ${anioPrev}.`
                : `El saldo de hoy es ${fmtCOP(Math.abs(dif))} menor que al cierre de ${anioPrev}.`;
        }
        if (m.avancePct >= 100) {
            return `Ya superamos todo lo de ${anioPrev} (${fmtCOP(m.prev)}) y aún falta parte del año.`;
        }
        return `Llevamos el ${m.avancePct.toFixed(0)}% de lo que se logró en todo ${anioPrev}, con el ${Math.round((fraccionAnio || 0) * 100)}% del año transcurrido.`;
    })();

    const chart = (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.barras} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                {/* Rejilla sólida y tenue: una línea punteada se lee como "proyección" */}
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="eje" tick={{ fontSize: 10, fontWeight: 700, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }} tickLine={false} interval={0} />
                <YAxis tickFormatter={fmtEje} tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                    axisLine={false} tickLine={false} width={52} domain={[0, 'auto']} />
                <Tooltip content={<TooltipBarra />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
                    {m.barras.map((b, i) => <Cell key={i} fill={rampa[b.tono]} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );

    if (compact) return chart;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide leading-tight">{title}</h4>
                    {subtitle && <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{subtitle}</p>}
                </div>
                {onExpand && (
                    <button onClick={onExpand} aria-label={`Ampliar ${title}`}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-brand-primary transition-colors shrink-0">
                        <Maximize2 className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Cifra principal — es la respuesta a "¿cuánto llevamos?" */}
            <div>
                <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider">
                    {tipo === 'saldo' ? 'Saldo actual' : `Acumulado ${anioActual}`}
                </p>
                <p className="text-3xl font-black text-gray-900 leading-none mt-1">{fmtCOP(m.act)}</p>
            </div>

            {/* Veredicto: por encima o por debajo del ritmo del año anterior */}
            <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${colorVeredicto.fondo} ${colorVeredicto.borde}`}>
                <Icono className={`h-5 w-5 shrink-0 ${colorVeredicto.texto}`} />
                <div className="min-w-0">
                    <p className={`text-base font-black leading-none ${colorVeredicto.texto}`}>
                        {fmtCambio(m.cambio)}
                        <span className="text-[11px] font-bold ml-1.5 opacity-80">
                            {tipo === 'saldo' ? `vs cierre ${anioPrev}` : `vs ritmo ${anioPrev}`}
                        </span>
                    </p>
                    {m.esperadoAhora !== null && (
                        <p className="text-[11px] text-gray-600 font-semibold mt-1 leading-snug">
                            A esta altura de {anioPrev} se llevaba {fmtCOP(m.esperadoAhora)}
                        </p>
                    )}
                </div>
            </div>

            {/* Avance sobre el año anterior — barra de progreso, no un porcentaje de caída */}
            {tipo === 'flujo' && m.avancePct !== null && (
                <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Avance sobre {anioPrev}</span>
                        <span className="text-sm font-black text-gray-800">{m.avancePct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(m.avancePct, 100)}%`, backgroundColor: rampa[2] }} />
                    </div>
                </div>
            )}

            {/* Gráfico: barras comparables, con el eje rotulado y sin adornos */}
            <div className="h-[150px] -mx-1">
                {chart}
            </div>

            {/* Vista de texto: los mismos valores sin depender del color ni del hover */}
            <dl className="text-[11px] border-t border-gray-100 pt-3 space-y-1">
                {m.barras.map((b, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                        <dt className="flex items-center gap-1.5 text-gray-600 font-semibold">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: rampa[b.tono] }} />
                            {b.name}
                        </dt>
                        <dd className="font-black text-gray-800 tabular-nums">{fmtCOP(b.value)}</dd>
                    </div>
                ))}
            </dl>

            <p className="text-[11px] text-gray-600 font-semibold leading-snug">{frase}</p>
            {nota && <p className="text-[11px] text-gray-500 font-medium leading-snug">{nota}</p>}
        </div>
    );
};

export default YearProgressCard;
