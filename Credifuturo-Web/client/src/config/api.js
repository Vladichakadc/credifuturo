import axios from 'axios';

// URL base configurable por variable de entorno Vite
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Interceptor de requests para enviar el token JWT
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Interceptor para manejar errores comunes de conectividad y autenticación
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (!error.response) {
            error.message = 'No se puede conectar con el servidor. Verifique que el backend esté activo en el puerto 3000.';
        } else if (error.response.status === 401) {
            // Token ausente o expirado — limpiar sesión y redirigir a login
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        } else if (error.response.status === 403) {
            // Token inválido (vs. rol insuficiente — se distingue por mensaje)
            const msg = error.response.data?.error || '';
            if (msg.includes('inválido') || msg.includes('expirado')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }
            // Si es "Se requiere rol: admin" no se limpia la sesión — solo se rechaza la promesa
        }
        return Promise.reject(error);
    }
);

/**
 * Ejecuta una función async con reintentos y backoff exponencial.
 * @param {() => Promise} fn          - Función a ejecutar (debe retornar una promesa)
 * @param {number} maxRetries         - Máximo número de reintentos (default 3)
 * @param {number} baseDelay          - Delay base en ms (se duplica en cada reintento, default 1500)
 */
export async function apiWithRetry(fn, maxRetries = 3, baseDelay = 1500) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            console.warn(`⚠️ Intento ${attempt}/${maxRetries} fallido:`, err.message);
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`⏳ Reintentando en ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

export default api;
export { API_BASE_URL };
