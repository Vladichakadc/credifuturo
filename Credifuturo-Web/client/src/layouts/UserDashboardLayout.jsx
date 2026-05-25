import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
    CreditCard,
    Wallet,
    PiggyBank,
    LayoutDashboard,
    Menu,
    X,
    LogOut,
    List,
    BarChart2,
    ChevronDown,
    Search,
    TrendingUp,
    Scale,
    DollarSign,
    FileText
} from 'lucide-react';
import { cn } from '../utils/cn';
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
    const hasActiveChild = children.some(child => location.pathname === child.path.split('?')[0]);

    return (
        <div className="mr-2">
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

            {!collapsed && (
                <div
                    className={cn(
                        "transition-all duration-200 ease-in-out",
                        isOpen ? "max-h-[70vh] opacity-100 mt-0.5 overflow-y-auto" : "max-h-0 opacity-0 overflow-hidden"
                    )}
                >
                    <div className="ml-4 pl-3 border-l-2 border-gray-200 space-y-0.5 py-1">
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

const UserDashboardLayout = ({ user, onLogout }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [openSubmenus, setOpenSubmenus] = useState({ inicio: true, estatutos: false, prestamos: false, ahorros: false });
    const location = useLocation();

    const toggleSubmenu = (key) => {
        setOpenSubmenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // ——— DYNAMIC NAV CONFIGURATION FOR USERS ———
    const navItems = [
        {
            type: 'submenu',
            key: 'inicio',
            icon: LayoutDashboard,
            label: 'Inicio',
            children: [
                { icon: LayoutDashboard, label: 'Panel Principal', path: '/dashboard' },
                { icon: TrendingUp, label: 'Detalle de la Cuenta', path: '/dashboard/savings/summary' },
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
                { icon: Scale, label: 'Analizador de Capacidad', path: '/dashboard/loan-capacity' }
            ]
        },
        {
            key: 'ahorros',
            icon: PiggyBank,
            label: 'Ahorros',
            path: '/dashboard/savings'
        },
        {
            key: 'aportes',
            icon: Wallet,
            label: 'Aportes',
            path: '/dashboard/contributions'
        }
    ];

    return (
        <div className="min-h-screen bg-ui-background flex relative">
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

                {/* Rol Badge */}
                <div className="px-6 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 ring-1 ring-blue-200">
                        <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-blue-500" />
                        MODO LECTURA
                    </span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
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

                {/* User Footer */}
                <div className="p-4 border-t border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="h-9 w-9 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-sm overflow-hidden">
                            {user?.profilePicture ? (
                                <img src={user.profilePicture} alt={user.name || 'Avatar'} className="w-full h-full object-cover" />
                            ) : (
                                user?.name?.charAt(0) || 'U'
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-base font-medium text-gray-900 truncate">{user?.name || 'Socio'}</p>
                            <p className="text-sm text-gray-500 truncate">{user?.email}</p>
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

export default UserDashboardLayout;
