import React from 'react';
import { Loader2, Lock } from 'lucide-react';
import RepartoUtilidadesPage from '../shared/RepartoUtilidadesPage';
import { useBetaAccess } from '../../utils/betaAccess';

/**
 * Reparto de Utilidades para los socios beta.
 *
 * Es la vista de SOCIO: lo que me toca, el peso de cada mes de mi ahorro y el
 * simulador. El mismo componente que la vista de administración, con vista="socio",
 * así que no hay una segunda copia que se pueda desviar de la primera.
 *
 * El panel de parámetros aparece aquí solo para la Junta que NO es admin
 * (subgerente y tesorera): no tienen ruta de administración, así que este es su
 * único sitio. Para el gerente no se pinta, porque ya lo tiene en la suya.
 *
 * La restricción beta se comprueba aquí y no solo escondiendo el enlace del
 * menú: la pantalla muestra el reparto de todos los socios, y cualquiera podría
 * escribir la URL a mano.
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
                <p className="text-sm max-w-sm">El Reparto de Utilidades está en fase beta con un grupo pequeño de socios. Pronto estará disponible para todos.</p>
            </div>
        );
    }

    return <div className="min-h-screen p-4 sm:p-6"><RepartoUtilidadesPage vista="socio" /></div>;
};

export default RankingAhorroPage;
