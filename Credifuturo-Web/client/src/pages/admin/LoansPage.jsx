import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { notifyUpdate } from '../../utils/sync';
import { Plus, Download, Edit, Trash2, FileText, X, Save, Search, Calendar, DollarSign, User, Loader2, CheckCircle, Calculator, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Label, FormField } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import * as XLSX from 'xlsx';

const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

import { useUi } from '../../context/UiContext';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../../utils/banks';

const LoansPage = () => {
    const { toast } = useUi();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('disbursed'); // 'disbursed' | 'requests'

    // Data States
    const [clients, setClients] = useState([]);
    const [loans, setLoans] = useState([]); // Requests
    const [disbursedLoans, setDisbursedLoans] = useState([]); // Active
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Processing overlay
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMsg, setProcessingMsg] = useState({ title: '', lines: [] });

    // Alerta de préstamo activo para refinanciación
    const [activeLoanWarning, setActiveLoanWarning] = useState(null);

    // Form States
    const [loanForm, setLoanForm] = useState({
        clientId: '', amount: '', date: '', purpose: ''
    });

    const [disbursedForm, setDisbursedForm] = useState({
        id: '',
        idVm: '',
        clientId: '',
        nombre: '',
        apellido: '',
        estado: 'Pendiente',
        fechaPrestamo: new Date().toISOString().split('T')[0],
        mesDesembolso: monthNames[new Date().getMonth()],
        anioDesembolso: new Date().getFullYear(),
        valorPrestado: '',
        cuotas: '1',
        interesMensual: '',
        diasPagoMax: '',
        itemQuantity: '1',
        banco: '',
        numeroTransaccion: '',
        cuentaAhorros: '',
        observaciones: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    // AUTO-OPEN: When navigated via sidebar "Ingresar Préstamo" (?action=new)
    useEffect(() => {
        if (searchParams.get('action') === 'new' && !loading && clients.length > 0) {
            handleOpenDisbursedModal(); // Open create modal
            // Clear the param so it doesn't re-trigger on tab change, etc.
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, loading, clients]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [resLoans, resDisbursed, resClients] = await Promise.all([
                api.get('/admin/loans'),
                api.get('/admin/disbursed-loans'),
                api.get('/admin/clients')
            ]);
            setLoans(resLoans.data);
            setDisbursedLoans(resDisbursed.data);
            setClients(resClients.data);
        } catch (err) {
            console.error('Error fetching loans:', err);
            toast.error(err.message || 'Error al cargar los datos');
        } finally {
            setLoading(false);
        }
    };

    // --- Helpers ---
    const autoIncrementDisbursedLoanId = () => {
        if (!disbursedLoans || disbursedLoans.length === 0) return 'SOL1';
        const solPattern = /^SOL(\d+)$/;
        const solNumbers = disbursedLoans
            .map(l => l.idVm || l.orderId)
            .filter(id => id && solPattern.test(id))
            .map(id => parseInt(id.match(solPattern)[1]))
            .filter(n => !isNaN(n));

        if (solNumbers.length === 0) return 'SOL1';
        return `SOL${Math.max(...solNumbers) + 1}`;
    };

    // --- Handlers for Disbursed Loans ---

    // Auto-calculate Month/Year when date changes
    useEffect(() => {
        if (!disbursedForm.fechaPrestamo) return;
        const [yearStr, monthStr] = disbursedForm.fechaPrestamo.split('-');
        const mes = parseInt(monthStr) - 1;
        const anio = parseInt(yearStr);
        setDisbursedForm(prev => ({
            ...prev,
            mesDesembolso: monthNames[mes] || '',
            anioDesembolso: isNaN(anio) ? '' : anio
        }));
    }, [disbursedForm.fechaPrestamo]);

    // Auto-fill Client Name + verificar préstamo activo (solo en modo creación)
    useEffect(() => {
        if (!disbursedForm.clientId) {
            setActiveLoanWarning(null);
            return;
        }
        const client = clients.find(c => c.id.toString() === disbursedForm.clientId.toString());
        if (client) {
            setDisbursedForm(prev => ({
                ...prev,
                nombre: client.name || '',
                apellido: `${client.surname1 || ''} ${client.surname2 || ''}`.trim()
            }));
        }
        // Solo verificar en modo creación (no al editar)
        if (isEditing) return;
        setActiveLoanWarning(null);
        api.get(`/admin/clients/${disbursedForm.clientId}/active-loan`)
            .then(res => {
                if (res.data.tienePrestamoActivo) setActiveLoanWarning(res.data.prestamo);
            })
            .catch(() => {}); // silencioso; no bloquea el formulario
    }, [disbursedForm.clientId, clients, isEditing]);

    const handleOpenDisbursedModal = (loan = null) => {
        if (loan) {
            setIsEditing(true);
            setDisbursedForm({
                ...loan,
                nombre: loan.nombre || '',
                apellido: loan.apellido || '',
                // Convert stored decimal to % for display (0.015 -> 1.5)
                interesMensual: loan.interesMensual ? parseFloat((parseFloat(loan.interesMensual) * 100).toFixed(4)) : ''
            });
        } else {
            setIsEditing(false);
            setDisbursedForm({
                id: '',
                idVm: '',
                clientId: '',
                nombre: '',
                apellido: '',
                estado: 'Vigente',
                fechaPrestamo: new Date().toISOString().split('T')[0],
                mesDesembolso: monthNames[new Date().getMonth()],
                anioDesembolso: new Date().getFullYear(),
                valorPrestado: '',
                cuotas: '1',
                interesMensual: '',
                diasPagoMax: '',
                itemQuantity: '1',
                banco: '',
                numeroTransaccion: '',
                cuentaAhorros: '',
                observaciones: ''
            });
        }
        setActiveLoanWarning(null);
        setActiveTab('disbursed');
        setIsModalOpen(true);
    };

    const handleSubmitDisbursed = async (e) => {
        e.preventDefault();
        try {
            if (!disbursedForm.valorPrestado || parseFloat(disbursedForm.valorPrestado) <= 0) {
                toast.error('El valor prestado debe ser mayor a 0');
                return;
            }

            const cuotas = parseInt(disbursedForm.cuotas) || 0;
            // interesMensual in form is stored as % (e.g. 1.5). Convert to decimal for backend (0.015).
            const interessPct = parseFloat(disbursedForm.interesMensual) || 0;
            const interes = parseFloat((interessPct / 100).toFixed(6));

            if (interessPct < 0 || interessPct > 100) {
                toast.error('El interés mensual debe estar entre 0% y 100%.');
                return;
            }

            // Confirmación explícita si hay refinanciación pendiente
            if (!isEditing && activeLoanWarning) {
                const fmt = n => Number(n).toLocaleString('es-CO');
                const ok = window.confirm(
                    `⚠️  REFINANCIACIÓN — CONFIRMAR ACCIÓN\n\n` +
                    `El socio tiene el préstamo ${activeLoanWarning.idVm} (Estado: Vigente).\n\n` +
                    `Al continuar se aplicarán los siguientes cambios:\n` +
                    `  • Saldo pendiente: $${fmt(activeLoanWarning.saldoPendiente)}\n` +
                    `  • ${activeLoanWarning.cuotasPendientes} cuota(s) — Estado Pago: Pendiente → PAGO\n` +
                    `  • ${activeLoanWarning.cuotasPendientes} cuota(s) — Estado Préstamo: Pendiente → CANCELADO\n` +
                    `  • Interés condonado: $${fmt(activeLoanWarning.interesCondonable)}\n` +
                    `  • Préstamo ${activeLoanWarning.idVm}: Vigente → CANCELADO\n\n` +
                    `Esta acción NO se puede deshacer. ¿Continuar?`
                );
                if (!ok) return;
            }

            // Show processing overlay
            setIsModalOpen(false);
            if (isEditing) {
                setProcessingMsg({
                    title: 'Actualizando préstamo...',
                    lines: [
                        'Guardando cambios del desembolso',
                        `Recalculando ${cuotas} cuotas con interés ${interessPct.toFixed(2)}% mensual`,
                        'Sincronizando tabla Estado de Préstamos',
                    ]
                });
            } else if (activeLoanWarning) {
                setProcessingMsg({
                    title: 'Procesando refinanciación...',
                    lines: [
                        `Cancelando préstamo anterior ${activeLoanWarning.idVm}`,
                        `Saldando ${activeLoanWarning.cuotasPendientes} cuota(s) sin interés`,
                        'Registrando nuevo desembolso',
                        `Generando ${cuotas} cuotas nuevas`,
                    ]
                });
            } else {
                setProcessingMsg({
                    title: 'Procesando nuevo desembolso...',
                    lines: [
                        'Registrando datos del préstamo',
                        `Calculando tabla de amortización para ${cuotas} cuotas`,
                        `Interés mensual: ${interessPct.toFixed(2)}% — generando fechas de pago`,
                        'Guardando en Estado de Préstamos',
                    ]
                });
            }
            setIsProcessing(true);

            const payload = { ...disbursedForm, interesMensual: interes };

            if (isEditing) {
                await api.put(`/admin/disbursed-loans/${disbursedForm.id}`, payload);
                toast.success('Préstamo actualizado y tabla de cuotas regenerada');
            } else {
                const res = await api.post('/admin/disbursed-loans', payload);
                const ref = res.data.refinanciacion;
                if (ref && ref.idVmAnterior) {
                    const fmt = n => Number(n).toLocaleString('es-CO');
                    toast.success(
                        `✅ Refinanciación completada — Préstamo anterior ${ref.idVmAnterior} cancelado. ` +
                        `${ref.cuotasSaldadas} cuota(s) saldadas, interés condonado: $${fmt(ref.interesCondonado)}`
                    );
                } else {
                    toast.success(`Préstamo registrado: ${cuotas} cuotas generadas automáticamente`);
                }
            }
            setActiveLoanWarning(null);
            fetchData();
            notifyUpdate('loans');
        } catch (error) {
            console.error('Error saving disbursed loan:', error);
            toast.error('Error al guardar: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteDisbursed = async (loan) => {
        if (window.confirm(`¿Está seguro de eliminar el préstamo ${loan.idVm} y todas sus cuotas asociadas?`)) {
            try {
                setProcessingMsg({
                    title: 'Eliminando préstamo...',
                    lines: [
                        `Eliminando desembolso ${loan.idVm}`,
                        'Borrando cuotas de Estado de Préstamos',
                        'Liberando registros asociados',
                    ]
                });
                setIsProcessing(true);
                await api.delete(`/admin/disbursed-loans/${loan.id}`);
                toast.success(`Préstamo ${loan.idVm} y sus cuotas eliminados`);
                fetchData();
                notifyUpdate('loans');
            } catch (error) {
                toast.error('Error al eliminar: ' + (error.response?.data?.error || error.message));
            } finally {
                setIsProcessing(false);
            }
        }
    };

    // --- Columns Configuration ---
    const disbursedColumns = [
        { header: 'ID Préstamo', accessorKey: 'idVm', className: 'font-bold text-brand-primary w-24' },
        {
            header: 'Socio',
            accessorKey: 'clientId',
            render: (row) => {
                const client = clients.find(c => c.id === row.clientId);
                return client ? `${client.name} ${client.surname1}` : 'Desconocido';
            }
        },
        {
            header: 'Monto Prestado',
            accessorKey: 'valorPrestado',
            render: (row) => `$${parseFloat(row.valorPrestado || 0).toLocaleString('es-CO')}`,
            className: 'font-mono text-gray-700'
        },
        { header: 'Fecha', accessorKey: 'fechaPrestamo' },
        {
            header: 'Estado',
            accessorKey: 'estado',
            render: (row) => (
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${row.estado === 'Activo' ? 'bg-green-100 text-green-700' :
                    row.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                    }`}>
                    {row.estado}
                </span>
            )
        }
    ];

    const requestColumns = [
        {
            header: 'Socio',
            accessorKey: 'clientId',
            render: (row) => {
                const client = clients.find(c => c.id === row.clientId);
                return client ? `${client.name} ${client.surname1}` : 'Desconocido';
            }
        },
        {
            header: 'Monto Solicitado',
            accessorKey: 'amount',
            render: (row) => `$${parseFloat(row.amount || 0).toLocaleString('es-CO')}`,
            className: 'font-mono font-bold text-brand-primary'
        },
        { header: 'Fecha Estimada', accessorKey: 'date' },
        { header: 'Propósito', accessorKey: 'purpose' }
    ];

    const exportToExcel = (data, tableType) => {
        const isDisbursed = tableType === 'disbursed';

        const mappedData = data.map(loan => {
            const client = clients.find(c => c.id === loan.clientId);

            if (isDisbursed) {
                return {
                    'id_vm': loan.idVm ?? '',
                    'customer_id': client ? client.customerId : '',
                    'nombre': client ? client.name : '',
                    'apellido': client ? client.surname1 : '',
                    'estado': loan.estado ?? '',
                    'fecha de prestamo': loan.fechaPrestamo ?? '',
                    'mes desembolso': loan.mesDesembolso ?? '',
                    'año desembolso': loan.anioDesembolso ?? '',
                    'valor prestado': parseFloat(loan.valorPrestado || 0),
                    '# cuotas': loan.cuotas ?? '',
                    'interes mensual': parseFloat(loan.interesMensual || 0),
                    'dias pago max': loan.diasPagoMax ?? '',
                    'item_quantity': loan.itemQuantity ?? '',
                    'banco desembolsado': loan.banco ?? '',
                    '# transaccion': loan.numeroTransaccion ?? '',
                    'cuenta de ahorros': loan.cuentaAhorros ?? '',
                    'observaciones': loan.observaciones ?? ''
                };
            }

            // Fallback for Requests tab
            return {
                'id_vm': loan.idVm || loan.orderId || '',
                'customer_id': client ? client.customerId : '',
                'nombre': client ? client.name : '',
                'apellido': client ? client.surname1 : '',
                'monto solicitado': parseFloat(loan.amount || 0),
                'proposito': loan.purpose ?? '',
                'fecha solicitada': loan.date ?? '',
                'estado': loan.status ?? 'Pendiente'
            };
        });

        const ws = XLSX.utils.json_to_sheet(mappedData);

        const columnFormats = isDisbursed ? {
            'valor prestado': '"$"#,##0',
            'interes mensual': '0.00%'
        } : {
            'monto solicitado': '"$"#,##0'
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
        XLSX.utils.book_append_sheet(wb, ws, "Reporte");

        const outputFilename = isDisbursed ? '1-orders_table_prestamos_desembolsados.xlsx' : 'Solicitudes_Prestamos_Web.xlsx';
        XLSX.writeFile(wb, outputFilename);
        toast.success(`${outputFilename} descargado`);
    };

    const handleValidateStatuses = async () => {
        try {
            const res = await api.post('/admin/validate-loan-statuses');
            toast.success(res.data.message);
            if (res.data.fixed > 0) {
                fetchData();
                notifyUpdate('loans');
            }
        } catch (err) {
            toast.error('Error al validar préstamos: ' + (err.response?.data?.error || err.message));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary">Gestión de Préstamos</h1>
                    <p className="text-gray-500">Administre préstamos activos y nuevas solicitudes.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => exportToExcel(activeTab === 'disbursed' ? disbursedLoans : loans, activeTab)}>
                        <Download className="mr-2 h-4 w-4" /> Exportar
                    </Button>
                    {activeTab === 'disbursed' && (
                        <>
                            <Button variant="outline" onClick={handleValidateStatuses} title="Marcar como Cancelado los préstamos con todas sus cuotas pagadas">
                                <CheckCircle className="mr-2 h-4 w-4 text-green-600" /> Validar Estados
                            </Button>
                            <Button onClick={() => handleOpenDisbursedModal()}>
                                <Plus className="mr-2 h-4 w-4" /> Nuevo Desembolso
                            </Button>
                        </>
                    )}
                </div>
            </div>


            <Card>
                <CardContent className="p-0">
                    <DataTable
                        columns={disbursedColumns}
                        data={disbursedLoans}
                        isLoading={loading}
                        searchKeys={['idVm', 'clientId']}
                        actions={{
                            onEdit: handleOpenDisbursedModal,
                            onDelete: handleDeleteDisbursed
                        }}
                    />
                </CardContent>
            </Card>

            {/* Modal for Disbursed Loans */}
            {isModalOpen && activeTab === 'disbursed' && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-8 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
                            <h2 className="text-xl font-bold text-brand-primary">
                                {isEditing ? 'Editar Préstamo' : 'Registrar Nuevo Desembolso'}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitDisbursed} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <FormField label="1. Id_VM (Auto)">
                                    <Input
                                        value={disbursedForm.idVm || '(Generado al Guardar)'}
                                        readOnly
                                        className="bg-white font-bold text-gray-400 italic"
                                    />
                                </FormField>
                                <div className="md:col-span-3 grid grid-cols-3 gap-4">
                                    <div className="col-span-1">
                                        <Label>2. Customer ID (Socio)</Label>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                            value={disbursedForm.clientId}
                                            onChange={(e) => setDisbursedForm({ ...disbursedForm, clientId: e.target.value })}
                                            required
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            {clients.map(c => (
                                                <option key={c.id} value={c.id}>{c.customerId} - {c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <FormField label="3. Nombre">
                                        <Input value={disbursedForm.nombre} readOnly className="bg-gray-100" />
                                    </FormField>
                                    <FormField label="4. Apellido">
                                        <Input value={disbursedForm.apellido} readOnly className="bg-gray-100" />
                                    </FormField>
                                </div>

                            {/* ── ALERTA: PRÉSTAMO VIGENTE DETECTADO ── */}
                            {!isEditing && activeLoanWarning && (
                                <div className="md:col-span-4 flex gap-3 bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm">
                                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 space-y-1.5">
                                        <p className="font-bold text-amber-800">
                                            Préstamo vigente detectado — {activeLoanWarning.idVm}
                                        </p>
                                        <p className="text-amber-700">
                                            Al registrar este nuevo préstamo, el sistema cancelará automáticamente el préstamo anterior:
                                        </p>
                                        <ul className="text-amber-700 space-y-0.5 ml-1">
                                            <li>• Saldo pendiente: <strong>${Number(activeLoanWarning.saldoPendiente).toLocaleString('es-CO')}</strong></li>
                                            <li>• <strong>{activeLoanWarning.cuotasPendientes}</strong> cuota(s) pendiente(s) — columna <em>Estado Pago</em>: <strong>Pendiente → PAGO</strong></li>
                                            <li>• <strong>{activeLoanWarning.cuotasPendientes}</strong> cuota(s) pendiente(s) — columna <em>Estado Préstamo</em>: <strong>Pendiente → CANCELADO</strong></li>
                                            <li>• Interés condonado (no cobrado): <strong>${Number(activeLoanWarning.interesCondonable).toLocaleString('es-CO')}</strong></li>
                                            <li>• Préstamo <strong>{activeLoanWarning.idVm}</strong> — <em>Estado del préstamo</em>: <strong>Vigente → CANCELADO</strong></li>
                                        </ul>
                                        <p className="text-amber-600 text-xs font-medium mt-1">
                                            ⚠️ Esta acción no se puede deshacer. Se pedirá confirmación antes de guardar.
                                        </p>
                                    </div>
                                </div>
                            )}
                            </div>

                            {/* Row 2: Status & Time */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <FormField label="5. Estado">
                                    <select
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none"
                                        value={disbursedForm.estado}
                                        onChange={(e) => setDisbursedForm({ ...disbursedForm, estado: e.target.value })}
                                    >
                                        <option value="Vigente">Vigente</option>
                                        <option value="Cancelado">Cancelado</option>
                                    </select>
                                </FormField>
                                <FormField label="6. Fecha Prestamo">
                                    <Input
                                        type="date"
                                        value={disbursedForm.fechaPrestamo}
                                        onChange={(e) => setDisbursedForm({ ...disbursedForm, fechaPrestamo: e.target.value })}
                                        required
                                    />
                                </FormField>
                                <FormField label="7. Mes Desembolso">
                                    <Input value={disbursedForm.mesDesembolso} readOnly className="bg-white" />
                                </FormField>
                                <FormField label="8. Año Desembolso">
                                    <Input value={disbursedForm.anioDesembolso} readOnly className="bg-white" />
                                </FormField>
                            </div>

                            {/* Row 3: Financials */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-green-50 p-4 rounded-lg border border-green-100">
                                <FormField label="9. Valor Prestado">
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                                        <Input
                                            type="number"
                                            className="pl-7 font-bold text-lg text-green-700"
                                            value={disbursedForm.valorPrestado}
                                            onChange={(e) => setDisbursedForm({ ...disbursedForm, valorPrestado: e.target.value })}
                                            required
                                        />
                                    </div>
                                </FormField>
                                <FormField label="10. # Cuotas">
                                    <Input
                                        type="number"
                                        value={disbursedForm.cuotas}
                                        onChange={(e) => setDisbursedForm({ ...disbursedForm, cuotas: e.target.value })}
                                        className="font-bold"
                                        required
                                    />
                                </FormField>
                                <FormField label="11. Interés Mensual (%)">
                                    <div className="relative">
                                        <Input
                                            type="number" step="0.01" min="0" max="100"
                                            value={disbursedForm.interesMensual}
                                            onChange={(e) => setDisbursedForm({ ...disbursedForm, interesMensual: e.target.value })}
                                            placeholder="Ej: 1.5"
                                            className="pr-8"
                                        />
                                        <span className="absolute right-3 top-2.5 text-gray-400 font-semibold">%</span>
                                    </div>
                                </FormField>
                                <FormField label="12. Dias Pago Max">
                                    <Input
                                        type="number"
                                        value={disbursedForm.diasPagoMax}
                                        onChange={(e) => setDisbursedForm({ ...disbursedForm, diasPagoMax: e.target.value })}
                                    />
                                </FormField>
                            </div>

                            {/* Row 4: Details & Banking */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <FormField label="13. Item Quantity">
                                    <Input
                                        type="number"
                                        value={disbursedForm.itemQuantity}
                                        onChange={(e) => setDisbursedForm({ ...disbursedForm, itemQuantity: e.target.value })}
                                    />
                                </FormField>
                                <FormField label="14. Banco Desembolsado">
                                    <select
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                                        value={disbursedForm.banco}
                                        onChange={(e) => setDisbursedForm({ ...disbursedForm, banco: e.target.value })}
                                    >
                                        <option value="">-- Seleccionar Banco --</option>
                                        {COLOMBIAN_BANKS_WITH_OTHER.map(bank => (
                                            <option key={bank} value={bank}>{bank}</option>
                                        ))}
                                    </select>
                                </FormField>
                                <FormField label="15. # Transaccion">
                                    <Input value={disbursedForm.numeroTransaccion} onChange={(e) => setDisbursedForm({ ...disbursedForm, numeroTransaccion: e.target.value })} />
                                </FormField>
                                <FormField label="16. Cuenta de Ahorros">
                                    <Input value={disbursedForm.cuentaAhorros} onChange={(e) => setDisbursedForm({ ...disbursedForm, cuentaAhorros: e.target.value })} />
                                </FormField>
                            </div>

                            <FormField label="17. Observaciones">
                                <Input
                                    value={disbursedForm.observaciones}
                                    onChange={(e) => setDisbursedForm({ ...disbursedForm, observaciones: e.target.value })}
                                />
                            </FormField>

                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" size="lg">
                                    <Save className="mr-2 h-4 w-4" />
                                    {isEditing ? 'Guardar Cambios' : 'Registrar Préstamo'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ====== PROCESSING OVERLAY ====== */}
            {isProcessing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.82)', backdropFilter: 'blur(6px)' }}>
                    <div className="bg-white rounded-2xl shadow-2xl px-10 py-10 flex flex-col items-center gap-5 min-w-[340px] max-w-md animate-fadeIn">
                        {/* Animated spinner ring */}
                        <div className="relative flex items-center justify-center w-20 h-20">
                            <div className="absolute w-20 h-20 rounded-full border-4 border-blue-100"></div>
                            <div className="absolute w-20 h-20 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
                            <Calculator className="w-8 h-8 text-blue-600" />
                        </div>

                        {/* Title */}
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-brand-primary">{processingMsg.title}</h3>
                            <p className="text-sm text-gray-400 mt-1">Por favor espere...</p>
                        </div>

                        {/* Step list */}
                        <ul className="w-full space-y-2">
                            {processingMsg.lines.map((line, idx) => (
                                <li key={idx} className="flex items-center gap-3 text-sm text-gray-600">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center">
                                        <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" style={{ animationDelay: idx * 0.2 + 's' }} />
                                    </span>
                                    {line}
                                </li>
                            ))}
                        </ul>

                        {/* Footer note */}
                        <p className="text-xs text-gray-400 text-center border-t border-gray-100 pt-3 w-full">
                            Calculando cuotas con las condiciones aprobadas
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoansPage;
