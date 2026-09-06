import React, { useMemo, useState } from 'react';
import { Calculator, ArrowRight, Info } from 'lucide-react';
import { factorDeDia, repartir } from '../../utils/reparto';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * "¿Y si abono X el día D?"
 *
 * Es la pregunta que el socio se hace de verdad, y hasta ahora la pantalla no
 * la respondía: mostraba lo que le tocaba y nada más. Sin esto, la lección
 * central del método —que adelantar el ahorro rinde más que hacerlo tarde—
 * queda enunciada en un párrafo que nadie lee, en vez de demostrada con su
 * propio dinero.
 *
 * Dos cuidados que hacen la diferencia entre una simulación útil y una engañosa:
 *
 *  · El abono simulado también agranda el total del fondo, así que el
 *    porcentaje sube MENOS de lo que sugiere la intuición. Se recalcula el
 *    reparto completo, no solo la fila propia; si no, el simulador prometería
 *    utilidades que el reparto real nunca daría.
 *  · La ganancia a repartir se deja fija. Es la del período que ya ocurrió;
 *    hacerla crecer con el abono simulado sería inventar un rendimiento.
 */
export default function SimuladorAbono({ yo, filas, periodo, monto }) {
    const hoy = periodo?.corte || '';
    const [importe, setImporte] = useState('200000');
    const [fecha, setFecha] = useState(hoy);

    const sim = useMemo(() => {
        if (!yo || !periodo) return null;
        const valor = Number(String(importe).replace(/\D/g, '')) || 0;
        if (valor <= 0 || !fecha) return null;

        const factor = factorDeDia(fecha, periodo);
        const aporteExtra = valor * factor;

        const bases = filas.map(f => f.base + (f.id === yo.id ? aporteExtra : 0));
        const nuevo = repartir(bases, monto);
        const i = filas.findIndex(f => f.id === yo.id);
        if (i < 0) return null;

        return {
            valor,
            fecha,
            factor,
            dias: Math.round(factor * periodo.dias),
            aporteExtra,
            antes: { participacion: yo.participacion, utilidad: yo.utilidad },
            despues: nuevo[i],
            delta: nuevo[i].utilidad - yo.utilidad,
        };
    }, [yo, filas, periodo, monto, importe, fecha]);

    if (!yo || !periodo) return null;

    const atajos = [
        { etiqueta: 'Hoy', fecha: hoy },
        { etiqueta: `1 de enero`, fecha: periodo.inicio },
    ];

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
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qué día</span>
                        <input
                            type="date"
                            value={fecha}
                            min={periodo.inicio}
                            max={periodo.corte}
                            onChange={(e) => setFecha(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                        />
                    </label>
                </div>

                <div className="flex flex-wrap gap-2">
                    {atajos.map(a => (
                        <button key={a.etiqueta} type="button" onClick={() => setFecha(a.fecha)}
                            className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors
                                ${fecha === a.fecha ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-primary hover:text-brand-primary'}`}>
                            {a.etiqueta}
                        </button>
                    ))}
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
                                Abonado el <strong>{sim.fecha}</strong>{' '}
                                ese dinero alcanzaría a trabajar <strong>{sim.dias} de los {periodo.dias} días</strong> del período
                                {' '}({(sim.factor * 100).toFixed(0)}%), así que de tus {fmt(sim.valor)} contarían{' '}
                                <strong>{fmt(sim.aporteExtra)}</strong> para el reparto.{' '}
                                {sim.delta > 0
                                    ? <>Tu parte subiría <strong>{fmt(sim.delta)}</strong>.</>
                                    : <>Llegando este día ya casi no alcanza a rendir en este período.</>}
                                {' '}El mismo abono el <strong>1 de enero</strong> contaría completo.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
