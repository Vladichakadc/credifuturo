import React from 'react';
import { PiggyBank, Percent, DollarSign, Layers, Users } from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * Lo que el fondo NO reparte.
 *
 * La asamblea puede decidir que una parte de la ganancia no se reparta: una
 * reserva, un fondo con un objetivo concreto, lo que se acuerde. La forma
 * evidente de hacerlo sería dejar editable la cifra de la ganancia — y sería un
 * error. La ganancia es un hecho contable que declara el Panel de
 * Administración; si se pudiera teclear, la pantalla repartiría un número
 * distinto del que el fondo dice haber ganado y en seis meses nadie sabría cuál
 * de los dos era el bueno.
 *
 * Lo que se decide es una RETENCIÓN, y lo repartido es la resta. Así el acta
 * lleva tres cifras separadas y auditables —lo que se ganó, lo que se retuvo y
 * para qué, lo que se repartió— en vez de un solo número sin historia.
 *
 * Se admite en pesos o en porcentaje porque las dos formas aparecen en las
 * actas: "el 10% de las utilidades" y "dos millones para el fondo de auxilios"
 * son la misma clase de decisión escrita de dos maneras.
 *
 * El destino es un campo de texto y no un adorno: una retención sin destino
 * escrito es dinero que se dejó de repartir sin que conste por qué.
 */
