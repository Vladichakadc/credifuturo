import React, { useMemo, useState } from 'react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

// Paleta rotatoria de segmentos. No codifica nada —el color no es un dato— así
// que solo tiene que distinguir vecinos y mantener contraste sobre blanco.
const COLORES = [
    '#166534', '#0e7490', '#b45309', '#4d7c0f', '#1e40af', '#9f1239',
    '#0f766e', '#7c2d12', '#3730a3', '#65a30d', '#0369a1', '#a16207',
];

/**
 * El reparto entero como una sola barra: cada socio, un tramo proporcional.
 *
 * Reemplaza al podio, y no por estética. Un podio ordena a las personas y
 * declara ganadores; este reparto no es una competencia sino una división
 * proporcional de una ganancia que produjo el capital de todos. La barra dice
 * exactamente eso: aquí está el total, y este pedazo es de cada quien.
 *
 * El orden es por NÚMERO DE SOCIO, no por monto. Ordenar por monto reconstruye
 * el podio con otra forma —el primero de la fila sigue siendo "el que más
 * tiene"— y en un fondo de veinticinco personas que se conocen, eso expone un
 * dato patrimonial sin que la pantalla lo necesite para nada. Quien quiera la
 * lectura ordenada la tiene en la tabla de abajo, donde es una decisión
 * consciente y no la primera imagen que se ve.
 */
export default function BarraReparto({ filas = [], yoId = null, onSeleccionar = null }) {
    const [encima, setEncima] = useState(null);

    const tramos = useMemo(() => {
        const conParte = filas.filter(f => f.participacion > 0);
        return [...conParte].sort((a, b) => {
            const na = parseInt(a.customerId, 10), nb = parseInt(b.customerId, 10);
            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
            return String(a.fullName).localeCompare(String(b.fullName), 'es');
        });
    }, [filas]);

    if (!tramos.length) {
        return (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                Todavía no hay participaciones que repartir en este período.
            </div>
        );
    }

    const activo = encima ?? (yoId ? tramos.find(t => t.id === yoId) : null);

    return (
        <div>
            <div className="flex h-14 w-full overflow-hidden rounded-2xl ring-1 ring-gray-200 shadow-inner bg-gray-100">
                {tramos.map((t, i) => {
                    const esYo = t.id === yoId;
                    const resaltado = activo?.id === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onMouseEnter={() => setEncima(t)}
                            onMouseLeave={() => setEncima(null)}
                            onFocus={() => setEncima(t)}
                            onBlur={() => setEncima(null)}
                            onClick={() => onSeleccionar?.(t)}
                            // El ancho ES el dato: un tramo con participación
                            // minúscula tiene que verse minúsculo. Solo se le da
                            // un mínimo de 2px para que siga siendo clicable.
                            style={{ width: `${t.participacion * 100}%`, minWidth: 2, background: COLORES[i % COLORES.length] }}
                            className={`relative h-full transition-all duration-150 focus:outline-none
                                ${resaltado ? 'brightness-125 z-10' : 'hover:brightness-110'}
                                ${esYo ? 'ring-2 ring-brand-gold ring-inset z-20' : ''}`}
                            aria-label={`${t.fullName}: ${(t.participacion * 100).toFixed(2)} por ciento, ${fmt(t.utilidad)}`}
                        />
                    );
                })}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 min-h-[2.5rem]">
                {activo ? (
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`text-sm font-bold ${activo.id === yoId ? 'text-brand-gold' : 'text-gray-800'}`}>
                            {activo.id === yoId ? 'Tú' : activo.fullName}
                        </span>
                        <span className="text-sm font-black text-gray-900 tabular-nums">{fmt(activo.utilidad)}</span>
                        <span className="text-xs text-gray-500 tabular-nums">{(activo.participacion * 100).toFixed(2)}% del reparto</span>
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">
                        Cada tramo es un socio, en orden de número de socio. Pasa el cursor para ver de quién es.
                    </p>
                )}
                {yoId && tramos.some(t => t.id === yoId) && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-sm ring-2 ring-brand-gold ring-inset bg-brand-primary/20" />
                        tu tramo
                    </span>
                )}
            </div>
        </div>
    );
}
