import React, { createContext, useContext, useState, useCallback } from 'react';
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
        <div className={`flex items-start p-4 rounded shadow-lg mb-3 min-w-[300px] max-w-sm animate-slide-in-right transition-all ${styles[type]}`}>
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

    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);

        setTimeout(() => {
            removeToast(id);
        }, TOAST_DURATION);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const toast = {
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error'),
        info: (msg) => addToast(msg, 'info'),
        warning: (msg) => addToast(msg, 'warning')
    };

    return (
        <UiContext.Provider value={{ toast }}>
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
