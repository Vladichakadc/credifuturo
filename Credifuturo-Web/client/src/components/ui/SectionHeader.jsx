import React from 'react';

/**
 * Encabezado de una sección de contenido — el mismo en todo el sistema.
 *
 * Existe porque una sola página llegó a tener tres lenguajes distintos para lo
 * mismo: el comparador interanual abría con el icono sobre una placa verde y un
 * título negro; "Movimiento mensual" con un icono suelto y un título más
 * pequeño; y el panel que los contiene a todos, con una barra gris y el título
 * en verde. Tres formas de decir "aquí empieza una sección" en la misma
 * pantalla.
 *
 * Se queda con la del comparador, que es la que mejor resiste el escaneo: la
 * placa de color da el punto de anclaje visual y el título en negro conserva el
 * contraste que un verde sobre gris pierde.
 *
 * No es un contenedor: solo el encabezado. Quien lo usa pone su propia caja,
 * porque unas secciones viven dentro de un panel más grande (sin borde propio) y
 * otras son tarjetas sueltas.
 */
const SectionHeader = ({ icono: Icono, titulo, subtitulo, acciones, className = '' }) => (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
        <div className="flex items-start gap-3 min-w-0">
            {Icono && (
                <div className="p-2 bg-brand-primary rounded-lg shadow-lg shadow-brand-primary/20 shrink-0">
                    <Icono className="h-5 w-5 text-white" />
                </div>
            )}
            <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-gray-900 leading-tight">{titulo}</h3>
                {subtitulo && (
                    <p className="text-[11px] sm:text-xs text-gray-500 font-semibold mt-0.5 leading-snug">{subtitulo}</p>
                )}
            </div>
        </div>
        {acciones && <div className="flex items-center gap-2 shrink-0">{acciones}</div>}
    </div>
);

export default SectionHeader;
