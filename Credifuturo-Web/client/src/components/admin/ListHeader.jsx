import React from 'react';

/**
 * Componente reutilizable para el encabezado de las páginas de listado.
 * Muestra el título, la fuente del registro (DB/Excel) y el conteo de registros.
 */
const ListHeader = ({
    title,
    source,
    totalCount,
    filteredCount,
    loading,
    className = ""
}) => {
    return (
        <div className={`mb-6 ${className}`}>
            <h1 className="text-2xl font-bold text-brand-primary">{title}</h1>
            <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-gray-500">
                    Fuente: <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono text-brand-primary/80">{source}</code>
                </p>
                <span className="text-gray-300">·</span>
                {loading ? (
                    <div className="h-4 w-24 bg-gray-100 animate-pulse rounded" />
                ) : (
                    <p className="text-sm text-gray-500">
                        <span className="font-semibold text-gray-800">{totalCount}</span> registros totales cargados
                        {filteredCount !== undefined && filteredCount !== totalCount && (
                            <span className="ml-1.5 text-brand-primary font-medium animate-in fade-in slide-in-from-left-2 duration-300">
                                · {filteredCount} filtrados
                            </span>
                        )}
                    </p>
                )}
            </div>
        </div>
    );
};

export default ListHeader;
