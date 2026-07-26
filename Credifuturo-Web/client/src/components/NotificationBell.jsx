import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2, Inbox } from 'lucide-react';
import api from '../config/api';
import { cn } from '../utils/cn';

const POLL_INTERVAL_MS = 30000;

const fmtRelativo = (d) => {
    if (!d) return '';
    const diffMin = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH} h`;
    return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
};

const NotificationBell = ({ variant = 'sidebar' }) => {
    const navigate = useNavigate();
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await api.get('/admin/my/notifications/unread-count');
            setUnreadCount(res.data?.unreadCount || 0);
        } catch {
            // silencioso: un fallo de sondeo no debe interrumpir al usuario
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/my/notifications');
            setNotifications(res.data?.data || []);
            setUnreadCount(res.data?.unreadCount || 0);
        } catch {
            // silencioso
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchUnreadCount]);

    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
        };
        if (showDropdown) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showDropdown]);

    const handleToggle = () => {
        const next = !showDropdown;
        setShowDropdown(next);
        if (next) fetchNotifications();
    };

    const handleNotificationClick = (n) => {
        setShowDropdown(false);
        if (!n.isRead) {
            setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
            setUnreadCount(prev => Math.max(0, prev - 1));
            api.put(`/admin/my/notifications/${n.id}/read`).catch(() => {});
        }
        if (n.link) navigate(n.link);
    };

    const handleMarkAllRead = async () => {
        setNotifications(prev => prev.map(x => ({ ...x, isRead: true })));
        setUnreadCount(0);
        try {
            await api.put('/admin/my/notifications/read-all');
        } catch {
            fetchNotifications();
        }
    };

    const iconBtnClass = variant === 'sidebar'
        ? 'relative p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors'
        : 'relative p-2 -mr-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors';

    return (
        <div className="relative" ref={dropdownRef}>
            <button onClick={handleToggle} className={iconBtnClass} aria-label="Notificaciones">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>
            {showDropdown && (
                <div className={cn(
                    'absolute z-50 w-80 max-w-[90vw] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden',
                    variant === 'sidebar' ? 'bottom-full mb-2 left-0' : 'top-full mt-2 right-0'
                )}>
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <span className="text-sm font-bold text-gray-700">Notificaciones</span>
                        {unreadCount > 0 && (
                            <button onClick={handleMarkAllRead} className="flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline">
                                <CheckCheck className="h-3 w-3" /> Marcar todas leídas
                            </button>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                <p className="text-xs font-medium">Sin notificaciones</p>
                            </div>
                        ) : notifications.map(n => (
                            <button
                                key={n.id}
                                onClick={() => handleNotificationClick(n)}
                                className={cn('w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-2.5', !n.isRead && 'bg-emerald-50/60')}
                            >
                                {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                                <div className={cn('min-w-0', n.isRead && 'pl-4')}>
                                    <p className="text-xs font-bold text-gray-800 truncate">{n.title}</p>
                                    {n.message && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>}
                                    <p className="text-[10px] text-gray-400 mt-1">{fmtRelativo(n.createdAt)}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
