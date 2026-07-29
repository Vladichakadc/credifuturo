import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { useUi } from '../../context/UiContext';
import LoanCapacityWidget from '../../components/admin/LoanCapacityWidget';
import LoanBoardVotingPanel from '../../components/LoanBoardVotingPanel';
import { Button } from '../../components/ui/Button';
import {
    ClipboardCheck, Loader2, Clock, Users, Calendar,
    Vote, Calculator, Inbox, History, Banknote
} from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ESTADO_BADGE = {
    approved: { label: 'Aprobada', className: 'bg-emerald-100 text-emerald-700' },
    disbursed: { label: 'Desembolsada', className: 'bg-blue-100 text-blue-700' },
    rejected: { label: 'Rechazada', className: 'bg-red-100 text-red-700' },
};

const LoanApprovalsPage = () => {
    const navigate = useNavigate();
    const { toast } = useUi();
    const [viewMode, setViewMode] = useState('pending'); // 'pending' | 'history'
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    const fetchRequests = async (keepSelection = true) => {
        setLoading(true);
        try {
            const statusParam = viewMode === 'pending' ? 'pending' : 'approved,rejected,disbursed';
            const res = await api.get('/admin/loan-requests', { params: { status: statusParam } });
            const data = res.data?.data || [];
            setRequests(data);
            setSelectedId(prev => (keepSelection && prev && data.some(r => r.id === prev)) ? prev : (data[0]?.id ?? null));
        } catch (err) {
            console.error(err);
            toast.error('Error al cargar solicitudes de préstamo.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRequests(false); }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const selected = requests.find(r => r.id === selectedId) || null;

    useEffect(() => {
        if (!selected || viewMode !== 'pending') { setAnalysis(null); return; }
        setAnalysis(null);
        setLoadingAnalysis(true);
        api.get(`/admin/clients/${selected.clientId}/loan-capacity`)
            .then(res => setAnalysis(res.data))
            .catch(() => {})
            .finally(() => setLoadingAnalysis(false));
    }, [selected?.id, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const nombreSocio = (r) => {
        const c = r?.Client;
        if (!c) return 'Socio';
        return `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.trim() || c.cedula || 'Socio';
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                    <ClipboardCheck className="h-6 w-6 text-emerald-600" />
                    Aprobaciones de Préstamos
                </h1>
                <p className="text-gray-500 text-sm mt-1">
                    {viewMode === 'pending'
                        ? 'Solicitudes enviadas por los socios desde el Simulador de Préstamo, pendientes de tu decisión.'
                        : 'Solicitudes ya revisadas: quién las aprobó o rechazó, cuándo, y con qué nota.'}
                </p>
            </div>

            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                <button onClick={() => setViewMode('pending')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'pending' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    Pendientes
                </button>
                <button onClick={() => setViewMode('history')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5 ${viewMode === 'history' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    <History className="h-3.5 w-3.5" /> Historial
                </button>
            </div>

            {viewMode === 'history' ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 gap-2 text-brand-primary">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Cargando...</span>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 px-4">
                            <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">Aún no hay solicitudes revisadas.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Socio</th>
                                        <th className="px-4 py-3 text-right">Monto</th>
                                        <th className="px-4 py-3 text-center">Cuotas</th>
                                        <th className="px-4 py-3 text-center">Estado</th>
                                        <th className="px-4 py-3 text-left">Votos de la Junta</th>
                                        <th className="px-4 py-3 text-left">Fecha decisión</th>
                                        <th className="px-4 py-3 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {requests.map(r => {
                                        const badge = ESTADO_BADGE[r.status] || ESTADO_BADGE.rejected;
                                        const votos = r.BoardVotes || [];
                                        return (
                                            <tr key={r.id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3 font-semibold text-gray-800">{nombreSocio(r)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{fmt(r.amount)}</td>
                                                <td className="px-4 py-3 text-center tabular-nums">{r.installments}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${badge.className}`}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {votos.length === 0 ? <span className="text-gray-300">—</span> : (
                                                        <div className="flex flex-wrap gap-1">
                                                            {votos.map(v => (
                                                                <span key={v.id}
                                                                    title={`${v.Voter?.name || ''} ${v.Voter?.surname1 || ''} (${v.Voter?.cargo || ''}): ${v.decision === 'approved' ? 'aprobó' : 'rechazó'}${v.note ? ' — ' + v.note : ''}`}
                                                                    className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full cursor-help ${
                                                                        v.decision === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                                                    }`}>
                                                                    {(v.Voter?.cargo || v.Voter?.name || '?').slice(0, 2).toUpperCase()}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-gray-500">{fmtFecha(r.reviewedAt)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    {r.status === 'approved' && (
                                                        <Button size="sm" onClick={() => navigate(`/admin/loans?prefillRequestId=${r.id}`)}>
                                                            <Banknote className="mr-1.5 h-3.5 w-3.5" /> Desembolsar
                                                        </Button>
                                                    )}
                                                    {r.status === 'disbursed' && r.DisbursedLoan?.idVm && (
                                                        <span className="text-[11px] font-semibold text-blue-600">{r.DisbursedLoan.idVm}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
                {/* ── Lista de solicitudes pendientes ── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                            Pendientes ({requests.length})
                        </p>
                    </div>
                    {loading ? (
                        <div className="flex items-center justify-center py-12 gap-2 text-brand-primary">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Cargando...</span>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 px-4">
                            <Inbox className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">No hay solicitudes pendientes.</p>
                        </div>
                    ) : (
                        <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-50">
                            {requests.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => setSelectedId(r.id)}
                                    className={`w-full text-left px-4 py-3.5 transition-colors ${r.id === selectedId ? 'bg-brand-primary/10' : 'hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className={`text-sm font-bold truncate ${r.id === selectedId ? 'text-brand-primary' : 'text-gray-800'}`}>
                                                {nombreSocio(r)}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">{fmt(r.amount)} · {r.installments} cuota(s)</p>
                                        </div>
                                        {r.requiresVote && (
                                            <span className="flex-shrink-0 text-[9px] font-black uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                                <Vote className="h-2.5 w-2.5" /> Votación
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-1">
                                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                            <Calendar className="h-2.5 w-2.5" /> {fmtFecha(r.createdAt)}
                                        </p>
                                        <span className="text-[9px] font-bold text-gray-400">
                                            {(r.BoardVotes || []).length}/3 votaron
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Detalle de la solicitud seleccionada ── */}
                <div className="space-y-4">
                    {!selected ? (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
                            <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-25" />
                            <p className="text-sm font-medium">Selecciona una solicitud para evaluarla.</p>
                        </div>
                    ) : (
                        <>
                            {/* Simulación solicitada por el socio */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="bg-gradient-to-r from-brand-primary to-emerald-700 px-5 py-4 flex items-center gap-3">
                                    <div className="bg-white/20 rounded-xl p-2"><Calculator className="h-5 w-5 text-white" /></div>
                                    <div>
                                        <h3 className="text-white font-bold text-base">Simulación solicitada por {nombreSocio(selected)}</h3>
                                        <p className="text-emerald-200 text-xs">Enviada el {fmtFecha(selected.createdAt)} · foto del perfil en ese momento</p>
                                    </div>
                                </div>
                                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monto</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{fmt(selected.amount)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Plazo</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{selected.installments} cuota(s)</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tasa</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{Number(selected.monthlyRate).toFixed(1)}% m</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Primera cuota</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{fmt(selected.firstInstallment)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Última cuota</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{fmt(selected.lastInstallment)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total intereses</p>
                                        <p className="text-base font-black text-amber-600 tabular-nums">{fmt(selected.totalInterest)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total a pagar</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{fmt(selected.totalToPay)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fin estimado</p>
                                        <p className="text-base font-black text-gray-800 tabular-nums">{fmtFecha(selected.estimatedEndDate)}</p>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-3 bg-blue-50 rounded-xl p-3">
                                        <Users className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                        <div>
                                            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Score al pedir</p>
                                            <p className="text-sm font-black text-blue-800">{selected.scoreAtRequest != null ? `${selected.scoreAtRequest}/100` : '—'}</p>
                                        </div>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-3 bg-emerald-50 rounded-xl p-3">
                                        <Clock className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                        <div>
                                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Cupo disponible al pedir</p>
                                            <p className="text-sm font-black text-emerald-800">{selected.availableCapacityAtRequest != null ? fmt(selected.availableCapacityAtRequest) : '—'}</p>
                                        </div>
                                    </div>
                                    {selected.requiresVote && (
                                        <div className="col-span-2 md:col-span-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                            <Vote className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                            <p className="text-xs text-amber-800 leading-snug">
                                                El monto solicitado superaba el cupo de aprobación directa (3× ahorro) de este socio en el momento de pedirlo. Revisa con cuidado antes de decidir.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Análisis de viabilidad en vivo (situación actual del socio) */}
                            <LoanCapacityWidget analysis={analysis} loading={loadingAnalysis} />

                            {/* Votación de la Junta Administrativa (gerente, subgerente, tesorera) */}
                            <LoanBoardVotingPanel request={selected} onVoted={() => fetchRequests(false)} />
                            <p className="text-[10px] text-gray-400 leading-relaxed px-1">
                                El desembolso (banco, cuenta, id_VM) se hace después, por separado, desde "Nuevo Desembolso" en Gestión de Préstamos, una vez la solicitud quede aprobada por los 3.
                            </p>
                        </>
                    )}
                </div>
            </div>
            )}
        </div>
    );
};

export default LoanApprovalsPage;