export default function Retencion({ retencion, onCambio, ganancia = 0, retenido = 0, aRepartir = 0, editable = true, reparto = null }) {
    const r = retencion || { tipo: 'porcentaje', valor: 0, alcance: 'general', destino: '' };
    const porSocio = r.alcance === 'porSocio';
    const set = (cambios) => onCambio?.({ ...r, ...cambios });
    const hayValor = Number(r.valor) > 0;

    return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 mb-3">
                <div className="bg-amber-100 rounded-lg p-1.5"><PiggyBank className="h-4 w-4 text-amber-700" /></div>
                <div>
                    <h3 className="text-sm font-bold text-gray-800">Valor o % a descontar antes de repartir</h3>
                    <p className="text-[11px] text-gray-500">
                        Lo que el fondo retiene para otro fin. Se aplica a todos de una vez, sin ir socio por socio.
                    </p>
                </div>
            </div>

            {/* El alcance va ARRIBA de todo porque cambia el significado de lo
                que se teclea debajo: el mismo "50.000" es una tajada del total o
                una cuota que paga cada socio. Decidirlo después de escribir la
                cifra es descubrir tarde que se cobró veinticinco veces. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {[
                    {
                        id: 'general', icono: Layers, titulo: 'De la bolsa común',
                        pie: 'Sale del total antes de repartir. Baja la parte de todos en proporción a lo que ahorraron.',
                    },
                    {
                        id: 'porSocio', icono: Users, titulo: 'A cada socio',
                        pie: 'Se le cobra a cada uno sobre su propia parte. Un valor fijo es una cuota igual por cabeza.',
                    },
                ].map(a => (
                    <button key={a.id} type="button" disabled={!editable}
                        onClick={() => set({ alcance: a.id })}
                        className={`text-left rounded-xl border px-3 py-2 transition-colors disabled:opacity-60 ${
                            (r.alcance === 'porSocio' ? 'porSocio' : 'general') === a.id
                                ? 'border-amber-500 bg-white ring-1 ring-amber-400'
                                : 'border-amber-200 bg-white/50 hover:bg-white'}`}>
                        <span className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                            <a.icono className="h-3.5 w-3.5 text-amber-600" /> {a.titulo}
                        </span>
                        <span className="block text-[10px] text-gray-500 leading-snug mt-0.5">{a.pie}</span>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr,2fr] gap-3 items-end">
                {/* El selector va primero: decide qué significa el número de al lado. */}
                <div className="inline-flex rounded-xl border border-amber-300 overflow-hidden bg-white self-end">
                    {[
                        { id: 'porcentaje', icono: Percent, titulo: porSocio ? 'Porcentaje de la parte de cada socio' : 'Porcentaje de la ganancia' },
                        { id: 'valor', icono: DollarSign, titulo: porSocio ? 'Valor en pesos que aporta cada socio' : 'Valor en pesos sobre el total' },
                    ].map(t => (
                        <button key={t.id} type="button" disabled={!editable}
                            onClick={() => set({ tipo: t.id })}
                            title={t.titulo}
                            className={`px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                                r.tipo === t.id ? 'bg-amber-500 text-white' : 'text-amber-700 hover:bg-amber-100'}`}>
                            <t.icono className="h-4 w-4" />
                        </button>
                    ))}
                </div>

                <label className="block">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        {r.tipo === 'porcentaje'
                            ? (porSocio ? 'Porcentaje de cada parte' : 'Porcentaje de la ganancia')
                            : (porSocio ? 'Valor por socio' : 'Valor total')}
                    </span>
                    <input
                        inputMode="numeric" disabled={!editable}
                        value={r.tipo === 'porcentaje'
                            ? String(r.valor ?? '')
                            : Number(String(r.valor ?? '').replace(/\D/g, '') || 0).toLocaleString('es-CO')}
                        onChange={(e) => {
                            const crudo = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
                            const n = r.tipo === 'porcentaje'
                                ? Math.min(100, Math.max(0, Number(crudo) || 0))
                                : Number(crudo.replace(/\./g, '')) || 0;
                            set({ valor: n });
                        }}
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-50"
                    />
                </label>

                <label className="block">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Destino de lo retenido</span>
                    <input
                        type="text" maxLength={200} disabled={!editable}
                        value={r.destino || ''}
                        onChange={(e) => set({ destino: e.target.value })}
                        placeholder="Ej.: fondo de auxilios, reserva 2027…"
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-50"
                    />
                </label>
            </div>

            {/* Una línea que dice qué va a pasar ANTES de guardar. Con el alcance
                por socio la cifra tecleada no es la que se recauda, así que
                enseñar solo lo tecleado sería enseñar el dato equivocado. */}
            {(retenido > 0 || (porSocio && hayValor && reparto?.totalAporteGeneral > 0)) && (
                <div className="mt-3 space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-amber-900 bg-amber-100/70 rounded-xl px-3 py-2">
                        {porSocio ? (
                            <>
                                <span>
                                    {r.tipo === 'porcentaje'
                                        ? `Cada socio aporta el ${Number(r.valor)}% de su parte:`
                                        : `${fmt(r.valor)} de cada uno de los ${reparto?.aportantes ?? 0} socios:`}
                                </span>
                                <strong className="tabular-nums">{fmt(reparto?.totalAporteGeneral || 0)}</strong>
                                <span>de {fmt(ganancia)} · se reparten</span>
                                <strong className="tabular-nums">{fmt((reparto?.totalRepartido || 0))}</strong>
                            </>
                        ) : (
                            <>
                                <span>De {fmt(ganancia)} se retienen</span>
                                <strong className="tabular-nums">{fmt(retenido)}</strong>
                                <span>y se reparten</span>
                                <strong className="tabular-nums">{fmt(aRepartir)}</strong>
                            </>
                        )}
                        {r.destino
                            ? <span>· destino: <strong>{r.destino}</strong></span>
                            : <span className="text-amber-700">· <strong>falta escribir el destino</strong></span>}
                    </div>

                    {/* Un porcentaje por socio da lo mismo que el mismo porcentaje
                        general. No es un fallo y decirlo evita que la Junta crea
                        haber cambiado algo cuando movió el selector. */}
                    {porSocio && r.tipo === 'porcentaje' && (
                        <p className="text-[11px] text-gray-500 leading-snug px-1">
                            Un porcentaje da prácticamente el mismo resultado por los dos caminos: recortar
                            el {Number(r.valor)}% de cada parte es recortar el {Number(r.valor)}% del total —
                            pueden bailar un par de pesos, porque por socio se redondea una vez por cada uno y
                            de la bolsa una sola vez. La diferencia de verdad entre «de la bolsa» y «a cada
                            socio» solo aparece con un <strong>valor fijo</strong>.
                        </p>
                    )}

                    {/* Lo que la cuota por cabeza no alcanzó a cobrar. Presupuestar
                        "valor × socios" y recaudar menos se descubre tarde. */}
                    {porSocio && reparto?.aporteNoCubierto > 0 && (
                        <p className="text-[11px] text-amber-800 bg-amber-100/60 rounded-lg px-3 py-2 leading-snug">
                            <strong>{fmt(reparto.aporteNoCubierto)} menos de lo previsto.</strong> {fmt(reparto.aporteTeorico)} sería
                            el aporte completo, pero a algún socio no le alcanza su parte para cubrirlo y no se le puede
                            cobrar más de lo que le corresponde. Se recaudan {fmt(reparto.totalAporteGeneral)}.
                        </p>
                    )}

                    {/* Una cuota plana pesa muchísimo más sobre el socio pequeño.
                        Puede ser justo lo que se quiso, pero se decide sabiéndolo. */}
                    {porSocio && r.tipo === 'valor' && reparto?.filas?.length > 0 && (() => {
                        const conParte = reparto.filas.filter(f => f.utilidadBruta > 0);
                        if (conParte.length < 2) return null;
                        const pct = (f) => f.aporteGeneral / f.utilidadBruta;
                        const may = conParte.reduce((a, b) => pct(a) >= pct(b) ? a : b);
                        const men = conParte.reduce((a, b) => pct(a) <= pct(b) ? a : b);
                        if (pct(may) - pct(men) < 0.01) return null;
                        return (
                            <p className="text-[11px] text-gray-500 leading-snug px-1">
                                Una cuota igual para todos no pesa igual para todos: a {String(men.fullName).split(' ')[0]} le
                                cuesta el <strong>{(pct(men) * 100).toFixed(1)}%</strong> de su parte y
                                a {String(may.fullName).split(' ')[0]} el <strong>{(pct(may) * 100).toFixed(1)}%</strong>.
                                Si se busca que pese igual, use el porcentaje.
                            </p>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
