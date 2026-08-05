import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { notifyUpdate } from '../../utils/sync';
import { Plus, Download, Edit, Trash2, FileText, X, Save, Search, Calendar, DollarSign, User, Loader2, CheckCircle, Calculator, AlertTriangle, ChevronDown, Users, ShieldCheck, Activity, Percent, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Label, FormField } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

import { useUi } from '../../context/UiContext';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../../utils/banks';
import { calcVerdict } from '../../utils/loanCapacity';

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

    // ── Datos derivados para tarjetas y gráficas (estado real: 'Vigente' / 'Cancelado' —
    // nunca 'Activo' ni 'Pendiente', que es lo que el Mini-KPI Bar anterior comprobaba
    // por error y por eso "Capital Vigente" y "Préstamos Activos" siempre mostraban $0) ──
    const loanStats = useMemo(() => {
        const vigentes = disbursedLoans.filter(l => (l.estado || '').trim() === 'Vigente');
        const cancelados = disbursedLoans.filter(l => (l.estado || '').trim() === 'Cancelado');
        const capitalTotal = disbursedLoans.reduce((s, l) => s + parseFloat(l.valorPrestado || l.monto || 0), 0);
        const capitalVigente = vigentes.reduce((s, l) => s + parseFloat(l.valorPrestado || l.monto || 0), 0);
        const tasaPromedio = vigentes.length > 0
            ? vigentes.reduce((s, l) => s + parseFloat(l.interesMensual || 0), 0) / vigentes.length
            : 0;
        return { vigentes, cancelados, capitalTotal, capitalVigente, tasaPromedio };
    }, [disbursedLoans]);

    // Desembolsos por mes — orden cronológico real (no alfabético), últimos 12 con datos.
    const desembolsosPorMes = useMemo(() => {
        const map = {};
        disbursedLoans.forEach(l => {
            if (!l.mesDesembolso || !l.anioDesembolso) return;
            const mIdx = monthNames.indexOf(l.mesDesembolso);
            if (mIdx === -1) return;
            const key = `${l.anioDesembolso}-${String(mIdx).padStart(2, '0')}`;
            if (!map[key]) map[key] = { key, anio: l.anioDesembolso, mesIdx: mIdx, monto: 0, count: 0 };
            map[key].monto += parseFloat(l.valorPrestado || l.monto || 0);
            map[key].count += 1;
        });
        return Object.values(map)
            .sort((a, b) => a.key.localeCompare(b.key))
            .slice(-12)
            .map(r => ({ ...r, label: `${monthNames[r.mesIdx].slice(0, 3)} ${String(r.anio).slice(2)}` }));
    }, [disbursedLoans]);

    // Top socios por capital prestado (histórico, todos los estados) — comparación con
    // nombres largos → barras horizontales, orden descendente.
    const topSociosPorMonto = useMemo(() => {
        const byClient = {};
        disbursedLoans.forEach(l => {
            const key = String(l.clientId);
            if (!byClient[key]) byClient[key] = 0;
            byClient[key] += parseFloat(l.valorPrestado || l.monto || 0);
        });
        return Object.entries(byClient)
            .map(([clientId, monto]) => {
                const c = clients.find(cl => String(cl.id) === clientId);
                const nombre = c ? `${c.name} ${c.surname1 || ''}`.trim() : `Socio ${clientId}`;
                return { nombre, monto };
            })
            .sort((a, b) => b.monto - a.monto)
            .slice(0, 6);
    }, [disbursedLoans, clients]);

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formStep, setFormStep] = useState(1); // 1 = Socio | 2 = Condiciones | 3 = Confirmación
    const [clientSearchModal, setClientSearchModal] = useState('');
    const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
    const clientDropdownRef = React.useRef(null);
    React.useEffect(() => {
        const h = (e) => { if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target)) setClientDropdownOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    // Processing overlay
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMsg, setProcessingMsg] = useState({ title: '', lines: [] });

    // Alerta de préstamo activo para refinanciación
    const [activeLoanWarning, setActiveLoanWarning] = useState(null);

    // Capacidad de crédito del socio seleccionado (regla 3× ahorro / mora EP) — misma
    // fuente que el Analizador de Capacidad y que ya bloquea POST /disbursed-loans en
    // el backend. Se trae al elegir socio para advertir en vivo, ANTES de llegar al
    // paso de confirmación y toparse con el rechazo del servidor.
    const [clientCapacity, setClientCapacity] = useState(null);

    // Prellenado desde una solicitud de préstamo aprobada (Aprobaciones de Préstamos → Desembolsar)
    const [prefillRequestId, setPrefillRequestId] = useState(null);

    // Filtro por socio en la tabla de desembolsos
    const [filterClientId, setFilterClientId] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = React.useRef(null);

    React.useEffect(() => {
        const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

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

    // AUTO-PREFILL: When navigated from Aprobaciones de Préstamos → "Desembolsar" (?prefillRequestId=N)
    useEffect(() => {
        const prefillId = searchParams.get('prefillRequestId');
        if (prefillId && !loading && clients.length > 0) {
            api.get(`/admin/loan-requests/${prefillId}`)
                .then(res => {
                    const request = res.data?.data;
                    if (!request) return;
                    setPrefillRequestId(request.id);
                    handleOpenDisbursedModal(null, {
                        clientId: request.clientId,
                        valorPrestado: request.amount,
                        cuotas: request.installments,
                        interesMensual: request.monthlyRate,
                        banco: request.banco || '',
                        cuentaAhorros: request.cuentaAhorros || ''
                    });
                })
                .catch(err => { console.error(err); toast.error('No se pudo cargar la solicitud para prellenar el formulario.'); });
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, loading, clients]); // eslint-disable-line react-hooks/exhaustive-deps

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
            setClientCapacity(null);
            return;
        }
        const client = clients.find(c => c.id.toString() === disbursedForm.clientId.toString());
        if (client) {
            setDisbursedForm(prev => ({
                ...prev,
                nombre: client.name || '',
                apellido: `${client.surname1 || ''} ${client.surname2 || ''}`.trim(),
                // Tasa asignada al socio (regla de devoluciones: 1,6% si retiró
                // ahorros el año anterior, 1,4% si no). Solo en creación; al
                // editar se respeta la tasa pactada del préstamo.
                ...(!isEditing && client.porcentajePrestamo
                    ? { interesMensual: parseFloat((Number(client.porcentajePrestamo) * 100).toFixed(4)) }
                    : {})
            }));
        }
        // Solo verificar en modo creación (no al editar)
        if (isEditing) return;
        setActiveLoanWarning(null);
        setClientCapacity(null);
        api.get(`/admin/clients/${disbursedForm.clientId}/active-loan`)
            .then(res => {
                if (res.data.tienePrestamoActivo) setActiveLoanWarning(res.data.prestamo);
            })
            .catch(() => {}); // silencioso; no bloquea el formulario
        // Capacidad de crédito (regla 3× / mora EP) — misma fuente que el Analizador y
        // que ya bloquea el guardado en el backend; se trae para advertir en vivo.
        api.get(`/admin/clients/${disbursedForm.clientId}/loan-capacity`)
            .then(res => setClientCapacity(res.data))
            .catch(() => {}); // silencioso; no bloquea el formulario
    }, [disbursedForm.clientId, clients, isEditing]);

    const handleOpenDisbursedModal = (loan = null, overrides = null) => {
        const today = new Date().toISOString().split('T')[0];
        if (loan) {
            setIsEditing(true);
            setDisbursedForm({
                ...loan,
                nombre: loan.nombre || '',
                apellido: loan.apellido || '',
                fechaPrestamo: today,
                interesMensual: loan.interesMensual ? parseFloat((parseFloat(loan.interesMensual) * 100).toFixed(4)) : ''
            });
        } else {
            setIsEditing(false);
            setDisbursedForm({
                id: '', idVm: '', clientId: '', nombre: '', apellido: '',
                estado: 'Vigente',
                fechaPrestamo: new Date().toISOString().split('T')[0],
                mesDesembolso: monthNames[new Date().getMonth()],
                anioDesembolso: new Date().getFullYear(),
                valorPrestado: '', cuotas: '1', interesMensual: '', diasPagoMax: '',
                itemQuantity: '1', banco: '', numeroTransaccion: '', cuentaAhorros: '', observaciones: '',
                ...(overrides || {})
            });
        }
        setActiveLoanWarning(null);
        setActiveTab('disbursed');
        setFormStep(1);
        setClientSearchModal('');
        setClientDropdownOpen(false);
        setIsModalOpen(true);
    };

    // gerenteAprueba: true cuando el gerente decide autorizar directamente un monto
    // que supera el cupo 3× sin votación, en vez de pasar por Aprobación de Préstamos.
    const handleSubmitDisbursed = async (e, gerenteAprueba = false) => {
        if (e && e.preventDefault) e.preventDefault();
        if (gerenteAprueba) {
            const ok = window.confirm(
                'Vas a aprobar este préstamo directamente como gerente, sin la votación completa de la Junta Administrativa.\n\n' +
                'Esta decisión queda registrada de forma permanente en el préstamo y en el log de seguridad.\n\n¿Confirmas?'
            );
            if (!ok) return;
        }
        try {
            if (!disbursedForm.valorPrestado || parseFloat(disbursedForm.valorPrestado) <= 0) {
                toast.error('El valor prestado debe ser mayor a 0');
                return;
            }

            const cuotas = parseInt(disbursedForm.cuotas) || 0;
            const interessPct = parseFloat(disbursedForm.interesMensual) || 0;
            const interes = parseFloat((interessPct / 100).toFixed(6));

            if (interessPct < 0 || interessPct > 100) {
                toast.error('El interés mensual debe estar entre 0% y 100%.');
                return;
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
            if (gerenteAprueba) {
                setProcessingMsg(prev => ({ ...prev, lines: [...prev.lines, 'Aprobación directa del gerente — sin votación de la Junta'] }));
            }
            setIsProcessing(true);

            // loanRequestId: si este desembolso viene de una solicitud ya votada y
            // aprobada por la Junta (Aprobación de Préstamos), el backend la usa para
            // eximir del tope 3× sin votación — ya pasó por el canal de gobierno correcto.
            const payload = { ...disbursedForm, interesMensual: interes, loanRequestId: prefillRequestId || null, gerenteAprueba };

            if (isEditing) {
                await api.put(`/admin/disbursed-loans/${disbursedForm.id}`, payload);
                toast.success('Préstamo actualizado y tabla de cuotas regenerada');
            } else {
                const res = await api.post('/admin/disbursed-loans', payload);
                const ref = res.data.refinanciacion;
                if (ref && ref.idVmAnterior) {
                    const fmt = n => Number(n).toLocaleString('es-CO');
                    const interesCausadoTxt = Number(ref.interesCausado) > 0
                        ? ` Interés cobrado por días transcurridos: $${fmt(ref.interesCausado)}.`
                        : '';
                    toast.success(
                        `✅ Refinanciación completada — Préstamo anterior ${ref.idVmAnterior} cancelado. ` +
                        `${ref.cuotasSaldadas} cuota(s) saldadas, interés condonado: $${fmt(ref.interesCondonado)}.` +
                        interesCausadoTxt,
                        9000 // mensaje largo, con cifras — 3s por defecto no alcanza a leerse
                    );
                } else if (gerenteAprueba) {
                    toast.success(
                        `✅ Préstamo aprobado directamente por el gerente (sin votación de la Junta) — ${cuotas} cuotas generadas automáticamente.`,
                        9000
                    );
                } else {
                    toast.success(`Préstamo registrado: ${cuotas} cuotas generadas automáticamente`, 6000);
                }
                if (prefillRequestId) {
                    try {
                        await api.put(`/admin/loan-requests/${prefillRequestId}/mark-disbursed`, {
                            disbursedLoanId: res.data.loan.id
                        });
                    } catch (linkErr) {
                        console.error('Error linking loan request to disbursed loan:', linkErr);
                        toast.error('El préstamo se registró pero no se pudo vincular con la solicitud original.');
                    } finally {
                        setPrefillRequestId(null);
                    }
                }
            }
            setActiveLoanWarning(null);
            fetchData();
            notifyUpdate('loans');
            // Crear/editar un desembolso también crea o regenera sus cuotas — sin esto,
            // PaymentsListPage (Lista de Pagos) solo escucha 'paymentsUpdated' y se queda
            // con datos viejos hasta que el admin la recargue manualmente.
            notifyUpdate('payments');
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
                const { data } = await api.delete(`/admin/disbursed-loans/${loan.id}`);
                if (data?.restauracion) {
                    toast.success(
                        `Préstamo ${loan.idVm} eliminado. Como era un retanqueo, el préstamo anterior ${data.restauracion.idVmAnterior} volvió a Vigente (${data.restauracion.cuotasRestauradas} cuota(s) de vuelta a Pendiente).`,
                        9000
                    );
                } else {
                    toast.success(`Préstamo ${loan.idVm} y sus cuotas eliminados`);
                }
                fetchData();
                notifyUpdate('loans');
                notifyUpdate('payments'); // sus cuotas también se borraron — refrescar Lista de Pagos
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


            {/* ── KPI Cards ────────────────────────────────────────────────────── */}
            {!loading && disbursedLoans.length > 0 && (() => {
                const { vigentes, cancelados, capitalTotal, capitalVigente, tasaPromedio } = loanStats;
                const kpis = [
                    {
                        label: 'Capital Desembolsado',
                        value: `$${Math.round(capitalTotal).toLocaleString('es-CO')}`,
                        sub: `${disbursedLoans.length} préstamos históricos`,
                        color: 'border-l-emerald-400', icon: DollarSign, iconColor: 'text-emerald-500',
                    },
                    {
                        label: 'Cartera Vigente',
                        value: `$${Math.round(capitalVigente).toLocaleString('es-CO')}`,
                        sub: `${vigentes.length} préstamo(s) activos`,
                        color: 'border-l-blue-400', icon: Activity, iconColor: 'text-blue-500',
                    },
                    {
                        label: 'Préstamos Vigentes',
                        value: vigentes.length,
                        sub: `${disbursedLoans.length > 0 ? (vigentes.length / disbursedLoans.length * 100).toFixed(0) : 0}% del portafolio`,
                        color: 'border-l-blue-400', icon: CheckCircle, iconColor: 'text-blue-500',
                    },
                    {
                        label: 'Préstamos Cancelados',
                        value: cancelados.length,
                        sub: `${disbursedLoans.length > 0 ? (cancelados.length / disbursedLoans.length * 100).toFixed(0) : 0}% ya saldados`,
                        color: 'border-l-gray-300', icon: XCircle, iconColor: 'text-gray-400',
                    },
                    {
                        label: 'Tasa Promedio (Vigentes)',
                        value: `${(tasaPromedio * 100).toFixed(2)}%`,
                        sub: 'Interés mensual',
                        color: 'border-l-amber-400', icon: Percent, iconColor: 'text-amber-500',
                    },
                ];
                return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {kpis.map((k, i) => (
                            <div key={i} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${k.color} p-4 flex items-center gap-3 shadow-sm`}>
                                <k.icon className={`h-6 w-6 flex-shrink-0 ${k.iconColor}`} />
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest truncate">{k.label}</p>
                                    <p className="text-xl font-black text-gray-900 font-mono leading-tight truncate">{k.value}</p>
                                    <p className="text-[10px] text-gray-500 font-medium truncate">{k.sub}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* ── Gráficas ─────────────────────────────────────────────────────── */}
            {!loading && disbursedLoans.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold text-gray-700">Desembolsos por mes</CardTitle>
                            <p className="text-xs text-gray-400">Capital prestado — últimos {desembolsosPorMes.length} mes(es) con movimiento</p>
                        </CardHeader>
                        <CardContent>
                            {desembolsosPorMes.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-16">Sin datos de desembolso para graficar.</p>
                            ) : (
                                <div style={{ width: '100%', height: 260 }}>
                                    <ResponsiveContainer>
                                        <BarChart data={desembolsosPorMes} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                                            <YAxis
                                                axisLine={false} tickLine={false}
                                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                                tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                                                domain={[0, 'auto']}
                                            />
                                            <Tooltip
                                                cursor={{ fill: '#1d4ed808' }}
                                                formatter={(value, name) => name === 'monto'
                                                    ? [`$${Math.round(value).toLocaleString('es-CO')}`, 'Capital desembolsado']
                                                    : [value, name]}
                                                labelFormatter={(label) => `Mes: ${label}`}
                                            />
                                            <Bar dataKey="monto" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold text-gray-700">Top socios por capital prestado</CardTitle>
                            <p className="text-xs text-gray-400">Histórico acumulado — todos los estados</p>
                        </CardHeader>
                        <CardContent>
                            {topSociosPorMonto.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-16">Sin datos de socios para graficar.</p>
                            ) : (
                                <div style={{ width: '100%', height: 260 }}>
                                    <ResponsiveContainer>
                                        <BarChart
                                            data={topSociosPorMonto}
                                            layout="vertical"
                                            margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                                            <XAxis
                                                type="number" axisLine={false} tickLine={false}
                                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                                tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                                                domain={[0, 'auto']}
                                            />
                                            <YAxis
                                                type="category" dataKey="nombre" axisLine={false} tickLine={false}
                                                tick={{ fontSize: 11, fill: '#374151' }}
                                                width={110}
                                            />
                                            <Tooltip
                                                cursor={{ fill: '#16653408' }}
                                                formatter={(value) => [`$${Math.round(value).toLocaleString('es-CO')}`, 'Capital prestado']}
                                            />
                                            <Bar dataKey="monto" fill="#166534" radius={[0, 4, 4, 0]} maxBarSize={22}>
                                                {topSociosPorMonto.map((_, i) => (
                                                    <Cell key={i} fill={i === 0 ? '#166534' : '#22c55e'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ── Filtro por socio ────────────────────────────────────────── */}
            {!loading && (() => {
                // Solo socios que tienen al menos un préstamo
                const sociosConPrestamo = clients.filter(c =>
                    disbursedLoans.some(l => String(l.clientId) === String(c.id))
                );

                const filteredDropdown = clientSearch.trim()
                    ? sociosConPrestamo.filter(c => {
                        const t = clientSearch.toLowerCase();
                        return `${c.name} ${c.surname1 || ''} ${c.cedula || ''} ${c.customerId || ''}`.toLowerCase().includes(t);
                    })
                    : sociosConPrestamo;

                const selectedClient = sociosConPrestamo.find(c => String(c.id) === String(filterClientId));
                const filteredDisbursed = filterClientId
                    ? disbursedLoans.filter(l => String(l.clientId) === String(filterClientId))
                    : disbursedLoans;

                return (
                    <>
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Dropdown de socios */}
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => { setDropdownOpen(o => !o); setClientSearch(''); }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors min-w-[220px] ${filterClientId ? 'bg-emerald-700/10 border-emerald-700/40 text-emerald-800' : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-400'}`}
                                >
                                    <Users className="h-4 w-4 flex-shrink-0" />
                                    <span className="flex-1 text-left truncate">
                                        {selectedClient ? `${selectedClient.name} ${selectedClient.surname1 || ''}` : 'Filtrar por socio'}
                                    </span>
                                    {filterClientId && (
                                        <span
                                            onClick={(e) => { e.stopPropagation(); setFilterClientId(''); setClientSearch(''); }}
                                            className="ml-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                                            title="Quitar filtro"
                                        >✕</span>
                                    )}
                                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {dropdownOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                        <div className="p-3 border-b border-gray-100">
                                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                                                <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    placeholder="Buscar por nombre o cédula..."
                                                    value={clientSearch}
                                                    onChange={e => setClientSearch(e.target.value)}
                                                    className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto py-1">
                                            <button
                                                type="button"
                                                onClick={() => { setFilterClientId(''); setDropdownOpen(false); }}
                                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors ${!filterClientId ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-gray-600'}`}
                                            >
                                                <span className="flex items-center gap-2">
                                                    <Users className="h-3.5 w-3.5 text-gray-400" />
                                                    Todos los socios
                                                    <span className="ml-auto text-xs text-gray-400">{disbursedLoans.length} préstamos</span>
                                                </span>
                                            </button>
                                            {filteredDropdown.length === 0 ? (
                                                <p className="px-4 py-3 text-sm text-gray-400 text-center">Sin resultados</p>
                                            ) : filteredDropdown.map(c => {
                                                const count = disbursedLoans.filter(l => String(l.clientId) === String(c.id)).length;
                                                return (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => { setFilterClientId(String(c.id)); setDropdownOpen(false); }}
                                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors ${String(filterClientId) === String(c.id) ? 'bg-emerald-50 font-bold text-emerald-700' : 'text-gray-700'}`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                                            <span className="flex-1 truncate">
                                                                <span className="font-semibold">{c.name} {c.surname1 || ''}</span>
                                                                <span className="text-xs text-gray-400 ml-1">· {c.cedula}</span>
                                                            </span>
                                                            <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{count}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="p-2 border-t border-gray-50 text-center">
                                            <span className="text-xs text-gray-400">{sociosConPrestamo.length} socios con préstamos</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Badge del filtro activo */}
                            {filterClientId && selectedClient && (
                                <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {filteredDisbursed.length} préstamo(s) de {selectedClient.name} {selectedClient.surname1 || ''}
                                </span>
                            )}
                        </div>

                        <Card>
                            <CardContent className="p-0">
                                <DataTable
                                    columns={disbursedColumns}
                                    data={filteredDisbursed}
                                    isLoading={loading}
                                    searchKeys={['idVm']}
                                    actions={{
                                        onEdit: handleOpenDisbursedModal,
                                        onDelete: handleDeleteDisbursed
                                    }}
                                />
                            </CardContent>
                        </Card>
                    </>
                );
            })()}

            {/* ──────── MODAL NUEVO DESEMBOLSO (STEPPER) ──────── */}
            {isModalOpen && activeTab === 'disbursed' && (() => {
                // ── cálculo en vivo de cuotas — MISMO método que usa el backend al guardar
                // (server/routes/admin.js, sección "CREAR CUOTAS" dentro de POST
                // /disbursed-loans): capital fijo por cuota + interés sobre el saldo que
                // va quedando, NO amortización francesa de cuota constante. Con ese
                // método la cuota es más alta al principio y baja cada mes — mostrar un
                // solo número "estimado" (como hacía la fórmula francesa original)
                // engañaría al admin: para $5.000.000 a 10 cuotas del 1,6%, la francesa
                // da ~$545.047 parejo, pero la cuota real 1 es $580.000 y la 10 es
                // $508.000 — ninguna cuota real vale lo que mostraba el estimado.
                const P = parseFloat(disbursedForm.valorPrestado) || 0;
                const n = parseInt(disbursedForm.cuotas) || 0;
                const iPct = parseFloat(disbursedForm.interesMensual) || 0;
                const i = iPct / 100;
                let primeraCuota = 0, ultimaCuota = 0, interesTotalEstimado = 0;
                if (P > 0 && n > 0) {
                    const capitalPorCuota = P / n;
                    let saldo = P;
                    for (let k = 1; k <= n; k++) {
                        const interesCuota = saldo * i;
                        const cuota = capitalPorCuota + interesCuota;
                        if (k === 1) primeraCuota = cuota;
                        if (k === n) ultimaCuota = cuota;
                        interesTotalEstimado += interesCuota;
                        saldo -= capitalPorCuota;
                    }
                }
                const fmt = v => Math.round(v).toLocaleString('es-CO');

                // ── capacidad de crédito (regla 3× / mora EP) — MISMA regla que ya
                // bloquea el guardado en el backend (POST /disbursed-loans). Se calcula
                // acá para advisar en vivo, antes de que el admin llegue a confirmar y
                // se tope con el rechazo del servidor. Si es un retanqueo, se descuenta
                // el saldo del préstamo que se está cancelando — ya no cuenta contra el
                // cupo porque se extingue en la misma operación (igual que en el backend).
                let cupoMaximo = 0, capacidadDisponible = 0, excedeCapacidad = false;
                if (clientCapacity && !isEditing) {
                    const verdictBase = calcVerdict(clientCapacity, { audience: 'admin' });
                    cupoMaximo = verdictBase.montoMaxSinVotacion;
                    const saldoQueSeCancela = activeLoanWarning ? Number(activeLoanWarning.saldoPendiente) || 0 : 0;
                    capacidadDisponible = verdictBase.capacidadDisponible + saldoQueSeCancela;
                    excedeCapacidad = P > 0 && P > capacidadDisponible;
                }

                // ── socio seleccionado ──
                const socioSel = clients.find(c => String(c.id) === String(disbursedForm.clientId));
                const clientesFiltrados = clientSearchModal.trim()
                    ? clients.filter(c => `${c.name} ${c.surname1 || ''} ${c.cedula || ''} ${c.customerId || ''}`.toLowerCase().includes(clientSearchModal.toLowerCase()))
                    : clients;

                const steps = ['Socio', 'Condiciones', 'Confirmar'];

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl min-h-[600px] max-h-[92vh] overflow-y-auto flex flex-col" style={{ animation: 'fadeScale .2s ease' }}>

                            {/* ── Header ── */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
                                <div>
                                    <h2 className="text-lg font-extrabold text-gray-900">
                                        {isEditing ? 'Editar Préstamo' : 'Registrar Nuevo Desembolso'}
                                    </h2>
                                    {prefillRequestId && (
                                        <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                                            <CheckCircle className="h-3 w-3" /> Prellenado desde solicitud aprobada
                                        </p>
                                    )}
                                </div>
                                <button onClick={() => { setIsModalOpen(false); setPrefillRequestId(null); }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* ── Stepper pills ── */}
                            <div className="flex items-center gap-0 px-6 pt-5 pb-4">
                                {steps.map((label, idx) => {
                                    const step = idx + 1;
                                    const done = formStep > step;
                                    const active = formStep === step;
                                    return (
                                        <React.Fragment key={step}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                                                    done ? 'bg-brand-primary text-white' :
                                                    active ? 'bg-brand-primary text-white ring-4 ring-brand-primary/20' :
                                                    'bg-gray-100 text-gray-400'
                                                }`}>
                                                    {done ? <CheckCircle className="h-4 w-4" /> : step}
                                                </div>
                                                <span className={`text-xs font-bold hidden sm:block ${
                                                    active ? 'text-gray-900' : done ? 'text-brand-primary' : 'text-gray-400'
                                                }`}>{label}</span>
                                            </div>
                                            {idx < steps.length - 1 && <div className={`flex-1 h-px mx-2 transition-all ${done ? 'bg-brand-primary' : 'bg-gray-200'}`} />}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            {/* ════════ PASO 1 — SOCIO ════════ */}
                            {formStep === 1 && (
                                <div className="px-6 pb-6 flex-1 flex flex-col">
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-500 font-medium">Selecciona el socio al que se le desembolsará el préstamo.</p>

                                    {/* Searchable combobox */}
                                    <div className="relative" ref={clientDropdownRef}>
                                        <button
                                            type="button"
                                            onClick={() => { setClientDropdownOpen(o => !o); setClientSearchModal(''); }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                                                disbursedForm.clientId
                                                    ? 'border-brand-primary bg-brand-primary/5 text-gray-900'
                                                    : 'border-gray-200 bg-white text-gray-400 hover:border-brand-primary/50'
                                            }`}
                                        >
                                            <User className="h-4 w-4 flex-shrink-0" />
                                            <span className="flex-1 text-left">
                                                {socioSel ? `${socioSel.name} ${socioSel.surname1 || ''} ${socioSel.surname2 || ''} · ${socioSel.cedula || socioSel.customerId || ''}` : 'Buscar socio por nombre o cédula...'}
                                            </span>
                                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${clientDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {clientDropdownOpen && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                                <div className="p-3 border-b border-gray-100">
                                                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                                                        <Search className="h-3.5 w-3.5 text-gray-400" />
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            placeholder="Nombre, cédula o ID..."
                                                            value={clientSearchModal}
                                                            onChange={e => setClientSearchModal(e.target.value)}
                                                            className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="max-h-80 overflow-y-auto py-1">
                                                    {clientesFiltrados.length === 0 ? (
                                                        <p className="px-4 py-3 text-sm text-gray-400 text-center">Sin resultados</p>
                                                    ) : clientesFiltrados.map(c => (
                                                        <button
                                                            key={c.id} type="button"
                                                            onClick={() => { setDisbursedForm(prev => ({ ...prev, clientId: String(c.id) })); setClientDropdownOpen(false); }}
                                                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-brand-primary/5 transition-colors flex items-center gap-3 ${
                                                                String(disbursedForm.clientId) === String(c.id) ? 'bg-brand-primary/10 font-bold text-brand-primary' : 'text-gray-700'
                                                            }`}
                                                        >
                                                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500 flex-shrink-0">
                                                                {(c.name || '?')[0].toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-semibold">{c.name} {c.surname1 || ''} {c.surname2 || ''}</p>
                                                                <p className="text-[11px] text-gray-400">{c.cedula || c.customerId || 'Sin cédula'}</p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Tarjeta del socio */}
                                    {socioSel && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center text-xl font-black text-brand-primary flex-shrink-0">
                                                {(socioSel.name || '?')[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-extrabold text-gray-900 text-base">{socioSel.name} {socioSel.surname1 || ''} {socioSel.surname2 || ''}</p>
                                                <p className="text-xs text-gray-500">{socioSel.cedula || socioSel.customerId} · {socioSel.email || 'Sin email'}</p>
                                            </div>
                                            {socioSel.porcentajePrestamo && (
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Tasa asignada</p>
                                                    <p className="text-lg font-extrabold text-brand-primary">{(Number(socioSel.porcentajePrestamo) * 100).toFixed(2)}%</p>
                                                    <p className="text-[10px] text-gray-400">mensual</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Alerta refinanciación */}
                                    {!isEditing && activeLoanWarning && (
                                        <div className="flex gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-4">
                                            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                            <div className="text-sm">
                                                <p className="font-bold text-amber-800 mb-1">⚠️ Préstamo vigente: {activeLoanWarning.idVm}</p>
                                                <p className="text-amber-700 text-xs">Este socio ya tiene un préstamo activo. Si continúas, se aplicará una refinanciación automática. Podrás revisar los detalles en el Paso 3.</p>
                                            </div>
                                        </div>
                                    )}

                                </div>

                                    <div className="flex justify-end pt-2 mt-auto">
                                        <Button type="button" onClick={() => { if (!disbursedForm.clientId) { toast.error('Debes seleccionar un socio'); return; } setFormStep(2); }}>
                                            Siguiente — Condiciones <ChevronDown className="ml-2 h-4 w-4 -rotate-90" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* ════════ PASO 2 — CONDICIONES ════════ */}
                            {formStep === 2 && (
                                <form onSubmit={(e) => { e.preventDefault(); setFormStep(3); }} className="px-6 pb-6 flex-1 flex flex-col">
                                <div className="space-y-5">
                                    <p className="text-sm text-gray-500 font-medium">Define las condiciones financieras y bancarias del desembolso.</p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <FormField label="Fecha de desembolso">
                                            <Input type="date" value={disbursedForm.fechaPrestamo}
                                                onChange={(e) => setDisbursedForm({ ...disbursedForm, fechaPrestamo: e.target.value })} required />
                                        </FormField>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Período</label>
                                            <div className="flex items-center gap-2 h-10 px-3 border border-gray-200 rounded-lg bg-gray-50 text-sm font-semibold text-gray-700">
                                                <Calendar className="h-4 w-4 text-gray-400" />
                                                {disbursedForm.mesDesembolso} {disbursedForm.anioDesembolso}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <FormField label="Valor del préstamo">
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-sm">$</span>
                                                <Input type="number" className="pl-7 font-bold text-green-700" value={disbursedForm.valorPrestado}
                                                    onChange={(e) => setDisbursedForm({ ...disbursedForm, valorPrestado: e.target.value })} required />
                                            </div>
                                        </FormField>
                                        <FormField label="Número de cuotas">
                                            <Input type="number" min="1" className="font-bold" value={disbursedForm.cuotas}
                                                onChange={(e) => setDisbursedForm({ ...disbursedForm, cuotas: e.target.value })} required />
                                        </FormField>
                                        <FormField label="Tasa mensual (%)">
                                            <div className="relative">
                                                <Input type="number" step="0.01" min="0" max="100" className="pr-8" value={disbursedForm.interesMensual}
                                                    onChange={(e) => setDisbursedForm({ ...disbursedForm, interesMensual: e.target.value })} placeholder="Ej: 1.5" />
                                                <span className="absolute right-3 top-2.5 text-gray-400 font-bold text-sm">%</span>
                                            </div>
                                        </FormField>
                                    </div>

                                    {/* Calculadora en vivo — capital fijo, cuota decreciente (igual que el
                                        backend): se muestra la primera y la última cuota en vez de un
                                        número "estimado" constante que no correspondería a ningún pago real. */}
                                    {primeraCuota > 0 && (
                                        <div className="flex items-center gap-4 bg-gradient-to-r from-brand-primary/5 to-green-50 border border-brand-primary/20 rounded-2xl px-5 py-4">
                                            <Calculator className="h-8 w-8 text-brand-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                                    {n > 1 ? 'Cuota: primera → última' : 'Cuota única'}
                                                </p>
                                                <p className="text-2xl font-extrabold text-brand-primary tabular-nums">
                                                    {n > 1 ? `$${fmt(primeraCuota)} → $${fmt(ultimaCuota)}` : `$${fmt(primeraCuota)}`}
                                                </p>
                                                <p className="text-[11px] text-gray-400">
                                                    {n > 1 && 'Capital fijo cada mes, el interés baja con el saldo · '}
                                                    Total a pagar: ${fmt(P + interesTotalEstimado)} · Interés total: ${fmt(interesTotalEstimado)}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Advertencia de cupo: misma regla 3× que ya bloquea el guardado en el
                                        backend — se muestra en vivo para que el admin lo sepa antes de llegar
                                        a la confirmación. */}
                                    {excedeCapacidad && (
                                        <div className="flex gap-3 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                                            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                            <div className="text-sm">
                                                <p className="font-bold text-red-800 mb-1">⚠️ Supera el cupo sin votación</p>
                                                <p className="text-red-700 text-xs">
                                                    ${fmt(P)} supera el cupo máximo de {socioSel?.name} {socioSel?.surname1 || ''} (3× ahorro:
                                                    {' '}${fmt(cupoMaximo)}, disponible: ${fmt(Math.max(0, capacidadDisponible))}).
                                                    Este monto <strong>requiere aprobación de la Junta Administrativa</strong> — el servidor rechazará
                                                    el guardado a menos que se registre primero como solicitud en Aprobación de Préstamos.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <FormField label="Días máximos de pago (gracia)">
                                        <Input type="number" value={disbursedForm.diasPagoMax}
                                            onChange={(e) => setDisbursedForm({ ...disbursedForm, diasPagoMax: e.target.value })} placeholder="Ej: 5" />
                                    </FormField>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <FormField label="Banco receptor">
                                            <select aria-label="Banco receptor"
                                                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                                value={disbursedForm.banco} onChange={(e) => setDisbursedForm({ ...disbursedForm, banco: e.target.value })}>
                                                <option value="">-- Seleccionar --</option>
                                                {COLOMBIAN_BANKS_WITH_OTHER.map(bank => <option key={bank} value={bank}>{bank}</option>)}
                                            </select>
                                        </FormField>
                                        <FormField label="N.° de transferencia">
                                            <Input value={disbursedForm.numeroTransaccion} onChange={(e) => setDisbursedForm({ ...disbursedForm, numeroTransaccion: e.target.value })} />
                                        </FormField>
                                        <FormField label="Cuenta de ahorros">
                                            <Input value={disbursedForm.cuentaAhorros} onChange={(e) => setDisbursedForm({ ...disbursedForm, cuentaAhorros: e.target.value })} />
                                        </FormField>
                                    </div>

                                    <FormField label="Observaciones">
                                        <Input value={disbursedForm.observaciones} onChange={(e) => setDisbursedForm({ ...disbursedForm, observaciones: e.target.value })} placeholder="Opcional..." />
                                    </FormField>

                                </div>

                                    <div className="flex justify-between pt-2 mt-auto">
                                        <Button type="button" variant="ghost" onClick={() => setFormStep(1)}>← Atrás</Button>
                                        <Button type="submit">Revisar y confirmar <ChevronDown className="ml-2 h-4 w-4 -rotate-90" /></Button>
                                    </div>
                                </form>
                            )}

                            {/* ════════ PASO 3 — CONFIRMACIÓN ════════ */}
                            {formStep === 3 && (
                                <div className="px-6 pb-6 flex-1 flex flex-col">
                                <div className="space-y-5">
                                    <p className="text-sm text-gray-500 font-medium">Revisa el resumen antes de registrar el desembolso.</p>

                                    {!isEditing && activeLoanWarning && (
                                        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
                                            <p className="font-bold text-amber-800 flex items-center gap-2 mb-2">
                                                <AlertTriangle className="h-4 w-4" /> Refinanciación — Préstamo {activeLoanWarning.idVm} será cancelado
                                            </p>
                                            <ul className="text-xs text-amber-700 space-y-1 ml-1">
                                                <li>• Saldo pendiente: <strong>${Number(activeLoanWarning.saldoPendiente).toLocaleString('es-CO')}</strong></li>
                                                <li>• {activeLoanWarning.cuotasPendientes} cuota(s): Estado Pago <strong>Pendiente → PAGO</strong></li>
                                                {Number(activeLoanWarning.interesCausado) > 0 && (
                                                    <li>• Interés causado por días transcurridos (<strong>SÍ se cobra</strong>): <strong>${Number(activeLoanWarning.interesCausado).toLocaleString('es-CO')}</strong></li>
                                                )}
                                                <li>• Interés condonado (no cobrado): <strong>${Number(activeLoanWarning.interesCondonable).toLocaleString('es-CO')}</strong></li>
                                                <li>• Préstamo {activeLoanWarning.idVm}: <strong>Vigente → CANCELADO</strong></li>
                                            </ul>
                                        </div>
                                    )}

                                    {excedeCapacidad && (
                                        <div className="flex gap-3 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                                            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                            <div className="text-sm">
                                                <p className="font-bold text-red-800 mb-1">⚠️ Este monto requiere votación de la Junta</p>
                                                <p className="text-red-700 text-xs">
                                                    ${fmt(P)} supera el cupo disponible sin votación (${fmt(Math.max(0, capacidadDisponible))} de ${fmt(cupoMaximo)}).
                                                    El servidor rechazará el guardado — regístralo primero como solicitud en Aprobación de Préstamos.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                                        <div className="bg-brand-primary px-5 py-3 flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-white" />
                                            <p className="text-white font-bold text-sm">Resumen del Desembolso</p>
                                        </div>
                                        <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-3">
                                            {[
                                                { label: 'Socio', value: `${disbursedForm.nombre} ${disbursedForm.apellido}`, full: true },
                                                { label: 'Fecha', value: `${disbursedForm.mesDesembolso} ${disbursedForm.anioDesembolso}` },
                                                { label: 'Valor prestado', value: `$${fmt(P)}`, bold: true, color: 'text-green-700' },
                                                { label: 'Cuotas', value: `${n} cuotas` },
                                                { label: 'Tasa mensual', value: `${iPct.toFixed(2)}%` },
                                                { label: n > 1 ? 'Primera cuota' : 'Cuota', value: primeraCuota > 0 ? `$${fmt(primeraCuota)}` : '—', bold: true, color: 'text-brand-primary' },
                                                ...(n > 1 ? [{ label: 'Última cuota', value: ultimaCuota > 0 ? `$${fmt(ultimaCuota)}` : '—' }] : []),
                                                { label: 'Banco receptor', value: disbursedForm.banco || '—' },
                                                { label: 'N.° transferencia', value: disbursedForm.numeroTransaccion || '—' },
                                                { label: 'Cuenta ahorros', value: disbursedForm.cuentaAhorros || '—' },
                                                { label: 'Observaciones', value: disbursedForm.observaciones || '—', full: true },
                                            ].map(({ label, value, bold, color, full }) => (
                                                <div key={label} className={full ? 'col-span-2' : ''}>
                                                    <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{label}</p>
                                                    <p className={`text-sm font-semibold break-words ${color || 'text-gray-800'} ${bold ? 'text-base font-extrabold' : ''}`}>{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                </div>

                                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2 mt-auto">
                                        <Button type="button" variant="ghost" onClick={() => setFormStep(2)}>← Atrás</Button>
                                        <div className="flex flex-col sm:items-end gap-2">
                                            {excedeCapacidad && (
                                                <Button
                                                    type="button"
                                                    onClick={() => handleSubmitDisbursed(null, true)}
                                                    size="lg"
                                                    className="bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 shadow-sm border-0"
                                                >
                                                    <ShieldCheck className="mr-2 h-4 w-4" />
                                                    Aprobar como Gerente y Registrar
                                                </Button>
                                            )}
                                            <Button
                                                type="button"
                                                onClick={() => handleSubmitDisbursed()}
                                                size="lg"
                                                variant={excedeCapacidad ? 'secondary' : 'primary'}
                                                disabled={excedeCapacidad}
                                                title={excedeCapacidad ? 'Supera el cupo sin votación de la Junta — regístralo como solicitud, o usa "Aprobar como Gerente"' : undefined}
                                            >
                                                <Save className="mr-2 h-4 w-4" />
                                                {isEditing ? 'Guardar cambios' : excedeCapacidad ? 'Requiere votación de la Junta' : 'Confirmar y Registrar'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                );
            })()}

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
