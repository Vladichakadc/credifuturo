import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import SavingsSummaryPage from '../admin/SavingsSummaryPage';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * UserSavingsSummaryPage
 * Wrapper que carga el perfil del socio autenticado y muestra
 * SavingsSummaryPage bloqueado a sus propios datos.
 */
const UserSavingsSummaryPage = () => {
    const [socio, setSocio] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await api.get('/admin/my/profile');
                if (res.data) {
                    setSocio(res.data);
                } else {
                    setError('No se pudo cargar el perfil del socio.');
                }
            } catch (err) {
                console.error('Error fetching user profile:', err);
                setError('Error al cargar el perfil. Por favor recarga la página.');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-brand-primary/40" />
                <p className="text-sm text-gray-400 font-semibold animate-pulse uppercase tracking-widest">
                    Cargando tu información...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
                <AlertCircle className="h-10 w-10 text-red-400" />
                <p className="text-sm text-red-500 font-medium">{error}</p>
            </div>
        );
    }

    return (
        <SavingsSummaryPage
            lockedSocio={socio}
            hideControls={true}
        />
    );
};

export default UserSavingsSummaryPage;
