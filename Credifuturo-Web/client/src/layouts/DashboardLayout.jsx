import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
    Users,
    CreditCard,
    PiggyBank,
    FileText,
    LayoutDashboard,
    Menu,
    X,
    LogOut,
    ChevronDown,
    UserPlus,
    List,
    DollarSign,
    ClipboardList,
    PlusCircle,
    BarChart2,
    ClipboardCheck,
    Search,
    TrendingUp,
    Scale
} from 'lucide-react';
import { cn } from '../utils/cn';
import api, { apiWithRetry } from '../config/api';
import { useUi } from '../context/UiContext';
import { Button } from '../components/ui/Button';
import logo from '../assets/logo.jpg';

// ——— Simple sidebar link (no children) ———
const SidebarItem = ({ icon: Icon, label, path, isActive, collapsed }) => {
    return (
        <Link
            to={path}
            className={cn(
                "flex items-center px-3 py-2.5 rounded-md transition-all duration-200 group mr-2",
                isActive
                    ? "bg-brand-primary/10 text-brand-primary font-bold"
                    : "text-green-700 hover:bg-brand-primary/10 hover:text-brand-primary"
            )}
            title={collapsed ? label : undefined}
        >
            <Icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-brand-primary" : "text-green-600 group-hover:text-brand-primary")} />
            {!collapsed && <span className="ml-3 truncate">{label}</span>}
            {isActive && !collapsed && <div className="ml-auto w-1 h-1 rounded-full bg-brand-primary" />}
        </Link>
    );
};

