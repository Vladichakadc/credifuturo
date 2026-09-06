import React, { useMemo } from 'react';
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtCorto = (n) => {
    const v = Math.abs(Number(n) || 0);
    if (v >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${Math.round(n)}`;
};
const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaFecha = (iso) => {
    const [, m, d] = String(iso).split('-');
    return `${Number(d)} ${NOMBRE_MES[Number(m) - 1] || ''}`;
};

/**
 * La línea de tiempo del dinero de un socio dentro del período.
 *
 * Es la pieza que reemplaza al podio, y la que hace visible de un vistazo lo que
 * el reparto mide de verdad: no cuánto ahorró alguien, sino cuánto dinero suyo
 * estuvo en el fondo y desde cuándo. Dos socios que ahorraron lo mismo dibujan
 * áreas distintas —uno un rectángulo casi completo, otro un escalón que sube al
 * final— y esa diferencia de área ES la diferencia de utilidad. Un podio no
 * puede explicar eso; esta forma sí.
 *
 * Escalonada (`stepAfter`) a propósito: el saldo no crece de forma continua, da
 * saltos el día de cada movimiento. Interpolar en diagonal dibujaría un dinero
 * que entró poco a poco y que nunca existió.
 *
 * La línea horizontal es el saldo promedio: el rectángulo de la misma área que
 * la figura. Es la traducción visual de "tu promedio del año", y deja ver de
 * inmediato si el socio estuvo casi siempre por encima o por debajo de él.
 */
export default function LineaDeTiempoSaldo({ movimientos = [], periodo, saldoApertura = 0, saldoPromedio = 0, altura = 220 }) {
    const serie = useMemo(() => {
        if (!periodo?.inicio || !periodo?.corte) return [];

        // Solo lo que ocurre DENTRO del período mueve la línea. Lo anterior ya
        // está condensado en el saldo de apertura, que es donde arranca.
        const dentro = movimientos
            .filter(m => m.fecha && m.dentroPeriodo)
            .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

        // Un solo punto por DÍA, no por movimiento. Quien paga seis cuotas de una
        // sentada genera seis filas con la misma fecha, y pintarlas por separado
        // dibuja seis escalones donde el saldo dio uno solo, con la misma fecha
        // repetida seis veces en el eje. El salto del día es la suma del día.
        const porDia = new Map();
        for (const m of dentro) {
            const previo = porDia.get(m.fecha) || { movimiento: 0, n: 0 };
            porDia.set(m.fecha, { movimiento: previo.movimiento + (Number(m.valor) || 0), n: previo.n + 1 });
        }

        let saldo = Number(saldoApertura) || 0;
        const puntos = [{ fecha: periodo.inicio, saldo, movimiento: 0, etiqueta: 'Saldo de apertura' }];

        for (const [fecha, { movimiento, n }] of porDia) {
            saldo += movimiento;
            puntos.push({
                fecha,
                saldo,
                movimiento,
                etiqueta: movimiento >= 0
                    ? (n > 1 ? `${n} abonos` : 'Abono')
                    : (n > 1 ? `${n} movimientos` : 'Movimiento del fondo'),
            });
        }

        puntos.push({ fecha: periodo.corte, saldo, movimiento: 0, etiqueta: 'Hoy' });
        return puntos;
    }, [movimientos, periodo, saldoApertura]);

    if (serie.length <= 2 && !saldoApertura) {
        return (
            <div className="h-[220px] flex flex-col items-center justify-center text-center gap-1 text-gray-400">
                <p className="text-sm font-bold text-gray-500">Sin movimientos en este período</p>
                <p className="text-xs max-w-xs">Cuando se registre el primer abono aparecerá aquí la línea de tiempo de tu saldo.</p>
            </div>
        );
    }

    const maximo = Math.max(...serie.map(p => p.saldo), saldoPromedio, 0);

    return (
        <ResponsiveContainer width="100%" height={altura}>
            <AreaChart data={serie} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                    <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#166534" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#166534" stopOpacity={0.04} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="fecha" tickFormatter={etiquetaFecha} tick={{ fontSize: 10, fill: '#9ca3af' }}
                    axisLine={false} tickLine={false} minTickGap={28} />
                {/* Empieza en cero siempre: recortar la base exageraría el escalón
                    de un abono y haría parecer enorme una diferencia pequeña. */}
                <YAxis domain={[0, Math.ceil(maximo * 1.1) || 1]} tickFormatter={fmtCorto}
                    tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}
                    labelFormatter={(v) => etiquetaFecha(v)}
                    formatter={(valor, _n, item) => {
                        const mov = item?.payload?.movimiento || 0;
                        const detalle = mov ? ` · ${mov > 0 ? '+' : ''}${fmt(mov)} (${item.payload.etiqueta})` : ` · ${item?.payload?.etiqueta || ''}`;
                        return [`${fmt(valor)}${detalle}`, 'Saldo en el fondo'];
                    }}
                />
                {saldoPromedio > 0 && (
                    <ReferenceLine y={saldoPromedio} stroke="#b45309" strokeDasharray="5 4" strokeWidth={1.5}
                        label={{ value: `promedio ${fmtCorto(saldoPromedio)}`, position: 'insideTopRight', fill: '#b45309', fontSize: 10, fontWeight: 700 }} />
                )}
                <Area type="stepAfter" dataKey="saldo" stroke="#166534" strokeWidth={2} fill="url(#gradSaldo)" dot={false} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
