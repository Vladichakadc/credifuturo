import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, Users, AlertTriangle, Inbox, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import ListHeader from '../../components/admin/ListHeader';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import { useSortTable, SortIcon } from '../../utils/useSortTable';

// Configuración de columnas de la tabla (mapeo completo de Tabla_Clientes)
// PK de negocio: customerId (Customer_id del Excel fuente)
// id (autoincrement interno) se oculta de la tabla pública — solo uso técnico interno
const TABLE_COLUMNS = [
    { key: 'customerId', label: 'Customer ID', align: 'center', minWidth: '100px', highlight: true },
    { key: 'cedula', label: 'Cédula', align: 'left', minWidth: '130px', highlight: true },
    { key: 'name', label: 'Nombre', align: 'left', minWidth: '150px' },
    { key: 'surname1', label: '1er Apellido', align: 'left', minWidth: '130px' },
    { key: 'surname2', label: '2do Apellido', align: 'left', minWidth: '130px' },
    { key: 'genero', label: 'Género', align: 'center', minWidth: '80px' },
    { key: 'email', label: 'Correo', align: 'left', minWidth: '200px' },
    { key: 'pais', label: 'País', align: 'left', minWidth: '100px' },
    { key: 'ciudad', label: 'Ciudad', align: 'left', minWidth: '110px' },
    { key: 'tipoCliente', label: 'Tipo Cliente', align: 'center', minWidth: '120px' },
    { key: 'socioFundador', label: 'Socio Fundador', align: 'center', minWidth: '130px' },
    { key: 'referido', label: 'Referido', align: 'left', minWidth: '140px' },
    { key: 'cargo', label: 'Cargo', align: 'left', minWidth: '140px' },
    { key: 'fechaIngreso', label: 'Fecha Ingreso', align: 'center', minWidth: '120px', isDate: true },
    { key: 'fechaBaja', label: 'Fecha Baja', align: 'center', minWidth: '120px', isDate: true },
    { key: 'estatus', label: 'Estatus', align: 'center', minWidth: '110px', isBadge: true },
];

const ITEMS_PER_PAGE = 20;


// ——— Status Badge ———
const StatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-400 text-xs italic">—</span>;

    const normalized = value.trim().toLowerCase();
    const isActive = normalized === 'activo' || normalized === 'active';

    return (
        <span
            className={`
                inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide
                ${isActive
                    ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                    : 'bg-red-100 text-red-700 ring-1 ring-red-200'
                }
            `}
        >
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {value}
        </span>
    );
};

