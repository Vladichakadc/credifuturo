import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

const UiContext = createContext();

export const useUi = () => useContext(UiContext);

const TOAST_DURATION = 3000;

const Toast = ({ message, type, onClose }) => {
    const icons = {
        success: <CheckCircle className="w-5 h-5 text-green-500" />,
        error: <AlertCircle className="w-5 h-5 text-red-500" />,
        info: <Info className="w-5 h-5 text-blue-500" />,
        warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />
    };

    const styles = {
        success: "border-l-4 border-green-500 bg-white",
        error: "border-l-4 border-red-500 bg-white",
        info: "border-l-4 border-blue-500 bg-white",
        warning: "border-l-4 border-yellow-500 bg-white"
    };

    return (
        <div className={`flex items-start p-4 rounded shadow-lg mb-3 min-w-[300px] max-w-md animate-slide-in-right transition-all ${styles[type]}`}>
            <div className="flex-shrink-0 mr-3 mt-0.5">
                {icons[type]}
            </div>
            <div className="flex-1 mr-2">
                <p className="text-sm font-medium text-gray-800">{message}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

export const UiProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    // duration es opcional — por defecto TOAST_DURATION (3s), pero mensajes largos
    // (ej. el resumen de una refinanciación con varias cifras) pueden pedir más
    // tiempo pasando un tercer argumento: toast.success(msg, 8000).
    const addToast = useCallback((message, type = 'info', duration = TOAST_DURATION) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);

        setTimeout(() => {
            removeToast(id);
        }, duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Memoizado: sin esto, `toast` cambia de referencia en cada render del Provider,
    // y cualquier useEffect con [toast] en deps entra en loop al agregar un toast.
    const toast = useMemo(() => ({
        success: (msg, duration) => addToast(msg, 'success', duration),
        error: (msg, duration) => addToast(msg, 'error', duration),
        info: (msg, duration) => addToast(msg, 'info', duration),
        warning: (msg, duration) => addToast(msg, 'warning', duration)
    }), [addToast]);

    const value = useMemo(() => ({ toast }), [toast]);

    return (
        <UiContext.Provider value={value}>
            {children}
            {createPortal(
                <div className="fixed top-4 right-4 z-50 flex flex-col items-end pointer-events-none">
                    <div className="pointer-events-auto">
                        {toasts.map(t => (
                            <Toast key={t.id} {...t} onClose={() => removeToast(t.id)} />
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </UiContext.Provider>
    );
};
