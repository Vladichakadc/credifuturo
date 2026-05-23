import React, { useState, useMemo } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Search,
    MoreVertical,
    Edit,
    Trash2,
    FileText
} from 'lucide-react';
import { Input } from './Input';
import { Button } from './Button';
import { cn } from '../../utils/cn';
import { Card } from './Card';
import { useSortTable, SortIcon } from '../../utils/useSortTable';

const DataTable = ({
    columns,
    data,
    isLoading,
    searchable = true,
    searchKeys = ['name'],
    actions, // { onEdit, onDelete, onView }
    pagination = true,
    itemsPerPage = 10
}) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRowAction, setActiveRowAction] = useState(null);

    // Filter Data
    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        return data.filter(item =>
            searchKeys.some(key => {
                const value = item[key];
                return value && value.toString().toLowerCase().includes(searchTerm.toLowerCase());
            })
        );
    }, [data, searchTerm, searchKeys]);

    // Sort Data
    const { sortedData, sortConfig, handleSort } = useSortTable(filteredData);

    // Pagination Logic
    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentData = pagination ? sortedData.slice(startIndex, startIndex + itemsPerPage) : sortedData;

    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const toggleActions = (id) => {
        if (activeRowAction === id) {
            setActiveRowAction(null);
        } else {
            setActiveRowAction(id);
        }
    };

    // Close actions when clicking outside (simple implementation)
    React.useEffect(() => {
        const handleClickOutside = () => setActiveRowAction(null);
        if (activeRowAction) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [activeRowAction]);

    if (isLoading) {
        return (
            <Card className="w-full p-6 space-y-4">
                <div className="h-10 bg-gray-100 rounded w-1/3 animate-pulse" />
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
                    ))}
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header Actions */}
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-ui-border shadow-sm">
                {searchable && (
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1); // Reset to first page
                            }}
                            className="pl-9"
                        />
                    </div>
                )}
                <div className="text-sm text-gray-500">
                    Mostrando {currentData.length} de {filteredData.length} registros
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border border-ui-border bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-ui-border">
                            <tr className="text-left">
                                {columns.map((col, idx) => (
                                    <th
                                        key={idx}
                                        className={cn(
                                            "h-12 px-4 align-middle font-medium text-gray-500 cursor-pointer select-none hover:bg-gray-100 transition-colors",
                                            col.className
                                        )}
                                        onClick={() => col.accessorKey && handleSort(col.accessorKey)}
                                    >
                                        <span className="inline-flex items-center gap-0.5">
                                            {col.header}
                                            {col.accessorKey && <SortIcon colKey={col.accessorKey} sortConfig={sortConfig} />}
                                        </span>
                                    </th>
                                ))}
                                {actions && <th className="h-12 px-4 text-right">Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {currentData.length > 0 ? (
                                currentData.map((row, rowIndex) => (
                                    <tr
                                        key={rowIndex}
                                        className="border-b border-ui-border transition-colors hover:bg-gray-50/50 last:border-0"
                                    >
                                        {columns.map((col, colIndex) => (
                                            <td key={colIndex} className="p-4 align-middle">
                                                {col.render ? col.render(row) : row[col.accessorKey]}
                                            </td>
                                        ))}

                                        {actions && (
                                            <td className="p-4 align-middle text-right">
                                                <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => toggleActions(rowIndex)}
                                                    >
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>

                                                    {activeRowAction === rowIndex && (
                                                        <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                                                            <div className="py-1" role="menu">
                                                                {actions.onEdit && (
                                                                    <button
                                                                        onClick={() => { actions.onEdit(row); setActiveRowAction(null); }}
                                                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                                                    >
                                                                        <Edit className="mr-2 h-4 w-4 text-blue-500" /> Editar
                                                                    </button>
                                                                )}
                                                                {actions.onView && (
                                                                    <button
                                                                        onClick={() => { actions.onView(row); setActiveRowAction(null); }}
                                                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                                                    >
                                                                        <FileText className="mr-2 h-4 w-4 text-gray-500" /> Ver Detalles
                                                                    </button>
                                                                )}
                                                                {actions.onDelete && (
                                                                    <button
                                                                        onClick={() => { actions.onDelete(row); setActiveRowAction(null); }}
                                                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                                                                    >
                                                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={columns.length + (actions ? 1 : 0)} className="h-24 text-center">
                                        <p className="text-gray-500">No se encontraron resultados.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {pagination && totalPages > 1 && (
                <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                    </Button>
                    <div className="text-sm font-medium">
                        Página {currentPage} de {totalPages}
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                    >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    );
};

export default DataTable;
