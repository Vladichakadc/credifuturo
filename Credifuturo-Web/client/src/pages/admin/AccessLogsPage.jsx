import React, { useState, useEffect, useMemo } from 'react';
import api from '../../config/api';
import { useUi } from '../../context/UiContext';
import { History, Search, Loader2, ShieldAlert, LogIn, LogOut, KeyRound, RefreshCw, Clock, Ban, Globe } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const EVENT_META = {
    LOGIN_SUCCESS: { label: 'Inicio de sesión exitoso', variant: 'success', icon: LogIn },
    LOGIN_FAIL_USER_NOT_FOUND: { label: 'Intento fallido (usuario no existe)', variant: 'error', icon: LogOut },
    LOGIN_FAIL_BAD_PASSWORD: { label: 'Intento fallido (contraseña incorrecta)', variant: 'error', icon: LogOut },
    LOGIN_FAIL_DEACTIVATED: { label: 'Intento de socio inactivo', variant: 'warning', icon: LogOut },
    ALERT_BRUTE_FORCE_SUSPECTED: { label: 'Alerta: posible fuerza bruta', variant: 'error', icon: ShieldAlert },
    ALERT_RATE_LIMIT_LOGIN: { label: 'Bloqueo por límite de intentos (login)', variant: 'error', icon: Ban },
    ALERT_RATE_LIMIT_RESET: { label: 'Bloqueo por límite de solicitudes (recuperación)', variant: 'warning', icon: Ban },
    PASSWORD_CHANGED: { label: 'Cambio de contraseña', variant: 'info', icon: KeyRound },
    PASSWORD_CHANGE_FAIL_BAD_CURRENT: { label: 'Cambio de contraseña fallido', variant: 'warning', icon: KeyRound },
    PASSWORD_RESET_REQUESTED: { label: 'Solicitud de recuperación', variant: 'info', icon: KeyRound },
    PASSWORD_RESET_BY_ADMIN: { label: 'Restablecida por administrador', variant: 'secondary', icon: KeyRound },
};

const SEVERITY_META = {
    alta: { label: 'Alta', variant: 'error' },
    media: { label: 'Media', variant: 'warning' },
    baja: { label: 'Baja', variant: 'secondary' },
};

const TABS = [
    { key: 'acceso', label: 'Accesos', icon: History },
    { key: 'ataques', label: 'Eventos de Seguridad', icon: ShieldAlert },
];

const FILTERS = [
    { key: 'ALL', label: 'Todos' },
    { key: 'LOGIN_SUCCESS', label: 'Ingresos exitosos' },
    { key: 'LOGIN_FAIL', label: 'Intentos fallidos' },
    { key: 'ALERT_BRUTE_FORCE_SUSPECTED', label: 'Alertas' },
    { key: 'PASSWORD', label: 'Contraseñas' },
];

const ATTACK_FILTERS = [
    { key: 'ALL', label: 'Todos' },
    { key: 'LOGIN_FAIL', label: 'Fallos de login' },
    { key: 'ALERT_BRUTE_FORCE_SUSPECTED', label: 'Fuerza bruta' },
    { key: 'ALERT_RATE_LIMIT', label: 'Bloqueos rate-limit' },
    { key: 'PASSWORD_CHANGE_FAIL_BAD_CURRENT', label: 'Contraseña' },
];

const formatFecha = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
    });
};

const formatHora = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
};

const formatDuracion = (mins) => {
    if (mins === null || mins === undefined) return null;
    if (mins < 1) return '< 1 min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} min`;
    return `${h}h ${m}min`;
};

