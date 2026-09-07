import { useState, useEffect } from 'react';
import { CreditCard, Mail, MapPin, CalendarDays, ChevronDown } from 'lucide-react';
import api from '../../config/api';
import { formatDate } from '../../utils/excelUtils';

/**
 * Los datos del socio, en todas sus pantallas.
 *
 * El administrador tiene esta ficha en la vista de cada socio y el socio no la
 * tenía en ninguna parte de la suya: para confirmar su propia cédula, su ID o
 * desde cuándo pertenece al fondo había que preguntarle al gerente. Son los
 * mismos campos que ve el admin, del socio autenticado y de nadie más — el id
 * sale del token en `/my/profile`, así que no hay forma de pedir la de otro.
 *
 * Vive en el layout y no dentro de cada página: así una pantalla nueva la hereda
 * sin tocarla, que es el mismo criterio que ya sigue PageHeroRuta. Y por eso es
 * compacta y plegable — va a aparecer encima de todo, y una ficha que ocupa
 * media pantalla en cada navegación deja de ser un dato y pasa a ser un estorbo.
 * El estado de plegado se recuerda en el navegador, para no volver a cerrarla en
 * cada visita.
 */
const CLAVE_PLEGADO = 'credifuturo.miIdentidad.plegada';

const leerPlegado = () => {
    try { return localStorage.getItem(CLAVE_PLEGADO) === '1'; } catch { return false; }
};

export default function MiIdentidad() {
    const [socio, setSocio] = useState(null);
    const [plegada, setPlegada] = useState(leerPlegado);

    useEffect(() => {
        let vivo = true;
        api.get('/admin/my/profile')
            .then(res => { if (vivo) setSocio(res.data); })
            // Silencio a propósito: es una tarjeta de contexto, no el contenido
            // de la pantalla. Si no carga, la página de abajo sigue sirviendo.
            .catch(() => { });
        return () => { vivo = false; };
    }, []);

    const alternar = () => {
        setPlegada(p => {
            const siguiente = !p;
            try { localStorage.setItem(CLAVE_PLEGADO, siguiente ? '1' : '0'); } catch { /* modo privado */ }
            return siguiente;
        });
    };

    if (!socio) return null;

    const nombre = [socio.name, socio.surname1, socio.surname2].filter(Boolean).join(' ').trim();
    const activo = String(socio.estatus || '').toLowerCase() === 'activo';
    const lugar = [socio.ciudad, socio.pais].filter(Boolean).join(', ');

    return (
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 p-3 sm:p-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary text-base font-bold">
                    {(socio.name || '?').trim().charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 sm:text-base">{nombre || 'Socio'}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                            <CreditCard className="h-3.5 w-3.5" /> CC {socio.cedula || '—'}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                            ID {socio.customerId || '—'}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${activo ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            {socio.estatus || '—'}
                        </span>
                    </div>
                </div>

                <button
                    type="button" onClick={alternar}
                    aria-expanded={!plegada}
                    aria-label={plegada ? 'Ver mis datos' : 'Ocultar mis datos'}
                    className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                    <ChevronDown className={`h-4 w-4 transition-transform ${plegada ? '' : 'rotate-180'}`} />
                </button>
            </div>

            {!plegada && (
                <div className="grid grid-cols-1 gap-2 border-t border-gray-100 bg-gray-50/60 px-3 py-3 text-xs text-gray-600 sm:grid-cols-3 sm:px-4">
                    {socio.email && (
                        <span className="inline-flex items-center gap-2 min-w-0">
                            <Mail className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                            <span className="truncate">{socio.email}</span>
                        </span>
                    )}
                    {lugar && (
                        <span className="inline-flex items-center gap-2 min-w-0">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                            <span className="truncate">{lugar}</span>
                        </span>
                    )}
                    {socio.fechaIngreso && (
                        <span className="inline-flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                            Ingreso: <strong className="font-semibold text-gray-800">{formatDate(socio.fechaIngreso)}</strong>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