// ——— Expandable sidebar group with dynamic children ———
const SidebarSubmenu = ({ icon: Icon, label, children, isOpen, onToggle, location, collapsed, searchValue, onSearch }) => {
    // Check if any child route is currently active
    // Strip query string from child.path for comparison
    const hasActiveChild = children.some(child => location.pathname === child.path.split('?')[0]);

    return (
        <div className="mr-2">
            {/* Parent Toggle Button */}
            <button
                onClick={onToggle}
                className={cn(
                    "flex items-center w-full px-3 py-2.5 rounded-md transition-all duration-200 group text-left",
                    hasActiveChild
                        ? "bg-brand-primary/10 text-brand-primary font-bold"
                        : "text-green-700 hover:bg-brand-primary/10 hover:text-brand-primary"
                )}
                title={collapsed ? label : undefined}
            >
                <Icon className={cn("h-5 w-5 flex-shrink-0", hasActiveChild ? "text-brand-primary" : "text-green-600 group-hover:text-brand-primary")} />
                {!collapsed && (
                    <>
                        <span className="ml-3 truncate flex-1">{label}</span>
                        <ChevronDown
                            className={cn(
                                "h-4 w-4 text-gray-400 transition-transform duration-200 ease-in-out",
                                isOpen && "rotate-180"
                            )}
                        />
                    </>
                )}
            </button>

            {/* Animated Submenu Children */}
            {!collapsed && (
                <div
                    className={cn(
                        "transition-all duration-200 ease-in-out",
                        isOpen ? "max-h-[70vh] opacity-100 mt-0.5 overflow-y-auto" : "max-h-0 opacity-0 overflow-hidden"
                    )}
                >
                    {/* Search input for searchable submenus */}
                    {isOpen && searchValue !== undefined && (
                        <div className="ml-4 pl-3 pr-1 pt-1.5 pb-1">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchValue}
                                    onChange={(e) => onSearch?.(e.target.value)}
                                    placeholder="Buscar informe..."
                                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary placeholder:text-gray-400 transition-all"
                                />
                            </div>
                        </div>
                    )}
                    <div className="ml-4 pl-3 border-l-2 border-gray-200 space-y-0.5 py-1">
                        {children.map(child => {
                            // Items with a query string (e.g. ?action=new) are "action shortcuts":
                            //   - Active only while that exact query is present in the URL
                            // Items without a query string use plain pathname comparison.
                            const childBasePath = child.path.split('?')[0];
                            const childQuery = child.path.includes('?') ? '?' + child.path.split('?')[1] : null;
                            const isChildActive = childQuery
                                ? location.pathname === childBasePath && location.search === childQuery
                                : location.pathname === childBasePath && !location.search;
                            const ChildIcon = child.icon;
                            return (
                                <Link
                                    key={child.path}
                                    to={child.path}
                                    title={child.label}
                                    className={cn(
                                        "flex items-center px-3 py-2 rounded-md text-sm transition-all duration-150 group",
                                        isChildActive
                                            ? "bg-brand-primary/10 text-brand-primary font-bold"
                                            : "text-gray-500 hover:bg-brand-primary/10 hover:text-brand-primary"
                                    )}
                                >
                                    {ChildIcon && (
                                        <ChildIcon className={cn(
                                            "h-4 w-4 mr-2.5 flex-shrink-0",
                                            isChildActive ? "text-brand-primary" : "text-gray-400 group-hover:text-gray-600"
                                        )} />
                                    )}
                                    <span className="truncate">{child.label}</span>
                                    {isChildActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-primary" />}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const DashboardLayout = ({ user, onLogout }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false); // starts false; set true only when sync runs
    const [syncProgress, setSyncProgress] = useState(0);
    const [syncStats, setSyncStats] = useState(null);
    const [showSummary, setShowSummary] = useState(false);
    const [syncAttempt, setSyncAttempt] = useState(0);
    const [openSubmenus, setOpenSubmenus] = useState({ inicio: true, estatutos: false, socios: false, prestamos: false, ahorros: false, aportes: false, informes: false });
    const [informesList, setInformesList] = useState([]);
    const [informesSearch, setInformesSearch] = useState('');
    const location = useLocation();
    const navigate = useNavigate();
    const { toast } = useUi();

    const toggleSubmenu = (key) => {
        setOpenSubmenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const runSync = React.useCallback(async () => {
        // 1. Check feature flag before showing any UI
        try {
            const statusRes = await api.get('/admin/sync-status');
            if (!statusRes.data?.enabled) {
                // Excel sync disabled — skip silently, go directly to dashboard
                console.info('ℹ️ Excel sync deshabilitado (ENABLE_EXCEL_SYNC=false). Cargando dashboard directamente.');
                return;
            }
        } catch {
            // If status check fails, also skip sync (backend may not be ready)
            console.warn('⚠️ No se pudo verificar sync-status. Omitiendo sincronización.');
            return;
        }

        // 2. Sync is enabled — show overlay and run
        setIsSyncing(true);
        setShowSummary(false);
        setSyncProgress(10);
        setSyncStats(null);

        try {
            const res = await apiWithRetry(
                () => api.post('/admin/sync-init'),
                3,
                1500
            );

            setSyncProgress(100);
            setSyncStats(res.data);

            setTimeout(() => {
                setIsSyncing(false);
                setShowSummary(true);
                if (res.data?.ok) {
                    toast.success('Sincronización completada');
                } else {
                    toast.error('Sincronización completada con advertencias.');
                }
            }, 600);

        } catch (error) {
            console.error('Sync Error (todos los reintentos fallaron):', error);
            setSyncProgress(0);
            setIsSyncing(false);
            setSyncStats({
                ok: false,
                summary: [{
                    table: 'Sistema',
                    status: 'ERROR',
                    message: error.message,
                    count: 0
                }]
            });
            setShowSummary(true);
        }
    }, [toast]);

    // Lanzar sync al montar
    React.useEffect(() => {
        runSync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchInformes = async () => {
        try {
            const res = await api.get('/admin/informes');
            setInformesList(res.data);
        } catch (err) {
            console.error('Error fetching informes:', err);
        }
    };

    React.useEffect(() => {
        fetchInformes();
        window.addEventListener('informesUpdated', fetchInformes);
        return () => window.removeEventListener('informesUpdated', fetchInformes);
    }, []);

    const handleCloseSummary = () => {
        setShowSummary(false);
    };

    // ——— DYNAMIC NAV CONFIGURATION ———
    // Each item can be a simple link OR a submenu with children.
    // To add new submenu items in the future, just add entries to the 'children' array.
    const navItems = [
        {
            type: 'submenu',
            key: 'inicio',
            icon: LayoutDashboard,
            label: 'Inicio',
            children: [
                { icon: LayoutDashboard, label: 'Panel Principal', path: '/admin' },
                { icon: CreditCard, label: 'Detalle de Cuenta', path: '/admin/account-detail' },
                { icon: TrendingUp, label: 'Resumen Total Socio', path: '/admin/savings/summary?view=total' },
            ]
        },
        {
            type: 'submenu',
            key: 'estatutos',
            icon: Scale,
            label: 'Estatutos',
            children: [
                { icon: Scale, label: 'Estatutos Generales', path: '/admin/statutes' },
                { icon: FileText, label: 'Resoluciones', path: '/admin/resolutions' },
            ]
        },
        {
            type: 'submenu',
            key: 'socios',
            icon: Users,
            label: 'Socios',
            children: [
                { icon: List, label: 'Lista de Socios', path: '/admin/clients/list' },
                { icon: UserPlus, label: 'Nuevo Socio', path: '/admin/clients' },
            ]
        },
        {
            type: 'submenu',
            key: 'prestamos',
            icon: DollarSign,
            label: 'Préstamos y Pagos',
            children: [
                { icon: List, label: 'Lista de Préstamos', path: '/admin/loans/list' },
                { icon: PlusCircle, label: 'Ingresar Préstamo', path: '/admin/loans?action=new' },
                { icon: List, label: 'Lista de Pagos', path: '/admin/payments/list' },
                { icon: ClipboardCheck, label: 'Registrar Pago', path: '/admin/payments?action=new' },
                { icon: Scale, label: 'Analizador', path: '/admin/loans/analyzer' },
            ]
        },
        {
            type: 'submenu',
            key: 'ahorros',
            icon: PiggyBank,
            label: 'Ahorros y Aportes',
            children: [
                { icon: List, label: 'Lista de Ahorros', path: '/admin/savings/list' },
                { icon: PlusCircle, label: 'Nuevo Ahorro', path: '/admin/savings?action=new' },
                { icon: TrendingUp, label: 'Resumen Ahorros', path: '/admin/savings/summary' },
                { icon: List, label: 'Lista de Aportes', path: '/admin/initial-contributions/list' },
                { icon: PlusCircle, label: 'Nuevo Aporte', path: '/admin/initial-contributions/new' },
            ]
        },
        { type: 'link', icon: FileText, label: 'Copias de Seguridad', path: '/admin/reports' },
        {
            type: 'submenu',
            key: 'informes',
            icon: ClipboardList,
            label: `Informes (${informesList.length})`,
            searchable: true,
            searchValue: informesSearch,
            onSearch: setInformesSearch,
            children: (() => {
                const filtered = informesList.filter(inf => {
                    if (!informesSearch.trim()) return true;
                    const searchLower = informesSearch.toLowerCase();
                    return inf.name.toLowerCase().includes(searchLower);
                });
                if (filtered.length > 0) return filtered.map(inf => ({
                    icon: FileText,
                    label: inf.name.replace(/\.md$|\.txt$/, '').replace(/_/g, ' '),
                    path: `/admin/informes/${encodeURIComponent(inf.name)}`
                }));
                if (informesSearch.trim()) return [{ icon: Search, label: 'Sin resultados', path: '#' }];
                return [{ icon: FileText, label: 'No hay informes', path: '#' }];
            })()
        }
    ];

    return (
        <div className="min-h-screen bg-ui-background flex relative">
            {/* Synchronization Overlay (Loading) */}
            {isSyncing && (
                <div className="fixed inset-0 bg-white/95 z-[60] flex flex-col items-center justify-center p-4">
                    <div className="w-full max-w-md space-y-6 text-center">
                        <div className="relative w-20 h-20 mx-auto">
                            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-brand-primary rounded-full border-t-transparent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center font-bold text-brand-primary">
                                {syncProgress}%
                            </div>
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold text-brand-dark mb-2">Sincronizando Base de Datos</h2>
                            <p className="text-gray-500 max-w-xs mx-auto">
                                Procesando archivos Excel y actualizando registros del sistema...
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Sync Summary Report (Success/Error) */}
            {showSummary && syncStats && (
                <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Resumen de Sincronización</h3>
                                <p className="text-sm text-gray-500">
                                    {syncStats.ok ? 'Proceso finalizado correctamente' : 'Se encontraron errores durante el proceso'}
                                </p>
                            </div>
                            <div className={cn("p-2 rounded-full", syncStats.ok ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600")}>
                                {syncStats.ok ? <menu className="h-6 w-6" /> : <X className="h-6 w-6" />}
                            </div>
                        </div>

                        <div className="p-0 max-h-[60vh] overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3">Módulo / Tabla</th>
                                        <th className="px-6 py-3 text-center">Registros</th>
                                        <th className="px-6 py-3 text-right">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {syncStats.summary?.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                {item.module || item.table || 'Módulo Desconocido'}
                                                {item.message && (
                                                    <div className={cn(
                                                        "text-xs mt-1 font-normal",
                                                        item.status === 'ERROR' ? "text-red-500" : "text-gray-500"
                                                    )}>
                                                        {item.message}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center text-gray-600">
                                                {item.count ?? 0}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                                    (item.status === 'OK' || item.status === 'success') ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                                                )}>
                                                    {item.status || 'ERROR'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-2 justify-end">
                            {!syncStats.ok && (
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="w-full sm:w-auto border-brand-primary text-brand-primary hover:bg-brand-primary/10"
                                    onClick={runSync}
                                >
                                    🔄 Reintentar Sincronización
                                </Button>
                            )}
                            <Button onClick={handleCloseSummary} size="lg" className="w-full sm:w-auto">
                                {syncStats.ok ? 'Continuar al Dashboard' : 'Continuar sin sincronizar'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={cn(
                "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-gray-50 border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Logo Area */}
                <div className="h-24 flex items-center px-6 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-sm overflow-hidden">
                            <img src={logo} alt="Credifuturo" className="w-full h-full object-contain" />
                        </div>
                        <span className="text-2xl font-bold text-brand-primary">Credifuturo</span>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="ml-auto lg:hidden text-gray-500 hover:text-gray-700"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
                    {navItems.map((item) => {
                        if (item.type === 'submenu') {
                            return (
                                <SidebarSubmenu
                                    key={item.key}
                                    icon={item.icon}
                                    label={item.label}
                                    children={item.children}
                                    isOpen={!!openSubmenus[item.key]}
                                    onToggle={() => toggleSubmenu(item.key)}
                                    location={location}
                                    collapsed={false}
                                    searchValue={item.searchValue}
                                    onSearch={item.onSearch}
                                />
                            );
                        }
                        return (
                            <SidebarItem
                                key={item.path}
                                {...item}
                                isActive={location.pathname === item.path}
                            />
                        );
                    })}

                </nav>

                {/* User Footer */}
                <div className="p-4 border-t border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="h-9 w-9 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-sm overflow-hidden">
                            {user?.profilePicture ? (
                                <img src={user.profilePicture} alt={user.name || 'Avatar'} className="w-full h-full object-cover" />
                            ) : (
                                user?.name?.charAt(0) || 'A'
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-base font-medium text-gray-900 truncate">{user?.name || 'Administrador'}</p>
                            <p className="text-sm text-gray-500 truncate">{user?.email || 'admin@credifuturo.com'}</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={onLogout}
                    >
                        <LogOut className="h-4 w-4 mr-2" />
                        Cerrar Sesión
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 lg:ml-0 flex flex-col min-h-screen">
                {/* Mobile Header */}
                <div className="sticky top-0 z-30 flex items-center h-16 bg-white border-b border-gray-200 px-4 lg:hidden">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="mr-4 text-gray-500 focus:outline-none"
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                    <span className="font-semibold text-gray-900">Credifuturo</span>
                </div>

                {/* Page Content */}
                <div className="flex-1 p-4 lg:p-8 overflow-x-hidden">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
