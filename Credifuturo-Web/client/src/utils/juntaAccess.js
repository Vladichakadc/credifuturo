import { useState, useEffect } from 'react';

// Miembros de la Junta Administrativa que NO son admin (el gerente entra por
// role==='admin'). Mismo criterio que JUNTA_CEDULAS en server/routes/admin.js —
// si cambia la Junta, actualizar en ambos lados.
export const JUNTA_CEDULAS_NO_ADMIN = ['79863805', '52496873']; // Leonardo Rojas (Subgerente), Xiomara Rojas (Tesorera)

export function useJuntaAccess() {
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        setAllowed(user.role === 'admin' || JUNTA_CEDULAS_NO_ADMIN.includes(user.cedula));
    }, []);

    return { allowed };
}
