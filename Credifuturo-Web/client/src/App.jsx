import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ChangePasswordPage from './pages/ChangePasswordPage';
import AdminDashboard from './pages/AdminDashboard'; // Mantener por compatibilidad temporal
import DashboardLayout from './layouts/DashboardLayout';
import DashboardHome from './pages/admin/DashboardHome';
import ClientsPage from './pages/admin/ClientsPage';
import ClientListPage from './pages/admin/ClientListPage';
import LoansPage from './pages/admin/LoansPage';
import LoansListPage from './pages/admin/LoansListPage';
import SavingsPage from './pages/admin/SavingsPage';
import SavingsListPage from './pages/admin/SavingsListPage';
import ReportsPage from './pages/admin/ReportsPage';
import PaymentsPage from './pages/admin/PaymentsPage';
import PaymentsListPage from './pages/admin/PaymentsListPage';
import InitialContributionsListPage from './pages/admin/InitialContributionsListPage';
import InitialContributionsPage from './pages/admin/InitialContributionsPage'; // Added this import
import InformesViewerPage from './pages/admin/InformesViewerPage';
import AccountDetailPage from './pages/admin/AccountDetailPage';
import SavingsSummaryPage from './pages/admin/SavingsSummaryPage';
import RankingAhorroPage from './pages/admin/RankingAhorroPage';
import DevolucionesAhorrosPage from './pages/admin/DevolucionesAhorrosPage';
import LoanAnalyzerPage from './pages/admin/LoanAnalyzerPage';
import LoanApprovalsPage from './pages/admin/LoanApprovalsPage';
import OrphanLoansPage from './pages/admin/OrphanLoansPage';
import AccessLogsPage from './pages/admin/AccessLogsPage';
import ExecutivePanelPage from './pages/admin/ExecutivePanelPage';
import SavingsEvolutionPage from './pages/admin/SavingsEvolutionPage';
import PropuestasPage from './pages/admin/PropuestasPage';

// User Pages
import UserDashboardLayout from './layouts/UserDashboardLayout';
import UserDashboardHome from './pages/user/UserDashboardHome';
import MiPanelPage from './pages/user/MiPanelPage';
import MisCreditosPage from './pages/user/MisCreditosPage';
import UserContributionsListPage from './pages/user/UserContributionsListPage';
import UserAccountDetailsPage from './pages/user/UserAccountDetailsPage';
import UserStatutesPage from './pages/user/UserStatutesPage';
import UserResolutionsPage from './pages/user/UserResolutionsPage';
import UserLoanAnalyzerPage from './pages/user/UserLoanAnalyzerPage';
import DetalleCuentaPage from './pages/user/DetalleCuentaPage';
import CapacidadBetaPage from './pages/user/CapacidadBetaPage';
import UserRankingAhorroPage from './pages/user/RankingAhorroPage';
import JuntaAprobacionesPage from './pages/user/JuntaAprobacionesPage';

import Navbar from './components/Navbar';
import { useState } from 'react';
import {
    Users,
    LayoutDashboard,
    HandCoins,
    Wallet,
    Settings,
    FileText,
    TrendingUp,
    PiggyBank
} from 'lucide-react';

// Lee el usuario de localStorage de forma síncrona en la inicialización del
// estado (no en un useEffect): un useEffect corre DESPUÉS del primer render,
// así que en una recarga completa de una ruta /admin/* o /dashboard/* el
// primer render veía `user === null`, ProtectedRoute redirigía a /login, y
// para cuando el efecto poblaba `user` la ruta ya había cambiado — la sesión
// seguía en localStorage pero la URL quedaba varada en /login.
function getStoredUser() {
    try {
        const storedUser = localStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    } catch {
        return null;
    }
}

