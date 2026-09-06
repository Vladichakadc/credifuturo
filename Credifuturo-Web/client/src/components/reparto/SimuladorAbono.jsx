import React, { useMemo, useState } from 'react';
import { Calculator, ArrowRight, Info } from 'lucide-react';
import { pesoDeFecha, repartir } from '../../utils/reparto';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * "¿Y si ahorro X en tal mes?"
 *
 * Es la pregunta que el socio se hace de verdad, y hasta ahora la pantalla no la
 * respondía: mostraba lo que le tocaba y nada más. Sin esto, la lección central
 * del método —que ahorrar temprano rinde más que hacerlo tarde— queda enunciada
 * en un párrafo que nadie lee, en vez de demostrada con su propio dinero.
 *
 * Dos cuidados que separan una simulación útil de una engañosa:
 *
 *  · El abono simulado también agranda el capital total del fondo, así que el
 *    porcentaje sube MENOS de lo que sugiere la intuición. Se recalcula el
 *    reparto completo, no solo la fila propia; si no, el simulador prometería
 *    utilidades que el reparto real nunca daría.
 *  · La ganancia del fondo se deja fija. Es la que el fondo ya generó; hacerla
 *    crecer con el abono simulado sería inventar un rendimiento.
 */
export default function SimuladorAbono({ yo, filas, periodo, monto }) {
    const [importe, setImporte] = useState('200000');
    // Por defecto, hoy: la pregunta natural es "si abono ahora, cuánto cambia".
    const [fecha, setFecha] = useState(periodo?.corte || periodo?.inicio || '');

    const sim = useMemo(() => {
        if (!yo || !periodo) return null;
        const valor = Number(String(importe).replace(/\D/g, '')) || 0;
        if (valor <= 0) return null;

        const peso = pesoDeFecha(fecha, periodo);
        const extra = valor * peso;

        const bases = filas.map(f => f.base + (f.id === yo.id ? extra : 0));
        const nuevo = repartir(bases, monto);
        const i = filas.findIndex(f => f.id === yo.id);
        if (i < 0) return null;

        // La comparación que enseña la regla: el mismo abono el 1 de enero.
        const enEnero = repartir(
            filas.map(f => f.base + (f.id === yo.id ? valor * pesoDeFecha(periodo.inicio, periodo) : 0)), monto)[i];

        return {
            valor, fecha, peso,
            dias: Math.round(peso * (periodo.dias || 365)),
            extra,
            antes: { participacion: yo.participacion, utilidad: yo.utilidad },
            despues: nuevo[i],
            delta: nuevo[i].utilidad - yo.utilidad,
            siEnEnero: enEnero.utilidad - yo.utilidad,
        };
    }, [yo, filas, periodo, monto, importe, fecha]);

    if (!yo || !periodo) return null;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-5 py-3 flex items-center gap-3 border-b border-gray-100">
                <div className="bg-brand-primary/10 rounded-lg p-2"><Calculator className="h-4 w-4 text-brand-primary" /></div>
                <div>
                    <h3 className="font-bold text-sm text-gray-800">¿Y si ahorro un poco más?</h3>
                    <p className="text-[11px] text-gray-500">Prueba un abono y mira cómo cambiaría tu parte. No registra nada.</p>
                </div>
            </div>

            <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cuánto abonarías</span>
                        <input
                            inputMode="numeric"
                            value={Number(String(importe).replace(/\D/g, '') || 0).toLocaleString('es-CO')}
                            onChange={(e) => setImporte(e.target.value.replace(/\D/g, ''))}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary"
                        />
                    </label>
                    <label className="block">
                        {/* Un día, no un mes: el peso cambia cada día, y el sentido
                            del simulador es justamente que se vea. */}
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qué día</span>
                        <input type="date" value={fecha} min={periodo.inicio} max={periodo.fin}
                            onChange={(e) => setFecha(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                    </label>
                </div>

                {sim && (
                    <>
                        <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl p-4">
                            <div className="text-center flex-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hoy te tocaría</p>
                                <p className="text-lg font-black text-gray-700 tabular-nums">{fmt(sim.antes.utilidad)}</p>
                                <p className="text-[10px] text-gray-400 tabular-nums">{(sim.antes.participacion * 100).toFixed(2)}%</p>
                            </div>
                            <ArrowRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
                            <div className="text-center flex-1">
                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Con ese abono</p>
                                <p className="text-lg font-black text-emerald-700 tabular-nums">{fmt(sim.despues.utilidad)}</p>
                                <p className="text-[10px] text-emerald-500 tabular-nums">{(sim.despues.participacion * 100).toFixed(2)}%</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3">
                            <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-900 leading-snug">
                                Abonando el <strong>{sim.fecha}</strong> ese dinero trabaja{' '}
                                <strong>{sim.dias} de los {periodo.dias} días</strong> del año, así que pesa un{' '}
                                <strong>{Math.round(sim.peso * 100)}%</strong>: de tus {fmt(sim.valor)} cuentan{' '}
                                <strong>{fmt(sim.extra)}</strong>.{' '}
                                {sim.delta > 0
                                    ? <>Tu parte subiría <strong>{fmt(sim.delta)}</strong>.</>
                                    : <>A esta altura del año ya casi no alcanza a rendir.</>}
                                {sim.siEnEnero > sim.delta && (
                                    <> El mismo abono <strong>el 1 de enero</strong> te habría subido <strong>{fmt(sim.siEnEnero)}</strong>.</>
                                )}
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