// ——— Socio Fundador Badge ———
const FundadorBadge = ({ value }) => {
    if (!value) return <span className="text-gray-400 text-xs">—</span>;
    const isSI = value.trim().toUpperCase() === 'SI';
    return (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${isSI ? 'bg-amber-100 text-amber-800' : 'text-gray-500'}`}>
            {value}
        </span>
    );
};

// ——— Cell Renderer ———
const CellValue = ({ column, value }) => {
    if (column.isBadge) return <StatusBadge value={value} />;
    if (column.key === 'socioFundador') return <FundadorBadge value={value} />;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (value === null || value === undefined || value === '') {
        return <span className="text-gray-300 text-xs italic">—</span>;
    }
    // Highlight primary columns
    if (column.highlight) {
        return <span className="font-semibold text-gray-900">{value}</span>;
    }
    return <span className="text-gray-700">{value}</span>;
};

import { useSearchParams } from 'react-router-dom';

const ClientListPage = () => {
    const { toast } = useUi();
    const [searchParams] = useSearchParams();

    // States
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'Todos');
    const [currentPage, setCurrentPage] = useState(1);

    // Fetch clients from backend
    const fetchClients = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Updated to support potential backend filtering if we want, 
            // but for now we fetch all and filter client-side for better UX
            const res = await api.get('/admin/clients/list');
            if (res.data && res.data.ok) {
                setClients(res.data.data);
            } else {
                throw new Error(res.data?.error || 'Respuesta inesperada del servidor');
            }
        } catch (err) {
            console.error('Error fetching client list:', err);
            setError(err.message || 'Error al conectar con el servidor');
            setClients([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchClients();
    }, [fetchClients]);

    // Client-side filtering (Search + Status)
    const filteredClients = useMemo(() => {
        let results = clients;

        // Apply Status Filter
        if (statusFilter !== 'Todos') {
            const term = statusFilter.toLowerCase();
            results = results.filter(c =>
                c.estatus && c.estatus.toLowerCase().startsWith(term)
            );
        }

        // Apply Search Term Filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            results = results.filter(c =>
                (c.name && c.name.toLowerCase().includes(term)) ||
                (c.surname1 && c.surname1.toLowerCase().includes(term)) ||
                (c.surname2 && c.surname2.toLowerCase().includes(term)) ||
                (c.cedula && c.cedula.toLowerCase().includes(term)) ||
                (c.customerId && c.customerId.toLowerCase().includes(term)) ||
                (c.email && c.email.toLowerCase().includes(term)) ||
                (c.ciudad && c.ciudad.toLowerCase().includes(term))
            );
        }

        return results;
    }, [clients, searchTerm, statusFilter]);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    // Paginated data
    const { sortedData: sortedClients, sortConfig: clientSort, handleSort: handleClientSort } = useSortTable(filteredClients);

    const paginatedClients = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedClients.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedClients, currentPage]);

    // Derive distinct statuses from loaded clients (no extra API call needed)
    const availableStatuses = useMemo(() => [
        ...new Set(clients.map(c => c.estatus?.trim()).filter(Boolean))
    ].sort(), [clients]);

    const handleExport = () => {
        if (filteredClients.length === 0) {
            toast.error('No hay datos para exportar.');
            return;
        }
        const dataToExport = filteredClients.map(c => ({
            'Customer_id': c.customerId ?? '',
            'Nombre': c.name ?? '',
            '1 Apellido': c.surname1 ?? '',
            '2 Apellido': c.surname2 ?? '',
            'Estado': c.estatus ?? '',
            'Genero': c.genero ?? '',
            'Pais': c.pais ?? '',
            'Ciudad': c.ciudad ?? '',
            'Tipo de Cliente': c.tipoCliente ?? '',
            'Concatenar': [c.name, c.surname1, c.surname2].filter(Boolean).join(' '),
            'Socio Fundador': c.socioFundador ?? '',
            'Referido': c.referido ?? '',
            'Cargo': c.cargo ?? '',
            'Fecha de Ingreso': formatDate(c.fechaIngreso),
            'Fecha de baja': formatDate(c.fechaBaja),
            'Cedula': c.cedula ?? '',
            'Correo': c.email ?? '',
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Socios');
        XLSX.writeFile(wb, 'Tabla_Clientes.xlsx');
        toast.success('Reporte exportado: Tabla_Clientes.xlsx');
    };

    const totalPages = Math.max(1, Math.ceil(filteredClients.length / ITEMS_PER_PAGE));

    // ——— RENDER: LOADING STATE ———
    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
                        <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
                    </div>
                </div>
                <Card>
                    <CardContent className="p-0">
                        <div className="p-6 space-y-4">
                            {/* Skeleton rows */}
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="flex gap-4 items-center">
                                    <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                                    <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
                                    <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ——— RENDER: ERROR STATE ———
    if (error) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-brand-dark">Lista de Clientes</h1>
                    <p className="text-gray-500">Tabla completa de socios registrados</p>
                </div>
                <Card>
                    <CardContent className="p-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                            <AlertTriangle className="h-8 w-8 text-red-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No se pudo cargar la lista</h3>
                        <p className="text-gray-500 mb-6 max-w-md mx-auto">{error}</p>
                        <Button onClick={fetchClients} className="bg-brand-primary hover:bg-brand-dark">
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reintentar
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ——— RENDER: MAIN TABLE ———
    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-brand-primary/10">
                        <Users className="h-5 w-5 text-brand-primary" />
                    </div>
                    <ListHeader
                        title="Lista de Clientes"
                        source="Tabla_Clientes"
                        totalCount={clients.length}
                        filteredCount={filteredClients.length}
                        loading={loading}
                        className="mb-0"
                    />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                    {/* Status Filter - Rediseñado */}
                    <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-2 rounded-xl border-2 border-emerald-200/80 shadow-sm transition-all hover:shadow-lg hover:border-emerald-300 w-full sm:w-auto">
                        <Users className="h-4 w-4 text-emerald-600" />
                        <select
                            aria-label="Filtrar por estado de socio"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="text-sm font-bold text-emerald-900 bg-transparent border-none focus:ring-0 cursor-pointer outline-none p-0"
                        >
                            <option value="Todos">Todos</option>
                            {availableStatuses.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Search Box - Rediseñado */}
                    <div className="relative flex-1 lg:w-64 w-full">
                        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border-2 border-gray-200/80 shadow-sm transition-all hover:shadow-lg hover:border-gray-300 w-full h-full">
                            <Search className="h-4 w-4 text-gray-400" />
                            <input
                                id="search-clients"
                                aria-label="Buscar socio"
                                type="text"
                                placeholder="Buscar socio..."
                                className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-800 placeholder:text-gray-400 p-0"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="secondary" onClick={handleExport} title="Exportar a Excel" className="px-3">
                            <Download className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Exportar</span>
                        </Button>

                        <Button variant="ghost" onClick={fetchClients} title="Recargar datos" className="px-2.5">
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* EMPTY STATE */}
            {filteredClients.length === 0 && !loading ? (
                <Card>
                    <CardContent className="p-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                            <Inbox className="h-8 w-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Sin registros</h3>
                        <p className="text-gray-500 text-sm">
                            {searchTerm
                                ? `No se encontraron socios que coincidan con "${searchTerm}"`
                                : 'No hay socios registrados en el sistema.'}
                        </p>
                        {searchTerm && (
                            <Button
                                variant="ghost"
                                onClick={() => setSearchTerm('')}
                                className="mt-4 text-brand-primary hover:text-brand-dark"
                            >
                                Limpiar búsqueda
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Table Container */}
                    <Card className="overflow-hidden border-none shadow-none bg-transparent">
                        <div className="table-container max-h-[70vh] overflow-y-auto">
                            <table className="premium-table" id="clients-list-table">
                                {/* Sticky Header */}
                                <thead>
                                    <tr className="bg-brand-primary text-white">
                                        {TABLE_COLUMNS.map(col => (
                                            <th key={col.key} className="sticky top-0 z-10 bg-brand-primary cursor-pointer select-none hover:bg-brand-dark transition-colors" style={{ textAlign: col.align, minWidth: col.minWidth }} onClick={() => handleClientSort(col.key)}>
                                                <span className="inline-flex items-center gap-1">{col.label}<SortIcon colKey={col.key} sortConfig={clientSort} /></span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>

                                {/* Body with zebra striping */}
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedClients.map((client, rowIdx) => (
                                        <tr key={client.customerId || client.id} className={`transition-colors duration-150 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                            {TABLE_COLUMNS.map(col => (
                                                <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }} className={col.key === 'customerId' ? 'font-mono text-xs' : ''}>
                                                    <CellValue column={col} value={client[col.key]} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-4">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                            </Button>
                            <span className="text-sm text-gray-600 font-medium">
                                Página{' '}
                                <span className="font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-md">
                                    {currentPage}
                                </span>
                                {' '}de {totalPages}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ClientListPage;
