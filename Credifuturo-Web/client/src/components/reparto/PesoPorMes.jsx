import React, { useMemo } from 'react';
import {
    ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { NOMBRE_MES } from '../../utils/reparto';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtCorto = (n) => {
    const v = Math.abs(Number(n) || 0);
    if (v >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${Math.round(n)}`;
};

/**
 * El peso de cada mes de ahorro del socio.
 *
 * Es la pieza central de la pantalla, y la que reemplazó al podio. El reparto no
 * mide cuánto ahorró alguien sino cuánto capital puso a trabajar y desde cuándo,
 * y esta es la forma de verlo: cada barra es un mes, su altura es lo que ese mes
 * aporta al reparto, y el número de abajo es su peso —enero 100%, julio 50%,
 * diciembre 8%—. Dos socios que ahorraron lo mismo dibujan perfiles distintos, y
 * esa diferencia ES la diferencia de utilidad.
 *
 * Tres decisiones que sostienen la lectura:
 *
 *  · La barra clara detrás es lo APORTADO y la oscura lo que CUENTA. La distancia
 *    entre las dos es, literalmente, lo que el mes le resta al peso; sin ella el
 *    socio ve una barra baja en octubre y no sabe si ahorró poco o si su ahorro
 *    llegó tarde.
 *  · El primer renglón, "Anterior", es el capital de años pasados que no retiró.
 *    Va aparte y no dentro de enero porque no es ahorro de este año: es el saldo
 *    con el que abrió, y su peso completo es justamente lo que premia no haberlo
 *    retirado.
 *  · Un retiro se pinta en rojo y hacia abajo, con el peso de SU mes. Quien sacó
 *    su dinero en octubre lo tuvo trabajando enero a septiembre, y una barra que
 *    solo restara el monto borraría esos nueve meses.
 */
export default function PesoPorMes({ porMes = [], periodo, altura = 240 }) {
    const datos = useMemo(() => (porMes || [])
        .filter(f => f.n > 0 || f.mes > 0)          // el renglón "Anterior" solo si tiene algo
        .filter(f => !(f.mes === 0 && f.n === 0))
        .map(f => ({
            ...f,
            nombre: NOMBRE_MES[f.mes] ?? `M${f.mes}`,
            movido: (f.ahorro || 0) + (f.fondo || 0),
            pesoPct: Math.round((f.peso || 0) * 100),
        })), [porMes]);

    const hayAlgo = datos.some(d => d.n > 0);
    if (!hayAlgo) {
        return (
            <div className="h-[240px] flex flex-col items-center justify-center text-center gap-1 text-gray-400">
                <p className="text-sm font-bold text-gray-500">Sin movimientos en este período</p>
                <p className="text-xs max-w-xs">Cuando se registre el primer abono aparecerá aquí el peso de cada mes.</p>
            </div>
        );
    }

    return (
        <div>
            <ResponsiveContainer width="100%" height={altura}>
                <ComposedChart data={datos} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={0} />
                    {/* Arranca en cero siempre: recortar la base exageraría la
                        diferencia entre un mes y otro. */}
                    <YAxis tickFormatter={fmtCorto} tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false} tickLine={false} width={52} />
                    <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,.04)' }}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}
                        formatter={(valor, nombre) => [fmt(valor), nombre === 'movido' ? 'Entró en el mes' : 'Cuenta para el reparto']}
                        labelFormatter={(etiqueta) => {
                            const f = datos.find(d => d.nombre === etiqueta);
                            if (!f) return etiqueta;
                            const cual = f.mes === 0 ? 'Capital de años anteriores' : `${etiqueta} · peso ${f.pesoPct}%`;
                            return f.mes === 0 ? `${cual} · peso 100%` : cual;
                        }}
                    />
                    {/* Lo movido, en claro, detrás. */}
                    <Bar dataKey="movido" fill="#d1d5db" radius={[4, 4, 0, 0]} maxBarSize={38} />
                    {/* Lo que cuenta, en color, delante. */}
                    <Bar dataKey="ponderado" radius={[4, 4, 0, 0]} maxBarSize={22}>
                        {datos.map((d) => (
                            <Cell key={d.mes} fill={d.ponderado < 0 ? '#dc2626' : (d.mes === 0 ? '#b45309' : '#166534')} />
                        ))}
                    </Bar>
                </ComposedChart>
            </ResponsiveContainer>

            {/* La escala de pesos, escrita. El gráfico la insinúa; esta línea la
                deja fijada, que es lo que el socio necesita para reconstruir su
                propia cifra con una calculadora. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-300" /> lo que entró</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-brand-primary" /> lo que cuenta</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-700" /> capital anterior</span>
                <span className="text-gray-400">
                    Peso: Ene 100% · Abr 75% · Jul 50% · Oct 25% · Dic 8%
                    {periodo && !periodo.cerrado && <> — sobre los 12 meses de {periodo.anio}</>}
                </span>
            </div>
        </div>
    );
}
