import { cn } from '../../utils/cn';

/**
 * La matriz, en un teléfono.
 *
 * En 390px la rejilla de doce columnas medía 1384px y vivía dentro de un
 * contenedor con scroll horizontal propio, anidado en el scroll vertical de la
 * página: había que arrastrarla 3,5 veces a lo ancho, y al hacerlo en diagonal
 * el navegador no sabe si mueves la tabla o la página. Por eso "no fluye".
 *
 * La respuesta no es suavizar ese arrastre: es que en un teléfono una tabla de
 * doce columnas es la forma equivocada. Aquí cada fila —un socio, un crédito—
 * es una tarjeta con su cifra y una TIRA de doce casillas que cabe entera en el
 * ancho de la pantalla. El año se ve de un vistazo y no hay nada que arrastrar;
 * el desplazamiento vuelve a ser el vertical, que es el único natural en móvil.
 *
 * Las iniciales de los meses van UNA vez, en la cabecera de la lista, y no
 * dentro de cada tarjeta: doce letras repetidas veinticinco veces son ruido,
 * no información.
 *
 * De `sm` en adelante esto no se pinta y manda la tabla, que en pantalla ancha
 * es mejor: permite comparar socios entre sí, que es para lo que la Junta la usa.
 */
export const INICIALES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** La cabecera de iniciales, alineada con las tiras de abajo. */
export function CabeceraTira({ mesFoco, className = '' }) {
    return (
        <div className={cn('grid grid-cols-12 gap-1 px-1', className)}>
            {INICIALES.map((m, i) => (
                <span
                    key={i}
                    className={cn(
                        'text-center text-[10px] font-bold uppercase tabular-nums',
                        mesFoco === i + 1 ? 'text-brand-dark' : 'text-gray-400',
                        mesFoco && mesFoco !== i + 1 && 'opacity-40',
                    )}
                >
                    {m}
                </span>
            ))}
        </div>
    );
}

/**
 * Una tarjeta de la lista móvil.
 *
 * `celdas` llega ya resuelta por la página —cada matriz sabe qué significan sus
 * estados— como `{ clases, contenido, titulo, activa }`. Este componente solo
 * decide la forma; el significado sigue viviendo donde están los datos.
 */
export default function TiraMeses({
    titulo, subtitulo, cifra, cifraEtiqueta, pie,
    celdas, mesFoco = null, onCelda, insignia,
}) {
    return (
        <div className="rounded-xl border border-ui-border bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900">{titulo}</p>
                    {subtitulo && (
                        <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-gray-500">{subtitulo}</p>
                    )}
                    {insignia}
                </div>
                <div className="flex-shrink-0 text-right">
                    <p className="font-mono text-sm font-black tabular-nums text-gray-900">{cifra}</p>
                    {cifraEtiqueta && (
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{cifraEtiqueta}</p>
                    )}
                </div>
            </div>

            <div className="mt-2.5 grid grid-cols-12 gap-1">
                {celdas.map((c, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => c.activa && onCelda?.(i + 1)}
                        disabled={!c.activa}
                        title={c.titulo}
                        aria-label={c.titulo}
                        className={cn(
                            // 44px de alto: el mínimo cómodo para el pulgar. Las
                            // casillas de 8px de la tabla son imposibles de tocar.
                            'flex h-11 items-center justify-center rounded-md border font-mono text-[10px] font-bold tabular-nums transition-transform',
                            c.clases,
                            c.activa ? 'cursor-pointer active:scale-95' : 'cursor-default',
                            mesFoco && mesFoco !== i + 1 && 'opacity-30',
                            mesFoco === i + 1 && 'ring-2 ring-brand-gold ring-offset-1',
                        )}
                    >
                        {c.contenido}
                    </button>
                ))}
            </div>

            {pie && <div className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-gray-500">{pie}</div>}
        </div>
    );
}
