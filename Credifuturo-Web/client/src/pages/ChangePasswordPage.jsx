import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';

export default function ChangePasswordPage({ user, setUser }) {
    const navigate = useNavigate();
    const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const strength = (pwd) => {
        let score = 0;
        if (pwd.length >= 6) score++;
        if (pwd.length >= 10) score++;
        if (/\d/.test(pwd)) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;
        return score;
    };

    const strengthLabel = ['', 'Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];
    const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
    const pwd = form.newPassword;
    const sc = strength(pwd);

    const handleChange = (e) => {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (form.newPassword !== form.confirmPassword) {
            setError('Las contraseñas nuevas no coinciden.');
            return;
        }
        if (form.newPassword.length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres.');
            return;
        }
        if (!/\d/.test(form.newPassword)) {
            setError('La nueva contraseña debe contener al menos un número.');
            return;
        }
        setLoading(true);
        try {
            const res = await api.put('/auth/change-password', {
                currentPassword: form.currentPassword,
                newPassword: form.newPassword
            });
            setSuccess('¡Contraseña actualizada correctamente!');
            // Update token and user state
            if (res.data.token) {
                localStorage.setItem('token', res.data.token);
            }
            const updatedUser = { ...user, mustChangePassword: false };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            if (setUser) setUser(updatedUser);

            setTimeout(() => {
                navigate(user?.role === 'admin' ? '/admin' : '/dashboard');
            }, 1500);
        } catch (err) {
            setError(err.response?.data?.message || 'Error al cambiar la contraseña.');
        } finally {
            setLoading(false);
        }
    };

    const EyeIcon = ({ show, toggle }) => (
        <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show
                ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            }
        </button>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
                {/* Header */}
                <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
                        <svg className="w-8 h-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Cambiar Contraseña</h1>
                    <p className="text-sm text-gray-500 text-center mt-1">
                        Por seguridad, debes establecer una contraseña personal antes de continuar.
                    </p>
                </div>

                {/* Aviso primer ingreso */}
                {user?.mustChangePassword && (
                    <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-800">
                        <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <span>Es tu primer ingreso. Debes cambiar la contraseña asignada por el administrador.</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Contraseña actual */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña actual</label>
                        <div className="relative">
                            <input
                                type={showCurrent ? 'text' : 'password'}
                                name="currentPassword"
                                value={form.currentPassword}
                                onChange={handleChange}
                                required
                                placeholder="Ingrese su contraseña actual"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <EyeIcon show={showCurrent} toggle={() => setShowCurrent(v => !v)} />
                        </div>
                    </div>

                    {/* Nueva contraseña */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
                        <div className="relative">
                            <input
                                type={showNew ? 'text' : 'password'}
                                name="newPassword"
                                value={form.newPassword}
                                onChange={handleChange}
                                required
                                placeholder="Mínimo 6 caracteres y 1 número"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <EyeIcon show={showNew} toggle={() => setShowNew(v => !v)} />
                        </div>
                        {/* Barra de fortaleza */}
                        {pwd.length > 0 && (
                            <div className="mt-1.5">
                                <div className="flex gap-1 h-1.5">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="flex-1 rounded-full transition-all duration-300"
                                            style={{ backgroundColor: i <= sc ? strengthColor[sc] : '#e5e7eb' }} />
                                    ))}
                                </div>
                                <p className="text-xs mt-1" style={{ color: strengthColor[sc] }}>{strengthLabel[sc]}</p>
                            </div>
                        )}
                    </div>

                    {/* Confirmar nueva contraseña */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nueva contraseña</label>
                        <div className="relative">
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                name="confirmPassword"
                                value={form.confirmPassword}
                                onChange={handleChange}
                                required
                                placeholder="Repita la nueva contraseña"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <EyeIcon show={showConfirm} toggle={() => setShowConfirm(v => !v)} />
                        </div>
                        {form.confirmPassword && form.newPassword !== form.confirmPassword && (
                            <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden.</p>
                        )}
                    </div>

                    {/* Reglas */}
                    <ul className="text-xs text-gray-500 space-y-0.5 pl-1">
                        <li className={`flex items-center gap-1 ${pwd.length >= 6 ? 'text-green-600' : ''}`}>
                            <span>{pwd.length >= 6 ? '✓' : '·'}</span> Mínimo 6 caracteres
                        </li>
                        <li className={`flex items-center gap-1 ${/\d/.test(pwd) ? 'text-green-600' : ''}`}>
                            <span>{/\d/.test(pwd) ? '✓' : '·'}</span> Al menos un número
                        </li>
                    </ul>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
                    >
                        {loading ? 'Guardando...' : 'Actualizar Contraseña'}
                    </button>
                </form>
            </div>
        </div>
    );
}
