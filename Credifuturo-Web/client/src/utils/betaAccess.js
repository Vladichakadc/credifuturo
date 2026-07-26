import { useState, useEffect } from 'react';
import api from '../config/api';

// Misma lista que usa el menú (UserDashboardLayout) para decidir a quién le muestra
// el submenú "Propuestas (BETA)". Centralizada aquí para que la ruta en sí quede
// protegida con el mismo criterio, no solo oculta en la navegación.
export const BETA_USERS = ["LADY TORRES", "XIOMARA ROJAS", "LEONARDO ROJAS"];

export function useBetaAccess() {
    const [loading, setLoading] = useState(true);
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.role === 'admin') {
            setAllowed(true);
            setLoading(false);
            return;
        }
        const fullName = `${user.name || ''} ${user.surname1 || ''}`.trim().toUpperCase();
        if (!BETA_USERS.includes(fullName)) {
            setAllowed(false);
            setLoading(false);
            return;
        }
        api.get('/admin/settings/propuestas_enabled')
            .then(res => setAllowed(res.data.value === 'true'))
            .catch(() => setAllowed(false))
            .finally(() => setLoading(false));
    }, []);

    return { loading, allowed };
}
