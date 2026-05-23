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
import LoanAnalyzerPage from './pages/admin/LoanAnalyzerPage';

// User Pages
import UserDashboardLayout from './layouts/UserDashboardLayout';
import UserDashboardHome from './pages/user/UserDashboardHome';
import UserLoansListPage from './pages/user/UserLoansListPage';
import UserSavingsListPage from './pages/user/UserSavingsListPage';
import UserContributionsListPage from './pages/user/UserContributionsListPage';
import UserPaymentsListPage from './pages/user/UserPaymentsListPage';
import UserAccountDetailsPage from './pages/user/UserAccountDetailsPage';
import UserStatutesPage from './pages/user/UserStatutesPage';
import UserResolutionsPage from './pages/user/UserResolutionsPage';

import Navbar from './components/Navbar';
import { useState, useEffect } from 'react';
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

function App() {
    const [user, setUser] = useState(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const ProtectedRoute = ({ children, role }) => {
        if (!user) return <Navigate to="/login" />;
        if (user.mustChangePassword) return <Navigate to="/change-password" />;
        if (role && user.role !== role) return <Navigate to="/" />;
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
                    {/* Placeholder para futuras páginas - Redirige a inicio por ahora o al legacy dashboard si se requiere */}
                    <Route path="clients" element={<ClientsPage />} />
                    <Route path="clients/list" element={<ClientListPage />} />
                    <Route path="loans" element={<LoansPage />} />
                    <Route path="loans/list" element={<LoansListPage />} />
                    <Route path="loans/analyzer" element={<LoanAnalyzerPage />} />
                    <Route path="savings" element={<SavingsPage />} />
                    <Route path="savings/list" element={<SavingsListPage />} />
                    <Route path="savings/summary" element={<SavingsSummaryPage />} />
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

                    {/* Ruta Legacy para acceder al dashboard antiguo si es necesario durante la migración */}
                    <Route path="legacy" element={<AdminDashboard />} />
                </Route>

                <Route path="/dashboard" element={
                    <ProtectedRoute role="user">
                        <UserDashboardLayout user={user} onLogout={handleLogout} />
                    </ProtectedRoute>
                }>
                    <Route index element={<UserDashboardHome />} />
                    <Route path="loans" element={<UserLoansListPage />} />
                    <Route path="savings" element={<UserSavingsListPage />} />
                    <Route path="contributions" element={<UserContributionsListPage />} />
                    <Route path="payments" element={<UserPaymentsListPage />} />
                    <Route path="account-details" element={<UserAccountDetailsPage />} />
                    <Route path="statutes" element={<UserStatutesPage />} />
                    <Route path="resolutions" element={<UserResolutionsPage />} />
                </Route>

                <Route path="/" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/dashboard') : '/login'} />} />
            </Routes>
        </Router>
    );
}

export default App;
