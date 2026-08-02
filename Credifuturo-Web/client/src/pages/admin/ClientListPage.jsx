import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiWithRetry } from '../../config/api';
import api from '../../config/api';
import {
    Search, RefreshCw, Users, AlertTriangle, Inbox, Download, ChevronLeft, ChevronRight,
    Filter, Building2, Tag, Award, PercentDiamond, XCircle, MoreVertical, Eye, Pencil, PowerOff, Power
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useUi } from '../../context/UiContext';
import ListHeader from '../../components/admin/ListHeader';
import StatusMultiSelect from '../../components/admin/StatusMultiSelect';
import PillSingleSelect from '../../components/admin/PillSingleSelect';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { exportToExcel, formatDate } from '../../utils/excelUtils';
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
    // Columna unificada: el valor que se muestra y se audita es SIEMPRE
    // porcentajePrestamo (la tasa de perfil) — es el único que usan de verdad
    // el Simulador y el formulario de Nuevo Desembolso. Si el socio tiene un
    // préstamo activo este año con una tasa DISTINTA, se marca como aviso; si
    // coincide o no tiene préstamo, no se satura la celda con una segunda cifra.
    { key: 'porcentajePrestamo', label: '% Préstamos', align: 'center', minWidth: '140px', isRate: true },
];

const ITEMS_PER_PAGE = 20;

