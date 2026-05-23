import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.jpg';

const Navbar = ({ user, setUser }) => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        navigate('/login');
    };

    return (
        <nav className="bg-brand-primary shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex items-center space-x-3">
                        <img src={logo} alt="Credifuturo" className="h-10 w-auto rounded-full bg-white p-1" />
                        <span className="text-white text-2xl font-bold tracking-wider">CREDIFUTURO</span>
                    </div>
                    <div className="flex items-center space-x-4">
                        <span className="text-gray-300 text-sm">Hola, {user.name} ({user.role === 'admin' ? 'Admin' : 'Socio'})</span>
                        <button
                            onClick={handleLogout}
                            className="text-white hover:text-brand-gold p-2 rounded-md transition-colors duration-200"
                            title="Cerrar Sesión"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
