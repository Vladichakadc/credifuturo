import React from 'react';
import { Scale, CheckCircle, XCircle, AlertCircle, AlertTriangle, PiggyBank, CreditCard, Award, TrendingUp, Lock, FileText, Gauge, Clock, History } from 'lucide-react';
import { calcVerdict, colorMap, kpiDescriptions } from '../../utils/loanCapacity';
import { useSortTable, SortIcon } from '../../utils/useSortTable';
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

    const v = calcVerdict(analysis, { audience: 'admin' });
    const c = v ? (colorMap[v.color] || colorMap.green) : null;

    const { sortedData: sortedVigentes, sortConfig: vigentesSort, handleSort: handleVigentesSort } =
        useSortTable(analysis?.prestamosVigentes || []);

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
                {v.score && (
                    <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="bg-brand-primary rounded-xl p-2">
                                    <Gauge className="h-4 w-4 text-white" />
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-widest text-gray-700">Score crediticio</p>
                                    <p className="text-sm font-bold text-gray-800">Salud financiera consolidada del socio</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`text-4xl font-black leading-none ${colorMap[v.score.color].text}`}>{v.score.score}</p>
                                <p className={`text-xs font-black uppercase tracking-widest ${colorMap[v.score.color].text}`}>{v.score.nivel}</p>
                                <p className="text-[11px] text-gray-600">de 100</p>
                            </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mb-3">
                            <div className={`h-2 rounded-full transition-all duration-700 ${colorMap[v.score.color].badge}`} style={{ width: `${v.score.score}%` }} />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {v.score.componentes.map((comp) => {
                                const pct = comp.max > 0 ? (comp.pts / comp.max) * 100 : 0;
                                return (
                                    <div key={comp.key} className="bg-white rounded-lg border border-gray-100 p-3">
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <div className="min-w-0">
                                                <p className="text-xs uppercase tracking-wide text-gray-700 font-bold leading-tight">{comp.label}</p>
                                                <p className="text-xs text-gray-600 leading-tight mt-0.5">{comp.hint}</p>
                                            </div>
                                            <p className="text-sm font-bold text-gray-800 whitespace-nowrap">{comp.pts}<span className="text-xs font-normal text-gray-600"> / {comp.max}</span></p>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-1 my-1.5 overflow-hidden">
                                            <div className={`h-1 rounded-full transition-all duration-500 ${pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <p className="text-xs text-gray-600 leading-snug">{comp.detalle}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="rounded-lg border border-gray-100 bg-white p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-blue-500 shrink-0" />
                            <p className="text-xs uppercase tracking-wide text-gray-700 font-bold">Antigüedad como socio</p>
                        </div>
                        <p className="text-sm font-bold text-gray-800">
                            {analysis.mesesComoSocio != null ? `${analysis.mesesComoSocio} meses` : '—'}
                        </p>
                        <p className="text-xs text-gray-700 leading-tight mt-0.5">
                            Permanencia desde el ingreso al fondo. Aporta puntaje en el componente de lealtad; alcanza el máximo a los 24 meses.
                        </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-white p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <History className="h-4 w-4 text-emerald-700 shrink-0" />
                            <p className="text-xs uppercase tracking-wide text-gray-700 font-bold">Créditos saldados</p>
                        </div>
                        <p className="text-sm font-bold text-gray-800">{analysis.prestamosLiquidados || 0}</p>
                        <p className="text-xs text-gray-700 leading-tight mt-0.5">
                            Préstamos cancelados a satisfacción. Evidencia capacidad de pago histórica; alcanza el máximo con 3 créditos.
                        </p>
                    </div>
                    <div className={`rounded-lg border p-3 ${analysis.pagosTardios > 0 ? 'bg-orange-50 border-orange-200' : 'border-gray-100 bg-white'}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className={`h-4 w-4 shrink-0 ${analysis.pagosTardios > 0 ? 'text-orange-500' : 'text-gray-300'}`} />
                            <p className="text-xs uppercase tracking-wide text-gray-700 font-bold">Cuotas liquidadas en mora</p>
                        </div>
                        <p className={`text-sm font-bold ${analysis.pagosTardios > 0 ? 'text-orange-700' : 'text-gray-800'}`}>
                            {analysis.pagosEvaluables > 0 ? `${analysis.pagosTardios} de ${analysis.pagosEvaluables}` : '— sin datos'}
                        </p>
                        <p className="text-xs text-gray-700 leading-tight mt-0.5">
                            {analysis.pagosEvaluables > 0
                                ? 'Pagos liquidados después de la fecha límite. Excluye cuotas heredadas de la migración inicial.'
                                : 'Indicador en construcción — se activa con pagos registrados nativamente en el sistema.'}
                        </p>
                    </div>
                </div>
                {analysis.resolucionVigente && (
                    <div className={`rounded-xl border-2 p-3 flex items-start gap-3 ${analysis.tieneCompromisoNoRetiroAhorros ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                        <div className={`rounded-lg p-2 ${analysis.tieneCompromisoNoRetiroAhorros ? 'bg-amber-500' : 'bg-blue-500'}`}>
                            {analysis.tieneCompromisoNoRetiroAhorros
                                ? <Lock className="h-4 w-4 text-white" />
                                : <FileText className="h-4 w-4 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-xs font-black uppercase tracking-widest ${analysis.tieneCompromisoNoRetiroAhorros ? 'text-amber-700' : 'text-blue-700'}`}>
                                Resolución vigente · {analysis.resolucionVigente.titulo}
                            </p>
                            <p className={`text-xs leading-relaxed mt-1 ${analysis.tieneCompromisoNoRetiroAhorros ? 'text-amber-800' : 'text-blue-800'}`}>
                                {analysis.resolucionVigente.regla}
                            </p>
                            {analysis.tieneCompromisoNoRetiroAhorros && (
                                <p className="text-xs font-semibold text-amber-900 mt-1.5 bg-amber-100 inline-block px-2 py-0.5 rounded">
                                    ⚠ Aplica: el socio tiene préstamo que cruza el 31-dic-{analysis.yearActual}
                                </p>
                            )}
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                        <div className="flex items-center gap-1.5 mb-1">
                            <PiggyBank className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Ahorro Acumulado</span>
                        </div>
                        <p className="text-base font-black text-emerald-600">${Math.round(analysis.ahorroTotal).toLocaleString('es-CO')}</p>
                        <p className="text-[11px] text-emerald-700 mt-0.5">Aportes iniciales + ahorros mensuales</p>
                        <p className="text-[11px] text-gray-700 mt-1 leading-tight">{kpiDescriptions.ahorro}</p>
                    </div>
                    <div className={`rounded-xl p-3 border ${analysis.enMoraActual ? 'bg-red-50 border-red-200' : analysis.totalDeudaPendiente > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                            <CreditCard className={`h-3.5 w-3.5 ${analysis.enMoraActual ? 'text-red-600' : analysis.totalDeudaPendiente > 0 ? 'text-orange-500' : 'text-gray-600'}`} />
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Deuda Pendiente</span>
                        </div>
                        <p className={`text-base font-black ${analysis.enMoraActual ? 'text-red-700' : analysis.totalDeudaPendiente > 0 ? 'text-orange-600' : 'text-gray-600'}`}>
                            ${Math.round(analysis.totalDeudaPendiente).toLocaleString('es-CO')}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${analysis.enMoraActual ? 'text-red-500' : 'text-orange-400'}`}>
                            {analysis.enMoraActual
                                ? `⚠ ${analysis.totalCuotasMoraEP} vencida(s) · $${(analysis.totalMoraEPValor || 0).toLocaleString('es-CO')}`
                                : analysis.totalPrestamosVigentes > 0
                                    ? `${analysis.prestamosVigentes.reduce((s, l) => s + l.cuotasPendientesCount, 0)} cuota(s) por vencer`
                                    : 'Sin obligaciones vigentes'}
                        </p>
                        <p className="text-[11px] text-gray-700 mt-1 leading-tight">{kpiDescriptions.deuda}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Award className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Cupo Máximo</span>
                        </div>
                        <p className="text-base font-black text-blue-600">${Math.round(v.montoMaxSinVotacion).toLocaleString('es-CO')}</p>
                        <p className="text-[11px] text-blue-700 mt-0.5">Regla 3× ahorro · aprobación directa</p>
                        <p className="text-[11px] text-gray-700 mt-1 leading-tight">{kpiDescriptions.maximo}</p>
                    </div>
                    <div className={`rounded-xl p-3 border ${v.capacidadDisponible > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className={`h-3.5 w-3.5 ${v.capacidadDisponible > 0 ? 'text-emerald-600' : 'text-red-500'}`} />
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Capacidad Disponible</span>
                        </div>
                        <p className={`text-base font-black ${v.capacidadDisponible > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            ${Math.max(0, Math.round(v.capacidadDisponible)).toLocaleString('es-CO')}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${v.capacidadDisponible > 0 ? 'text-emerald-700' : 'text-red-400'}`}>
                            {v.capacidadDisponible > 0 ? 'Cupo libre para aprobación directa' : 'Cupo agotado · requiere asamblea'}
                        </p>
                        <p className="text-[11px] text-gray-700 mt-1 leading-tight">{kpiDescriptions.capacidadDisponible}</p>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-semibold text-gray-600">Nivel de Apalancamiento (Deuda / Ahorro)</span>
                        <span className={`text-xs font-black ${v.tasaApalancamiento > 200 ? 'text-red-600' : v.tasaApalancamiento > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {v.tasaApalancamiento === 0 ? 'Sin apalancamiento' : `${v.tasaApalancamiento.toFixed(1)}%`}
                        </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                            className={`h-2.5 rounded-full transition-all duration-700 ${v.tasaApalancamiento === 0 ? 'bg-emerald-200' : v.tasaApalancamiento > 200 ? 'bg-red-500' : v.tasaApalancamiento > 100 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                            style={{ width: `${v.tasaApalancamiento === 0 ? 100 : Math.min(100, v.tasaApalancamiento / 3)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-0.5">
                        <span className="text-[11px] text-gray-600">0%</span>
                        <span className="text-[11px] text-gray-600">100% (1×)</span>
                        <span className="text-[11px] text-gray-600">200% (2×)</span>
                        <span className="text-[11px] text-gray-600">300% (3× límite)</span>
                    </div>
                    {v.tasaApalancamiento === 0 && (
                        <p className="text-xs text-emerald-600 mt-1 italic">Perfil libre de deuda — capacidad máxima disponible.</p>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {v.positivos.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                            <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-700" />
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

                {/* Loans table */}
                {analysis.prestamosVigentes?.length > 0 && (
                    <div className="mt-4">
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Detalle de Préstamos con Cuotas Pendientes</p>
                        <div className="overflow-hidden rounded-xl border border-gray-100">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-gray-100 text-gray-700 uppercase text-xs font-bold">
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
                                                <div className="text-[11px] font-normal text-gray-600">Balance real</div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-semibold text-amber-700">
                                                ${Math.round(loan.valorCuotasPendientes).toLocaleString('es-CO')}
                                                <div className="text-[11px] font-normal text-gray-600">Suma cuotas</div>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className="font-semibold text-gray-700">
                                                    {loan.cuotasPendientesCount + loan.cuotasMoraEPCount}
                                                </span>
                                                {loan.cuotas && <span className="text-gray-600"> / {loan.cuotas}</span>}
                                                {loan.cuotasMoraEPCount > 0 && (
                                                    <div className="text-[11px] text-red-500 font-bold">{loan.cuotasMoraEPCount} vencida(s)</div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center text-gray-600">
                                                {loan.interesMensual > 0 ? `${loan.interesMensual.toFixed(2)}% m` : '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${loan.enMoraEP ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {loan.enMoraEP ? `Mora EP ×${loan.cuotasMoraEPCount}` : 'Al día'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-100 font-bold text-gray-700 border-t-2 border-gray-200">
                                        <td className="px-3 py-2 text-xs uppercase">Total</td>
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
                                                <div className="text-[11px] text-red-600 font-bold">{analysis.totalCuotasMoraEP} en mora</div>
                                            )}
                                        </td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <p className="text-[11px] text-gray-600 mt-1.5 italic">
                            * Saldo Pendiente = balance real (saldo inicial próxima cuota). Val. Cuotas Pend. = suma cuotas × intereses por pagar.
                        </p>
                    </div>
                )}

                <div className={`${c.bg} border-2 ${c.border} rounded-xl p-4`}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`${c.badge} rounded-lg p-2`}>
                            {v.icon === 'check' && <CheckCircle className="h-5 w-5 text-white" />}
                            {v.icon === 'X'     && <XCircle className="h-5 w-5 text-white" />}
                            {v.icon === 'warn'  && <AlertCircle className="h-5 w-5 text-white" />}
                            {v.icon === 'vote'  && <Scale className="h-5 w-5 text-white" />}
                            {v.icon === 'lock'  && <Lock className="h-5 w-5 text-white" />}
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Veredicto Financiero</p>
                            <p className={`text-sm font-black ${c.text}`}>{v.verdict}</p>
                        </div>
                    </div>
                    <p className={`text-xs leading-relaxed ${c.text} mb-3`}>{v.mensaje}</p>
                    <div className="border-t border-current/10 pt-3">
                        <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-1">Recomendación del Analista</p>
                        <p className={`text-xs font-semibold leading-relaxed ${c.text}`}>{v.recomendacion}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoanCapacityWidget;
