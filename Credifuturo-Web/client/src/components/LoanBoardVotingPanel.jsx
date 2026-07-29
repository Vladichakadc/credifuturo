import { useState, useEffect, useCallback } from 'react';
import api from '../config/api';
import { useUi } from '../context/UiContext';
import { CheckCircle, XCircle, Clock, Loader2, Users } from 'lucide-react';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const nombreMiembro = (m) => `${m.name || ''} ${m.surname1 || ''}`.trim();

// Panel de votación de la Junta Administrativa (gerente, subgerente, tesorera) para
// una solicitud de préstamo. Compartido entre LoanApprovalsPage.jsx (admin/gerente)
// y JuntaAprobacionesPage.jsx (subgerente/tesorera) — mismo componente, mismos datos,
// solo cambia el layout que lo envuelve.
const LoanBoardVotingPanel = ({ request, onVoted }) => {
    const { toast } = useUi();
    const [members, setMembers] = useState([]);
    const [loadingMembers, setLoadingMembers] = useState(true);
    const [note, setNote] = useState('');
    const [actionLoading, setActionLoading] = useState(null); // 'approved' | 'rejected' | null

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const currentUserId = currentUser.clientId || currentUser.id;

    useEffect(() => {
        api.get('/admin/junta/members')
            .then(res => setMembers(res.data?.data || []))
            .catch(() => {})
            .finally(() => setLoadingMembers(false));
    }, []);

    const votes = request?.BoardVotes || [];
    const findVoto = useCallback((memberId) => votes.find(v => v.voterClientId === memberId || v.Voter?.id === memberId), [votes]);
    const miVoto = findVoto(currentUserId);
    const esFinal = request && request.status !== 'pending';

    const handleVote = async (decision) => {
        setActionLoading(decision);
        try {
            await api.put(`/admin/loan-requests/${request.id}/vote`, { decision, note: note.trim() || undefined });
            setNote('');
            toast.success(decision === 'approved' ? 'Tu voto quedó registrado: aprobado.' : 'Tu voto quedó registrado: rechazado.');
            onVoted?.();
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo registrar tu voto.');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-brand-dark to-brand-primary px-5 py-4 flex items-center gap-3">
                <div className="bg-white/20 rounded-xl p-2"><Users className="h-5 w-5 text-white" /></div>
                <div>
                    <h3 className="text-white font-bold text-base">Junta Administrativa</h3>
                    <p className="text-emerald-100 text-xs">
                        {esFinal
                            ? `Decisión final: ${request.status === 'approved' ? 'aprobado' : 'rechazado'} por los 3 miembros.`
                            : 'Se necesitan los 3 votos (gerente, subgerente, tesorera) para decidir.'}
                    </p>
                </div>
            </div>

            <div className="p-5 space-y-2.5">
                {loadingMembers ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-brand-primary">
                        <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm">Cargando Junta...</span>
                    </div>
                ) : (
                    members.map(m => {
                        const voto = findVoto(m.id);
                        const esMio = m.id === currentUserId;
                        return (
                            <div key={m.id} className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
                                voto?.decision === 'approved' ? 'bg-emerald-50 border-emerald-200' :
                                voto?.decision === 'rejected' ? 'bg-red-50 border-red-200' :
                                'bg-gray-50 border-gray-200'
                            }`}>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-800 truncate">
                                        {nombreMiembro(m)} {esMio && <span className="text-[10px] font-black text-brand-primary">(tú)</span>}
                                    </p>
                                    <p className="text-[11px] text-gray-500">{m.cargo || (m.role === 'admin' ? 'Gerente' : 'Miembro de Junta')}</p>
                                    {voto?.note && <p className="text-[11px] text-gray-600 italic mt-1">"{voto.note}"</p>}
                                    {voto && <p className="text-[10px] text-gray-400 mt-0.5">{fmtFecha(voto.updatedAt || voto.createdAt)}</p>}
                                </div>
                                <span className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                                    voto?.decision === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                    voto?.decision === 'rejected' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-200 text-gray-500'
                                }`}>
                                    {voto?.decision === 'approved' ? <><CheckCircle className="h-3 w-3" /> Aprobó</> :
                                     voto?.decision === 'rejected' ? <><XCircle className="h-3 w-3" /> Rechazó</> :
                                     <><Clock className="h-3 w-3" /> Pendiente</>}
                                </span>
                            </div>
                        );
                    })
                )}

                {!esFinal && (
                    <div className="pt-2 space-y-2.5 border-t border-gray-100 mt-3">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            {miVoto ? 'Cambiar tu voto' : 'Tu voto'} · nota opcional
                        </label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={2}
                            placeholder="Ej: aprobado a 8 cuotas en vez de 12, o motivo del rechazo..."
                            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none resize-none"
                        />
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                onClick={() => handleVote('approved')}
                                disabled={!!actionLoading}
                                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm py-2.5 rounded-xl transition-colors">
                                {actionLoading === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                {miVoto?.decision === 'approved' ? 'Ya aprobaste' : 'Aprobar'}
                            </button>
                            <button
                                onClick={() => handleVote('rejected')}
                                disabled={!!actionLoading}
                                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-sm py-2.5 rounded-xl transition-colors">
                                {actionLoading === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                {miVoto?.decision === 'rejected' ? 'Ya rechazaste' : 'Rechazar'}
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                            Tu voto se guarda de inmediato y puedes cambiarlo mientras falte algún miembro por votar. La solicitud queda aprobada o rechazada solo cuando los 3 hayan decidido.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoanBoardVotingPanel;
