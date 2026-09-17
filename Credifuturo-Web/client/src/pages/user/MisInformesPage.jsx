import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, FileText, ArrowRight, Loader2, TrendingDown } from 'lucide-react';
import api from '../../config/api';
import { cn } from '../../utils/cn';

/**
 * Mis Informes — los documentos que el fondo generó a nombre del socio.
 *
 * La decisión de diseño que manda aquí: **un informe se presenta por lo que dice
 * de tu dinero, no por cómo se llama el archivo.**
 *
 * El menú de la Junta lista los informes por su nombre de archivo con los
 * guiones bajos cambiados por espacios ("Abono SOL30 2026-09-17"). Para quien
 * gobierna el fondo eso basta: sabe qué hay dentro. Para la socia a la que le
 * bajaron la cuota, no significa nada — tendría que abrirlo para saber si le
 * interesa, y probablemente no lo abra.
 *
 * Así que la tarjeta lleva delante la respuesta: **cuánto bajó su cuota**. Las
 * cifras vienen en la propia lista (el registro las guarda al generar el
 * informe), así que no hay que abrir nada para saber de qué va.
 */

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const fecha = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

function Cifra({ etiqueta, valor, acento = false }) {
    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{etiqueta}</p>
            <p className={cn('font-mono text-base font-black tabular-nums leading-tight',
                acento ? 'text-brand-gold' : 'text-brand-primary')}>
                {valor}
            </p>
        </div>
    );
}

export default function MisInformesPage() {
    const [informes, setInformes] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.get('/admin/informes')
            .then((res) => setInformes((res.data || []).filter((i) => i.personal)))
            .catch((err) => setError(err.response?.data?.error || 'No se pudieron cargar tus informes.'));
    }, []);

    if (error) {
        return (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
                <p className="font-semibold text-rose-900">No se pudieron cargar tus informes</p>
                <p className="mt-1 text-sm text-rose-800">{error}</p>
            </div>
        );
    }

    if (informes === null) {
        return (
            <div className="flex items-center gap-2 p-8 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus informes…
            </div>
        );
    }

    if (informes.length === 0) {
        return (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-card">
                <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 font-semibold text-gray-700">Todavía no tienes informes</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-gray-500">
                    Aquí aparecerán los documentos que el fondo prepare a tu nombre. Por ahora se
                    genera uno cada vez que pagas por encima de tu cuota y ese excedente abona a
                    capital: te explica cuánto bajó cada cuota y cuánto te ahorraste en intereses.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {informes.map((inf) => {
                const r = inf.resumen || {};
                return (
                    <Link
                        key={inf.name}
                        to={`/dashboard/informes/${encodeURIComponent(inf.name)}`}
                        className="group block rounded-2xl border border-gray-200 bg-white shadow-card transition-all hover:border-brand-primary/40 hover:shadow-card-hover"
                    >
                        <div className="flex items-start gap-3 p-4 sm:p-5">
                            <span className="mt-0.5 rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary ring-1 ring-brand-primary/15">
                                <FileText className="h-5 w-5" />
                            </span>

                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-gray-900">
                                    {inf.titulo || inf.name.replace(/\.(md|txt|pdf)$/, '').replace(/_/g, ' ')}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500">{fecha(inf.createdAt)}</p>

                                {/* La respuesta primero: qué cambió en su bolsillo. */}
                                {r.bajaMensual > 0 && (
                                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800">
                                        <TrendingDown className="h-3.5 w-3.5" />
                                        Tu cuota bajó {pesos(r.bajaMensual)} cada mes
                                    </p>
                                )}
                            </div>

                            <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
                        </div>

                        {(r.excedente > 0 || r.ahorroInteres > 0) && (
                            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:px-5">
                                <Cifra etiqueta="Abonaste a capital" valor={pesos(r.excedente)} />
                                <Cifra etiqueta="Te ahorraste" valor={pesos(r.ahorroInteres)} acento />
                            </div>
                        )}
                    </Link>
                );
            })}
        </div>
    );
}
