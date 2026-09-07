import { CreditCard, Hash, MapPin, CalendarDays, BadgeCheck } from 'lucide-react';
import { formatDate } from '../../utils/excelUtils';

/**
 * Los datos del socio, en un solo sitio: debajo del saludo de Mi Panel.
 *
 * El administrador tiene esta ficha en la vista de cada socio y el socio no la
 * tenía en ninguna parte de la suya: para confirmar su cédula, su ID o desde
 * cuándo pertenece al fondo había que preguntarle al gerente.
 *
 * ── UN DATO, UN SITIO ───────────────────────────────────────────────────────
 *
 * Estuvo un tiempo encima de TODAS las pantallas del socio y era demasiado:
 * unos datos que se consultan de vez en cuando no tienen por qué acompañar
 * cada navegación. Vive donde se va a mirar —Mi Panel— y solo ahí.
 *
 * Y no repite nada de lo que ya está a su alrededor, que es la otra mitad de la
 * regla. Por eso NO lleva:
 *
 *   · el nombre — lo dice el "Hola, …" justo encima;
 *   · el correo — no aporta nada que el socio no sepa, y es el dato con más
 *     ruido visual de todos;
 *   · la cédula en la barra lateral, que se quitó de allí al traerla aquí.
 *
 * Lo que sí lleva es lo que no está en ninguna otra parte: cédula, número de
 * socio, estado y la fecha exacta de ingreso (el saludo solo da el año).
 */
const Dato = ({ icono: Icono, etiqueta, children }) => (
    <div className="flex items-start gap-2.5 min-w-0">
        <Icono className="h-4 w-4 flex-shrink-0 text-gray-400 mt-0.5" />
        <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 leading-none">{etiqueta}</p>
            <p className="mt-1 text-sm font-semibold text-gray-800 truncate">{children}</p>
        </div>
    </div>
);

export default function MiIdentidad({ socio }) {
    if (!socio) return null;

    const activo = String(socio.estatus || '').toLowerCase() === 'activo';
    const lugar = [socio.ciudad, socio.pais].filter(Boolean).join(', ');

    return (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-card p-4 lg:p-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
                <Dato icono={CreditCard} etiqueta="Cédula">{socio.cedula || '—'}</Dato>

                <Dato icono={Hash} etiqueta="Número de socio">{socio.customerId || '—'}</Dato>

                <Dato icono={BadgeCheck} etiqueta="Estado">
                    <span className={`inline-flex items-center gap-1.5 ${activo ? 'text-emerald-700' : 'text-gray-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${activo ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {socio.estatus || '—'}
                    </span>
                </Dato>

                {/* La fecha completa; el saludo de arriba solo da el año. */}
                <Dato icono={CalendarDays} etiqueta="Ingreso al fondo">
                    {socio.fechaIngreso ? formatDate(socio.fechaIngreso) : '—'}
                </Dato>

                {lugar && (
                    <div className="col-span-2 sm:col-span-4 border-t border-gray-100 pt-3">
                        <Dato icono={MapPin} etiqueta="Ciudad">{lugar}</Dato>
                    </div>
                )}
            </div>
        </div>
    );
}
