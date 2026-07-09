import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import {
    CreditCard,
    Wallet,
    PiggyBank,
    LayoutDashboard,
    Menu,
    X,
    LogOut,
    List,
    ChevronDown,
    Scale,
    DollarSign,
    FileText,
    Landmark,
    Gauge
} from 'lucide-react';
import { cn } from '../utils/cn';
import { Button } from '../components/ui/Button';
import logo from '../assets/logo.jpg';

// ——— Bottom nav items (mobile only) ———
const USER_BOTTOM_NAV = [
    { icon: LayoutDashboard, label: 'Inicio', path: '/dashboard', exact: true },
    { icon: DollarSign, label: 'Préstamos', path: '/dashboard/loans' },
    { icon: PiggyBank, label: 'Ahorros', path: '/dashboard/cuenta' },
    { icon: Wallet, label: 'Aportes', path: '/dashboard/contributions' },
    { icon: Menu, label: 'Menú', action: 'menu' },
];

// ——— Simple sidebar link (no children) ———
const SidebarItem = ({ icon: Icon, label, path, isActive, collapsed }) => {
    return (
        <Link
            to={path}
            className={cn(
                "flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group mr-2 min-h-[44px]",
                isActive
                    ? "bg-white/15 text-white font-semibold"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
            title={collapsed ? label : undefined}
        >
            <Icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-white" : "text-white/60 group-hover:text-white")} />
            {!collapsed && <span className="ml-3 whitespace-normal leading-tight">{label}</span>}
            {isActive && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-light opacity-80" />}
        </Link>
    );
};

// ——— Expandable sidebar group with dynamic children ———
const SidebarSubmenu = ({ icon: Icon, label, children, isOpen, onToggle, location, collapsed }) => {
    const hasActiveChild = children.some(child => location.pathname === child.path.split('?')[0]);

    return (
        <div className="mr-2">
            <button
                onClick={onToggle}
                className={cn(
                    "flex items-center w-full px-3 py-2.5 rounded-lg transition-all duration-200 group text-left min-h-[44px]",
                    hasActiveChild
                        ? "bg-white/15 text-white font-semibold"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
                title={collapsed ? label : undefined}
            >
                <Icon className={cn("h-5 w-5 flex-shrink-0", hasActiveChild ? "text-white" : "text-white/60 group-hover:text-white")} />
                {!collapsed && (
                    <>
                        <span className="ml-3 whitespace-normal leading-tight flex-1">{label}</span>
                        <ChevronDown
                            className={cn(
                                "h-4 w-4 text-white/40 transition-transform duration-200 ease-in-out",
                                isOpen && "rotate-180"
                            )}
                        />
                    </>
                )}
            </button>

            {!collapsed && (
                <div
                    className={cn(
                        "transition-all duration-200 ease-in-out",
                        isOpen ? "max-h-[70vh] opacity-100 mt-0.5 overflow-y-auto" : "max-h-0 opacity-0 overflow-hidden"
                    )}
                >
                    <div className="ml-4 pl-3 border-l-2 border-white/15 space-y-0.5 py-1">
                        {children.map(child => {
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
                                        "flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-150 group min-h-[40px]",
                                        isChildActive
                                            ? "bg-white/15 text-white font-semibold"
                                            : "text-white/55 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    {ChildIcon && (
                                        <ChildIcon className={cn(
                                            "h-4 w-4 mr-2.5 flex-shrink-0",
                                            isChildActive ? "text-white" : "text-white/40 group-hover:text-white/80"
                                        )} />
                                    )}
                                    <span className="whitespace-normal leading-tight">{child.label}</span>
                                    {isChildActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-light opacity-80" />}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const UserDashboardLayout = ({ user, onLogout }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [openSubmenus, setOpenSubmenus] = useState({ inicio: true, estatutos: false, prestamos: false });
    const location = useLocation();

    const toggleSubmenu = (key) => {
        setOpenSubmenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const navItems = [
        {
            type: 'submenu',
            key: 'inicio',
            icon: LayoutDashboard,
            label: 'Inicio',
            children: [
                { icon: LayoutDashboard, label: 'Mi Panel', path: '/dashboard' },
                { icon: Landmark, label: 'Nuestro Fondo', path: '/dashboard/fondo' },
            ]
        },
        {
            type: 'submenu',
            key: 'estatutos',
            icon: Scale,
            label: 'Estatutos',
            children: [
                { icon: Scale, label: 'Estatutos Generales', path: '/dashboard/statutes' },
                { icon: FileText, label: 'Resoluciones', path: '/dashboard/resolutions' }
            ]
        },
        {
            type: 'submenu',
            key: 'prestamos',
            icon: DollarSign,
            label: 'Préstamos y Pagos',
            children: [
                { icon: List, label: 'Lista de Préstamos', path: '/dashboard/loans' },
                { icon: List, label: 'Lista de Pagos', path: '/dashboard/payments' },
                { icon: Scale, label: 'Analizador de Capacidad', path: '/dashboard/loan-capacity' },
                { icon: Gauge, label: 'Capacidad (beta)', path: '/dashboard/loan-capacity-beta' }
            ]
        },
        {
            type: 'link',
            icon: PiggyBank,
            label: 'Ahorros',
            path: '/dashboard/cuenta'
        },
        {
            type: 'link',
            icon: Wallet,
            label: 'Aportes',
            path: '/dashboard/contributions'
        }
    ];

    // Abre automáticamente el submenú que contiene la ruta activa,
    // para que el socio siempre vea dónde está dentro del menú.
    useEffect(() => {
        navItems.forEach(item => {
            if (item.type !== 'submenu') return;
            const hasActive = item.children.some(c => location.pathname === c.path.split('?')[0]);
            if (hasActive) {
                setOpenSubmenus(prev => (prev[item.key] ? prev : { ...prev, [item.key]: true }));
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'S';
    const userName = `${user?.name || 'Socio'} ${user?.surname1 || ''}`.trim();

    return (
        <div className="min-h-[100dvh] bg-ui-background flex relative">
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar — dark brand */}
            <aside className={cn(
                "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0",
                "bg-brand-dark shadow-sidebar",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Logo header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm overflow-hidden flex-shrink-0">
                        <img src={logo} alt="Credifuturo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-base leading-tight truncate">Credifuturo</p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/20 mt-0.5">
                            SOCIO
                        </span>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
                    {navItems.map((item) => (
                        item.type === 'submenu' ? (
                            <SidebarSubmenu
                                key={item.key}
                                {...item}
                                isOpen={openSubmenus[item.key]}
                                onToggle={() => toggleSubmenu(item.key)}
                                location={location}
                                collapsed={false}
                            />
                        ) : (
                            <SidebarItem
                                key={item.path}
                                {...item}
                                isActive={location.pathname === item.path}
                                collapsed={false}
                            />
                        )
                    ))}
                </nav>

                {/* User footer */}
                <div className="px-4 py-4 border-t border-white/10">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="h-9 w-9 rounded-full bg-brand-primary flex items-center justify-center font-bold text-sm text-white flex-shrink-0 overflow-hidden">
                            {user?.profilePicture ? (
                                <img src={user.profilePicture} alt={user.name || 'Avatar'} className="w-full h-full object-cover" />
                            ) : userInitial}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{userName}</p>
                            <p className="text-xs text-white/40 truncate">{user?.cedula ? `C.C. ${user.cedula}` : 'Socio'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors min-h-[40px]"
                    >
                        <LogOut className="h-4 w-4" />
                        Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 flex flex-col min-h-[100dvh]">
                {/* Mobile Header */}
                <header className="sticky top-0 z-30 flex items-center h-14 bg-white border-b border-gray-200 px-4 lg:hidden shadow-mobile-header">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Abrir menú"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <div className="flex-1 flex justify-center">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full overflow-hidden">
                                <img src={logo} alt="Credifuturo" className="w-full h-full object-contain" />
                            </div>
                            <span className="font-bold text-brand-primary text-base">Credifuturo</span>
                        </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center font-bold text-sm text-white flex-shrink-0">
                        {userInitial}
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 p-4 lg:p-8 overflow-x-hidden pb-20 lg:pb-8">
                    <Outlet />
                </div>
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-bottom-nav lg:hidden pb-safe">
                <div className="flex h-14">
                    {USER_BOTTOM_NAV.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.exact
                            ? location.pathname === item.path
                            : item.path && location.pathname.startsWith(item.path) && item.path !== '/dashboard';

                        if (item.action === 'menu') {
                            return (
                                <button
                                    key="menu"
                                    onClick={() => setSidebarOpen(true)}
                                    className="flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-brand-primary active:scale-95 transition-all"
                                >
                                    <Icon className="h-5 w-5" />
                                    <span className="text-[10px] font-medium">{item.label}</span>
                                </button>
                            );
                        }

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    "flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all active:scale-95",
                                    isActive ? "text-brand-primary" : "text-gray-400 hover:text-gray-600"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-primary rounded-full" />
                                )}
                                <Icon className="h-5 w-5" />
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
};

export default UserDashboardLayout;
