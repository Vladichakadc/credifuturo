import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import SavingsSummaryPage from '../admin/SavingsSummaryPage';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * UserSavingsSummaryPage
 * Carga todos los datos del socio autenticado usando los endpoints /my/*
 * (accesibles sin rol admin) y los pasa a SavingsSummaryPage para reutilizar
 * todos sus componentes visuales.
 */
const UserSavingsSummaryPage = () => {
    const [socio, setSocio] = useState(null);
    const [preloadedData, setPreloadedData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                // Cargar perfil + ahorros + aportes + préstamos + pagos en paralelo
                const [profileRes, savingsRes, aportesRes, loansRes, paymentsRes] = await Promise.all([
                    api.get('/admin/my/profile'),
                    api.get('/admin/my/savings'),
                    api.get('/admin/my/initial-contributions'),
                    api.get('/admin/my/loans'),
                    api.get('/admin/my/payments'),
                ]);

                const profile = profileRes.data;
                if (!profile) throw new Error('No se pudo cargar el perfil del socio.');

                // Los endpoints /my/* devuelven { ok, data } o el objeto directo
                const savings  = savingsRes.data?.data  ?? savingsRes.data  ?? [];
                const aportes  = aportesRes.data?.data  ?? aportesRes.data  ?? [];
                const loans    = loansRes.data?.data    ?? loansRes.data    ?? [];
                const payments = paymentsRes.data?.data ?? paymentsRes.data ?? [];

                setSocio(profile);
                setPreloadedData({ savings, aportes, loans, payments });
            } catch (err) {
                console.error('Error al cargar datos del socio:', err);
                setError('Error al cargar la información. Por favor recarga la página.');
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
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
            preloadedData={preloadedData}
        />
    );
};

export default UserSavingsSummaryPage;
