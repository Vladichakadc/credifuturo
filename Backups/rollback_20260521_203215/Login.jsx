import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import logo from '../assets/logo.jpg';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Lock, Mail, AlertCircle } from 'lucide-react';

const Login = ({ setUser }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await api.post('/auth/login', { email, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            setUser(res.data.user);

            if (res.data.role === 'admin') {
                navigate('/admin');
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            setError('Credenciales inválidas. Verifique su correo y contraseña.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4 py-12 sm:px-6 lg:px-8 bg-[url('https://images.unsplash.com/photo-1565514020176-dbf2277e492f?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat bg-blend-overlay bg-gray-900/60">
            <Card className="w-full max-w-md shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
                <CardHeader className="space-y-1 items-center text-center pb-2">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md mb-4 p-1">
                        <img src={logo} alt="Credifuturo" className="w-full h-full object-contain rounded-full" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-brand-primary">Credifuturo</CardTitle>
                    <p className="text-sm text-gray-500">Ingrese sus credenciales para continuar</p>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="usuario@credifuturo.com"
                                    className="pl-9"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="pl-9"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                        <Button
                            type="submit"
                            className="w-full"
                            size="lg"
                            isLoading={isLoading}
                        >
                            Iniciar Sesión
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-center border-t border-gray-100 pt-6">
                    <p className="text-xs text-center text-gray-500">
                        ¿Olvidó su contraseña? Contacte al soporte técnico.
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
};

export default Login;