// ——— Status Badge (estandarizado sobre el primitivo Badge) ———
const StatusBadge = ({ value }) => {
    if (!value) return <span className="text-gray-400 text-xs italic">—</span>;
    const normalized = value.trim().toLowerCase();
    const isActive = normalized === 'activo' || normalized === 'active';
    return (
        <Badge variant={isActive ? 'success' : 'error'}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {value}
        </Badge>
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
const CellValue = ({ column, value, row = {} }) => {
    if (column.isBadge) return <StatusBadge value={value} />;
    if (column.key === 'socioFundador') return <FundadorBadge value={value} />;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;

    // Columna % Préstamos (unificada): el valor mostrado es SIEMPRE porcentajePrestamo
    // (la tasa de perfil), porque es el único que usan el Simulador y el formulario de
    // Nuevo Desembolso — mostrar cualquier otra cosa aquí sería mostrar un número que
    // en la práctica no se usa en ningún lado. Si además hay un préstamo activo este año
    // con una tasa distinta, se avisa (posible desincronización a revisar); si coincide
    // o no tiene préstamo, no se agrega ruido visual.
    if (column.isRate) {
        const efectivo = row.porcentajeEfectivo;
        const fuente = row.porcentajeFuente;
        const tienePrestamoActivo = fuente === 'loan';
        const perfilVacio = value === null || value === undefined || value === '';

        if (perfilVacio) {
            return (
                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-red-500 text-xs font-bold" title="Sin tasa de perfil asignada — el Simulador y Nuevo Desembolso usarán la tasa vigente por defecto, no necesariamente la correcta para este socio.">
                        — sin asignar
                    </span>
                    {tienePrestamoActivo && (
                        <span className="text-[9px] text-gray-400">préstamo activo: {Number(efectivo).toFixed(2)}%</span>
                    )}
                </div>
            );
        }

        const perfilPct = Number(value) * 100;
        const hayDesincronizacion = tienePrestamoActivo && Math.abs(Number(efectivo) - perfilPct) > 0.001;

        return (
            <div className="flex flex-col items-center gap-0.5">
                <span className="font-mono font-bold text-sm" style={{ color: '#166534' }}>
                    {perfilPct.toFixed(2)}%
                </span>
                {hayDesincronizacion && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-bold leading-none"
                        title={`El préstamo activo de este socio quedó desembolsado a ${Number(efectivo).toFixed(2)}%, distinto a su tasa de perfil actual.`}>
                        ⚠ préstamo a {Number(efectivo).toFixed(2)}%
                    </span>
                )}
            </div>
        );
    }

    if (value === null || value === undefined || value === '') {
        return <span className="text-gray-300 text-xs italic">—</span>;
    }
    // Highlight primary columns
    if (column.highlight) {
        return <span className="font-semibold text-gray-900">{value}</span>;
    }
    return <span className="text-gray-700">{value}</span>;
};

// ——— Menú de acciones por fila (Ver / Editar / Desactivar-Reactivar) ———
const RowActions = ({ client, onView, onEdit, onToggleStatus }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    const isActive = (client.estatus || '').trim().toLowerCase().startsWith('activo');
    const item = 'flex w-full items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors';
    return (
        <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-label="Acciones del socio"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
                <MoreVertical className="h-4 w-4" />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                    <button className={item} onClick={() => { setOpen(false); onView(client); }}>
                        <Eye className="h-4 w-4 text-gray-500" /> Ver ficha
                    </button>
                    <button className={item} onClick={() => { setOpen(false); onEdit(client); }}>
                        <Pencil className="h-4 w-4 text-gray-500" /> Editar
                    </button>
                    <div className="border-t border-gray-100" />
                    {isActive ? (
                        <button className={`${item} text-red-600`} onClick={() => { setOpen(false); onToggleStatus(client, 'deactivate'); }}>
                            <PowerOff className="h-4 w-4" /> Desactivar
                        </button>
                    ) : (
                        <button className={`${item} text-emerald-700`} onClick={() => { setOpen(false); onToggleStatus(client, 'reactivate'); }}>
                            <Power className="h-4 w-4" /> Reactivar
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const ClientListPage = () => {
    const { toast } = useUi();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // States
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Filtros multi-faceta
    const initialStatus = searchParams.get('status');
    const [statusSel, setStatusSel] = useState(initialStatus && initialStatus !== 'Todos' ? [initialStatus] : []);
    const [tipoSel, setTipoSel] = useState([]);
    const [fundadorSel, setFundadorSel] = useState('');
    const [ciudadSel, setCiudadSel] = useState('');
    const [soloSinTasa, setSoloSinTasa] = useState(false);

    // Confirmación de (des)activación
    const [confirmTarget, setConfirmTarget] = useState(null); // { client, action }
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Fetch clients from backend (full set; el filtrado/orden/paginación es client-side
    // para respuesta instantánea — el volumen de socios es pequeño. El backend ya
    // soporta paginación/filtros server-side vía params si el padrón crece.)
    const fetchClients = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiWithRetry(() => api.get('/admin/clients/list'));
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

    // Opciones de cada faceta derivadas de los datos cargados (sin llamadas extra)
    const uniqueSorted = (key) => [...new Set(clients.map(c => c[key]?.toString().trim()).filter(Boolean))].sort();
    const availableStatuses = useMemo(() => uniqueSorted('estatus'), [clients]);
    const availableTipos = useMemo(() => uniqueSorted('tipoCliente'), [clients]);
    const availableFundador = useMemo(() => uniqueSorted('socioFundador'), [clients]);
    const availableCiudades = useMemo(() => uniqueSorted('ciudad'), [clients]);

    const activeFilterCount =
        statusSel.length + tipoSel.length + (fundadorSel ? 1 : 0) + (ciudadSel ? 1 : 0) + (soloSinTasa ? 1 : 0);

    const clearFilters = () => {
        setStatusSel([]); setTipoSel([]); setFundadorSel(''); setCiudadSel(''); setSoloSinTasa(false); setSearchTerm('');
    };

    // Filtrado client-side (búsqueda + facetas)
    const filteredClients = useMemo(() => {
        let results = clients;

        if (statusSel.length) {
            const set = new Set(statusSel.map(s => s.toLowerCase()));
            results = results.filter(c => c.estatus && set.has(c.estatus.trim().toLowerCase()));
        }
        if (tipoSel.length) {
            const set = new Set(tipoSel);
            results = results.filter(c => c.tipoCliente && set.has(c.tipoCliente.trim()));
        }
        if (fundadorSel) {
            results = results.filter(c => (c.socioFundador || '').trim() === fundadorSel);
        }
        if (ciudadSel) {
            results = results.filter(c => (c.ciudad || '').trim() === ciudadSel);
        }
        if (soloSinTasa) {
            // "Sin tasa" = sin tasa EFECTIVA (ni manual ni por préstamo activo)
            results = results.filter(c => c.porcentajeEfectivo === null || c.porcentajeEfectivo === undefined);
        }

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
    }, [clients, searchTerm, statusSel, tipoSel, fundadorSel, ciudadSel, soloSinTasa]);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusSel, tipoSel, fundadorSel, ciudadSel, soloSinTasa]);

    const { sortedData: sortedClients, sortConfig: clientSort, handleSort: handleClientSort } = useSortTable(filteredClients);

    const paginatedClients = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedClients.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedClients, currentPage]);

    // Navegación a la ficha 360°
    const goToDetail = (client) => navigate(`/admin/clients/${client.id}`);
    const goToEdit = (client) => navigate(`/admin/clients/${client.id}?edit=1`);

    // (Des)activar socio
    const requestToggle = (client, action) => setConfirmTarget({ client, action });
    const runToggle = async () => {
        if (!confirmTarget) return;
        const { client, action } = confirmTarget;
        setConfirmLoading(true);
        try {
            if (action === 'deactivate') {
                await api.delete(`/admin/clients/${client.id}`); // soft-delete: desactiva
                toast.success(`${client.name || 'Socio'} desactivado.`);
            } else {
                await api.put(`/admin/clients/${client.id}`, { estatus: 'Activo' });
                toast.success(`${client.name || 'Socio'} reactivado.`);
            }
            setConfirmTarget(null);
            await fetchClients();
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo actualizar el estado del socio.');
        } finally {
            setConfirmLoading(false);
        }
    };

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
            '% Prestamo': c.porcentajeEfectivo != null ? Number(c.porcentajeEfectivo) : '',
        }));
        const { success, error: exportErr } = exportToExcel(
            dataToExport,
            'Tabla_Clientes',
            'Socios',
            { '% Prestamo': '0.00"%"' }
        );
        if (success) toast.success('Reporte exportado: Tabla_Clientes.xlsx');
        else toast.error(exportErr || 'No se pudo exportar.');
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

            {/* Barra de filtros multi-faceta */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <div className="flex items-center gap-2 bg-white px-4 rounded-xl border-2 border-gray-200/80 shadow-sm transition-all hover:shadow-lg hover:border-gray-300 h-11">
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

                <StatusMultiSelect
                    options={availableStatuses}
                    selectedValues={statusSel}
                    onChange={setStatusSel}
                    labelPrefix="Estatus"
                    icon={Users}
                />
                {availableTipos.length > 0 && (
                    <StatusMultiSelect
                        options={availableTipos}
                        selectedValues={tipoSel}
                        onChange={setTipoSel}
                        labelPrefix="Tipo"
                        icon={Tag}
                    />
                )}
                {availableFundador.length > 0 && (
                    <PillSingleSelect
                        options={availableFundador}
                        selectedValue={fundadorSel}
                        onChange={setFundadorSel}
                        labelPrefix="Fundador"
                        icon={Award}
                    />
                )}
                {availableCiudades.length > 0 && (
                    <PillSingleSelect
                        options={availableCiudades}
                        selectedValue={ciudadSel}
                        onChange={setCiudadSel}
                        labelPrefix="Ciudad"
                        icon={Building2}
                    />
                )}
                <button
                    onClick={() => setSoloSinTasa(v => !v)}
                    className={`inline-flex items-center gap-2 px-4 rounded-xl border-2 shadow-sm transition-all h-11 text-sm font-bold ${
                        soloSinTasa
                            ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                            : 'bg-white border-gray-200/80 text-gray-600 hover:border-amber-300 hover:text-amber-700'
                    }`}
                    title="Mostrar solo socios sin tasa de préstamo efectiva"
                >
                    <PercentDiamond className="h-4 w-4" /> Sin tasa
                </button>

                {activeFilterCount > 0 && (
                    <button
                        onClick={clearFilters}
                        className="inline-flex items-center gap-1.5 px-3 h-11 rounded-xl text-sm font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <XCircle className="h-4 w-4" /> Limpiar ({activeFilterCount})
                    </button>
                )}
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
                            {activeFilterCount > 0 || searchTerm
                                ? 'No se encontraron socios que coincidan con los filtros aplicados.'
                                : 'No hay socios registrados en el sistema.'}
                        </p>
                        {(activeFilterCount > 0 || searchTerm) && (
                            <Button variant="ghost" onClick={clearFilters} className="mt-4 text-brand-primary hover:text-brand-dark">
                                Limpiar filtros
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
                                <thead>
                                    <tr className="bg-brand-primary text-white">
                                        {TABLE_COLUMNS.map(col => (
                                            <th key={col.key} className="sticky top-0 z-10 bg-brand-primary cursor-pointer select-none hover:bg-brand-dark transition-colors" style={{ textAlign: col.align, minWidth: col.minWidth }} onClick={() => handleClientSort(col.key)}>
                                                <span className="inline-flex items-center gap-1">{col.label}<SortIcon colKey={col.key} sortConfig={clientSort} /></span>
                                            </th>
                                        ))}
                                        <th className="sticky top-0 z-10 bg-brand-primary text-center" style={{ minWidth: '70px' }}>Acciones</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-gray-100">
                                    {paginatedClients.map((client, rowIdx) => (
                                        <tr
                                            key={client.customerId || client.id}
                                            onClick={() => goToDetail(client)}
                                            className={`cursor-pointer transition-colors duration-150 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}
                                            title="Ver ficha del socio"
                                        >
                                            {TABLE_COLUMNS.map(col => (
                                                <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }} className={col.key === 'customerId' ? 'font-mono text-xs' : ''}>
                                                    <CellValue column={col} value={client[col.key]} row={client} />
                                                </td>
                                            ))}
                                            <td className="text-center">
                                                <RowActions
                                                    client={client}
                                                    onView={goToDetail}
                                                    onEdit={goToEdit}
                                                    onToggleStatus={requestToggle}
                                                />
                                            </td>
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

            {/* Confirmación de (des)activación */}
            <ConfirmDialog
                open={!!confirmTarget}
                title={confirmTarget?.action === 'deactivate' ? 'Desactivar socio' : 'Reactivar socio'}
                message={
                    confirmTarget?.action === 'deactivate'
                        ? `Se marcará a ${confirmTarget?.client?.name || 'este socio'} como Desactivado. Su historial se conserva y podrás reactivarlo después.`
                        : `Se reactivará a ${confirmTarget?.client?.name || 'este socio'} (estatus Activo).`
                }
                confirmLabel={confirmTarget?.action === 'deactivate' ? 'Desactivar' : 'Reactivar'}
                variant={confirmTarget?.action === 'deactivate' ? 'danger' : 'primary'}
                loading={confirmLoading}
                onConfirm={runToggle}
                onClose={() => !confirmLoading && setConfirmTarget(null)}
            />
        </div>
    );
};

export default ClientListPage;