const detalleTexto = (entry) => {
    const { event, extra } = entry;
    if (event === 'ALERT_BRUTE_FORCE_SUSPECTED') {
        const objetivo = extra?.target === 'ip' ? 'IP' : 'cédula';
        return `${extra?.failuresInWindow || '?'} fallos en ${extra?.windowMinutes || '?'} min (objetivo: ${objetivo})`;
    }
    if (event === 'LOGIN_SUCCESS' && entry.mustChangePassword) {
        return 'Debe cambiar contraseña';
    }
    if (event === 'PASSWORD_RESET_REQUESTED') {
        return extra?.matched === false ? 'No se encontró cuenta asociada' : 'Solicitud registrada';
    }
    if (event === 'ALERT_RATE_LIMIT_LOGIN') {
        return 'Se superó el límite de 10 intentos de inicio de sesión en 15 minutos';
    }
    if (event === 'ALERT_RATE_LIMIT_RESET') {
        return 'Se superó el límite de 5 solicitudes de recuperación en 1 hora';
    }
    return '—';
};

const AccessLogsPage = () => {
    const { toast } = useUi();
    const [activeTab, setActiveTab] = useState('acceso');

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('ALL');

    const [attackLogs, setAttackLogs] = useState([]);
    const [attackLoading, setAttackLoading] = useState(true);
    const [attackSearch, setAttackSearch] = useState('');
    const [attackFilter, setAttackFilter] = useState('ALL');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/logs/access');
            setLogs(res.data.data || []);
        } catch (err) {
            toast.error('Error al cargar los registros de acceso.');
        } finally {
            setLoading(false);
        }
    };

    const fetchAttackLogs = async () => {
        setAttackLoading(true);
        try {
            const res = await api.get('/admin/logs/security-events');
            setAttackLogs(res.data.data || []);
        } catch (err) {
            toast.error('Error al cargar los eventos de seguridad.');
        } finally {
            setAttackLoading(false);
        }
    };

    const refreshActive = () => {
        fetchLogs();
        fetchAttackLogs();
    };

    useEffect(() => { fetchLogs(); fetchAttackLogs(); }, []);

    const filtered = useMemo(() => {
        return logs.filter((l) => {
            if (filter === 'LOGIN_FAIL' && !l.event.startsWith('LOGIN_FAIL')) return false;
            if (filter === 'PASSWORD' && !l.event.startsWith('PASSWORD')) return false;
            if (filter !== 'ALL' && filter !== 'LOGIN_FAIL' && filter !== 'PASSWORD' && l.event !== filter) return false;
            if (search.trim()) {
                const q = search.trim().toLowerCase();
                const haystack = `${l.nombre || ''} ${l.cedula || ''} ${l.customerId || ''} ${l.ip || ''}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [logs, search, filter]);

    const kpis = useMemo(() => {
        const total = logs.length;
        const exitosos = logs.filter(l => l.event === 'LOGIN_SUCCESS').length;
        const fallidos = logs.filter(l => l.event.startsWith('LOGIN_FAIL')).length;
        const alertas = logs.filter(l => l.event === 'ALERT_BRUTE_FORCE_SUSPECTED').length;
        const conectados = logs.filter(l => l.online).length;
        return { total, exitosos, fallidos, alertas, conectados };
    }, [logs]);

    const attackFiltered = useMemo(() => {
        return attackLogs.filter((l) => {
            if (attackFilter === 'LOGIN_FAIL' && !l.event.startsWith('LOGIN_FAIL')) return false;
            if (attackFilter === 'ALERT_RATE_LIMIT' && !l.event.startsWith('ALERT_RATE_LIMIT')) return false;
            if (
                attackFilter !== 'ALL' &&
                attackFilter !== 'LOGIN_FAIL' &&
                attackFilter !== 'ALERT_RATE_LIMIT' &&
                l.event !== attackFilter
            ) return false;
            if (attackSearch.trim()) {
                const q = attackSearch.trim().toLowerCase();
                const haystack = `${l.nombre || ''} ${l.cedula || ''} ${l.customerId || ''} ${l.ip || ''}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [attackLogs, attackSearch, attackFilter]);

    const attackKpis = useMemo(() => {
        const total = attackLogs.length;
        const bruteForce = attackLogs.filter(l => l.event === 'ALERT_BRUTE_FORCE_SUSPECTED').length;
        const rateLimit = attackLogs.filter(l => l.event.startsWith('ALERT_RATE_LIMIT')).length;
        const ipsUnicas = new Set(attackLogs.map(l => l.ip).filter(Boolean)).size;
        const alta = attackLogs.filter(l => l.severity === 'alta').length;
        return { total, bruteForce, rateLimit, ipsUnicas, alta };
    }, [attackLogs]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                        <History className="h-6 w-6" />
                        Logs del Sistema
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Auditoría de ingresos al portal y eventos de seguridad (intentos de vulnerar el sistema).
                        No incluye contraseñas: el logger ya las redacta antes de escribir al archivo.
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={refreshActive} disabled={loading || attackLoading}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${(loading || attackLoading) ? 'animate-spin' : ''}`} />
                    Actualizar
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    const isActive = activeTab === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                                isActive
                                    ? 'border-brand-primary text-brand-primary'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {t.label}
                            {t.key === 'ataques' && attackKpis.total > 0 && (
                                <Badge variant={attackKpis.alta > 0 ? 'error' : 'secondary'} className="ml-1">
                                    {attackKpis.total}
                                </Badge>
                            )}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'acceso' && (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Eventos totales</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{kpis.total}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Ingresos exitosos</p>
                            <p className="text-2xl font-bold text-emerald-600 mt-1">{kpis.exitosos}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Intentos fallidos</p>
                            <p className="text-2xl font-bold text-red-600 mt-1">{kpis.fallidos}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Alertas de seguridad</p>
                            <p className="text-2xl font-bold text-orange-600 mt-1">{kpis.alertas}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Conectados ahora</p>
                            <p className="text-2xl font-bold text-blue-600 mt-1">{kpis.conectados}</p>
                        </div>
                    </div>

                    {/* Filtros */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Buscar por nombre, cédula, código o IP..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {FILTERS.map((f) => (
                                <button
                                    key={f.key}
                                    onClick={() => setFilter(f.key)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                        filter === f.key
                                            ? 'bg-brand-primary text-white border-brand-primary'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tabla */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-700">
                                {loading ? 'Cargando...' : `${filtered.length} registro(s)`}
                            </p>
                        </div>
                        {loading ? (
                            <div className="py-12 flex items-center justify-center gap-2 text-gray-400">
                                <Loader2 className="h-5 w-5 animate-spin" /> Cargando...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="py-12 text-center text-gray-400 text-sm">
                                No hay registros que coincidan con el filtro.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Fecha</th>
                                            <th className="px-3 py-2 text-left">Hora</th>
                                            <th className="px-3 py-2 text-left">Evento</th>
                                            <th className="px-3 py-2 text-left">Socio</th>
                                            <th className="px-3 py-2 text-left">Código</th>
                                            <th className="px-3 py-2 text-left">Cédula</th>
                                            <th className="px-3 py-2 text-left">IP</th>
                                            <th className="px-3 py-2 text-left">Tiempo conectado</th>
                                            <th className="px-3 py-2 text-left">Detalle</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((l, i) => {
                                            const meta = EVENT_META[l.event] || { label: l.event, variant: 'secondary', icon: History };
                                            const Icon = meta.icon;
                                            return (
                                                <tr key={i} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{formatFecha(l.ts)}</td>
                                                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap font-mono">{formatHora(l.ts)}</td>
                                                    <td className="px-3 py-2.5">
                                                        <Badge variant={meta.variant} className="flex items-center gap-1 w-fit">
                                                            <Icon className="h-3 w-3" />
                                                            {meta.label}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-3 py-2.5 font-semibold text-gray-700">{l.nombre || '—'}</td>
                                                    <td className="px-3 py-2.5 text-gray-500">{l.customerId || '—'}</td>
                                                    <td className="px-3 py-2.5 text-gray-500">{l.cedula || '—'}</td>
                                                    <td className="px-3 py-2.5 text-gray-500 font-mono">{l.ip || '—'}</td>
                                                    <td className="px-3 py-2.5 text-gray-500">
                                                        {l.event !== 'LOGIN_SUCCESS' || l.sessionDurationMin === null ? (
                                                            '—'
                                                        ) : l.online ? (
                                                            <Badge variant="success" className="flex items-center gap-1 w-fit">
                                                                <Clock className="h-3 w-3" />
                                                                En línea · {formatDuracion(l.sessionDurationMin)}
                                                            </Badge>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1">
                                                                <Clock className="h-3 w-3 text-gray-400" />
                                                                {formatDuracion(l.sessionDurationMin)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-gray-500">{detalleTexto(l)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'ataques' && (
                <>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2 text-sm text-amber-800">
                        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>
                            Eventos que indican un posible intento de vulnerar el sistema: logins fallidos, cambios de
                            contraseña rechazados, alertas de fuerza bruta y bloqueos por límite de intentos (rate-limit).
                        </p>
                    </div>

                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Eventos de ataque</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{attackKpis.total}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Alertas de fuerza bruta</p>
                            <p className="text-2xl font-bold text-red-600 mt-1">{attackKpis.bruteForce}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">Bloqueos por rate-limit</p>
                            <p className="text-2xl font-bold text-orange-600 mt-1">{attackKpis.rateLimit}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                            <p className="text-xs text-gray-500 uppercase font-bold">IPs involucradas</p>
                            <p className="text-2xl font-bold text-blue-600 mt-1">{attackKpis.ipsUnicas}</p>
                        </div>
                    </div>

                    {/* Filtros */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Buscar por nombre, cédula, código o IP..."
                                value={attackSearch}
                                onChange={(e) => setAttackSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {ATTACK_FILTERS.map((f) => (
                                <button
                                    key={f.key}
                                    onClick={() => setAttackFilter(f.key)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                        attackFilter === f.key
                                            ? 'bg-brand-primary text-white border-brand-primary'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tabla */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-700">
                                {attackLoading ? 'Cargando...' : `${attackFiltered.length} evento(s)`}
                            </p>
                        </div>
                        {attackLoading ? (
                            <div className="py-12 flex items-center justify-center gap-2 text-gray-400">
                                <Loader2 className="h-5 w-5 animate-spin" /> Cargando...
                            </div>
                        ) : attackFiltered.length === 0 ? (
                            <div className="py-12 text-center text-gray-400 text-sm">
                                No hay eventos de seguridad que coincidan con el filtro.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Fecha</th>
                                            <th className="px-3 py-2 text-left">Hora</th>
                                            <th className="px-3 py-2 text-left">Evento</th>
                                            <th className="px-3 py-2 text-left">Severidad</th>
                                            <th className="px-3 py-2 text-left">Socio</th>
                                            <th className="px-3 py-2 text-left">Cédula</th>
                                            <th className="px-3 py-2 text-left">
                                                <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> IP</span>
                                            </th>
                                            <th className="px-3 py-2 text-left">Detalle</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attackFiltered.map((l, i) => {
                                            const meta = EVENT_META[l.event] || { label: l.event, variant: 'secondary', icon: ShieldAlert };
                                            const Icon = meta.icon;
                                            const sev = SEVERITY_META[l.severity] || SEVERITY_META.media;
                                            return (
                                                <tr key={i} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{formatFecha(l.ts)}</td>
                                                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap font-mono">{formatHora(l.ts)}</td>
                                                    <td className="px-3 py-2.5">
                                                        <Badge variant={meta.variant} className="flex items-center gap-1 w-fit">
                                                            <Icon className="h-3 w-3" />
                                                            {meta.label}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <Badge variant={sev.variant} className="w-fit">{sev.label}</Badge>
                                                    </td>
                                                    <td className="px-3 py-2.5 font-semibold text-gray-700">{l.nombre || '—'}</td>
                                                    <td className="px-3 py-2.5 text-gray-500">{l.cedula || '—'}</td>
                                                    <td className="px-3 py-2.5 text-gray-500 font-mono">{l.ip || '—'}</td>
                                                    <td className="px-3 py-2.5 text-gray-500">{detalleTexto(l)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default AccessLogsPage;
