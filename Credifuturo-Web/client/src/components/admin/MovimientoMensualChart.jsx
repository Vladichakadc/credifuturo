import React from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine
} from 'recharts';
import { Activity } from 'lucide-react';
import { fmt, fmtCorto } from '../../utils/savingsSeries';
import SectionHeader from '../ui/SectionHeader';

/**
 * "Movimiento mensual" — abonos y retiros/devoluciones por mes, apilados desde
 * cero. Vivía dentro de Evolución de Ahorros; se traslada a Inteligencia
 * Financiera como componente propio (no un bloque inline) para que quien lo
 * necesite en otro lugar lo reutilice sin copiar la definición del gráfico.
 */
const MovimientoMensualChart = ({ serie, subtitulo = 'Abonos en verde · retiros y devoluciones en rojo, hacia abajo ($ COP)' }) => (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5">
        {/* Encabezado compartido: antes usaba un icono suelto y un título más
            pequeño que el resto de secciones del mismo menú. */}
        <SectionHeader icono={Activity} titulo="Movimiento mensual" subtitulo={subtitulo} className="mb-4" />
        <div className="h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 9.5, fontWeight: 600 }} minTickGap={14} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={fmtCorto}
                        tick={{ fill: '#94a3b8', fontSize: 10 }} width={52} />
                    <RechartsTooltip
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 shadow-xl text-xs text-left min-w-[150px]">
                                        <p className="text-gray-400 font-medium mb-1.5">{label}</p>
                                        {d.abonos > 0 && <p className="text-gray-200">Abonos: <span className="font-semibold text-green-400">{fmt(d.abonos)}</span></p>}
                                        {d.retiros < 0 && <p className="text-gray-200">Devolución / Recargo: <span className="font-semibold text-red-400">{fmt(d.retiros)}</span></p>}
                                        <div className="h-px bg-gray-800 my-1.5" />
                                        <p className="text-gray-200">Neto: <span className={`font-semibold ${d.flujo < 0 ? 'text-red-400' : 'text-gray-100'}`}>{fmt(d.flujo)}</span></p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                        cursor={{ fill: '#f1f5f9' }}
                    />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
                    <Bar dataKey="abonos" stackId="a" fill="#166534" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                    <Bar dataKey="retiros" stackId="a" fill="#dc2626" radius={[0, 0, 3, 3]} maxBarSize={26} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    </div>
);

export default MovimientoMensualChart;
