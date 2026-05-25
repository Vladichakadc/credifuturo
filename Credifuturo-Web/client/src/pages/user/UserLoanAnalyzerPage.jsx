import React, { useState, useEffect } from 'react';
import { useSortTable, SortIcon } from '../../utils/useSortTable';
import api from '../../config/api';
import {
    Scale, Loader2, PiggyBank, CreditCard,
    Award, TrendingUp, TrendingDown, CheckCircle, XCircle,
    AlertCircle, AlertTriangle
} from 'lucide-react';
import { useUi } from '../../context/UiContext';

const UserLoanAnalyzerPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    const { toast } = useUi();
    const [analysis, setAnalysis] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(true);

    const { sortedData: sortedVigentes, sortConfig: vigentesSort, handleSort: handleVigentesSort } =
        useSortTable(analysis?.prestamosVigentes || []);

    useEffect(() => {
        const fetchAnalysis = async () => {
            setLoadingAnalysis(true);
            try {
                const res = await api.get('/admin/my/loan-capacity');
                setAnalysis(res.data);
            } catch (err) {
                console.error(err);
                toast.error('Error al cargar análisis de capacidad.');
            } finally {
                setLoadingAnalysis(false);
            }
        };
        fetchAnalysis();
    }, [toast]);

    // ── Lógica financiera experta ──────────────────────────────────────────────
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
            mensaje = 'No tienes ahorro acumulado registrado. La política del fondo exige ahorro base para calcular el límite de endeudamiento.';
            recomendacion = 'Invitamos a regularizar tus aportes antes de presentar una nueva solicitud de préstamo.';
        } else if (a.enMoraActual) {
            verdict = 'NO VIABLE — MORA EP ACTIVA';
            color   = 'red';   icon = 'X';
            mensaje = `Tienes ${totalMoraEP} cuota(s) vencida(s) sin pagar por $${(a.totalMoraEPValor || 0).toLocaleString('es-CO')}. La fecha límite de pago ya venció. Ningún reglamento de fondo solidario autoriza nuevos desembolsos con mora vigente.`;
            recomendacion = 'Requerimos paz y salvo total antes de cualquier nuevo trámite. Tus cuotas en mora deben quedar en estado "Pago" para reconsiderar.';
        } else if (capacidadDisponible <= 0) {
            verdict = 'REQUIERE VOTACIÓN DEL FONDO';
            color   = 'amber'; icon = 'vote';
            mensaje = `Tu deuda pendiente ($${Math.round(a.totalDeudaPendiente).toLocaleString('es-CO')}) supera tu límite actual de 3× tu ahorro ($${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}). Cualquier nuevo préstamo excede el techo sin votación.`;
            recomendacion = 'Sujeto a votación del fondo. El monto solicitado no puede exceder tu capacidad de pago histórica demostrada.';
        } else if (a.historialMoraTotal > 2 || tasaMora > 20) {
            verdict = 'VIABLE CON RESTRICCIONES';
            color   = 'yellow'; icon = 'warn';
            mensaje = `Calificas por nivel de ahorro (máximo sin votación: $${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}), pero tu historial registra mora en ${tasaMora.toFixed(0)}% de las cuotas. Tu solicitud será revisada con precaución.`;
            recomendacion = `Se puede requerir presentar garantía adicional o un codeudor debido al historial de pagos.`;
        } else {
            verdict = 'VIABLE SIN VOTACIÓN';
            color   = 'green'; icon = 'check';
            mensaje = `Cumples todos los requisitos. Puedes solicitar hasta $${Math.round(capacidadDisponible).toLocaleString('es-CO')} sin necesidad de votación del fondo (techo de 3× tu ahorro: $${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}).`;
            recomendacion = `Viable hasta $${Math.round(capacidadDisponible).toLocaleString('es-CO')} sin votación. Para montos superiores, será necesario someter la solicitud a votación en el fondo.`;
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
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                    <Scale className="h-6 w-6 text-emerald-600" />
                    Mi Capacidad de Préstamo
                 {!user?.name ? '' : `- ${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim()}</h1>
                <p className="text-gray-500 text-sm mt-1">
                    Evaluación financiera personal · Basada en la regla de 3× Ahorro Acumulado
                </p>
            </div>

            {/* Main card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="bg-gradient-to-r from-brand-primary to-emerald-700 px-6 py-4 flex items-center gap-3">
                    <div className="bg-white/20 rounded-xl p-2">
                        <Scale className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-base">Análisis de Viabilidad de Préstamo</h3>
                        <p className="text-emerald-200 text-xs">Máximo sin votación = 3× ahorro · Monto mayor requiere votación del fondo</p>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {/* Loading */}
                    {loadingAnalysis && (
                        <div className="flex items-center justify-center py-12 gap-3 text-brand-primary">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span className="text-sm font-medium">Analizando tu perfil financiero...</span>
                        </div>
                    )}

                    {/* Analysis result */}
                    {analysis && v && !loadingAnalysis && (
                        <div className="space-y-4">
                            {/* Key metrics grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-emerald-50 rounded-xl p-3 border border-white">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <PiggyBank className="h-3.5 w-3.5 text-emerald-600" />
                                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Ahorro Acumulado</span>
                                    </div>
                                    <p className="text-base font-black text-emerald-600">${Math.round(analysis.ahorroTotal).toLocaleString('es-CO')}</p>
                                    <p className="text-[9px] text-emerald-500 mt-0.5">Aportes + Mensual</p>
                                </div>
                                <div className={`rounded-xl p-3 border border-white ${analysis.enMoraActual ? 'bg-red-50 border-red-200' : analysis.totalDeudaPendiente > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
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
                                <div className="bg-blue-50 rounded-xl p-3 border border-white">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Award className="h-3.5 w-3.5 text-blue-600" />
                                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Máximo Sin Votación</span>
                                    </div>
                                    <p className="text-base font-black text-blue-600">${Math.round(v.montoMaxSinVotacion).toLocaleString('es-CO')}</p>
                                    <p className="text-[9px] text-blue-400 mt-0.5">3 × Ahorro Acumulado</p>
                                </div>
                                <div className={`rounded-xl p-3 border border-white ${v.capacidadDisponible > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
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

                            {/* Leverage bar */}
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

                            {/* Risk factors */}
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

                            {/* Verdict box */}
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

                            {/* Payment history */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Historial Completo de Cuotas</p>
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    <div className="bg-emerald-50 rounded-xl py-2.5 border border-emerald-100">
                                        <p className="text-xl font-black text-emerald-600">{analysis.historialPagoTotal}</p>
                                        <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mt-0.5">Pagadas</p>
                                    </div>
                                    <div className={`rounded-xl py-2.5 border ${analysis.totalCuotasMoraEP > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                                        <p className={`text-xl font-black ${analysis.totalCuotasMoraEP > 0 ? 'text-red-700' : 'text-gray-300'}`}>
                                            {analysis.totalCuotasMoraEP || 0}
                                        </p>
                                        <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${analysis.totalCuotasMoraEP > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                            Mora EP Activa
                                        </p>
                                        {analysis.totalCuotasMoraEP > 0 && (
                                            <p className="text-[9px] text-red-400">${(analysis.totalMoraEPValor || 0).toLocaleString('es-CO')}</p>
                                        )}
                                    </div>
                                    <div className={`rounded-xl py-2.5 border ${analysis.historialMoraTotal > 0 ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                                        <p className={`text-xl font-black ${analysis.historialMoraTotal > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                                            {analysis.historialMoraTotal}
                                        </p>
                                        <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${analysis.historialMoraTotal > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
                                            Mora Histórica
                                        </p>
                                    </div>
                                    <div className={`rounded-xl py-2.5 border ${analysis.historialPendTotal > 0 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                                        <p className={`text-xl font-black ${analysis.historialPendTotal > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                                            {analysis.historialPendTotal}
                                        </p>
                                        <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${analysis.historialPendTotal > 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                                            Por Vencer
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Loans table */}
                            {analysis.prestamosVigentes.length > 0 && (
                                <div className="mt-6">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Detalle de Préstamos con Cuotas Pendientes</p>
                                    <div className="overflow-hidden rounded-xl border border-gray-100">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
                                                    {[
                                                        { key: 'idVm',                 label: 'ID',               cls: 'text-left' },
                                                        { key: 'valorPrestado',        label: 'Val. Prestado',    cls: 'text-right' },
                                                        { key: 'saldoPendiente',       label: 'Saldo Pendiente',  cls: 'text-right' },
                                                        { key: 'valorCuotasPendientes',label: 'Val. Cuotas Pend.',cls: 'text-right' },
                                                        { key: 'cuotasPendientesCount',label: 'Cuotas',           cls: 'text-center' },
                                                        { key: 'interesMensual',       label: 'Interés',          cls: 'text-center' },
                                                        { key: 'enMoraEP',             label: 'Estado',           cls: 'text-center' },
                                                    ].map(col => (
                                                        <th key={col.key} className={`px-3 py-2 cursor-pointer select-none hover:bg-gray-200 transition-colors ${col.cls}`} onClick={() => handleVigentesSort(col.key)}>
                                                            <span className="inline-flex items-center gap-1">{col.label}<SortIcon colKey={col.key} sortConfig={vigentesSort} /></span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedVigentes.map((loan, i) => (
                                                    <tr key={i} className={`border-t border-gray-100 ${loan.enMoraEP ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                        <td className="px-3 py-2.5 font-bold text-gray-700">{loan.idVm}</td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600">
                                                            {loan.valorPrestado > 0 ? `$${Math.round(loan.valorPrestado).toLocaleString('es-CO')}` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-bold">
                                                            <span className={loan.enMoraEP ? 'text-red-600' : 'text-gray-800'}>
                                                                ${Math.round(loan.saldoPendiente).toLocaleString('es-CO')}
                                                            </span>
                                                            <div className="text-[9px] font-normal text-gray-400">Balance real</div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-semibold text-amber-700">
                                                            ${Math.round(loan.valorCuotasPendientes).toLocaleString('es-CO')}
                                                            <div className="text-[9px] font-normal text-gray-400">Suma cuotas</div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            <span className="font-semibold text-gray-700">
                                                                {loan.cuotasPendientesCount + loan.cuotasMoraEPCount}
                                                            </span>
                                                            {loan.cuotas && <span className="text-gray-400"> / {loan.cuotas}</span>}
                                                            {loan.cuotasMoraEPCount > 0 && (
                                                                <div className="text-[9px] text-red-500 font-bold">{loan.cuotasMoraEPCount} vencida(s)</div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center text-gray-600">
                                                            {loan.interesMensual > 0 ? `${loan.interesMensual.toFixed(2)}% m` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${loan.enMoraEP ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {loan.enMoraEP ? `Mora EP ×${loan.cuotasMoraEPCount}` : 'Al día'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-gray-100 font-bold text-gray-700 border-t-2 border-gray-200">
                                                    <td className="px-3 py-2 text-[10px] uppercase">Total</td>
                                                    <td className="px-3 py-2 text-right">—</td>
                                                    <td className="px-3 py-2 text-right text-red-700">
                                                        ${Math.round(analysis.totalDeudaPendiente).toLocaleString('es-CO')}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-amber-700">
                                                        ${Math.round(analysis.prestamosVigentes.reduce((s, l) => s + l.valorCuotasPendientes, 0)).toLocaleString('es-CO')}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {analysis.prestamosVigentes.reduce((s, l) => s + l.cuotasPendientesCount + l.cuotasMoraEPCount, 0)}
                                                        {analysis.totalCuotasMoraEP > 0 && (
                                                            <div className="text-[9px] text-red-600 font-bold">{analysis.totalCuotasMoraEP} en mora</div>
                                                        )}
                                                    </td>
                                                    <td colSpan={2}></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    <p className="text-[9px] text-gray-400 mt-1.5 italic">
                                        * Saldo Pendiente = balance real (saldo inicial próxima cuota). Val. Cuotas Pend. = suma cuotas × intereses por pagar.
                                    </p>
                                </div>
                            )}

                        </div>
                    )}

                    {!analysis && !loadingAnalysis && (
                        <div className="text-center py-12 text-gray-400">
                            <TrendingDown className="h-12 w-12 mx-auto mb-3 opacity-25" />
                            <p className="text-sm font-medium">No se pudo cargar el análisis de capacidad</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserLoanAnalyzerPage;
