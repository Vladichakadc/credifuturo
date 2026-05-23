import React from 'react';
import { Scale, CheckCircle, XCircle, AlertCircle, AlertTriangle, PiggyBank, CreditCard, Award, TrendingUp } from 'lucide-react';

const LoanCapacityWidget = ({ analysis, loading }) => {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 gap-3 text-brand-primary bg-white rounded-2xl border border-gray-100 mt-5">
                <span className="animate-spin text-2xl">⏳</span>
                <span className="text-sm font-medium">Analizando perfil financiero...</span>
            </div>
        );
    }

    if (!analysis) return null;

    const calcVerdict = (a) => {
        if (!a) return null;
        const FACTOR_MAX = 3;
        const montoMaxSinVotacion = a.ahorroTotal * FACTOR_MAX;
        const capacidadDisponible = montoMaxSinVotacion - a.totalDeudaPendiente;
        const tasaApalancamiento  = a.ahorroTotal > 0 ? (a.totalDeudaPendiente / a.ahorroTotal) * 100 : 0;
        const totalCuotas         = a.historialPagoTotal + a.historialMoraTotal + a.historialPendTotal;
        const tasaMora            = totalCuotas > 0 ? (a.historialMoraTotal / totalCuotas) * 100 : 0;
        const totalMoraEP         = a.totalCuotasMoraEP || 0;

        const riesgos = [];
        const positivos = [];

        if (a.enMoraActual)
            riesgos.push(`Tiene ${totalMoraEP} cuota(s) vencidas sin pagar (Mora EP) — valor: $${(a.totalMoraEPValor || 0).toLocaleString('es-CO')}`);
        else
            positivos.push('Sin cuotas vencidas (Mora EP) en préstamos vigentes');

        if (a.historialMoraTotal > 0)
            riesgos.push(`Historial con ${a.historialMoraTotal} cuota(s) en mora registrada(s)`);
        else
            positivos.push('Historial crediticio limpio — 0 moras registradas');

        if (tasaApalancamiento > 200)
            riesgos.push(`Apalancamiento crítico: deuda equivale al ${tasaApalancamiento.toFixed(0)}% del ahorro`);
        else if (tasaApalancamiento > 100)
            riesgos.push(`Apalancamiento elevado: deuda equivale al ${tasaApalancamiento.toFixed(0)}% del ahorro`);
        else if (tasaApalancamiento > 0)
            positivos.push(`Apalancamiento saludable: ${tasaApalancamiento.toFixed(0)}% deuda/ahorro`);
        else
            positivos.push('Sin deuda pendiente registrada');

        if (a.ahorroTotal === 0)
            riesgos.push('Sin ahorro acumulado — no se puede calcular capacidad');
        else if (a.ahorroTotal < 500000)
            riesgos.push(`Ahorro bajo ($${a.ahorroTotal.toLocaleString('es-CO')}) — limita capacidad de endeudamiento`);
        else
            positivos.push(`Ahorro acumulado: $${a.ahorroTotal.toLocaleString('es-CO')} (aportes + mensual)`);

        if (capacidadDisponible > 0)
            positivos.push(`Margen disponible sin votación: $${Math.round(capacidadDisponible).toLocaleString('es-CO')}`);
        else
            riesgos.push('No hay capacidad adicional sin votación del fondo');

        let verdict, color, icon, mensaje, recomendacion;
        if (a.ahorroTotal === 0) {
            verdict = 'NO VIABLE';
            color   = 'red';   icon = 'X';
            mensaje = 'El socio no tiene ahorro acumulado registrado. La política del fondo exige ahorro base para calcular el límite de endeudamiento.';
            recomendacion = 'Rechazar solicitud. Invitar al socio a regularizar sus aportes antes de presentar una nueva solicitud.';
        } else if (a.enMoraActual) {
            verdict = 'NO VIABLE — MORA EP ACTIVA';
            color   = 'red';   icon = 'X';
            mensaje = `El socio tiene ${totalMoraEP} cuota(s) vencida(s) sin pagar por $${(a.totalMoraEPValor || 0).toLocaleString('es-CO')}. La fecha límite de pago ya venció. Ningún reglamento de fondo solidario autoriza nuevos desembolsos con mora vigente.`;
            recomendacion = 'Rechazar solicitud. Exigir paz y salvo total antes de cualquier nuevo trámite. Las cuotas en mora deben quedar en estado "Pago" para reconsiderar.';
        } else if (capacidadDisponible <= 0) {
            verdict = 'REQUIERE VOTACIÓN DEL FONDO';
            color   = 'amber'; icon = 'vote';
            mensaje = `La deuda pendiente ($${Math.round(a.totalDeudaPendiente).toLocaleString('es-CO')}) supera el límite de 3× el ahorro ($${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}). Cualquier nuevo préstamo excede el techo sin votación.`;
            recomendacion = 'Someter a votación del fondo. El monto solicitado no puede exceder la capacidad de pago histórica demostrada. Se recomienda análisis caso a caso con todos los asociados.';
        } else if (a.historialMoraTotal > 2 || tasaMora > 20) {
            verdict = 'VIABLE CON RESTRICCIONES';
            color   = 'yellow'; icon = 'warn';
            mensaje = `El socio califica por ahorro (max sin votación: $${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}), pero su historial registra mora en ${tasaMora.toFixed(0)}% de las cuotas. Se recomienda precaución.`;
            recomendacion = `Puede aprobarse hasta $${Math.round(Math.min(capacidadDisponible, montoMaxSinVotacion * 0.5)).toLocaleString('es-CO')} (50% del techo) como medida de mitigación. Exigir garantía adicional o codeudor.`;
        } else {
            verdict = 'VIABLE SIN VOTACIÓN';
            color   = 'green'; icon = 'check';
            mensaje = `El socio cumple todos los requisitos. Puede solicitar hasta $${Math.round(capacidadDisponible).toLocaleString('es-CO')} sin necesidad de votación del fondo (techo 3×: $${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}).`;
            recomendacion = `Aprobar hasta $${Math.round(capacidadDisponible).toLocaleString('es-CO')} sin votación. Para montos superiores hasta $${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}, también es viable pero requiere votación del fondo.`;
        }

        return { verdict, color, icon, mensaje, recomendacion, montoMaxSinVotacion, capacidadDisponible, tasaApalancamiento, tasaMora, totalMoraEP, riesgos, positivos };
    };

    const v = calcVerdict(analysis);
    const colorMap = {
        green:  { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600' },
        yellow: { bg: 'bg-yellow-50',  border: 'border-yellow-300',  text: 'text-yellow-800',  badge: 'bg-yellow-500' },
        amber:  { bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-800',   badge: 'bg-amber-500'  },
        red:    { bg: 'bg-red-50',     border: 'border-red-300',     text: 'text-red-800',     badge: 'bg-red-600'    },
    };
    const c = v ? (colorMap[v.color] || colorMap.green) : null;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-5">
            <div className="bg-gradient-to-r from-brand-primary to-emerald-700 px-6 py-4 flex items-center gap-3">
                <div className="bg-white/20 rounded-xl p-2">
                    <Scale className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 className="text-white font-bold text-base">Análisis de Viabilidad de Préstamo</h3>
                    <p className="text-emerald-200 text-xs">Evaluación financiera experta · Regla 3× Ahorro Acumulado · Sin mínimo requerido</p>
                </div>
            </div>

            <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                        <div className="flex items-center gap-1.5 mb-1">
                            <PiggyBank className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Ahorro Acumulado</span>
                        </div>
                        <p className="text-base font-black text-emerald-600">${Math.round(analysis.ahorroTotal).toLocaleString('es-CO')}</p>
                        <p className="text-[9px] text-emerald-500 mt-0.5">Aportes + Mensual</p>
                    </div>
                    <div className={`rounded-xl p-3 border ${analysis.enMoraActual ? 'bg-red-50 border-red-200' : analysis.totalDeudaPendiente > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                            <CreditCard className={`h-3.5 w-3.5 ${analysis.enMoraActual ? 'text-red-600' : analysis.totalDeudaPendiente > 0 ? 'text-orange-500' : 'text-gray-400'}`} />
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Deuda Pendiente</span>
                        </div>
                        <p className={`text-base font-black ${analysis.enMoraActual ? 'text-red-700' : analysis.totalDeudaPendiente > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                            ${Math.round(analysis.totalDeudaPendiente).toLocaleString('es-CO')}
                        </p>
                        <p className={`text-[9px] mt-0.5 ${analysis.enMoraActual ? 'text-red-500' : 'text-orange-400'}`}>
                            {analysis.enMoraActual
                                ? `⚠ ${analysis.totalCuotasMoraEP} vencida(s) · $${(analysis.totalMoraEPValor || 0).toLocaleString('es-CO')}`
                                : analysis.totalPrestamosVigentes > 0
                                    ? `${analysis.prestamosVigentes.reduce((s, l) => s + l.cuotasPendientesCount, 0)} cuota(s) por vencer`
                                    : 'Sin préstamos activos'}
                        </p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Award className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Máximo Sin Votación</span>
                        </div>
                        <p className="text-base font-black text-blue-600">${Math.round(v.montoMaxSinVotacion).toLocaleString('es-CO')}</p>
                        <p className="text-[9px] text-blue-400 mt-0.5">3 × Ahorro Acumulado</p>
                    </div>
                    <div className={`rounded-xl p-3 border ${v.capacidadDisponible > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className={`h-3.5 w-3.5 ${v.capacidadDisponible > 0 ? 'text-emerald-600' : 'text-red-500'}`} />
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Capacidad Disponible</span>
                        </div>
                        <p className={`text-base font-black ${v.capacidadDisponible > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            ${Math.max(0, Math.round(v.capacidadDisponible)).toLocaleString('es-CO')}
                        </p>
                        <p className={`text-[9px] mt-0.5 ${v.capacidadDisponible > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {v.capacidadDisponible > 0 ? 'Sin necesidad de votación' : 'Requiere votación del fondo'}
                        </p>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-semibold text-gray-600">Nivel de Apalancamiento (Deuda / Ahorro)</span>
                        <span className={`text-xs font-black ${v.tasaApalancamiento > 200 ? 'text-red-600' : v.tasaApalancamiento > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {v.tasaApalancamiento.toFixed(1)}%
                        </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                            className={`h-2.5 rounded-full transition-all duration-700 ${v.tasaApalancamiento > 200 ? 'bg-red-500' : v.tasaApalancamiento > 100 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, v.tasaApalancamiento / 3)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-0.5">
                        <span className="text-[9px] text-gray-400">0%</span>
                        <span className="text-[9px] text-gray-400">100% (1×)</span>
                        <span className="text-[9px] text-gray-400">200% (2×)</span>
                        <span className="text-[9px] text-gray-400">300% (3× límite)</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {v.positivos.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                            <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                            <span>{p}</span>
                        </div>
                    ))}
                    {v.riesgos.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-red-500" />
                            <span>{r}</span>
                        </div>
                    ))}
                </div>

                <div className={`${c.bg} border-2 ${c.border} rounded-xl p-4`}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`${c.badge} rounded-lg p-2`}>
                            {v.icon === 'check' && <CheckCircle className="h-5 w-5 text-white" />}
                            {v.icon === 'X'     && <XCircle className="h-5 w-5 text-white" />}
                            {v.icon === 'warn'  && <AlertCircle className="h-5 w-5 text-white" />}
                            {v.icon === 'vote'  && <Scale className="h-5 w-5 text-white" />}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Veredicto Financiero</p>
                            <p className={`text-sm font-black ${c.text}`}>{v.verdict}</p>
                        </div>
                    </div>
                    <p className={`text-xs leading-relaxed ${c.text} mb-3`}>{v.mensaje}</p>
                    <div className="border-t border-current/10 pt-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Recomendación del Analista</p>
                        <p className={`text-xs font-semibold leading-relaxed ${c.text}`}>{v.recomendacion}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoanCapacityWidget;
