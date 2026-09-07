import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Encabezado de presentación de una pantalla — el mismo en todo el sistema.
 *
 * Formato corporativo: el degradado verde de marca, el icono de la sección en
 * una placa translúcida, el nombre, una frase que dice qué es esta pantalla y
 * una lista corta de lo que se encuentra dentro.
 *
 * Deliberadamente SIN botones y SIN cifras. Los botones viven en la barra de
 * acciones de cada página, junto al contenido sobre el que actúan; las cifras,
 * en las tarjetas del cuerpo. Un encabezado que además hace cosas y muestra
 * datos deja de leerse como presentación y se convierte en otro panel más.
 *
 * El contenido no está aquí: viene de utils/paginasInfo.js, indexado por ruta,
 * y lo monta el layout. Este componente solo sabe pintarlo.
 */
/**
 * En el teléfono, "Lo que encontrarás aquí" viene plegado.
 *
 * El encabezado ocupaba ~600px de los 844 de una pantalla de móvil: una
 * presentación a pantalla completa delante del contenido, en cada navegación y
 * en cada visita. La primera vez orienta; a partir de la segunda es un peaje.
 * En pantalla ancha no estorba, así que allí sigue desplegado.
 */
const CLAVE_HERO = 'credifuturo.hero.desplegado';

const PageHero = ({ icono: Icono, titulo, descripcion, encontraras = [] }) => {
    const [abierto, setAbierto] = useState(() => {
        try { return localStorage.getItem(CLAVE_HERO) === '1'; } catch { return false; }
    });
    const alternar = () => setAbierto((a) => {
        const sig = !a;
        try { localStorage.setItem(CLAVE_HERO, sig ? '1' : '0'); } catch { /* modo privado */ }
        return sig;
    });

    if (!titulo) return null;

    return (
        <section
            className="relative rounded-3xl overflow-hidden shadow-lg bg-gradient-to-br from-brand-dark via-brand-primary to-brand-dark text-white p-5 sm:p-7 mb-5"
            aria-labelledby="page-hero-titulo"
        >
            {/* Halos de marca. `pointer-events-none` para que no intercepten el
                clic de nada que quede encima. */}
            <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-brand-gold/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex items-start gap-3.5 sm:gap-4">
                {Icono && (
                    <div className="w-11 h-11 sm:w-14 sm:h-14 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center shadow-lg ring-1 ring-white/20 flex-shrink-0">
                        <Icono className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
                    </div>
                )}

                <div className="min-w-0">
                    <h1 id="page-hero-titulo" className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-white">
                        {titulo}
                    </h1>
                    {descripcion && (
                        <p className="text-white/80 text-[13px] sm:text-sm mt-1 leading-relaxed max-w-3xl">
                            {descripcion}
                        </p>
                    )}

                    {encontraras.length > 0 && (
                        <>
                            {/* En móvil es un botón que despliega; desde `sm` es
                                un rótulo y la lista va siempre visible. */}
                            <button
                                type="button"
                                onClick={alternar}
                                aria-expanded={abierto}
                                className="mt-4 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/45 transition-colors hover:text-white/70 sm:pointer-events-none sm:mt-4"
                            >
                                Lo que encontrarás aquí
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform sm:hidden ${abierto ? 'rotate-180' : ''}`} />
                            </button>
                            {/* Dos columnas desde `sm` para que tres viñetas no
                                estiren el encabezado más que el contenido que
                                presenta; en móvil, una sola. */}
                            <ul className={`mt-2 gap-1.5 sm:grid sm:grid-cols-2 sm:gap-x-6 ${abierto ? 'grid' : 'hidden'}`}>
                                {encontraras.map((punto, i) => (
                                    <li key={i} className="flex items-start gap-2 text-[12px] sm:text-[13px] text-white/85 leading-snug">
                                        <Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-brand-gold" />
                                        <span>{punto}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
};

export default PageHero;
