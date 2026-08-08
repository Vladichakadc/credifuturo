import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X, BookOpen } from 'lucide-react';

/**
 * Glosario de los términos financieros del Panel Ejecutivo.
 *
 * El panel es la vista que ven los socios, y varios de sus indicadores usan
 * vocabulario que solo entiende quien trabaja en finanzas: PAR, apalancamiento,
 * penetración de crédito, "EP". Un número con color y sin explicación no informa
 * — obliga a adivinar si un 3% es bueno o malo. Cada definición dice qué es, cómo
 * leerla y cuál es el rango sano, en el lenguaje de un socio.
 */

export const TERMINOS = {
    par: {
        titulo: 'PAR — Cartera en riesgo',
        texto: 'De todo el dinero prestado que aún no se ha pagado, qué porcentaje corresponde a cuotas cuya fecha de pago ya venció. Es el termómetro de la calidad de la cartera.',
        rango: 'Sano por debajo del 3%. Entre 3% y 5% conviene vigilar. Por encima del 5% requiere gestión de cobro.',
    },
    apalancamiento: {
        titulo: 'Apalancamiento del fondo',
        texto: 'Qué proporción del ahorro de los socios está colocada en préstamos. Si es muy bajo, hay plata quieta que no genera intereses; si es muy alto, queda poco margen para atender retiros o nuevas solicitudes.',
        rango: 'Entre 40% y 85% se considera sano. Por debajo del 40% hay capacidad ociosa; por encima del 85%, poco margen de maniobra.',
    },
    penetracion: {
        titulo: 'Penetración de crédito',
        texto: 'Qué porcentaje de los socios activos tiene hoy un préstamo vigente. Mide cuántos están usando el beneficio principal de la cooperativa.',
        rango: 'No hay un valor "correcto": depende de la etapa del fondo. Un valor bajo indica capacidad de colocación sin usar.',
    },
    recaudo: {
        titulo: 'Eficiencia de recaudo',
        texto: 'De cada 100 cuotas que se debían pagar en lo que va del año, cuántas se pagaron efectivamente. No cuenta las cuotas que aún no han vencido.',
        rango: 'Sano por encima del 95%. Entre 90% y 95% conviene reforzar recordatorios. Por debajo del 90% es una alerta.',
    },
    ep: {
        titulo: '"EP" — Estado de Préstamos',
        texto: 'Abreviatura interna del módulo donde vive cada cuota de cada crédito. Cuando el panel dice "mora EP" se refiere a cuotas de préstamos vencidas, para distinguirlas de la mora en los aportes de ahorro.',
        rango: null,
    },
    disponible: {
        titulo: 'Disponible estimado',
        texto: 'Es una cifra contable calculada (patrimonio de los socios, menos el capital que está prestado, más lo que se ha recaudado), no el saldo de una cuenta bancaria. Sirve para dimensionar la capacidad del fondo, no para conciliar contra un extracto.',
        rango: null,
    },
    ritmo: {
        titulo: 'Comparación "vs ritmo"',
        texto: 'Compara lo que llevamos este año contra lo que el año pasado se había logrado a esta misma altura del calendario. Se usa esta forma, y no el total del año anterior, porque comparar unos meses contra doce siempre daría negativo hasta diciembre — mediría el calendario, no el desempeño del fondo.',
        rango: null,
    },
};

