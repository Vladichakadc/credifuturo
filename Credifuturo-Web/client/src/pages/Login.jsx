import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import logo from '../assets/logo.jpg';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Lock, Mail, AlertCircle, X } from 'lucide-react';

const Login = ({ setUser }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    // Modal "Olvidé mi contraseña"
    const [showForgot, setShowForgot] = useState(false);
    const [forgotField, setForgotField] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotMsg, setForgotMsg] = useState('');
    const [forgotError, setForgotError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await api.post('/auth/login', { email, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            setUser(res.data.user);

            if (res.data.mustChangePassword) {
                navigate('/change-password');
            } else if (res.data.role === 'admin') {
                navigate('/admin');
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Credenciales inválidas. Verifique su correo y contraseña.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setForgotError('');
        setForgotMsg('');
        if (!forgotField.trim()) {
            setForgotError('Ingrese su cédula o correo electrónico.');
            return;
        }
        setForgotLoading(true);
        try {
            const isEmail = forgotField.includes('@');
            const payload = isEmail ? { email: forgotField.trim() } : { cedula: forgotField.trim() };
            const res = await api.post('/auth/request-reset', payload);
            setForgotMsg(res.data.message || 'Solicitud enviada correctamente.');
        } catch (err) {
            setForgotError(err.response?.data?.message || 'Error al enviar la solicitud.');
        } finally {
            setForgotLoading(false);
        }
    };

    const closeForgot = () => {
        setShowForgot(false);
        setForgotField('');
        setForgotMsg('');
        setForgotError('');
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
                        ¿Olvidó su contraseña?{' '}
                        <button
                            type="button"
                            onClick={() => setShowForgot(true)}
                            className="text-green-700 hover:underline font-medium"
                        >
                            Solicitar restablecimiento
                        </button>
                    </p>
                </CardFooter>
            </Card>

            {/* Modal Olvidé mi contraseña */}
            {showForgot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
                        <button
                            onClick={closeForgot}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex flex-col items-center mb-4">
                            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-2">
                                <Lock className="w-6 h-6 text-amber-600" />
                            </div>
                            <h2 className="text-lg font-bold text-gray-800">¿Olvidó su contraseña?</h2>
                            <p className="text-xs text-gray-500 text-center mt-1">
                                Ingrese su cédula o correo registrado. El administrador recibirá la solicitud y restablecerá su acceso.
                            </p>
                        </div>

                        {forgotMsg ? (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center">
                                {forgotMsg}
                                <div className="mt-3">
                                    <button
                                        onClick={closeForgot}
                                        className="text-xs text-green-800 underline hover:no-underline"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleForgotSubmit} className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Cédula o Correo Electrónico
                                    </label>
                                    <input
                                        type="text"
                                        value={forgotField}
                                        onChange={(e) => setForgotField(e.target.value)}
                                        placeholder="Ej: 12345678 o socio@email.com"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                        autoFocus
                                    />
                                </div>

                                {forgotError && (
                                    <p className="text-xs text-red-600">{forgotError}</p>
                                )}

                                <button
                                    type="submit"
                                    disabled={forgotLoading}
                                    className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                                >
                                    {forgotLoading ? 'Enviando...' : 'Enviar solicitud'}
                                </button>

                                <p className="text-xs text-gray-400 text-center">
                                    El administrador le informará cuando su contraseña sea restablecida.
                                </p>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;
