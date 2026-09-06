import React from 'react';
import { PiggyBank, Percent, DollarSign } from 'lucide-react';

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
export default function Retencion({ retencion, onCambio, ganancia = 0, retenido = 0, aRepartir = 0, editable = true }) {
    const r = retencion || { tipo: 'porcentaje', valor: 0, destino: '' };
    const set = (cambios) => onCambio?.({ ...r, ...cambios });

    return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 mb-3">
                <div className="bg-amber-100 rounded-lg p-1.5"><PiggyBank className="h-4 w-4 text-amber-700" /></div>
                <div>
                    <h3 className="text-sm font-bold text-gray-800">Valor o % a descontar antes de repartir</h3>
                    <p className="text-[11px] text-gray-500">
                        Lo que el fondo retiene para otro fin. Se descuenta de la ganancia y baja la parte de todos los socios en proporción.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr,2fr] gap-3 items-end">
                {/* El selector va primero: decide qué significa el número de al lado. */}
                <div className="inline-flex rounded-xl border border-amber-300 overflow-hidden bg-white self-end">
                    {[
                        { id: 'porcentaje', icono: Percent, titulo: 'Porcentaje de la ganancia' },
                        { id: 'valor', icono: DollarSign, titulo: 'Valor en pesos' },
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
                        {r.tipo === 'porcentaje' ? 'Porcentaje' : 'Valor'}
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

            {retenido > 0 && (
                <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-amber-900 bg-amber-100/70 rounded-xl px-3 py-2">
                    <span>De {fmt(ganancia)} se retienen</span>
                    <strong className="tabular-nums">{fmt(retenido)}</strong>
                    <span>y se reparten</span>
                    <strong className="tabular-nums">{fmt(aRepartir)}</strong>
                    {r.destino
                        ? <span>· destino: <strong>{r.destino}</strong></span>
                        : <span className="text-amber-700">· <strong>falta escribir el destino</strong></span>}
                </div>
            )}
        </div>
    );
}
