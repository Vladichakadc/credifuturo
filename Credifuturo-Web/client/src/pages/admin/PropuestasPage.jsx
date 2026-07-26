import { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import {
    Lightbulb, Plus, Heart, ChevronDown, ChevronUp, Filter, Search,
    Clock, CheckCircle, XCircle, Eye, Trash2, MessageSquare, Rocket,
    TrendingUp, Users, Sparkles, X
} from 'lucide-react';

// ── Configuración de categorías ─────────────────────────────────────────
const CATEGORIAS = ['Todas', 'Ahorro', 'Préstamos', 'Eventos', 'Tecnología', 'Otro'];
const CATEGORIA_COLORS = {
    'Ahorro': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Préstamos': 'bg-blue-100 text-blue-700 border-blue-200',
    'Eventos': 'bg-lime-100 text-lime-700 border-lime-200',
    'Tecnología': 'bg-amber-100 text-amber-700 border-amber-200',
    'Otro': 'bg-gray-100 text-gray-600 border-gray-200',
};
const CATEGORIA_ICONS = {
    'Ahorro': '🐷', 'Préstamos': '💳', 'Eventos': '🎉', 'Tecnología': '⚡', 'Otro': '💡',
};

// ── Configuración de estados ─────────────────────────────────────────────
const ESTADOS = {
    pendiente:   { label: 'Pendiente',    icon: Clock,        color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200',  badgeBg: 'bg-amber-100 text-amber-700' },
    en_revision: { label: 'En Revisión',  icon: Eye,          color: 'text-blue-600',   bg: 'bg-blue-50   border-blue-200',   badgeBg: 'bg-blue-100 text-blue-700' },
    aprobada:    { label: 'Aprobada',     icon: CheckCircle,  color: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-200',badgeBg: 'bg-emerald-100 text-emerald-700' },
    rechazada:   { label: 'Rechazada',    icon: XCircle,      color: 'text-red-500',    bg: 'bg-red-50    border-red-200',    badgeBg: 'bg-red-100 text-red-600' },
};
const ESTADOS_ORDER = ['pendiente', 'en_revision', 'aprobada', 'rechazada'];

// ── Componente: Tarjeta de Propuesta ────────────────────────────────────
const PropuestaCard = ({ propuesta, isAdmin, onVote, onEstadoChange, onDelete, expandedId, setExpandedId }) => {
    const [guardandoEstado, setGuardandoEstado] = useState(false);
    const [respuesta, setRespuesta] = useState(propuesta.respuestaAdmin || '');
    const [guardandoResp, setGuardandoResp] = useState(false);
    const isExpanded = expandedId === propuesta.id;
    const cfg = ESTADOS[propuesta.estado] || ESTADOS.pendiente;
    const EstadoIcon = cfg.icon;

    const handleGuardarRespuesta = async () => {
        setGuardandoResp(true);
        try {
            await api.put(`/admin/propuestas/${propuesta.id}/estado`, { respuestaAdmin: respuesta });
            onEstadoChange(propuesta.id, { respuestaAdmin: respuesta });
        } finally { setGuardandoResp(false); }
    };

    const handleEstado = async (nuevoEstado) => {
        setGuardandoEstado(true);
        try {
            await api.put(`/admin/propuestas/${propuesta.id}/estado`, { estado: nuevoEstado });
            onEstadoChange(propuesta.id, { estado: nuevoEstado });
        } finally { setGuardandoEstado(false); }
    };

    return (
        <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden
            ${isExpanded ? 'shadow-lg ring-2 ring-emerald-200' : ''}`}>
            {/* Stripe de color por estado */}
            <div className={`h-1 w-full ${
                propuesta.estado === 'aprobada' ? 'bg-gradient-to-r from-emerald-400 to-green-500' :
                propuesta.estado === 'en_revision' ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                propuesta.estado === 'rechazada' ? 'bg-gradient-to-r from-red-400 to-red-500' :
                'bg-gradient-to-r from-amber-300 to-yellow-400'
            }`} />

            <div className="p-4">
                {/* Header de la tarjeta */}
                <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-primary to-brand-dark flex items-center justify-center text-white text-lg flex-shrink-0 shadow-md">
                        {CATEGORIA_ICONS[propuesta.categoria] || '💡'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-black text-gray-900 text-sm leading-tight mb-1 line-clamp-2">{propuesta.titulo}</h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${CATEGORIA_COLORS[propuesta.categoria] || CATEGORIA_COLORS['Otro']}`}>
                                {propuesta.categoria}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badgeBg} flex items-center gap-1`}>
                                <EstadoIcon className="w-2.5 h-2.5" />
                                {cfg.label}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Descripción */}
                <p className={`text-xs text-gray-600 leading-relaxed mb-3 ${isExpanded ? '' : 'line-clamp-2'}`}>
                    {propuesta.descripcion}
                </p>

                {/* Respuesta del admin */}
                {propuesta.respuestaAdmin && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-3 text-xs">
                        <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600 mb-1 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> Respuesta del Comité
                        </div>
                        <p className="text-emerald-800">{propuesta.respuestaAdmin}</p>
                    </div>
                )}

                {/* Footer: autor, fecha, votos, acciones */}
                <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                            {(propuesta.autorNombre || 'A')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <div className="text-[10px] font-bold text-gray-700 truncate">{propuesta.autorNombre}</div>
                            <div className="text-[9px] text-gray-400">
                                {new Date(propuesta.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Botón de voto */}
                        <button
                            onClick={() => onVote(propuesta.id)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-black transition-all duration-150
                                ${propuesta.yaVote
                                    ? 'bg-red-100 text-red-600 hover:bg-red-200 scale-105'
                                    : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500'
                                }`}>
                            <Heart className={`w-3.5 h-3.5 ${propuesta.yaVote ? 'fill-red-500' : ''}`} />
                            {propuesta.votos || 0}
                        </button>
                        {/* Expandir */}
                        <button
                            onClick={() => setExpandedId(isExpanded ? null : propuesta.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {/* Eliminar (solo admin) */}
                        {isAdmin && (
                            <button
                                onClick={() => onDelete(propuesta.id)}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Panel expandido (solo admin): cambiar estado + respuesta */}
                {isExpanded && isAdmin && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3" style={{ animation: 'fadeSlideIn 0.15s ease both' }}>
                        <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                            <div className="w-1 h-3 bg-gradient-to-b from-brand-primary to-brand-dark rounded-full" />
                            Gestionar Propuesta
                        </div>
                        {/* Selector de estado */}
                        <div className="flex flex-wrap gap-1.5">
                            {ESTADOS_ORDER.map(e => {
                                const c = ESTADOS[e];
                                const EIcon = c.icon;
                                return (
                                    <button key={e} disabled={guardandoEstado}
                                        onClick={() => handleEstado(e)}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black border transition-all
                                            ${propuesta.estado === e
                                                ? `${c.badgeBg} border-current scale-105 shadow-sm`
                                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                                            } disabled:opacity-50`}>
                                        <EIcon className="w-3 h-3" />
                                        {c.label}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Campo de respuesta */}
                        <textarea
                            value={respuesta}
                            onChange={e => setRespuesta(e.target.value)}
                            placeholder="Escribe una respuesta del comité para este socio..."
                            className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
                            rows={3}
                        />
                        <button
                            onClick={handleGuardarRespuesta}
                            disabled={guardandoResp}
                            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-black py-2 rounded-xl hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                            {guardandoResp ? 'Guardando...' : <><MessageSquare className="w-3.5 h-3.5" /> Guardar Respuesta</>}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Componente: Formulario de nueva propuesta ────────────────────────────
const FormularioPropuesta = ({ onCreated, onCancel }) => {
    const [titulo, setTitulo] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [categoria, setCategoria] = useState('Otro');
    const [anonima, setAnonima] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [lanzado, setLanzado] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (titulo.length < 5) return setError('El título debe tener al menos 5 caracteres.');
        if (descripcion.length < 10) return setError('La descripción debe tener al menos 10 caracteres.');

        setEnviando(true);
        try {
            const res = await api.post('/admin/propuestas', { titulo, descripcion, categoria, anonima });
            if (res.data.ok) {
                setLanzado(true);
                setTimeout(() => {
                    setLanzado(false);
                    onCreated(res.data.data);
                }, 1800);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error al enviar la propuesta.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-white/30"
                style={{ animation: 'fadeSlideIn 0.2s ease both' }}>
                {/* Header */}
                <div className="bg-gradient-to-br from-brand-dark to-brand-primary px-6 pt-6 pb-8 text-white relative overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                                {lanzado ? '🚀' : '💡'}
                            </div>
                            <div>
                                <h2 className="font-black text-lg leading-tight">
                                    {lanzado ? '¡Propuesta enviada!' : 'Nueva Propuesta'}
                                </h2>
                                <p className="text-white/70 text-xs">Tu voz importa en el fondo</p>
                            </div>
                        </div>
                        <button onClick={onCancel} className="p-2 rounded-xl hover:bg-white/20 transition-all">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {lanzado ? (
                    <div className="p-8 text-center flex flex-col items-center gap-4">
                        <div className="text-6xl animate-bounce">🚀</div>
                        <div>
                            <p className="font-black text-gray-900 text-lg">¡Tu propuesta fue enviada!</p>
                            <p className="text-gray-500 text-sm mt-1">El comité la revisará pronto.</p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4 -mt-2">
                        {/* Categoría */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1.5">Categoría</label>
                            <div className="flex flex-wrap gap-2">
                                {CATEGORIAS.filter(c => c !== 'Todas').map(cat => (
                                    <button key={cat} type="button"
                                        onClick={() => setCategoria(cat)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all
                                            ${categoria === cat
                                                ? `${CATEGORIA_COLORS[cat]} scale-105 shadow-sm`
                                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                                            }`}>
                                        {CATEGORIA_ICONS[cat]} {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Título */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1.5">Título de la Propuesta</label>
                            <input
                                value={titulo}
                                onChange={e => setTitulo(e.target.value)}
                                maxLength={200}
                                placeholder="Resumen en una frase..."
                                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all font-semibold"
                            />
                            <div className="text-right text-[10px] text-gray-300 mt-1">{titulo.length}/200</div>
                        </div>

                        {/* Descripción */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1.5">Descripción Detallada</label>
                            <textarea
                                value={descripcion}
                                onChange={e => setDescripcion(e.target.value)}
                                maxLength={2000}
                                rows={4}
                                placeholder="Explica tu idea con detalle: ¿qué problema resuelve? ¿cómo beneficia al fondo?"
                                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all"
                            />
                            <div className="text-right text-[10px] text-gray-300 mt-0.5">{descripcion.length}/2000</div>
                        </div>

                        {/* Anónima */}
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all
                                ${anonima ? 'bg-brand-primary border-brand-primary' : 'border-gray-300 group-hover:border-brand-primary/60'}`}
                                onClick={() => setAnonima(prev => !prev)}>
                                {anonima && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div>
                                <span className="text-sm font-semibold text-gray-700">Enviar de forma anónima</span>
                                <p className="text-xs text-gray-400">Tu nombre no aparecerá en la propuesta</p>
                            </div>
                        </label>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-semibold">
                                ⚠️ {error}
                            </div>
                        )}

                        <div className="flex gap-3 pt-1">
                            <button type="button" onClick={onCancel}
                                className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-all">
                                Cancelar
                            </button>
                            <button type="submit" disabled={enviando}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-primary to-brand-dark text-white text-sm font-black hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/30">
                                {enviando ? 'Enviando...' : <><Rocket className="w-4 h-4" /> Enviar Propuesta</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

// ── Componente principal: PropuestasPage ─────────────────────────────────
const PropuestasPage = () => {
    const [propuestas, setPropuestas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState('Todas');
    const [filtroEstado, setFiltroEstado] = useState('todas');
    const [orden, setOrden] = useState('votos');
    const [expandedId, setExpandedId] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [moduleEnabled, setModuleEnabled] = useState(false);
    const [toggling, setToggling] = useState(false);

    useEffect(() => {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        setIsAdmin(u.role === 'admin');
        
        // Fetch config
        api.get('/admin/settings/propuestas_enabled').then(res => {
            setModuleEnabled(res.data.value === 'true');
        }).catch(err => console.error(err));
    }, []);

    const toggleModule = async () => {
        setToggling(true);
        try {
            const newValue = !moduleEnabled;
            await api.put('/admin/settings/propuestas_enabled', { value: newValue.toString() });
            setModuleEnabled(newValue);
        } catch (err) {
            console.error('Error toggling module:', err);
        } finally {
            setToggling(false);
        }
    };

    const fetchPropuestas = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ orden });
            if (filtroEstado && filtroEstado !== 'todas') params.set('estado', filtroEstado);
            if (filtroCategoria && filtroCategoria !== 'Todas') params.set('categoria', filtroCategoria);
            const res = await api.get(`/admin/propuestas?${params.toString()}`);
            if (res.data.ok) setPropuestas(res.data.data);
        } catch (err) {
            console.error('Error cargando propuestas:', err.message);
        } finally {
            setLoading(false);
        }
    }, [filtroEstado, filtroCategoria, orden]);

    useEffect(() => { fetchPropuestas(); }, [fetchPropuestas]);

    const handleVote = async (id) => {
        try {
            const res = await api.put(`/admin/propuestas/${id}/voto`);
            if (res.data.ok) {
                setPropuestas(prev => prev.map(p =>
                    p.id === id ? { ...p, votos: res.data.votos, yaVote: res.data.yaVote } : p
                ));
            }
        } catch (err) {
            console.error('Error votando:', err.message);
        }
    };

    const handleEstadoChange = (id, cambios) => {
        setPropuestas(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p));
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Eliminar esta propuesta?')) return;
        try {
            await api.delete(`/admin/propuestas/${id}`);
            setPropuestas(prev => prev.filter(p => p.id !== id));
        } catch (err) {
            console.error('Error eliminando:', err.message);
        }
    };

    const handleCreated = (nueva) => {
        setPropuestas(prev => [{ ...nueva, yaVote: false }, ...prev]);
        setShowForm(false);
    };

    // Filtro local por búsqueda
    const filtradas = propuestas.filter(p => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return p.titulo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q) || p.autorNombre.toLowerCase().includes(q);
    });

    // Stats
    const stats = {
        total: propuestas.length,
        pendientes: propuestas.filter(p => p.estado === 'pendiente').length,
        aprobadas: propuestas.filter(p => p.estado === 'aprobada').length,
        votos: propuestas.reduce((s, p) => s + (p.votos || 0), 0),
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-amber-50/20 p-4 sm:p-6">
            <style>{`
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* ── HEADER ── */}
            <div className="relative bg-gradient-to-br from-brand-dark via-brand-primary to-brand-dark rounded-3xl p-6 sm:p-8 mb-6 overflow-hidden shadow-2xl shadow-brand-primary/20">
                <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-brand-gold/10 rounded-full blur-3xl" />
                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center text-3xl shadow-lg">💡</div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Buzón de Propuestas</h1>
                                {isAdmin && (
                                    <button 
                                        onClick={toggleModule} 
                                        disabled={toggling}
                                        className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border flex items-center gap-1.5 transition-all ${moduleEnabled ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-200 border-red-400/30 hover:bg-red-500/30'}`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${moduleEnabled ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]'}`} />
                                        {moduleEnabled ? 'Visible para socios' : 'Oculto para socios'}
                                    </button>
                                )}
                            </div>
                            <p className="text-white/70 text-sm mt-0.5">Comparte tus ideas para mejorar el fondo</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 bg-white text-brand-primary font-black px-5 py-3 rounded-2xl hover:bg-emerald-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 text-sm">
                        <Plus className="w-4 h-4" /> Nueva Propuesta
                    </button>
                </div>

                {/* Stats strip */}
                <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                    {[
                        { label: 'Total Propuestas', value: stats.total, icon: Lightbulb, color: 'text-white' },
                        { label: 'Pendientes', value: stats.pendientes, icon: Clock, color: 'text-amber-300' },
                        { label: 'Aprobadas', value: stats.aprobadas, icon: CheckCircle, color: 'text-emerald-300' },
                        { label: 'Total Votos', value: stats.votos, icon: Heart, color: 'text-red-300' },
                    ].map(s => (
                        <div key={s.label} className="bg-white/15 backdrop-blur rounded-2xl px-4 py-3 flex items-center gap-3">
                            <s.icon className={`w-5 h-5 flex-shrink-0 ${s.color}`} />
                            <div>
                                <div className="text-xl font-black text-white tabular-nums">{s.value}</div>
                                <div className="text-[10px] font-bold text-white/60 leading-tight">{s.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── FILTROS ── */}
            <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white shadow-sm p-4 mb-5">
                <div className="flex flex-wrap gap-3 items-center">
                    {/* Búsqueda */}
                    <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar propuesta..."
                            className="w-full pl-9 pr-4 py-2.5 text-sm border-2 border-gray-100 rounded-xl bg-gray-50 focus:outline-none focus:border-brand-primary focus:bg-white focus:ring-4 focus:ring-brand-primary/10 transition-all font-semibold text-gray-700" />
                    </div>
                    {/* Categorías */}
                    <div className="flex flex-wrap gap-1.5">
                        {CATEGORIAS.map(cat => (
                            <button key={cat} onClick={() => setFiltroCategoria(cat)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all
                                    ${filtroCategoria === cat
                                        ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-brand-primary/40 hover:text-brand-primary'
                                    }`}>
                                {cat === 'Todas' ? '🔍 Todas' : `${CATEGORIA_ICONS[cat]} ${cat}`}
                            </button>
                        ))}
                    </div>
                    {/* Estado y orden */}
                    <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                        className="text-xs font-bold border-2 border-gray-100 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:border-brand-primary text-gray-600">
                        <option value="todas">Todos los estados</option>
                        {ESTADOS_ORDER.map(e => <option key={e} value={e}>{ESTADOS[e].label}</option>)}
                    </select>
                    <select value={orden} onChange={e => setOrden(e.target.value)}
                        className="text-xs font-bold border-2 border-gray-100 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:border-brand-primary text-gray-600">
                        <option value="votos">↑ Más votadas</option>
                        <option value="reciente">↑ Más recientes</option>
                        <option value="antiguo">↑ Más antiguas</option>
                    </select>
                </div>
            </div>

            {/* ── CONTENIDO ── */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <div className="w-12 h-12 border-4 border-emerald-200 border-t-brand-primary rounded-full animate-spin" />
                    <p className="text-brand-primary/70 font-black text-xs uppercase tracking-widest">Cargando propuestas...</p>
                </div>
            ) : filtradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
                    <Lightbulb className="w-20 h-20 opacity-10" />
                    <div className="text-center">
                        <p className="font-black text-lg text-gray-500">No hay propuestas aquí</p>
                        <p className="text-sm text-gray-400 mt-1">{search ? `Sin resultados para "${search}"` : '¡Sé el primero en proponer una idea!'}</p>
                    </div>
                    <button onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 bg-gradient-to-r from-brand-primary to-brand-dark text-white font-black px-5 py-3 rounded-2xl hover:opacity-90 transition-all shadow-lg text-sm mt-2">
                        <Sparkles className="w-4 h-4" /> Crear primera propuesta
                    </button>
                </div>
            ) : (
                <>
                    <div className="text-xs font-bold text-gray-400 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5" />
                        {filtradas.length} propuesta{filtradas.length !== 1 ? 's' : ''}
                        {search && ` · búsqueda: "${search}"`}
                    </div>

                    {/* Vista Kanban por estado */}
                    {filtroEstado === 'todas' && !search ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                            {ESTADOS_ORDER.map(estado => {
                                const grupo = filtradas.filter(p => p.estado === estado);
                                const cfg = ESTADOS[estado];
                                const EIcon = cfg.icon;
                                return (
                                    <div key={estado} className="flex flex-col gap-3">
                                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${cfg.bg} border`}>
                                            <EIcon className={`w-4 h-4 ${cfg.color} flex-shrink-0`} />
                                            <span className={`text-xs font-black ${cfg.color}`}>{cfg.label}</span>
                                            <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-full ${cfg.badgeBg}`}>{grupo.length}</span>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            {grupo.length === 0 ? (
                                                <div className="bg-white/60 border border-dashed border-gray-200 rounded-2xl p-6 text-center text-xs text-gray-400 font-semibold">
                                                    Sin propuestas
                                                </div>
                                            ) : grupo.map(p => (
                                                <PropuestaCard key={p.id} propuesta={p} isAdmin={isAdmin}
                                                    onVote={handleVote} onEstadoChange={handleEstadoChange}
                                                    onDelete={handleDelete} expandedId={expandedId}
                                                    setExpandedId={setExpandedId} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // Vista lista (cuando hay filtro)
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filtradas.map(p => (
                                <PropuestaCard key={p.id} propuesta={p} isAdmin={isAdmin}
                                    onVote={handleVote} onEstadoChange={handleEstadoChange}
                                    onDelete={handleDelete} expandedId={expandedId}
                                    setExpandedId={setExpandedId} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── FORMULARIO MODAL ── */}
            {showForm && <FormularioPropuesta onCreated={handleCreated} onCancel={() => setShowForm(false)} />}
        </div>
    );
};

export default PropuestasPage;