function App() {
    const [user, setUser] = useState(getStoredUser);

    const ProtectedRoute = ({ children, role, roles }) => {
        if (!user) return <Navigate to="/login" />;
        if (user.mustChangePassword) return <Navigate to="/change-password" />;
        const permitidos = roles || (role ? [role] : null);
        if (permitidos && !permitidos.includes(user.role)) return <Navigate to="/" />;
        return children;
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setUser(null);
    };

    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login setUser={setUser} />} />
                <Route path="/change-password" element={<ChangePasswordPage user={user} setUser={setUser} />} />

                {/* Rutas de Administrador con Nuevo Layout */}
                <Route path="/admin" element={
                    <ProtectedRoute role="admin">
                        <DashboardLayout user={user} onLogout={handleLogout} />
                    </ProtectedRoute>
                }>
                    <Route index element={<DashboardHome />} />
                    {/* Panel Ejecutivo (beta): propuesta del plan de mejora, en evaluación */}
                    <Route path="executive" element={<ExecutivePanelPage />} />
                    {/* Placeholder para futuras páginas - Redirige a inicio por ahora o al legacy dashboard si se requiere */}
                    <Route path="clients" element={<ClientsPage />} />
                    <Route path="clients/list" element={<ClientListPage />} />
                    <Route path="loans" element={<LoansPage />} />
                    <Route path="loans/list" element={<LoansListPage />} />
                    <Route path="loans/analyzer" element={<LoanAnalyzerPage />} />
                    <Route path="loans/approvals" element={<LoanApprovalsPage />} />
                    <Route path="loans/orphans" element={<OrphanLoansPage />} />
                    <Route path="savings" element={<SavingsPage />} />
                    <Route path="savings/list" element={<SavingsListPage />} />
                    <Route path="savings/summary" element={<SavingsSummaryPage />} />
                    <Route path="savings/ranking" element={<RankingAhorroPage />} />
                    {/* Evolución de Ahorros (beta): tríada stock/flujo/composición con negativos visibles */}
                    <Route path="savings/evolution" element={<SavingsEvolutionPage />} />
                    <Route path="savings/devoluciones" element={<DevolucionesAhorrosPage />} />
                    {/* Aportes Module */}
                    <Route path="initial-contributions/list" element={<InitialContributionsListPage />} />
                    <Route path="initial-contributions/new" element={<InitialContributionsPage />} />
                    <Route path="initial-contributions/edit/:id" element={<InitialContributionsPage />} />
                    <Route path="payments" element={<PaymentsPage />} />
                    <Route path="payments/list" element={<PaymentsListPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="informes/:filename" element={<InformesViewerPage />} />
                    <Route path="account-detail" element={<AccountDetailPage />} />
                    <Route path="statutes" element={<UserStatutesPage />} />
                    <Route path="resolutions" element={<UserResolutionsPage />} />
                    <Route path="logs" element={<AccessLogsPage />} />
                    <Route path="propuestas" element={<PropuestasPage />} />

                    {/* Ruta Legacy para acceder al dashboard antiguo si es necesario durante la migración */}
                    <Route path="legacy" element={<AdminDashboard />} />
                </Route>

                {/* El módulo del socio también es accesible para el admin (vistas de
                    lectura auto-referidas: ve SUS propios datos como socio del fondo) */}
                <Route path="/dashboard" element={
                    <ProtectedRoute roles={['user', 'admin']}>
                        <UserDashboardLayout user={user} onLogout={handleLogout} />
                    </ProtectedRoute>
                }>
                    {/* Inicio del socio: Mi Panel (información personal primero) */}
                    <Route index element={<MiPanelPage />} />
                    {/* Panel del fondo completo (antes era el inicio) */}
                    <Route path="fondo" element={<DashboardHome />} />
                    {/* Panel Ejecutivo: misma página que /admin/executive, reutilizada como
                        vista de solo lectura para socios (igual patrón que "fondo" arriba) */}
                    <Route path="panel-ejecutivo" element={<ExecutivePanelPage />} />
                    {/* UserDashboardHome queda accesible en /dashboard/mi-resumen */}
                    <Route path="mi-resumen" element={<UserDashboardHome />} />
                    <Route path="mis-creditos" element={<MisCreditosPage />} />
                    {/* Rutas antiguas: redirigen a la vista unificada Mis Créditos */}
                    <Route path="loans" element={<Navigate to="/dashboard/mis-creditos" replace />} />
                    <Route path="savings" element={<Navigate to="/dashboard/cuenta" replace />} />
                    <Route path="contributions" element={<UserContributionsListPage />} />
                    <Route path="payments" element={<Navigate to="/dashboard/mis-creditos?tab=cuotas" replace />} />
                    <Route path="account-details" element={<UserAccountDetailsPage />} />
                    <Route path="statutes" element={<UserStatutesPage />} />
                    <Route path="resolutions" element={<UserResolutionsPage />} />
                    <Route path="loan-capacity" element={<UserLoanAnalyzerPage />} />
                    {/* Detalle de la Cuenta unificado (fusiona la vista clásica y la beta) */}
                    <Route path="cuenta" element={<DetalleCuentaPage />} />
                    {/* Rutas antiguas: redirigen a la vista unificada */}
                    <Route path="savings/summary" element={<Navigate to="/dashboard/cuenta" replace />} />
                    <Route path="account-statement" element={<Navigate to="/dashboard/cuenta" replace />} />
                    <Route path="loan-capacity-beta" element={<CapacidadBetaPage />} />
                    <Route path="propuestas" element={<PropuestasPage />} />
                    <Route path="ranking-ahorro" element={<UserRankingAhorroPage />} />
                    <Route path="savings-evolution" element={<SavingsEvolutionPage user={user} />} />
                    <Route path="junta-prestamos" element={<JuntaAprobacionesPage />} />
                    {/* Informes: misma página que /admin/informes/:filename, reutilizada para
                        la Junta Administrativa (gerente/subgerente/tesorera). El backend ya
                        restringe /admin/informes a admin + Junta (ver JUNTA_ROUTES). */}
                    <Route path="informes/:filename" element={<InformesViewerPage />} />
                </Route>

                <Route path="/" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/dashboard') : '/login'} />} />
            </Routes>
        </Router>
    );
}

export default App;
