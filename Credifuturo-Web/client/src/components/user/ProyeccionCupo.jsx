import React, { useMemo } from 'react';
import { Target } from 'lucide-react';

/**
 * "Proyección de tu cupo" — a cuánto llegaría el cupo del socio en 3, 6 y 12
 * meses si mantiene su ritmo de ahorro.
 *
 * Vivía dentro de CapacidadBetaPage, una pantalla en evaluación a la que hay
 * que entrar a propósito. Se traslada a "Mi Panel" (la primera que ve el socio
 * al abrir la app) y se extrae aquí con su cálculo dentro, en vez de copiarlo:
 * la regla del 3× es del fondo y no debe tener dos versiones.
 *
 * `analysis` es la respuesta de /admin/my/loan-capacity y `veredicto` el
 * resultado de calcVerdict sobre ella — los mismos dos objetos que ya maneja
 * cualquier pantalla que hable de capacidad.
 */

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

export function calcularProyeccion(analysis, veredicto) {
    if (!analysis || !veredicto) return null;
    const prom = Number(analysis.promedioAhorroMensual || 0);
    // Sin historial de ahorro mensual no hay ritmo que proyectar: proyectar
    // desde cero daría siempre el cupo de hoy y parecería que no crece nunca.
    if (prom <= 0) return null;
    return [3, 6, 12].map(m => {
        const cupoFuturo = (analysis.ahorroTotal + m * prom) * 3 - analysis.totalDeudaPendiente;
        return { meses: m, cupo: Math.max(0, cupoFuturo), delta: cupoFuturo - veredicto.capacidadDisponible };
    });
}

const ProyeccionCupo = ({ analysis, veredicto, className = '' }) => {
    const proyeccion = useMemo(() => calcularProyeccion(analysis, veredicto), [analysis, veredicto]);

    // Sin datos no se pinta una tarjeta vacía: en Mi Panel esto va entre otras
    // tarjetas con contenido y un hueco con excusa solo estorba.
    if (!proyeccion) return null;

    return (
        <div className={`bg-white rounded-2xl border border-gray-200 shadow-card p-4 lg:p-5 ${className}`}>
            <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4 text-brand-primary" />
                <h2 className="text-sm font-bold text-gray-800">Proyección de tu cupo</h2>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {proyeccion.map(p => (
                    <div key={p.meses} className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-xl p-2.5 sm:p-3 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">En {p.meses} meses</p>
                        <p className="text-[13px] sm:text-sm font-black text-gray-800 tabular-nums mt-1">{fmt(p.cupo)}</p>
                        <p className="text-[10px] text-emerald-600 font-bold mt-0.5">+{fmt(Math.max(0, p.delta))}</p>
                    </div>
                ))}
            </div>

            <p className="text-[11px] text-gray-500 mt-3 leading-snug">
                Si mantienes tu ahorro promedio de <b>{fmt(analysis.promedioAhorroMensual)}/mes</b>, cada peso ahorrado suma $3 de cupo.
                Cálculo conservador: asume tu deuda actual sin cambios — como tus cuotas la van bajando, el cupo real será igual o mayor.
            </p>
        </div>
    );
};

export default ProyeccionCupo;
