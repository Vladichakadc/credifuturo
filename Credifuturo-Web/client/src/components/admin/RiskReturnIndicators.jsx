// Extraído de DashboardHome.jsx ("Indicadores de Riesgo y Rendimiento", la
// cuarta sección de "Indicadores por área") para poder mostrarlo también en
// pages/admin/FinancialIntelligencePage.jsx sin duplicar el cálculo de sus
// cuatro señales (índice de mora, socios en mora, cobertura, retorno del
// capital). El detalle nominal de "Socios en Mora" (nombre + cédula por
// socio) sigue siendo exclusivo del admin: se abre solo si el llamador pasa
// `onSociosMoraClick`. Sin ese prop la tarjeta NO se pinta clicable — antes
// un socio veía cursor-pointer y hover sobre una tarjeta cuyo clic no abría
// nada, porque el backend ya no le envía ese detalle a quien no es admin.
import React from 'react';
import { AlertTriangle, Users, ShieldCheck, TrendingUp } from 'lucide-react';

const RiskReturnIndicators = ({ stats, loading = false, onSociosMoraClick }) => {
                const disponible = (stats?.saldoEnBanco || 0) + (stats?.rentabilidadCajaNU || 0);
                const carteraTotal = (stats?.carteraDia || 0) + (stats?.moraCarteraEP || 0);
                const mora = stats?.moraCarteraEP || 0;
                const sociosMora = stats?.sociosMoraCount || 0;
                const totalSocios = stats?.activeClientsCount || 1;

                // Índice de Mora: % de la cartera que está vencida
                const indiceMora = carteraTotal > 0 ? (mora / carteraTotal) * 100 : 0;
                const moraColor = indiceMora <= 3 ? 'from-emerald-50' : indiceMora <= 5 ? 'from-amber-50' : 'from-red-50';
                const moraText = indiceMora <= 3 ? 'text-emerald-700' : indiceMora <= 5 ? 'text-amber-700' : 'text-red-700';
                const moraBadge = indiceMora <= 3 ? 'bg-emerald-100 text-emerald-700' : indiceMora <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                const moraBadgeLabel = indiceMora <= 3 ? '● Bajo' : indiceMora <= 5 ? '▲ Moderado' : '⚠ Alto';

                // Cobertura de Mora: cuántas veces el efectivo cubre la mora
                const cobertura = mora > 0 ? disponible / mora : null;
                const coberturaColor = cobertura === null ? 'from-emerald-50' : cobertura >= 5 ? 'from-emerald-50' : cobertura >= 2 ? 'from-amber-50' : 'from-red-50';
                const coberturaText = cobertura === null ? 'text-emerald-700' : cobertura >= 5 ? 'text-emerald-700' : cobertura >= 2 ? 'text-amber-700' : 'text-red-700';
                const coberturaBadge = cobertura === null ? 'bg-emerald-100 text-emerald-700' : cobertura >= 5 ? 'bg-emerald-100 text-emerald-700' : cobertura >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                const coberturaBadgeLabel = cobertura === null ? '✓ Sin mora' : cobertura >= 5 ? '✓ Sólida' : cobertura >= 2 ? '● Adecuada' : '⚠ Débil';

                // Socios en Mora: count y % del total
                const sociosMoraPct = totalSocios > 0 ? (sociosMora / totalSocios) * 100 : 0;
                const sociosMoraColor = sociosMora === 0 ? 'from-emerald-50' : sociosMoraPct <= 10 ? 'from-amber-50' : 'from-red-50';
                const sociosMoraText = sociosMora === 0 ? 'text-emerald-700' : sociosMoraPct <= 10 ? 'text-amber-700' : 'text-red-700';
                const sociosMoraBadge = sociosMora === 0 ? 'bg-emerald-100 text-emerald-700' : sociosMoraPct <= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                const sociosMoraBadgeLabel = sociosMora === 0 ? '✓ Ninguno' : `${sociosMoraPct.toFixed(0)}% del total`;

                // Retorno del Capital: rentabilidad total / patrimonio activos
                const rentabilidadTotal = (stats?.totalInteresesPagados || 0) + (stats?.rentabilidadCajaNU || 0) + (stats?.totalPenaltyValue || 0);
                const patrimonio = stats?.totalAhorradoGeneral || 1;
                const retornoCapital = (rentabilidadTotal / patrimonio) * 100;
                const retornoColor = retornoCapital >= 5 ? 'from-emerald-50' : retornoCapital >= 2 ? 'from-amber-50' : 'from-gray-50';
                const retornoText = retornoCapital >= 5 ? 'text-emerald-700' : retornoCapital >= 2 ? 'text-amber-700' : 'text-gray-600';
                const retornoBadge = retornoCapital >= 5 ? 'bg-emerald-100 text-emerald-700' : retornoCapital >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600';
                const retornoBadgeLabel = retornoCapital >= 5 ? '▲ Saludable' : retornoCapital >= 2 ? '● Moderado' : '▼ Revisar';

                return (
                    <div className="mb-8">
                        <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-rose-600" /> Indicadores de Riesgo y Rendimiento
                        </h2>
                        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">

                            {/* Índice de Mora */}
                            <div className={`bg-gradient-to-br ${moraColor} to-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Índice de Mora</p>
                                    <AlertTriangle className={`h-4 w-4 ${moraText}`} />
                                </div>
                                <p className={`text-[28px] font-black font-mono leading-none ${loading ? 'text-gray-300' : moraText}`}>
                                    {loading ? '...' : `${indiceMora.toFixed(1)}%`}
                                </p>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${moraBadge}`}>{moraBadgeLabel}</span>
                                <div>
                                    <div className="relative flex h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-emerald-400 w-[30%]" />
                                        <div className="bg-amber-400 w-[20%]" />
                                        <div className="bg-red-400 flex-1" />
                                        <div className="absolute top-0 bottom-0 w-0.5 bg-gray-900 rounded-full" style={{ left: `${Math.min(indiceMora * 4, 98)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                                        {loading ? '' : `$${Number(mora).toLocaleString('es-CO')} de $${Number(carteraTotal).toLocaleString('es-CO')} cartera`}
                                    </p>
                                </div>
                            </div>

                            {/* Socios en Mora */}
                            <div
                                className={`bg-gradient-to-br ${sociosMoraColor} to-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm transition-all duration-200 ${onSociosMoraClick && sociosMora > 0 ? 'cursor-pointer hover:shadow-md hover:border-brand-primary/20 active:scale-[0.99]' : ''}`}
                                onClick={() => onSociosMoraClick && sociosMora > 0 && onSociosMoraClick()}
                                title={onSociosMoraClick && sociosMora > 0 ? 'Ver detalle de socios en mora' : undefined}
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Socios en Mora</p>
                                    <Users className={`h-4 w-4 ${sociosMoraText}`} />
                                </div>
                                <div className="flex items-end gap-1.5">
                                    <p className={`text-[28px] font-black font-mono leading-none ${loading ? 'text-gray-300' : sociosMoraText}`}>
                                        {loading ? '...' : sociosMora}
                                    </p>
                                    {!loading && <p className="text-[13px] font-bold text-gray-400 mb-0.5">de {totalSocios}</p>}
                                </div>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${sociosMoraBadge}`}>{sociosMoraBadgeLabel}</span>
                                <div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${sociosMora === 0 ? 'bg-emerald-400' : sociosMoraPct <= 10 ? 'bg-amber-400' : 'bg-red-400'}`}
                                            style={{ width: `${Math.min(sociosMoraPct, 100)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                                        {loading ? '' : sociosMora === 0 ? 'Todos al día con sus pagos' : `${sociosMoraPct.toFixed(0)}% de socios activos`}
                                    </p>
                                </div>
                            </div>

                            {/* Cobertura de Mora */}
                            <div className={`bg-gradient-to-br ${coberturaColor} to-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cobertura de Mora</p>
                                    <ShieldCheck className={`h-4 w-4 ${coberturaText}`} />
                                </div>
                                <p className={`text-[28px] font-black font-mono leading-none ${loading ? 'text-gray-300' : coberturaText}`}>
                                    {loading ? '...' : cobertura === null ? '∞' : `${cobertura.toFixed(1)}×`}
                                </p>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${coberturaBadge}`}>{coberturaBadgeLabel}</span>
                                <div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${coberturaText.includes('emerald') ? 'bg-emerald-400' : coberturaText.includes('amber') ? 'bg-amber-400' : 'bg-red-400'}`}
                                            style={{ width: `${cobertura === null ? 100 : Math.min((cobertura / 10) * 100, 100)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                                        {loading ? '' : cobertura === null ? 'Sin deuda vencida que cubrir' : `$${Number(disponible).toLocaleString('es-CO')} caja / $${Number(mora).toLocaleString('es-CO')} mora`}
                                    </p>
                                </div>
                            </div>

                            {/* Retorno del Capital */}
                            <div className={`bg-gradient-to-br ${retornoColor} to-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Retorno del Capital</p>
                                    <TrendingUp className={`h-4 w-4 ${retornoText}`} />
                                </div>
                                <p className={`text-[28px] font-black font-mono leading-none ${loading ? 'text-gray-300' : retornoText}`}>
                                    {loading ? '...' : `${retornoCapital.toFixed(1)}%`}
                                </p>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start ${retornoBadge}`}>{retornoBadgeLabel}</span>
                                <div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${retornoCapital >= 5 ? 'bg-emerald-400' : retornoCapital >= 2 ? 'bg-amber-400' : 'bg-gray-300'}`}
                                            style={{ width: `${Math.min(retornoCapital * 10, 100)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                                        {loading ? '' : `$${Number(rentabilidadTotal).toLocaleString('es-CO')} ganancia / $${Number(patrimonio).toLocaleString('es-CO')} patrimonio`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
};

export default RiskReturnIndicators;
