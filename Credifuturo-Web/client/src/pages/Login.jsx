import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import logo from '../assets/logo.jpg';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Lock, Fingerprint, AlertCircle, X, Eye, EyeOff, ShieldCheck, PiggyBank, HandCoins, ScrollText } from 'lucide-react';

const VALUE_PROPS = [
    { icon: PiggyBank, text: 'Ahorro mensual con rendimiento real, no solo una cuenta guardada' },
    { icon: HandCoins, text: 'Préstamos entre socios a tasas justas, definidas en comité' },
    { icon: ScrollText, text: 'Transparencia total: estatutos, resoluciones y tu estado de cuenta siempre a la vista' },
];

const Login = ({ setUser }) => {
    const [cedula, setCedula] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

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
            const res = await api.post('/auth/login', { cedula: cedula.trim(), password });
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
            setError(err.response?.data?.message || 'Credenciales invalidas. Verifique su cedula y contrasena.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setForgotError('');
        setForgotMsg('');
        if (!forgotField.trim()) { setForgotError('Ingrese su cedula o correo electronico.'); return; }
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

    const closeForgot = () => { setShowForgot(false); setForgotField(''); setForgotMsg(''); setForgotError(''); };

    return (
        <div className="min-h-[100dvh] lg:grid lg:grid-cols-2 bg-white">

            {/* ── Panel izquierdo: identidad del fondo (oculto en mobile) ── */}
            <div
                className="hidden lg:flex lg:flex-col lg:justify-between relative overflow-hidden px-14 py-14"
                style={{ background: 'linear-gradient(160deg, #052e16 0%, #166534 58%, #14532d 100%)' }}
            >
                {/* Decorativo: blobs + grid, igual identidad visual del resto de la app */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div
                        className="absolute -top-40 -right-24 w-[520px] h-[520px] rounded-full"
                        style={{ background: 'radial-gradient(circle, rgb(251 191 36 / 0.10), transparent 65%)' }}
                    />
                    <div
                        className="absolute -bottom-40 -left-24 w-[460px] h-[460px] rounded-full"
                        style={{ background: 'radial-gradient(circle, rgb(132 204 22 / 0.08), transparent 65%)' }}
                    />
                    <div
                        className="absolute inset-0 opacity-[0.04]"
                        style={{
                            backgroundImage: 'linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)',
                            backgroundSize: '48px 48px'
                        }}
                    />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-lg p-1.5">
                            <img src={logo} alt="Credifuturo" className="w-full h-full object-contain rounded-xl" />
                        </div>
                        <div>
                            <p className="text-white text-lg font-extrabold tracking-tight leading-none">Credifuturo</p>
                            <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest mt-1">Fondo Familiar</p>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 max-w-md">
                    <h1 className="text-white text-[34px] font-extrabold leading-[1.15] tracking-tight text-balance">
                        El fondo de ahorro y crédito de la familia.
                    </h1>
                    <p className="text-white/60 text-[15px] mt-3 leading-relaxed">
                        Un solo lugar para ver tu ahorro, tus préstamos y las decisiones del fondo — con las cuentas claras, siempre.
                    </p>

                    <ul className="mt-8 space-y-4">
                        {VALUE_PROPS.map(({ icon: Icon, text }) => (
                            <li key={text} className="flex items-start gap-3">
                                <span className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                                    <Icon className="h-4 w-4 text-brand-gold" />
                                </span>
                                <span className="text-white/75 text-sm leading-snug pt-1">{text}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative z-10 text-white/35 text-xs tracking-wide">
                    Fondo Familiar Credifuturo &middot; constituido en 2024
                </p>
            </div>

            {/* ── Panel derecho: formulario ── */}
            <div className="flex items-center justify-center px-4 py-10 sm:py-14 relative">
                {/* Fondo con leve textura de marca en mobile, donde no hay panel izquierdo */}
                <div className="lg:hidden absolute inset-0 pointer-events-none overflow-hidden">
                    <div
                        className="absolute -top-24 -right-24 w-72 h-72 rounded-full"
                        style={{ background: 'radial-gradient(circle, rgb(22 101 52 / 0.06), transparent 70%)' }}
                    />
                </div>

                <div className="w-full max-w-sm relative animate-scale-in">
                    {/* Encabezado de marca — solo visible en mobile, donde no hay panel izquierdo */}
                    <div className="lg:hidden flex flex-col items-center text-center mb-6">
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-card ring-1 ring-gray-100 p-1.5 mb-3">
                            <img src={logo} alt="Credifuturo" className="w-full h-full object-contain rounded-xl" />
                        </div>
                        <p className="text-brand-primary text-xl font-extrabold tracking-tight">Credifuturo</p>
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mt-0.5">Fondo Familiar</p>
                    </div>

                    <Card className="border-0 shadow-2xl lg:shadow-card ring-1 ring-gray-900/5 overflow-hidden">
                        <div className="h-1 w-full hidden lg:block" style={{ background: 'linear-gradient(90deg, #052e16, #166534, #fbbf24)' }} />

                        <CardHeader className="items-start text-left pb-1 pt-7 px-7 space-y-1">
                            <CardTitle className="text-[22px] font-extrabold tracking-tight text-gray-900">
                                Bienvenido de nuevo
                            </CardTitle>
                            <p className="text-sm text-gray-500 font-normal">
                                Ingresa con tu cédula para ver tu cuenta.
                            </p>
                        </CardHeader>

                        <CardContent className="px-7 pt-6 pb-2">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="flex items-start gap-2.5 p-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg">
                                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label htmlFor="cedula">Cédula de identidad</Label>
                                    <div className="relative">
                                        <Fingerprint className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                        <Input
                                            id="cedula"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="username"
                                            placeholder="Ej: 12345678"
                                            className="pl-10 h-12 text-base"
                                            required
                                            value={cedula}
                                            onChange={(e) => setCedula(e.target.value)}
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="password">Contraseña</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                        <Input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Ingresa tu contraseña"
                                            className="pl-10 pr-12 h-12 text-base"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            disabled={isLoading}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            disabled={isLoading}
                                            tabIndex={-1}
                                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-md transition-colors disabled:opacity-50"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-12 text-[15px] font-semibold mt-1 tracking-wide"
                                    size="lg"
                                    isLoading={isLoading}
                                >
                                    Iniciar sesión
                                </Button>
                            </form>
                        </CardContent>

                        <CardFooter className="flex flex-col items-center gap-3 border-t border-gray-100 pt-5 pb-7">
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                <ShieldCheck className="h-3.5 w-3.5 text-brand-primary/60" />
                                <span>Conexión segura y cifrada</span>
                            </div>
                            <p className="text-xs text-center text-gray-500">
                                ¿Olvidaste tu contraseña?{' '}
                                <button
                                    type="button"
                                    onClick={() => setShowForgot(true)}
                                    className="text-brand-primary hover:text-brand-dark underline underline-offset-2 font-medium transition-colors"
                                >
                                    Solicitar restablecimiento
                                </button>
                            </p>
                        </CardFooter>
                    </Card>

                    <p className="lg:hidden text-center text-gray-300 text-[11px] mt-5 tracking-wide">
                        Fondo Familiar Credifuturo &copy; {new Date().getFullYear()}
                    </p>
                </div>
            </div>

            {/* Modal recuperacion de contrasena */}
            {showForgot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
                     style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative animate-scale-in ring-1 ring-gray-900/5">
                        <button
                            onClick={closeForgot}
                            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex flex-col items-center mb-5">
                            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mb-3">
                                <Lock className="w-5 h-5 text-amber-600" />
                            </div>
                            <h2 className="text-base font-bold text-gray-900">Recuperar acceso</h2>
                            <p className="text-xs text-gray-500 text-center mt-1.5 leading-relaxed">
                                Ingrese su cedula o correo registrado. El administrador recibira su solicitud.
                            </p>
                        </div>

                        {forgotMsg ? (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 text-center">
                                <ShieldCheck className="h-6 w-6 text-green-500 mx-auto mb-2" />
                                {forgotMsg}
                                <button onClick={closeForgot} className="block text-xs text-green-800 underline mt-3 mx-auto hover:no-underline">
                                    Cerrar
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleForgotSubmit} className="space-y-3">
                                <div>
                                    <label htmlFor="forgot-field" className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Cedula o Correo Electronico
                                    </label>
                                    <input
                                        id="forgot-field"
                                        type="text"
                                        value={forgotField}
                                        onChange={(e) => setForgotField(e.target.value)}
                                        placeholder="Ej: 12345678 o socio@email.com"
                                        className="w-full border border-gray-300 rounded-lg px-3.5 py-3 text-sm h-12 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
                                        autoFocus
                                    />
                                </div>

                                {forgotError && <p className="text-xs text-red-600">{forgotError}</p>}

                                <button
                                    type="submit"
                                    disabled={forgotLoading}
                                    className="w-full bg-brand-primary hover:bg-brand-dark disabled:opacity-60 text-white text-sm font-semibold h-12 rounded-lg transition-colors"
                                >
                                    {forgotLoading ? 'Enviando...' : 'Enviar solicitud'}
                                </button>

                                <p className="text-xs text-gray-400 text-center pt-1">
                                    El administrador le informara cuando su contrasena sea restablecida.
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
