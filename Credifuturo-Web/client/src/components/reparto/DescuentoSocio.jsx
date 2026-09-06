import React from 'react';
import { Percent, DollarSign, X } from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * El descuento sobre la parte de UN socio.
 *
 * Distinto de la retención general: aquí la Junta descuenta a una persona, no a
 * todas. Vive dentro del desglose que se abre bajo su fila, porque una decisión
 * sobre un socio se toma mirando sus cifras, no desde una lista.
 *
 * Lo descontado se queda en el fondo, con la retención general — NO se reparte
 * entre los demás socios, y eso está escrito en la propia pantalla. Repartirlo
 * convertiría una medida sobre una persona en una ganancia para sus compañeros:
 * quien vota el descuento cobraría por votarlo, y el socio afectado tendría
 * enfrente a veinticuatro personas con un interés económico en que se le
 * descuente. Un fondo pequeño donde todos se conocen no puede permitirse ese
 * incentivo.
 *
 * El motivo es obligatorio en la práctica: un descuento sin motivo escrito es
 * dinero que un socio dejó de recibir sin que conste por qué, y eso es lo
 * primero que se pregunta en una asamblea.
 */
export default function DescuentoSocio({ socio, regla, onCambio }) {
    const activo = !!regla && Number(regla.valor) > 0;
    const r = regla || { tipo: 'porcentaje', valor: 0, motivo: '' };
    const set = (cambios) => onCambio?.(socio.id, { ...r, ...cambios });

    return (
        <div className={`rounded-xl border p-3 mb-3 ${activo ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                    Descuento a {socio.fullName.split(' ')[0]}
                </p>
                {activo && (
                    <button type="button" onClick={() => onCambio?.(socio.id, null)}
                        className="text-[10px] font-bold text-gray-400 hover:text-red-600 flex items-center gap-1">
                        <X className="h-3 w-3" /> quitar
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr,2fr] gap-2 items-end">
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden bg-white self-end">
                    {[{ id: 'porcentaje', icono: Percent }, { id: 'valor', icono: DollarSign }].map(t => (
                        <button key={t.id} type="button" onClick={() => set({ tipo: t.id })}
                            className={`px-2.5 py-1.5 transition-colors ${r.tipo === t.id ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                            <t.icono className="h-3.5 w-3.5" />
                        </button>
                    ))}
                </div>

                <input
                    inputMode="numeric"
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
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                />

                <input
                    type="text" maxLength={200} value={r.motivo || ''}
                    onChange={(e) => set({ motivo: e.target.value })}
                    placeholder="Motivo del descuento"
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
            </div>

            {activo && (
                <p className="text-[11px] text-amber-900 mt-2 leading-snug">
                    De {fmt(socio.utilidadBruta)} se le descuentan <strong className="tabular-nums">{fmt(socio.descuento)}</strong> y
                    recibe <strong className="tabular-nums">{fmt(socio.utilidad)}</strong>.
                    {' '}Ese dinero <strong>queda en el fondo</strong>, no se reparte entre los demás socios.
                    {!r.motivo && <span className="text-amber-700"> Falta escribir el motivo.</span>}
                </p>
            )}
        </div>
    );
}
