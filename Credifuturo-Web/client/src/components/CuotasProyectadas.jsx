import React, { useState } from 'react';
import { Table2, ChevronDown, ChevronUp } from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * Las cuotas que tendría el préstamo si se aprueba, una por una.
 *
 * La Junta vota sobre unas cuotas concretas, no sobre un monto y un plazo sueltos: es
 * la cuota mensual la que el socio tiene que poder pagar, y la que decide si el crédito
 * es viable. Hasta ahora la pantalla solo mostraba la primera, la última y los totales,
 * y con eso no se ve cómo baja la carga mes a mes.
 *
 * El cronograma lo calcula el servidor con la MISMA ley que aplicará el desembolso
 * (capital constante, interés sobre el saldo, última cuota absorbiendo el residuo), así
 * que lo que se aprueba aquí es exactamente lo que se registrará después.
 */
export default function CuotasProyectadas({ cronograma, titulo = 'Cuotas del crédito', abiertoPorDefecto = false }) {
    const [abierto, setAbierto] = useState(abiertoPorDefecto);

    const filas = cronograma?.filas || [];
    if (!filas.length) return null;

    // Con pocas cuotas la tabla cabe entera; con muchas conviene poder plegarla para no
    // empujar la votación fuera de la pantalla.
    const largo = filas.length > 6;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setAbierto(v => !v)}
                className="w-full bg-gray-50 px-5 py-3 flex items-center gap-3 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                aria-expanded={abierto}
            >
                <div className="bg-brand-primary/10 rounded-lg p-2"><Table2 className="h-4 w-4 text-brand-primary" /></div>
                <div className="flex-1 text-left">
                    <h4 className="font-bold text-sm text-gray-800">{titulo}</h4>
                    <p className="text-[11px] text-gray-500">
                        {filas.length} cuota(s) · primera {fmt(filas[0].cuota)} · última {fmt(filas[filas.length - 1].cuota)}
                    </p>
                </div>
                {abierto ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>

            {abierto && (
                <div className={`overflow-x-auto ${largo ? 'max-h-80 overflow-y-auto' : ''}`}>
                    <table className="w-full text-sm">
                        <thead className="bg-white sticky top-0 z-10">
                            <tr className="border-b-2 border-gray-200">
                                <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">#</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Saldo inicial</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Capital</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Interés</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cuota</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Saldo final</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((f) => (
                                <tr key={f.n} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                                    <td className="px-3 py-2 font-bold text-gray-500 tabular-nums">{f.n}</td>
                                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmt(f.saldoInicial)}</td>
                                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmt(f.capital)}</td>
                                    <td className="px-3 py-2 text-right text-amber-600 tabular-nums">{fmt(f.interes)}</td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900 tabular-nums">{fmt(f.cuota)}</td>
                                    <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{fmt(f.saldoFinal)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t-2 border-gray-200">
                                <td className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider" colSpan={2}>Totales</td>
                                <td className="px-3 py-2 text-right font-bold text-gray-800 tabular-nums">
                                    {fmt(filas.reduce((s, f) => s + Number(f.capital || 0), 0))}
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-amber-700 tabular-nums">{fmt(cronograma.totalInteres)}</td>
                                <td className="px-3 py-2 text-right font-black text-gray-900 tabular-nums">{fmt(cronograma.totalAPagar)}</td>
                                <td className="px-3 py-2 text-right text-gray-400 tabular-nums">$0</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}
