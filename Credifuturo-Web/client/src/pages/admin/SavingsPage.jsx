import React, { useState, useEffect, useMemo } from 'react';
import api from '../../config/api';
import { notifyUpdate } from '../../utils/sync';
import { useSearchParams } from 'react-router-dom';
import { Plus, Download, Edit, Trash2, X, RefreshCw, Search, Filter, FileDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import SavingFormModal from '../../components/admin/SavingFormModal';
import * as XLSX from 'xlsx';
import { useUi } from '../../context/UiContext';

// ——— Small reusable select ———
const FilterSelect = ({ id, label, value, onChange, options, allLabel = 'Todos' }) => (
    <div className="flex flex-col gap-1 min-w-[130px]">
        <label htmlFor={id} className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {label}
        </label>
        <select
            id={id}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 font-medium focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary outline-none"
        >
            <option value="">{allLabel}</option>
            {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    </div>
);

const SavingsPage = () => {
    const { toast } = useUi();
    const [searchParams, setSearchParams] = useSearchParams();

    // Data States
    const [savings, setSavings] = useState([]);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal/Form States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Filter States (Parte D)
    const [searchTerm, setSearchTerm] = useState('');
    const [filterYear, setFilterYear] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // Fila en edición (null cuando el modal está creando un ahorro nuevo).
    // El formulario y sus cálculos de penalización viven dentro de SavingFormModal.
    const [editingSaving, setEditingSaving] = useState(null);

    // ——— Fetch Data ———
    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [resClients, resSavings] = await Promise.all([
                api.get('/admin/clients'),
                api.get('/admin/savings')
            ]);
            setClients(Array.isArray(resClients.data) ? resClients.data : []);
            // Sort DESC by ID_VM (externalId)
            const raw = Array.isArray(resSavings.data) ? resSavings.data : [];
            const sorted = [...raw].sort((a, b) => {
                const getNum = (id) => {
                    if (!id) return 0;
                    const match = String(id).match(/\d+/);
                    return match ? parseInt(match[0], 10) : 0;
                };
                return getNum(b.externalId) - getNum(a.externalId); // DESC
            });
            setSavings(sorted);
        } catch (err) {
            console.error('Error fetching savings/clients:', err);
            setError(err.message || 'No se pudieron cargar los datos');
            setSavings([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // AUTO-OPEN: When navigated via sidebar "Ingresar Ahorro" (?action=new)
    useEffect(() => {
        if (searchParams.get('action') === 'new' && !loading && clients.length > 0) {
            handleOpenModal(); // Open create modal
            setSearchParams({}, { replace: true }); // Clear param
        }
    }, [searchParams, loading, clients]);

    const handleOpenModal = (saving = null) => {
        setIsEditing(!!saving);
        setEditingSaving(saving);
        setIsModalOpen(true);
    };

    const handleDelete = async (row) => {
        if (window.confirm('¿Estás seguro de eliminar este registro de ahorro?')) {
            try {
                await api.delete(`/admin/savings/${row.id}`);
                toast.success('Registro eliminado');
                fetchData();
                notifyUpdate('savings');
            } catch (err) {
                toast.error('Error al eliminar: ' + (err.response?.data?.error || err.message));
            }
        }
    };

    // ——— Parte D: Derived filter values ———
    const availableYears = useMemo(() => {
        const years = new Set(savings.map(s => s.year).filter(Boolean));
        return Array.from(years).sort((a, b) => b - a); // DESC
    }, [savings]);

    const availableStatuses = useMemo(() => {
        const statuses = new Set(savings.map(s => s.status).filter(Boolean));
        return Array.from(statuses).sort();
    }, [savings]);

    // ——— Parte D: Filtered savings (Año, Estado, Nombre/Apellido) ———
    const filteredSavings = useMemo(() => {
        let result = savings;

        // Filter by Año
        if (filterYear) {
            result = result.filter(s => String(s.year) === String(filterYear));
        }

        // Filter by Estado
        if (filterStatus) {
            result = result.filter(s => s.status === filterStatus);
        }

        // Search by Nombre o Apellido (case-insensitive, tolerant)
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            result = result.filter(s => {
                const client = clients.find(c => c.id === s.clientId);
                const nombre = ((client?.name || '') + ' ' + (client?.surname1 || '') + ' ' + (client?.surname2 || ''))
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const idVm = (s.externalId || '').toLowerCase();
                return nombre.includes(term) || idVm.includes(term);
            });
        }

        return result;
    }, [savings, clients, filterYear, filterStatus, searchTerm]);

    const exportToExcel = () => {
        const dataToExport = filteredSavings.map(s => {
            const client = clients.find(c => c.id === s.clientId);
            return {
                Id_VM: s.externalId ?? '',
                Customer_id: client ? client.customerId : '',
                Nombre: client ? client.name : '',
                Apellido: client ? client.surname1 : '',
                Estado: s.status ?? '',
                'Fecha Pago': s.date ?? '',
                'Año pago': s.year ?? '',
                'Mes pago': s.month ?? '',
                Penalizacion: s.penalizacion ?? '',
                'Dias Penalizacion': s.diasPenalizacion || 0,
                'Valor Mensual': parseFloat(s.amount || 0),
                'Valor a Penalizar': parseFloat(s.valorAPenalizar || 0),
                'Valor Ahorrado': parseFloat(s.valorAhorrado || 0),
                'Mes Abonado': s.mesAbonado ?? '',
                'Año Abonado': s.anioAbonado ?? '',
                Item_Quantity: s.itemQuantity ?? '',
                Banco: s.banco ?? '',
                '# Transaccion': s.numeroTransaccion ?? '',
                'Desde Cuenta de Ahorros': s.origen ?? '',
                'Tipo de Ahorro': s.type ?? '',
                Observaciones: s.observaciones ?? ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);

        const columnFormats = {
            'Valor Mensual': '"$"#,##0',
            'Valor a Penalizar': '"$"#,##0',
            'Valor Ahorrado': '"$"#,##0'
        };

        const range = XLSX.utils.decode_range(ws['!ref']);
        const headerRow = range.s.r;

        const colIndexes = {};
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const headCell = ws[XLSX.utils.encode_cell({ c: C, r: headerRow })];
            if (headCell && headCell.v) colIndexes[headCell.v] = C;
        }

        Object.entries(columnFormats).forEach(([headerName, formatCode]) => {
            const C = colIndexes[headerName];
            if (C !== undefined) {
                for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                    const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
                    const cell = ws[cellAddress];
                    if (cell && cell.t === 'n') {
                        cell.z = formatCode;
                    }
                }
            }
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
        XLSX.writeFile(wb, '1-orders_table_ahorro_mensual.xlsx');
        toast.success('1-orders_table_ahorro_mensual.xlsx descargado');
    };

    // Columns — explicit text colors to fix "no se ven las letras" issue
    const columns = [
        { header: 'ID_VM', accessorKey: 'externalId', className: 'font-bold text-brand-primary w-24' },
        {
            header: 'Socio',
            accessorKey: 'clientId',
            render: (row) => {
                const client = clients.find(c => c.id === row.clientId);
                return <span className="text-gray-800 font-medium">{client ? `${client.name} ${client.surname1}` : '—'}</span>;
            }
        },
        {
            header: 'Fecha',
            accessorKey: 'date',
            render: (row) => <span className="text-gray-700 font-mono text-xs">{row.date || '—'}</span>
        },
        {
            header: 'Monto',
            accessorKey: 'amount',
            render: (row) => <span className="font-bold text-gray-800">${parseFloat(row.amount || 0).toLocaleString('es-CO')}</span>,
        },
        {
            header: 'Estado',
            accessorKey: 'status',
            render: (row) => (
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${row.status === 'Abono' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {row.status || '—'}
                </span>
            )
        },
        {
            header: 'Año',
            accessorKey: 'year',
            render: (row) => <span className="text-gray-700">{row.year || '—'}</span>
        },
        {
            header: 'Mes',
            accessorKey: 'month',
            render: (row) => <span className="text-gray-700">{row.month || '—'}</span>
        },
        {
            header: 'Soporte',
            accessorKey: 'soporte',
            render: (row) => {
                if (!row.soporte) return <span className="text-gray-400 text-xs">—</span>;
                return (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-brand-primary h-8 w-8 p-0"
                        title={`Descargar: ${row.soporte.name}`}
                        onClick={() => {
                            const link = document.createElement('a');
                            link.href = `${api.defaults.baseURL}/admin/savings/${row.id}/soporte`;
                            link.setAttribute('download', row.soporte.name);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }}
                    >
                        <FileDown className="h-4 w-4" />
                    </Button>
                );
            }
        }
    ];

    // ——— Error state ———
    if (error && !loading && savings.length === 0) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary">Gestión de Ahorros</h1>
                    <p className="text-gray-500">Administre los aportes mensuales y ahorros de los socios.</p>
                </div>
                <Card><CardContent className="p-12 text-center">
                    <p className="text-red-600 font-medium mb-4">{error}</p>
                    <Button onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Reintentar</Button>
                </CardContent></Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ——— Header ——— */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary">Gestión de Ahorros</h1>
                    <p className="text-gray-600 text-sm mt-0.5">
                        {filteredSavings.length} de {savings.length} registros
                        {savings.length > 0 && <span className="text-gray-400 ml-1">• Ordenados por fecha más reciente</span>}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={fetchData} title="Recargar desde servidor">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="secondary" onClick={exportToExcel}>
                        <Download className="mr-2 h-4 w-4" /> Exportar Excel
                    </Button>
                    <Button onClick={() => handleOpenModal()}>
                        <Plus className="mr-2 h-4 w-4" /> Nuevo Ahorro
                    </Button>
                </div>
            </div>

            {/* ── Mini-KPI Bar ─────────────────────────────────────────────────── */}
            {!loading && savings.length > 0 && (() => {
                const currentYear = new Date().getFullYear();
                const prevYear = currentYear - 1;

                const abonosSoloMensuales = savings.filter(s => s.type !== 'Aporte Inicial');

                // Ahorro promedio por socio activo (año actual, neto)
                const porSocioMap = {};
                abonosSoloMensuales.filter(s => (s.anioAbonado || s.year) === currentYear).forEach(s => {
                    const id = s.clientId || s.client_id;
                    porSocioMap[id] = (porSocioMap[id] || 0) + parseFloat(s.valorAhorrado || 0);
                });
                const sociosConAhorro = Object.values(porSocioMap);
                const ahorroPromedio = sociosConAhorro.length > 0
                    ? sociosConAhorro.reduce((a, b) => a + b, 0) / sociosConAhorro.length : 0;

                // Crecimiento interanual
                const totalActual = abonosSoloMensuales
                    .filter(s => (s.anioAbonado || s.year) === currentYear)
                    .reduce((s, r) => s + parseFloat(r.valorAhorrado || 0), 0);
                const totalAnterior = abonosSoloMensuales
                    .filter(s => (s.anioAbonado || s.year) === prevYear)
                    .reduce((s, r) => s + parseFloat(r.valorAhorrado || 0), 0);
                const crecimiento = totalAnterior > 0 ? ((totalActual - totalAnterior) / totalAnterior) * 100 : null;

                // Penalidades del año actual
                const penalidades = savings
                    .filter(s => (s.anioAbonado || s.year) === currentYear && s.valorAPenalizar > 0)
                    .reduce((s, r) => s + parseFloat(r.valorAPenalizar || 0), 0);
                const sociosConPenalidad = new Set(
                    savings.filter(s => (s.anioAbonado || s.year) === currentYear && s.valorAPenalizar > 0).map(s => s.clientId)
                ).size;

                const kpis = [
                    {
                        label: 'Ahorro Promedio / Socio',
                        value: `$${Math.round(ahorroPromedio).toLocaleString('es-CO')}`,
                        sub: `${sociosConAhorro.length} socios con ahorros en ${currentYear}`,
                        color: 'border-l-emerald-400', icon: '👤',
                    },
                    {
                        label: `Crecimiento vs ${prevYear}`,
                        value: crecimiento === null ? 'N/A' : `${crecimiento >= 0 ? '+' : ''}${crecimiento.toFixed(1)}%`,
                        sub: crecimiento === null ? 'Sin datos del año anterior' : crecimiento >= 0 ? `▲ Más que en ${prevYear}` : `▼ Menos que en ${prevYear}`,
                        color: crecimiento === null ? 'border-l-gray-300' : crecimiento >= 0 ? 'border-l-emerald-400' : 'border-l-red-400',
                        icon: crecimiento === null ? '📊' : crecimiento >= 0 ? '📈' : '📉',
                    },
                    {
                        label: `Penalidades ${currentYear}`,
                        value: penalidades > 0 ? `$${Math.round(penalidades).toLocaleString('es-CO')}` : '$0',
                        sub: penalidades > 0 ? `${sociosConPenalidad} socio(s) con retraso` : 'Sin recargos por mora este año',
                        color: penalidades > 0 ? 'border-l-amber-400' : 'border-l-emerald-400', icon: penalidades > 0 ? '⚠️' : '✓',
                    },
                ];
                return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {kpis.map((k, i) => (
                            <div key={i} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${k.color} p-4 flex items-center gap-3 shadow-sm`}>
                                <span className="text-2xl flex-shrink-0">{k.icon}</span>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{k.label}</p>
                                    <p className="text-xl font-black text-gray-900 font-mono leading-tight">{k.value}</p>
                                    <p className="text-[10px] text-gray-500 font-medium">{k.sub}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* ——— PARTE D: Filter Bar ——— */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Search by Nombre/Apellido */}
                        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <label htmlFor="search-savings" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                Buscar por Nombre / Apellido
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    id="search-savings"
                                    type="text"
                                    placeholder="Ej: García, López..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 h-9 rounded-md border border-gray-300 bg-white text-sm text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary outline-none"
                                />
                            </div>
                        </div>

                        {/* Filtro Año */}
                        <FilterSelect
                            id="filter-year"
                            label="Filtrar por Año"
                            value={filterYear}
                            onChange={v => setFilterYear(v)}
                            options={availableYears}
                            allLabel="Todos los años"
                        />

                        {/* Filtro Estado */}
                        <FilterSelect
                            id="filter-status"
                            label="Filtrar por Estado"
                            value={filterStatus}
                            onChange={v => setFilterStatus(v)}
                            options={availableStatuses}
                            allLabel="Todos los estados"
                        />

                        {/* Clear Filters */}
                        {(searchTerm || filterYear || filterStatus) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setSearchTerm(''); setFilterYear(''); setFilterStatus(''); }}
                                className="text-gray-500 hover:text-gray-700 self-end"
                            >
                                <X className="h-3.5 w-3.5 mr-1" /> Limpiar
                            </Button>
                        )}
                    </div>

                    {/* Active filter chips */}
                    {(filterYear || filterStatus) && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {filterYear && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-primary/10 text-brand-primary">
                                    📅 Año: {filterYear}
                                    <button onClick={() => setFilterYear('')} className="ml-1 hover:text-brand-dark"><X className="h-3 w-3" /></button>
                                </span>
                            )}
                            {filterStatus && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-gold/20 text-amber-700">
                                    🏷️ Estado: {filterStatus}
                                    <button onClick={() => setFilterStatus('')} className="ml-1 hover:text-amber-900"><X className="h-3 w-3" /></button>
                                </span>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ——— Table ——— */}
            <Card>
                <CardContent className="p-0">
                    <DataTable
                        columns={columns}
                        data={filteredSavings}
                        isLoading={loading}
                        searchable={false}
                        actions={{
                            onEdit: handleOpenModal,
                            onDelete: handleDelete
                        }}
                    />
                </CardContent>
            </Card>

            {/* ——— Modal (Nuevo Ahorro / Editar Ahorro) ——— */}
            <SavingFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                isEditing={isEditing}
                initialSaving={editingSaving}
                clients={clients}
                savings={savings}
                onSaved={() => { fetchData(); notifyUpdate('savings'); }}
            />
        </div>
    );
};

export default SavingsPage;
