import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { useVisibilidad } from '../../context/VisibilidadContext';
import { SECCIONES_POR_ID } from '../../utils/seccionesVisibles';

/**
 * Recordatorio global de que hay una vista previa activa (ver CambiosPage y
 * VisibilidadContext.activarVistaPrevia). Vive por encima de <Routes> en
 * App.jsx para que se vea sin importar a qué página navegue el admin mientras
 * previsualiza — sin este recordatorio, un admin podría olvidar que está
 * viendo una sección que los socios todavía no ven, y confundirla con el
 * estado real.
 *
 * "Salir" no solo oculta el banner: apaga la vista previa de verdad (vuelve a
 * consultar el estado real guardado) y regresa a Cambios, el único lugar
 * desde donde tiene sentido activarla de nuevo.
 */
const VistaPreviaBanner = () => {
    const { previewIds, salirVistaPrevia } = useVisibilidad();
    const navigate = useNavigate();

    if (!previewIds || previewIds.length === 0) return null;

    const titulos = previewIds.map(id => SECCIONES_POR_ID[id]?.titulo || id);

    const salir = () => {
        salirVistaPrevia();
        navigate('/admin/cambios');
    };

    return (
        <div className="fixed bottom-0 inset-x-0 z-[70] bg-amber-400 border-t-2 border-amber-500 shadow-[0_-6px_20px_rgba(0,0,0,0.18)]">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="bg-amber-900/10 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                        <Eye className="h-4 w-4 text-amber-900" />
                    </div>
                    <p className="text-xs font-bold text-amber-950 leading-snug min-w-0">
                        Vista previa activa · {titulos.length === 1 ? titulos[0] : `${titulos.length} secciones`}
                        <span className="hidden sm:inline"> — así se vería si estuviera visible. Los socios todavía no la ven.</span>
                    </p>
                </div>
                <button
                    onClick={salir}
                    className="inline-flex items-center gap-1.5 bg-amber-950 text-white text-xs font-bold px-3.5 py-2 rounded-lg hover:bg-amber-900 transition-colors flex-shrink-0 min-h-[36px]"
                >
                    <X className="h-3.5 w-3.5" /> Salir de vista previa
                </button>
            </div>
        </div>
    );
};

export default VistaPreviaBanner;
