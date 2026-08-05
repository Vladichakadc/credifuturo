import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

/**
 * Diálogo de confirmación accesible que reemplaza a window.confirm/alert.
 * Cierra con Escape o clic en el backdrop. Renderiza en un portal para
 * quedar por encima de cualquier layout.
 *
 * Props:
 *  - open: boolean
 *  - title, message: contenido
 *  - confirmLabel / cancelLabel: textos de los botones
 *  - variant: 'danger' | 'primary' (color del botón de confirmar)
 *  - loading: deshabilita botones mientras corre la acción
 *  - onConfirm / onClose
 *  - children: contenido extra opcional (p. ej. mostrar una contraseña temporal)
 *  - hideCancel: oculta el botón cancelar (modo "aviso")
 */
export const ConfirmDialog = ({
    open,
    title,
    message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    variant = 'primary',
    loading = false,
    onConfirm,
    onClose,
    children,
    hideCancel = false,
}) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose?.(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, loading, onClose]);

    if (!open) return null;

    const isDanger = variant === 'danger';

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
        >
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => !loading && onClose?.()}
            />
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100">
                <button
                    onClick={() => !loading && onClose?.()}
                    className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Cerrar"
                >
                    <X className="h-5 w-5" />
                </button>
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${isDanger ? 'bg-red-100' : 'bg-brand-primary/10'}`}>
                            <AlertTriangle className={`h-6 w-6 ${isDanger ? 'text-red-600' : 'text-brand-primary'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 id="confirm-dialog-title" className="text-lg font-bold text-gray-900">{title}</h3>
                            {message && <p className="mt-1 text-sm text-gray-500">{message}</p>}
                            {children && <div className="mt-3">{children}</div>}
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        {!hideCancel && (
                            <Button variant="outline" onClick={onClose} disabled={loading}>
                                {cancelLabel}
                            </Button>
                        )}
                        <Button
                            variant={isDanger ? 'danger' : 'primary'}
                            onClick={onConfirm}
                            isLoading={loading}
                        >
                            {confirmLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmDialog;
