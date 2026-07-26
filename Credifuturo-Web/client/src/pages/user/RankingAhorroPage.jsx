import React from 'react';
import { Loader2, Lock } from 'lucide-react';
import { RankingBox } from '../admin/SavingsSummaryPage';
import { useBetaAccess } from '../../utils/betaAccess';

/**
 * Vista de Ranking de Ahorro para socios BETA.
 * Reutiliza el componente RankingBox del panel de administrador,
 * pero en modo "embedded" (sin botón de cerrar, ocupa toda la página).
 *
 * El Ranking muestra nombre y ahorro real de TODOS los socios, así que esta
 * ruta debe quedar restringida al mismo grupo beta que oculta el menú — no
 * basta con esconder el enlace, cualquier socio podría escribir la URL directo.
 */
const RankingAhorroPage = () => {
    const { loading, allowed } = useBetaAccess();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
            </div>
        );
    }

    if (!allowed) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-400 p-6 text-center">
                <Lock className="h-12 w-12 opacity-20" />
                <p className="font-bold text-gray-500">Esta función todavía no está disponible para tu cuenta.</p>
                <p className="text-sm max-w-sm">El Ranking de Ahorro está en fase beta con un grupo pequeño de socios. Pronto estará disponible para todos.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 sm:p-6">
            <RankingBox embedded={true} />
        </div>
    );
};

export default RankingAhorroPage;