/**
 * Icono de ayuda junto a un término; abre su definición.
 *
 * Dos detalles que parecen menores y no lo son. Este control se inyecta dentro
 * del `label` de una HeroKpi, y HeroKpi se renderiza como <button> cuando tiene
 * onClick — así que:
 *
 * 1. El disparador NO puede ser un <button>: anidar botones es HTML inválido.
 *    Va como <span role="button"> con manejo de teclado, que es accesible y
 *    válido dentro de contenido de botón.
 * 2. El modal es DESCENDIENTE React del elemento clicable, y los eventos
 *    sintéticos de React burbujean por el árbol de React, no por el del DOM —
 *    ni el portal ni `position: fixed` lo desconectan. Sin stopPropagation en el
 *    fondo oscuro, cerrar el glosario clicando fuera disparaba también el
 *    onClick de la tarjeta: en "Cartera pendiente" sacaba al gerente a
 *    /admin/payments/list, y en "Apalancamiento" abría otro modal encima.
 * 3. Y va en un PORTAL a document.body porque HeroKpi tiene `hover:scale-[1.02]`:
 *    un `transform` en un ancestro convierte `position: fixed` en relativo a ESE
 *    ancestro, no al viewport. Sin el portal el modal salía encajonado dentro de
 *    la tarjeta (medido: 225×164 px en la esquina derecha) y encima recortado por
 *    su `overflow-hidden` — el texto quedaba ilegible.
 */

/** Envuelve el modal fuera del subárbol con transform/overflow de la tarjeta. */
const Overlay = ({ onCerrar, children, etiqueta }) => createPortal(
    <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        onClick={(e) => { e.stopPropagation(); onCerrar(); }}
        aria-label={etiqueta}
    >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        {children}
    </div>,
    document.body
);
export const TerminoAyuda = ({ termino, className = '' }) => {
    const [abierto, setAbierto] = useState(false);
    const def = TERMINOS[termino];
    if (!def) return null;
    const abrir = (e) => { e.stopPropagation(); e.preventDefault(); setAbierto(true); };
    return (
        <>
            <span
                role="button"
                tabIndex={0}
                onClick={abrir}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') abrir(e); }}
                aria-label={`Qué significa ${def.titulo}`}
                className={`print:hidden inline-flex items-center justify-center rounded-full hover:bg-white/20 transition-colors cursor-pointer ${className}`}
            >
                <HelpCircle className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
            </span>
            {abierto && (
                <Overlay onCerrar={() => setAbierto(false)}>
                    <div
                        role="dialog" aria-modal="true" aria-label={def.titulo}
                        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <h3 className="text-base font-black text-gray-900">{def.titulo}</h3>
                            {/* También <span>: este modal vive dentro del <button> de
                                la HeroKpi, donde un <button> anidado es HTML inválido. */}
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); setAbierto(false); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setAbierto(false); } }}
                                aria-label="Cerrar"
                                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                                <X className="h-4 w-4" />
                            </span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{def.texto}</p>
                        {def.rango && (
                            <p className="text-xs text-gray-600 font-semibold mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 leading-relaxed">
                                {def.rango}
                            </p>
                        )}
                    </div>
                </Overlay>
            )}
        </>
    );
};

/** Glosario completo, para consultar todos los términos de una vez. */
const GlosarioFondo = () => {
    const [abierto, setAbierto] = useState(false);
    return (
        <>
            <button
                type="button"
                onClick={() => setAbierto(true)}
                className="print:hidden inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-primary hover:underline"
            >
                <BookOpen className="h-3.5 w-3.5" /> ¿Qué significan estos términos?
            </button>
            {abierto && (
                <Overlay onCerrar={() => setAbierto(false)}>
                    <div
                        role="dialog" aria-modal="true" aria-label="Glosario"
                        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h2 className="text-base font-black text-brand-primary flex items-center gap-2">
                                <BookOpen className="h-4 w-4" /> Glosario del fondo
                            </h2>
                            <button onClick={() => setAbierto(false)} aria-label="Cerrar"
                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="overflow-y-auto px-5 py-4 space-y-4">
                            {Object.entries(TERMINOS).map(([k, d]) => (
                                <div key={k} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                                    <h3 className="text-sm font-black text-gray-900">{d.titulo}</h3>
                                    <p className="text-sm text-gray-700 leading-relaxed mt-1">{d.texto}</p>
                                    {d.rango && (
                                        <p className="text-xs text-gray-600 font-semibold mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5 leading-relaxed">
                                            {d.rango}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </Overlay>
            )}
        </>
    );
};

export default GlosarioFondo;
