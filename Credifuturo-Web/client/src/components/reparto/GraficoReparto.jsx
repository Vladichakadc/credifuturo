import React, { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, LabelList,
} from 'recharts';
import { TrendingUp, Coins, Users, Percent } from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtCorto = (n) => {
    const v = Math.abs(Number(n) || 0);
    if (v >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${Math.round(n)}`;
};
const pct = (x, d = 2) => `${((Number(x) || 0) * 100).toFixed(d).replace('.', ',')}%`;
const primerNombre = (n) => String(n || '').split(' ').slice(0, 2).join(' ');

/**
 * Cómo se reparte la ganancia — la vista que un socio reconoce de su banco.
 *
 * Lo que había antes era una sola barra con un tramo por socio. Como imagen de
 * "esto es un pote que se divide" funcionaba, pero un socio no sacaba nada de
 * ella: veinticinco tramos sin rótulo, y para encontrar el suyo tenía que pasar
 * el cursor uno por uno. No respondía ninguna de las tres preguntas que sí se
 * hace: cuánto rindió el fondo, cuánto rindió lo MÍO, y cómo quedo respecto de
 * los demás.
 *
 * Ahora responde las tres:
 *
 *  · LA RENTABILIDAD arriba, que es como abre cualquier extracto de un fondo.
 *    `ganancia ÷ capital ponderado` es lo que rindió el capital que de verdad
 *    trabajó — y la de cada socio, `su utilidad ÷ lo que ahorró`, es la que
 *    varía según cuándo entró su dinero. Esa diferencia ES la lección del
 *    método, y hasta ahora no aparecía en ninguna parte.
 *  · UNA BARRA POR SOCIO, horizontal y ordenada. Con nombres largos en español
 *    la horizontal es la única legible; la vertical los apila en diagonal.
 *  · LA LÍNEA DEL PROMEDIO, que es lo que convierte una lista en una lectura:
 *    sin ella un socio ve su cifra pero no sabe si es mucha o poca.
 *
 * La barra propia va en dorado. En un fondo de veinticinco personas que se
 * conocen, poder encontrarse en un vistazo es la diferencia entre un gráfico
 * que se mira y uno que se salta.
 */
export default function GraficoReparto({ filas = [], yoId = null, monto = 0, totalPonderado = 0, onSeleccionar = null }) {
    const datos = useMemo(() => filas
        .filter(f => f.utilidad > 0)
        .map(f => ({
            id: f.id,
            nombre: primerNombre(f.fullName),
            completo: f.fullName,
            utilidad: f.utilidad,
            participacion: f.participacion,
            ahorro: f.capitalBase || 0,
            // Lo que rindió SU dinero: por cada peso ahorrado, cuánto recibe.
            // Varía con el momento en que entró, que es justo lo que el reparto
            // premia y lo que el socio puede cambiar el año que viene.
            rentabilidad: f.capitalBase > 0 ? f.utilidad / f.capitalBase : 0,
            esYo: f.id === yoId,
        })), [filas, yoId]);

    // Lo que rindió el capital que trabajó. Es la cifra con la que abre el
    // extracto de cualquier fondo, y la que la Junta lleva a la asamblea.
    const rentabilidadFondo = totalPonderado > 0 ? monto / totalPonderado : 0;
    const promedio = datos.length ? monto / datos.length : 0;
    const yo = datos.find(d => d.esYo) || null;

    if (!datos.length) {
        return (
            <div className="py-10 text-center text-sm text-gray-400">
                Todavía no hay ganancia que repartir en este período.
            </div>
        );
    }

    const kpis = [
        { icono: Coins, etiqueta: 'Ganancia repartida', valor: fmtCorto(monto), pie: `entre ${datos.length} socios` },
        { icono: TrendingUp, etiqueta: 'Rindió el fondo', valor: pct(rentabilidadFondo), pie: 'sobre el capital que trabajó', destacado: true },
        yo
            ? { icono: Percent, etiqueta: 'Rindió lo tuyo', valor: pct(yo.rentabilidad), pie: `por cada $100 ahorrados, $${(yo.rentabilidad * 100).toFixed(2).replace('.', ',')}`, propio: true }
            : { icono: Users, etiqueta: 'Reparto promedio', valor: fmtCorto(promedio), pie: 'por socio' },
    ];

    return (
        <div className="space-y-4">
            {/* ── La cabecera de extracto ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {kpis.map(k => (
                    <div key={k.etiqueta}
                        className={`rounded-xl border px-4 py-3 ${k.propio ? 'bg-brand-gold/10 border-brand-gold/40'
                            : k.destacado ? 'bg-brand-primary/5 border-brand-primary/20' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center gap-1.5 text-gray-400">
                            <k.icono className="h-3 w-3" />
                            <span className="text-[9px] font-black uppercase tracking-wider">{k.etiqueta}</span>
                        </div>
                        <p className={`text-xl font-black tabular-nums leading-tight mt-0.5 ${k.propio ? 'text-brand-gold' : k.destacado ? 'text-brand-primary' : 'text-gray-800'}`}>
                            {k.valor}
                        </p>
                        <p className="text-[10px] text-gray-400 leading-tight">{k.pie}</p>
                    </div>
                ))}
            </div>

            {/* ── Una barra por socio ── */}
            <div>
                <ResponsiveContainer width="100%" height={Math.max(200, datos.length * 30 + 58)}>
                    <BarChart data={datos} layout="vertical" margin={{ top: 18, right: 64, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        {/* Arranca en cero: recortar la base exageraría la diferencia
                            entre un socio y otro, que es justo lo que este gráfico
                            no puede permitirse deformar. */}
                        <XAxis type="number" domain={[0, 'dataMax']} tickFormatter={fmtCorto}
                            tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="nombre" width={110}
                            tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} interval={0} />
                        <Tooltip
                            cursor={{ fill: 'rgba(0,0,0,.04)' }}
                            contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}
                            formatter={(v, _n, item) => [
                                `${fmt(v)} · ${pct(item.payload.participacion)} del reparto · rindió ${pct(item.payload.rentabilidad)}`,
                                'Le corresponde',
                            ]}
                            labelFormatter={(_l, p) => p?.[0]?.payload?.completo || ''}
                        />
                        {/* El promedio: sin él, una cifra propia no se puede juzgar. */}
                        <ReferenceLine x={promedio} stroke="#b45309" strokeDasharray="5 4" strokeWidth={1.5}
                            label={{ value: `promedio ${fmtCorto(promedio)}`, position: 'top', fill: '#b45309', fontSize: 10, fontWeight: 700 }} />
                        <Bar dataKey="utilidad" radius={[0, 6, 6, 0]} maxBarSize={20}
                            onClick={(d) => onSeleccionar?.(d.payload)}
                            className={onSeleccionar ? 'cursor-pointer' : ''}>
                            {datos.map(d => (
                                <Cell key={d.id} fill={d.esYo ? '#fbbf24' : '#166534'} />
                            ))}
                            <LabelList dataKey="utilidad" position="right" formatter={fmtCorto}
                                style={{ fontSize: 10, fontWeight: 700, fill: '#4b5563' }} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500 mt-1">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-brand-primary" /> lo que le corresponde a cada socio</span>
                    {yo && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-brand-gold" /> tú</span>}
                    <span className="text-gray-400">Cifras en pesos · {monto > 0 ? fmt(monto) : '—'} repartidos</span>
                </div>
            </div>
        </div>
    );
}
