import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatDate } from '../../utils/excelUtils';
import api from '../../config/api';
import { notifyUpdate } from '../../utils/sync';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Edit, FileDown, Search, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { exportToExcel } from '../../utils/excelUtils';
import { useSortTable, SortIcon } from '../../utils/useSortTable';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Label } from '../../components/ui/Input';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../../utils/banks';

const FormattedNumberInput = ({ value, onChange, isPercent = false, className, readOnly, ...props }) => {
    const [focused, setFocused] = useState(false);

    let displayValue = value;
    if (!focused && value !== '' && value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            if (isPercent) {
                displayValue = (num * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + '%';
            } else {
                displayValue = num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
        }
    }

    return (
        <Input
            {...props}
            type={focused ? "number" : "text"}
            value={focused ? value : displayValue}
            readOnly={readOnly}
            onChange={onChange}
            onFocus={(e) => {
                if (!readOnly) setFocused(true);
                if (props.onFocus) props.onFocus(e);
            }}
            onBlur={(e) => {
                if (!readOnly) setFocused(false);
                if (props.onBlur) props.onBlur(e);
            }}
            className={className}
        />
    );
};

const MONTH_NAMES_ES = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
};

// Muestra fechas en DD-MM-YYYY independientemente del formato almacenado.
// Usa mesPago como referencia para detectar si DD y MM están intercambiados (registros importados).
const displayFecha = (dateStr, mesPago) => {
  if (!dateStr) return '—';
  const s = String(dateStr).trim();
  const parts = s.split('-');

  // Caso 1: YYYY-XX-XX (el primer segmento es el año de 4 dígitos)
  if (parts.length === 3 && parts[0].length === 4) {
    const yyyy = parts[0];
    const p1 = parts[1].padStart(2, '0');
    const p2 = parts[2].padStart(2, '0');
    if (mesPago) {
      const correctMM = MONTH_NAMES_ES[mesPago.toLowerCase().trim()];
      if (correctMM) {
        if (p1 === correctMM) return `${p2}-${p1}-${yyyy}`; // YYYY-MM-DD
        if (p2 === correctMM) return `${p1}-${p2}-${yyyy}`; // YYYY-DD-MM
      }
    }
    // Fallback: asumir YYYY-MM-DD estándar
    return `${p2}-${p1}-${yyyy}`;
  }

  // Caso 2: DD-MM-YYYY (ya en formato correcto)
  if (parts.length === 3 && parts[2].length === 4) return s;

  // Caso 3: Solo número de día (ej: "09")
  const dayNum = parseInt(s, 10);
  if (!isNaN(dayNum) && parts.length === 1) {
    const dd = String(dayNum).padStart(2, '0');
    if (mesPago) {
      const mm = MONTH_NAMES_ES[mesPago.toLowerCase().trim()];
      if (mm) return `${dd}-${mm}-${new Date().getFullYear()}`;
    }
    return dd;
  }

  return s;
};

const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ── Toggle Switch Component ────────────────────────────────────────────────────
const ToggleSwitch = ({ active, onToggle, disabled }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        title={active ? 'Desactivar' : 'Activar'}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
            ${active ? 'bg-green-500' : 'bg-gray-300'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
        <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                ${active ? 'translate-x-6' : 'translate-x-1'}`}
        />
    </button>
);

// ── Estado badge ──────────────────────────────────────────────────────────────
const EstadoBadge = ({ estado }) => {
    const map = {
        'Pago': 'bg-green-100 text-green-800',
        'Mora': 'bg-red-100 text-red-800',
        'Abono': 'bg-blue-100 text-blue-800',
        'Pendiente': 'bg-yellow-100 text-yellow-800',
    };
    return (
        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${map[estado] || 'bg-gray-100 text-gray-700'}`}>
            {estado || '—'}
        </span>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
const STATES_PAGO = ['Pendiente', 'Pago', 'Mora', 'Abono', 'Parcial'];
const STATES_PRESTAMO = ['Pendiente', 'Cancelado'];

const PaymentsPage = () => {
    const { toast } = useUi();
    const [searchParams] = useSearchParams();
    const [payments, setPayments] = useState([]);
    const [clients, setClients] = useState([]);
    const [disbursedLoans, setDisbursedLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState(null);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [selectingRecord, setSelectingRecord] = useState(false);
    // Filtros del selector multi-campo
    const [selectorSearch, setSelectorSearch]       = useState('');
    const [selectorClientId, setSelectorClientId]   = useState('');
    const [selectorIdVm, setSelectorIdVm]           = useState('');
    const [selectorMes, setSelectorMes]             = useState('');
    const [selectorEstado, setSelectorEstado]       = useState('');
    const [selectorCuota, setSelectorCuota]         = useState('');

    // Soportes (Archivos de pago)
    const [soportesInfo, setSoportesInfo] = useState({}); // { paymentId: { exists: true, name: '...' } }
    const [soporteFile, setSoporteFile] = useState(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState('Todos');
    const [filterEstadoPrestamo, setFilterEstadoPrestamo] = useState('Pendiente');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    const [paymentForm, setPaymentForm] = useState({
        externalId: '',
        clientId: '',
        nombre: '',
        apellido: '',
        idVm: '',
        mesDesembolso: '',
        saldoInicial: '',
        cuotasPrestamo: '',
        interesMensual: '',
        valorInteresesAmortizados: '',
        fechaPagoMax: new Date().toISOString().split('T')[0],
        mesPago: monthNames[new Date().getMonth()],
        valorCuotaVariable: '',
        estado: 'Pendiente',
        valorCuotaPago: '',
        saldoFinal: '',
        itemQuantity: '1',
        banco: '',
        numeroTransaccion: '',
        cuentaAhorros: '',
        observaciones: '',
        estadoPrestamo: ''
    });

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resPayments, resClients, resDisbursed] = await Promise.all([
                api.get('/admin/payments'),
                api.get('/admin/clients'),
                api.get('/admin/disbursed-loans')
            ]);

            const fetchedPayments = Array.isArray(resPayments.data) ? resPayments.data : [];
            setPayments(fetchedPayments);
            setClients(Array.isArray(resClients.data) ? resClients.data : []);
            setDisbursedLoans(Array.isArray(resDisbursed.data) ? resDisbursed.data : []);

            // Fetch soporte info para cada payment (en background)
            const infoMap = {};
            for (const p of fetchedPayments) {
                try {
                    const sRes = await api.get(`/admin/payments/${p.id}/soporte/info`);
                    if (sRes.data.exists) {
                        infoMap[p.id] = sRes.data;
                    }
                } catch (e) {
                    // Ignorar errores individuales si no tiene soporte
                }
            }
            setSoportesInfo(infoMap);

        } catch (err) {
            console.error('Error fetching data:', err);
            toast.error(err.message || 'Error al cargar datos');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (searchParams.get('action') === 'new' && !loading && !isModalOpen) {
            handleOpenModal();
        }
    }, [searchParams, loading]);

    // ── Filtering (client-side) ───────────────────────────────────────────────
    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            let matchesSearch = true;
            if (searchTerm && searchTerm !== "") {
                const name = p.Client?.name || '';
                const surname = p.Client?.surname1 || '';
                const cedula = p.Client?.cedula || '';
                const socio = `${name} ${surname} (${cedula})`.replace(/\s\(\)$/, '').trim();
                matchesSearch = socio === searchTerm;
            }

            const matchesStatus = filterEstado === 'Todos' || p.estado === filterEstado;
            const matchesLoanStatus = filterEstadoPrestamo === 'Todos' || p.estadoPrestamo === filterEstadoPrestamo;

            return matchesSearch && matchesStatus && matchesLoanStatus;
        });
    }, [payments, searchTerm, filterEstado, filterEstadoPrestamo]);

    const { sortedData: sortedPaymentsP, sortConfig: payPageSort, handleSort: handlePayPageSort } = useSortTable(filteredPayments);

    // ── Pagination ───────────────────────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(sortedPaymentsP.length / ITEMS_PER_PAGE));
    const paginated = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedPaymentsP.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedPaymentsP, currentPage]);

    // Dynamic statuses from actual data (solo los que existen en los registros)
    const availableEstados = useMemo(() => {
        const ests = new Set(payments.map(p => p.estado).filter(Boolean));
        return Array.from(ests).sort();
    }, [payments]);

    // Filtrar socios activos que tienen algún préstamo (sea "Vigente" o no)
    const clientsWithActiveLoans = useMemo(() => {
        if (!clients || !disbursedLoans) return [];
        const clientIdsWithLoans = new Set(disbursedLoans.map(loan => loan.clientId.toString()));
        
        return clients.filter(c => {
            const hasLoan = clientIdsWithLoans.has(c.id.toString());
            const isActive = c.estatus && c.estatus.toLowerCase().includes('activo');
            return hasLoan && isActive;
        });
    }, [clients, disbursedLoans]);

    const availableEstadoPrestamo = STATES_PRESTAMO;

    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterEstado, filterEstadoPrestamo]);

    // ── Toggle Activate/Deactivate ────────────────────────────────────────────
    const handleToggle = async (payment) => {
        const newEstado = payment.estado === 'Pago' ? 'Pendiente' : 'Pago';
        setTogglingId(payment.id);
        try {
            await api.put(`/admin/payments/${payment.id}`, { ...payment, estado: newEstado });
            setPayments(prev => prev.map(p => p.id === payment.id ? { ...p, estado: newEstado } : p));
            toast.success(`Estado cambiado a "${newEstado}"`);
        } catch (err) {
            toast.error('Error al cambiar estado: ' + (err.message || ''));
        } finally {
            setTogglingId(null);
        }
    };

    // ── Form helpers ──────────────────────────────────────────────────────────
    const resetForm = () => {
        setPaymentForm({
            externalId: '', clientId: '', nombre: '', apellido: '',
            mesDesembolso: '', saldoInicial: '', cuotasPrestamo: '',
            interesMensual: '', valorInteresesAmortizados: '',
            fechaPagoMax: new Date().toISOString().split('T')[0],
            mesPago: monthNames[new Date().getMonth()],
            valorCuotaVariable: '', estado: 'Pendiente',
            valorCuotaPago: '', saldoFinal: '',
            itemQuantity: '1', banco: '', numeroTransaccion: '',
            cuentaAhorros: '', observaciones: '', idVm: '', estadoPrestamo: ''
        });
        setIsEditing(false);
        setEditingId(null);
        setSoporteFile(null); // Clear file input
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const handleOpenModal = (payment = null) => {
        if (payment) {
            // Normalizar fechaPagoMax al formato YYYY-MM-DD que requiere input[type=date].
            // Desde la BD puede venir como ISO "2026-01-04T05:00:00.000Z" o como "2026-01-04".
            const rawFecha = payment.fechaPagoMax || '';
            const fechaNorm = rawFecha ? rawFecha.split('T')[0] : '';

            setPaymentForm({
                ...payment,
                fechaPagoMax: fechaNorm,
                // cuotasPrestamo = número de cuota que se está pagando (mismo que itemQuantity)
                cuotasPrestamo: payment.itemQuantity ?? payment.cuotasPrestamo,
                nombre: payment.Client?.name || '',
                apellido: `${payment.Client?.surname1 || ''} ${payment.Client?.surname2 || ''}`.trim()
            });
            setIsEditing(true);
            setEditingId(payment.id);
            setSelectingRecord(false);
        } else {
            resetForm();
            setSelectingRecord(true);
            // Limpiar todos los filtros del selector
            setSelectorSearch('');
            setSelectorClientId('');
            setSelectorIdVm('');
            setSelectorMes('');
            setSelectorEstado('');
            setSelectorCuota('');
        }
        setIsModalOpen(true);
    };

    // ── Al cambiar cliente, poblar los datos del préstamo ─────────────────────────────────
    // NOTA: Solo corre cuando se crea un NUEVO registro (editingId === null).
    // Cuando se edita un registro existente, los datos ya están cargados desde la BD.
    useEffect(() => {
        if (!paymentForm.clientId) return;
        if (editingId) return; // ← No sobreescribir cuando se está editando un registro existente

        const client = clients.find(c => c.id.toString() === paymentForm.clientId.toString());
        if (!client) return;

        const clientLoans = disbursedLoans.filter(l => l.clientId.toString() === paymentForm.clientId.toString());
        if (clientLoans.length === 0) return;

        // Priorizar el préstamo que está "Vigente", si no hay, tomar el más reciente
        const activeLoans = clientLoans.filter(l => l.estado && l.estado.toLowerCase() === 'vigente');
        activeLoans.sort((a, b) => new Date(b.fechaPrestamo) - new Date(a.fechaPrestamo));
        clientLoans.sort((a, b) => new Date(b.fechaPrestamo) - new Date(a.fechaPrestamo));
        
        const latestLoan = activeLoans.length > 0 ? activeLoans[0] : clientLoans[0];

        setPaymentForm(prev => ({
            ...prev,
            nombre: client.name || '',
            apellido: `${client.surname1 || ''} ${client.surname2 || ''}`.trim(),
            idVm: latestLoan.idVm || latestLoan.orderId || '',
            mesDesembolso: latestLoan.mesDesembolso || '',
            saldoInicial: latestLoan.valorPrestado || latestLoan.monto || '',
            cuotasPrestamo: latestLoan.cuotas || '',
            interesMensual: latestLoan.interesMensual || '',
            banco: latestLoan.banco || '',
            cuentaAhorros: latestLoan.cuentaAhorros || latestLoan.cuenta || '',
            estadoPrestamo: latestLoan.estado || '',
            itemQuantity: '', // Resetear para que usuario seleccione cuota
            // Limpiar campos de pago anteriores al cambiar de cliente
            valorInteresesAmortizados: '',
            valorCuotaVariable: '',
            valorCuotaPago: '',
            saldoFinal: '',
            mesPago: '',
            fechaPagoMax: '',
            numeroTransaccion: '',
            observaciones: '',
            externalId: ''
        }));
        setIsEditing(false);
        setEditingId(null);
    }, [paymentForm.clientId, editingId]);

    // handleCuotaChange se ha eliminado según la solicitud del usuario

    useEffect(() => {
        // Solo recalcular saldoFinal de forma reactiva.
        // valorInteresesAmortizados y valorCuotaVariable son editables por el usuario.
        const saldoInicial = parseFloat(paymentForm.saldoInicial) || 0;
        const valorPago = parseFloat(paymentForm.valorCuotaPago) || 0;
        const intereses = parseFloat(paymentForm.valorInteresesAmortizados) || 0;
        const saldoFinal = saldoInicial + intereses - valorPago;

        setPaymentForm(prev => ({
            ...prev,
            saldoFinal: saldoFinal > 0 ? saldoFinal.toFixed(0) : '0'
        }));
    }, [paymentForm.saldoInicial, paymentForm.valorInteresesAmortizados, paymentForm.valorCuotaPago]);

    // ── Submit / Delete ───────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            let paymentIdToUse = editingId;

            // Sanitize payload: Keep only model fields
            const payload = {
                externalId: paymentForm.externalId,
                clientId: paymentForm.clientId,
                mesDesembolso: paymentForm.mesDesembolso,
                saldoInicial: paymentForm.saldoInicial,
                // cuotasPrestamo = número de cuota pagada (= itemQuantity), NO el total del plan.
                // El total de cuotas del plan es informativo y se obtiene de disbursedLoans en el formulario.
                cuotasPrestamo: paymentForm.itemQuantity,
                interesMensual: paymentForm.interesMensual,
                valorInteresesAmortizados: paymentForm.valorInteresesAmortizados,
                fechaPagoMax: paymentForm.fechaPagoMax,
                mesPago: paymentForm.mesPago,
                valorCuotaVariable: paymentForm.valorCuotaVariable,
                estado: paymentForm.estado,
                valorCuotaPago: paymentForm.valorCuotaPago || 0,
                saldoFinal: paymentForm.saldoFinal,
                itemQuantity: paymentForm.itemQuantity,
                banco: paymentForm.banco,
                numeroTransaccion: paymentForm.numeroTransaccion,
                cuentaAhorros: paymentForm.cuentaAhorros,
                observaciones: paymentForm.observaciones,
                idVm: paymentForm.idVm,
                estadoPrestamo: paymentForm.estadoPrestamo
            };

            if (isEditing) {
                await api.put(`/admin/payments/${editingId}`, payload);
                toast.success('Registro actualizado correctamente');
            } else {
                const response = await api.post('/admin/payments', payload);
                paymentIdToUse = response.data.id;
                toast.success('Pago registrado correctamente');
            }

            // Subir archivo de soporte si existe
            if (soporteFile && paymentIdToUse) {
                const formData = new FormData();
                formData.append('soporte', soporteFile);
                try {
                    await api.post(`/admin/payments/${paymentIdToUse}/soporte`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    toast.success('Soporte adjuntado correctamente');
                } catch (fileErr) {
                    console.error('Error uploading file:', fileErr);
                    toast.error('Gurdado, pero falló la subida del soporte: ' + (fileErr.response?.data?.error || fileErr.message));
                }
            }

            handleCloseModal();
            fetchData();
            notifyUpdate('payments');
        } catch (error) {
            console.error('------- handleSubmit Error -------');
            console.dir(error);
            console.error('Response data:', error.response?.data);
            const msg = error.response?.data?.error || error.response?.data?.message || error.message || 'Error desconocido';
            toast.error('Error al guardar: ' + msg);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (payment) => {
        if (!window.confirm(`¿Eliminar el registro ${payment.externalId}?`)) return;
        setLoading(true);
        try {
            await api.delete(`/admin/payments/${payment.id}`);
            toast.success('Registro eliminado correctamente');
            notifyUpdate('payments');
            fetchData();
        } catch (err) {
            toast.error(err.message || 'Error al eliminar');
        } finally {
            setLoading(false);
        }
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExport = () => {
        const dataToExport = [...payments]
            .sort((a, b) => {
                const numA = parseInt(a.externalId?.replace(/\D/g, '') || '0', 10);
                const numB = parseInt(b.externalId?.replace(/\D/g, '') || '0', 10);
                return numB - numA;
            })
            .map(item => {
                const client = clients.find(c => c.id === item.clientId || c.id === parseInt(item.clientId));
                const realCustomerId = client ? client.customerId : (item.Client?.customerId || item.clientId);
                return {
                    'Id_EP': item.externalId,
                    'Customer_id': realCustomerId,
                    'Id_VM': item.idVm,
                    'Nombre': item.Client?.name || '',
                    'Apellido': `${item.Client?.surname1 || ''} ${item.Client?.surname2 || ''}`.trim(),
                    'Mes Desembolso': item.mesDesembolso,
                    'Saldo Inicial': parseFloat(item.saldoInicial || 0),
                    '# Cuotas Prestamo': item.cuotasPrestamo,
                    'Interes Mensual': parseFloat(item.interesMensual || 0),
                    'Valor Intereses amortizados': parseFloat(item.valorInteresesAmortizados || 0),
                    'Fecha de Pago Max': item.fechaPagoMax,
                    'Mes de Pago': item.mesPago,
                    'Valor Cuota Variable': parseFloat(item.valorCuotaVariable || 0),
                    'Estado': item.estado,
                    'Valor Cuota Pago': parseFloat(item.valorCuotaPago || 0),
                    'Saldo Final': parseFloat(item.saldoFinal || 0),
                    'Banco desembolsado': item.banco,
                    '# Transaccion': item.numeroTransaccion,
                    'Cuenta de Ahorros': item.cuentaAhorros,
                    'Observaciones': item.observaciones,
                    'Estado Prestamo': item.estadoPrestamo,
                    'Soporte Adjunto': soportesInfo[item.id] ? 'Sí' : 'No'
                };
            });

        const result = exportToExcel(dataToExport, 'Reporte_Estado_Prestamos', 'Reporte', {
            'Saldo Inicial': '"$"#,##0',
            'Interes Mensual': '0.00%',
            'Valor Intereses amortizados': '"$"#,##0',
            'Valor Cuota Variable': '"$"#,##0',
            'Valor Cuota Pago': '"$"#,##0',
            'Saldo Final': '"$"#,##0'
        });
        if (!result.success) toast.error(result.error);
        else toast.success('Reporte descargado');
    };

    // ── Eliminar Soporte ──────────────────────────────────────────────────────
    const handleDeleteSoporte = async (paymentId) => {
        if (!window.confirm('¿Eliminar el soporte adjunto? Esta acción no se puede deshacer.')) return;
        try {
            await api.delete(`/admin/payments/${paymentId}/soporte`);
            setSoportesInfo(prev => {
                const next = { ...prev };
                delete next[paymentId];
                return next;
            });
            toast.success('Soporte eliminado correctamente');
        } catch (err) {
            toast.error('Error al eliminar el soporte: ' + (err.response?.data?.error || err.message));
        }
    };

    // ── Descargar Soporte ─────────────────────────────────────────────────────
    const handleDownloadSoporte = async (paymentId, fileName) => {
        try {
            const res = await api.get(`/admin/payments/${paymentId}/soporte`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error('Error al descargar el archivo de soporte');
            console.error('Download error:', err);
        }
    };

    // ── Variables pre-computadas para el selector de registros ────────────────
    // Lista de clientes únicos que tienen registros de pago
    const selectorUniqueClients = [...new Map(
        payments.filter(p => p.Client).map(p => [p.clientId, p.Client])
    ).entries()].sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

    // Lista de Id_VM filtrada por el socio seleccionado
    const selectorUniqueIdVms = [...new Set(
        payments
            .filter(p => !selectorClientId || String(p.clientId) === String(selectorClientId))
            .map(p => p.idVm)
            .filter(Boolean)
    )].sort();

    const selectorAnyFilter = selectorSearch.trim() || selectorClientId || selectorIdVm || selectorMes || selectorEstado || selectorCuota;
    const selectorFiltered = selectorAnyFilter ? payments.filter(p => {
        const term = selectorSearch.toLowerCase().trim();
        // Filtro por Id_EP (texto libre)
        if (term && !(p.externalId || '').toLowerCase().includes(term)) return false;
        // Filtro por Socio (clientId exacto)
        if (selectorClientId && String(p.clientId) !== String(selectorClientId)) return false;
        // Filtro por Id_VM
        if (selectorIdVm && (p.idVm || '').toLowerCase() !== selectorIdVm.toLowerCase()) return false;
        // Filtro por Mes de Pago
        if (selectorMes && (p.mesPago || '').toLowerCase() !== selectorMes.toLowerCase()) return false;
        // Filtro por Estado
        if (selectorEstado && p.estado !== selectorEstado) return false;
        // Filtro por # Cuota
        if (selectorCuota && String(p.itemQuantity) !== String(selectorCuota)) return false;
        return true;
    }) : [];

    const selectorFieldCls = "flex h-10 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary outline-none transition-colors";
    const clearSelectorFilters = () => { setSelectorSearch(''); setSelectorClientId(''); setSelectorIdVm(''); setSelectorMes(''); setSelectorEstado(''); setSelectorCuota(''); };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* ── Mini-KPI Bar ────────────────────────────────────────────────── */}
            {!loading && payments.length > 0 && (() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

                const safeParse = (d) => {
                    if (!d) return null;
                    const s = String(d).split('T')[0];
                    const [y, m, dd] = s.split('-').map(Number);
                    return (y && m && dd) ? new Date(y, m - 1, dd) : null;
                };

                const pagadas = payments.filter(p => p.estado === 'Pago');
                const pendientes = payments.filter(p => p.estado === 'Pendiente');
                const enMora = payments.filter(p => p.estado === 'Mora');
                const tasaRecuperacion = payments.length > 0 ? (pagadas.length / payments.length) * 100 : 0;

                const proximas = pendientes.filter(p => {
                    const f = safeParse(p.fechaPagoMax);
                    return f && f >= today && f <= in30;
                });
                const montoProximas = proximas.reduce((s, p) => s + parseFloat(p.valorCuotaVariable || 0), 0);

                const montoMora = enMora.reduce((s, p) => s + parseFloat(p.valorCuotaVariable || 0), 0);

                const kpis = [
                    {
                        label: 'Tasa de Recuperación',
                        value: `${tasaRecuperacion.toFixed(0)}%`,
                        sub: `${pagadas.length} de ${payments.length} cuotas cobradas`,
                        color: tasaRecuperacion >= 70 ? 'border-l-emerald-400' : tasaRecuperacion >= 50 ? 'border-l-amber-400' : 'border-l-red-400',
                        icon: '✓',
                    },
                    {
                        label: 'Vencen en 30 Días',
                        value: proximas.length,
                        sub: `$${Math.round(montoProximas).toLocaleString('es-CO')} por cobrar`,
                        color: proximas.length > 0 ? 'border-l-amber-400' : 'border-l-emerald-400',
                        icon: '📅',
                    },
                    {
                        label: 'Cuotas en Mora',
                        value: enMora.length,
                        sub: enMora.length > 0 ? `$${Math.round(montoMora).toLocaleString('es-CO')} vencidos` : 'Sin cuotas vencidas',
                        color: enMora.length === 0 ? 'border-l-emerald-400' : 'border-l-red-400',
                        icon: enMora.length === 0 ? '✓' : '⚠️',
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

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-xl font-bold text-brand-primary flex items-center gap-2">
                        📋 Registro Estado Préstamos (Control Pagos)
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button variant="outline" className="text-green-700 border-green-700 hover:bg-green-50" onClick={handleExport}>
                            <FileDown size={18} className="mr-2" /> Exportar Excel
                        </Button>
                        <Button onClick={() => handleOpenModal()}>
                            <Edit size={18} className="mr-2" /> Modificar Registro
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* ── FILTROS ── */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <div className="md:col-span-2">
                            <Label>Buscar por Socio</Label>
                            <select
                                aria-label="Buscar por socio"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            >
                                <option value="">Todos los Socios</option>
                                {Array.from(new Set(payments.map(p => {
                                    const name = p.Client?.name || '';
                                    const surname = p.Client?.surname1 || '';
                                    const cedula = p.Client?.cedula || '';
                                    return `${name} ${surname} (${cedula})`.replace(/\s\(\)$/, '').trim();
                                }).filter(n => n !== '()'))).sort().map(socio => (
                                    <option key={socio} value={socio}>{socio}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label>Estado</Label>
                            <select
                                aria-label="Filtrar por estado del pago"
                                value={filterEstado}
                                onChange={e => setFilterEstado(e.target.value)}
                                className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            >
                                <option value="Todos">Todos</option>
                                {availableEstados.map(est => (
                                    <option key={est} value={est}>{est}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label>Filtrar por Estado Préstamo</Label>
                            <select
                                aria-label="Filtrar por estado del préstamo"
                                value={filterEstadoPrestamo}
                                onChange={e => setFilterEstadoPrestamo(e.target.value)}
                                className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            >
                                <option value="Todos">Todos los estados</option>
                                {availableEstadoPrestamo.map(est => (
                                    <option key={est} value={est}>{est}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* ── CONTADOR ── */}
                    <div className="flex justify-between items-center text-sm text-gray-500 mb-3">
                        <span>Mostrando <strong>{paginated.length}</strong> de <strong>{filteredPayments.length}</strong> registros</span>
                        <span>Página {currentPage} de {totalPages}</span>
                    </div>

                    {/* ── TABLA ── */}
                    {loading ? (
                        <div className="flex justify-center items-center py-20 text-gray-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mr-3"></div>
                            Cargando registros...
                        </div>
                    ) : paginated.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <p className="text-lg font-medium">No se encontraron registros</p>
                            <p className="text-sm mt-1">Ajusta los filtros o registra un nuevo pago</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-brand-primary text-white text-left">
                                        {[
                                            { key: 'externalId',         label: 'Id_EP',             cls: '' },
                                            { key: null,                  label: 'Socio / Cédula',    cls: '' },
                                            { key: 'idVm',               label: 'Id_VM',             cls: '' },
                                            { key: 'cuotasPrestamo',     label: '# Cuotas Prestamo', cls: 'text-center' },
                                            { key: 'fechaPagoMax',       label: 'Fecha Pago',        cls: '' },
                                            { key: 'saldoInicial',       label: 'Saldo Inicial',     cls: 'text-right' },
                                            { key: 'valorCuotaVariable', label: 'Cuota Variable',    cls: 'text-right' },
                                            { key: 'saldoFinal',         label: 'Saldo Final',       cls: 'text-right' },
                                            { key: 'estado',             label: 'Estado',            cls: 'text-center' },
                                            { key: null,                  label: 'Soporte',           cls: 'text-center' },
                                            { key: null,                  label: 'Activo',            cls: 'text-center' },
                                            { key: null,                  label: 'Acciones',          cls: 'text-center' },
                                        ].map(col => (
                                            <th key={col.label} className={`px-3 py-3 font-semibold ${col.cls} ${col.key ? 'cursor-pointer select-none hover:bg-brand-dark transition-colors' : ''}`} onClick={() => col.key && handlePayPageSort(col.key)}>
                                                <span className="inline-flex items-center gap-1">{col.label}{col.key && <SortIcon colKey={col.key} sortConfig={payPageSort} />}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginated.map((p, idx) => (
                                        <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                                            <td className="px-3 py-2.5 font-bold text-brand-primary">{p.externalId}</td>
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium">{p.Client?.name} {p.Client?.surname1}</div>
                                                <div className="text-xs text-gray-400">{p.Client?.customerId}</div>
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-gray-700">{p.idVm}</td>
                                            <td className="px-3 py-2.5 text-center font-bold text-gray-600">{p.cuotasPrestamo ?? 0}</td>
                                            <td className="px-3 py-2.5">
                                                <div>{displayFecha(p.fechaPagoMax, p.mesPago)}</div>
                                                <div className="text-xs text-gray-400">{p.mesPago}</div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono">${parseFloat(p.saldoInicial || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                                            <td className="px-3 py-2.5 text-right font-bold text-blue-700">${parseFloat(p.valorCuotaVariable || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                                            <td className="px-3 py-2.5 text-right font-bold text-red-700">${parseFloat(p.saldoFinal || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                                            <td className="px-3 py-2.5 text-center">
                                                <EstadoBadge estado={p.estado} />
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                {soportesInfo[p.id] ? (
                                                    <button
                                                        onClick={() => handleDownloadSoporte(p.id, soportesInfo[p.id].name)}
                                                        className="inline-flex items-center justify-center p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-md transition-colors"
                                                        title={`Descargar ${soportesInfo[p.id].name}`}
                                                    >
                                                        <FileDown className="h-5 w-5" />
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <ToggleSwitch
                                                    active={p.estado === 'Pago'}
                                                    onToggle={() => handleToggle(p)}
                                                    disabled={togglingId === p.id}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => handleOpenModal(p)}
                                                        className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                                                        title="Editar"
                                                    >
                                                        <Edit size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(p)}
                                                        className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── PAGINACIÓN ── */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-5">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-md border text-sm font-medium disabled:opacity-40 hover:bg-gray-50"
                            >
                                ‹ Anterior
                            </button>
                            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                let page;
                                if (totalPages <= 7) page = i + 1;
                                else if (currentPage <= 4) page = i + 1;
                                else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
                                else page = currentPage - 3 + i;
                                return (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`w-8 h-8 rounded-md text-sm font-medium
                                            ${currentPage === page ? 'bg-brand-primary text-white' : 'border hover:bg-gray-50'}`}
                                    >
                                        {page}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-md border text-sm font-medium disabled:opacity-40 hover:bg-gray-50"
                            >
                                Siguiente ›
                            </button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════════════════════ MODAL FORM ═══════════════════════════════ */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-brand-primary">
                                {isEditing
                                    ? '✏️ Modificar Registro Estado Préstamo'
                                    : '🔍 Seleccionar Registro a Modificar'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
                        </div>

                        {/* ── FORMULARIO DE BÚSQUEDA MULTI-CAMPO (modo selector) ── */}
                        {selectingRecord ? (
                            <div className="p-6 space-y-5">
                                {/* Banner instrucción */}
                                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-start gap-3">
                                    <Search className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-indigo-800">Filtrar registro a modificar</p>
                                        <p className="text-xs text-indigo-600 mt-0.5">Usa uno o más campos para encontrar el registro exacto. Los resultados se actualizan automáticamente.</p>
                                    </div>
                                </div>

                                {/* ── FILA 1 ── */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Id_EP</label>
                                        <input type="text" autoFocus aria-label="Buscar pago por Id_EP" placeholder="Ej: P59, P122..." value={selectorSearch} onChange={e => setSelectorSearch(e.target.value)} className={selectorFieldCls} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Socio</label>
                                        <select
                                            aria-label="Socio"
                                            value={selectorClientId}
                                            onChange={e => {
                                                setSelectorClientId(e.target.value);
                                                // Al cambiar socio, limpiar Id_VM para evitar filtros sin resultados
                                                setSelectorIdVm('');
                                            }}
                                            className={selectorFieldCls}
                                        >
                                            <option value="">— Todos los socios —</option>
                                            {selectorUniqueClients.map(([id, c]) => <option key={id} value={id}>{c.name} {c.surname1}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">
                                            Id VM (Préstamo)
                                            {selectorClientId && <span className="ml-1 text-indigo-500 font-normal normal-case">— filtrado por socio</span>}
                                        </label>
                                        <select aria-label="Préstamo (Id_VM)" value={selectorIdVm} onChange={e => setSelectorIdVm(e.target.value)} className={selectorFieldCls}>
                                            <option value="">— Todos —</option>
                                            {selectorUniqueIdVms.map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* ── FILA 2 ── */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Mes de Pago</label>
                                        <select aria-label="Mes de pago" value={selectorMes} onChange={e => setSelectorMes(e.target.value)} className={selectorFieldCls}>
                                            <option value="">— Todos los meses —</option>
                                            {monthNames.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Estado</label>
                                        <select aria-label="Estado de la cuota" value={selectorEstado} onChange={e => setSelectorEstado(e.target.value)} className={selectorFieldCls}>
                                            <option value="">— Todos —</option>
                                            <option value="Pendiente">Pendiente</option>
                                            <option value="Pago">Pago</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide"># Cuota</label>
                                        <input type="number" min="1" aria-label="Filtrar por número de cuota" placeholder="Ej: 1, 2, 3..." value={selectorCuota} onChange={e => setSelectorCuota(e.target.value)} className={selectorFieldCls} />
                                    </div>
                                </div>

                                {/* Contador + limpiar */}
                                {selectorAnyFilter && (
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-gray-500">{selectorFiltered.length} resultado(s) encontrado(s)</p>
                                        <button type="button" onClick={clearSelectorFilters} className="text-xs text-red-500 hover:text-red-700 font-medium underline">Limpiar todos los filtros</button>
                                    </div>
                                )}

                                {/* Estado vacío */}
                                {!selectorAnyFilter && (
                                    <div className="text-center py-8 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                                        <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                        Selecciona al menos un filtro para ver registros
                                    </div>
                                )}

                                {selectorAnyFilter && selectorFiltered.length === 0 && (
                                    <div className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                                        No se encontraron registros con los filtros aplicados
                                    </div>
                                )}

                                {/* Resultados */}
                                {selectorAnyFilter && selectorFiltered.length > 0 && (
                                    <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                                        {selectorFiltered.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => handleOpenModal(p)}
                                                className="w-full text-left border-2 border-gray-200 hover:border-brand-primary rounded-lg px-4 py-3 transition-all group hover:shadow-md bg-white"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <span className="inline-flex items-center justify-center min-w-[60px] h-9 rounded-md bg-brand-primary/10 text-brand-primary font-bold text-sm px-2 group-hover:bg-brand-primary group-hover:text-white transition-colors">
                                                            {p.externalId}
                                                        </span>
                                                        <div>
                                                            <div className="font-semibold text-gray-900 text-sm">{p.Client?.name} {p.Client?.surname1}</div>
                                                            <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                                                                <span className="font-mono font-semibold">{p.idVm}</span>
                                                                <span className="text-gray-300">|</span>
                                                                <span>{p.mesPago}</span>
                                                                <span className="text-gray-300">|</span>
                                                                <span>Cuota #{p.itemQuantity}</span>
                                                                <span className="text-gray-300">|</span>
                                                                <span className="font-semibold text-gray-700">${parseFloat(p.valorCuotaVariable || 0).toLocaleString('es-CO')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${p.estado === 'Pago' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{p.estado}</span>
                                                        <Edit size={15} className="text-gray-300 group-hover:text-brand-primary transition-colors" />
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="flex justify-end pt-2 border-t">
                                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                                </div>
                            </div>
                        ) : (
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* SECCIÓN 1: IDENTIFICACIÓN */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div>
                                    <Label>1. Id_EP</Label>
                                    <select
                                        aria-label="Id_EP"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.externalId || ''}
                                        onChange={e => {
                                            const selectedId = e.target.value;
                                            setPaymentForm(prev => ({ ...prev, externalId: selectedId }));
                                            if (selectedId) {
                                                const found = payments.find(p => p.externalId === selectedId);
                                                if (found) handleOpenModal(found);
                                            }
                                        }}
                                    >
                                        <option value="">-- Seleccionar Id_EP --</option>
                                        {[...payments]
                                            .sort((a, b) => {
                                                const na = parseInt((a.externalId || '').replace(/\D/g, '') || '0');
                                                const nb = parseInt((b.externalId || '').replace(/\D/g, '') || '0');
                                                return nb - na;
                                            })
                                            .map(p => (
                                                <option key={p.id} value={p.externalId}>
                                                    {p.externalId}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <Label>2. Customer_id</Label>
                                    <select
                                        aria-label="Customer_id"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.clientId}
                                        onChange={e => {
                                            setIsEditing(false);
                                            setEditingId(null);
                                            setPaymentForm(prev => ({ ...prev, clientId: e.target.value }));
                                        }}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {(clientsWithActiveLoans || []).map(c => <option key={c.id} value={c.id}>{c.customerId || c.id} - {c.name} {c.surname1}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <Label>3. Nombre</Label>
                                    <Input
                                        value={paymentForm.nombre || ''}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, nombre: e.target.value }))}
                                        className="bg-white"
                                    />
                                </div>
                                <div>
                                    <Label>4. Apellido</Label>
                                    <Input
                                        value={paymentForm.apellido || ''}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, apellido: e.target.value }))}
                                        className="bg-white"
                                    />
                                </div>
                            </div>

                            {/* SECCIÓN 2: DETALLES PRÉSTAMO */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <Label>5. Mes Desembolso</Label>
                                    <Input
                                        value={paymentForm.mesDesembolso || ''}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, mesDesembolso: e.target.value }))}
                                        className="bg-white"
                                    />
                                </div>
                                <div>
                                    <Label>6. Saldo Inicial</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-900 font-bold">$</span>
                                        <FormattedNumberInput
                                            step="0.01"
                                            value={paymentForm.saldoInicial || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, saldoInicial: e.target.value }))}
                                            className="pl-7 bg-white text-green-900 font-bold border-green-200"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label>7. # Cuota a Pagar</Label>
                                    <select
                                        aria-label="# Cuota a pagar"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.itemQuantity}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, itemQuantity: e.target.value ? parseInt(e.target.value, 10) : '' }))}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {(() => {
                                            // Usar el total de cuotas del préstamo real para las opciones
                                            const realLoan = paymentForm.idVm
                                                ? disbursedLoans.find(l => (l.idVm || l.orderId) === paymentForm.idVm)
                                                : null;
                                            const maxCuotas = parseInt(realLoan?.cuotas || paymentForm.cuotasPrestamo || 12);
                                            return Array.from({ length: maxCuotas }, (_, i) => (
                                                <option key={i + 1} value={i + 1}>Cuota {i + 1}</option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                                <div>
                                    <Label>8. Interes Mensual (%)</Label>
                                    <div className="relative">
                                        <FormattedNumberInput
                                            isPercent={true}
                                            step="0.0001"
                                            min="0"
                                            max="1"
                                            value={paymentForm.interesMensual || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, interesMensual: e.target.value }))}
                                            className="bg-white font-medium"
                                            placeholder="Ej: 0.02 = 2%"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 3: AMORTIZACIÓN */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div>
                                    <Label>9. Valor Int. Amortizados</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-bold">$</span>
                                        <FormattedNumberInput
                                            step="0.01"
                                            value={paymentForm.valorInteresesAmortizados || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, valorInteresesAmortizados: e.target.value }))}
                                            className="pl-7 bg-white font-mono"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="payment-fecha-max">10. Fecha de Pago Max</Label>
                                    <input
                                        id="payment-fecha-max"
                                        type="date"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.fechaPagoMax || ''}
                                        onChange={e => {
                                            const val = e.target.value;
                                            let calculatedMes = paymentForm.mesPago;
                                            if (val) {
                                                const [, monthStr] = val.split('-');
                                                const mesIdx = parseInt(monthStr, 10) - 1;
                                                calculatedMes = monthNames[mesIdx] || calculatedMes;
                                            }
                                            setPaymentForm(prev => ({ ...prev, fechaPagoMax: val, mesPago: calculatedMes }));
                                        }}
                                    />
                                </div>
                                <div>
                                    <Label>11. Mes de Pago</Label>
                                    <select
                                        aria-label="Mes de pago"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.mesPago}
                                        onChange={e => setPaymentForm(prev => ({ ...prev, mesPago: e.target.value }))}
                                    >
                                        <option value="">-- Seleccionar Mes --</option>
                                        {monthNames.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-blue-800 font-bold">12. Valor Cuota Variable</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-700 font-bold">$</span>
                                        <FormattedNumberInput
                                            step="0.01"
                                            value={paymentForm.valorCuotaVariable || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, valorCuotaVariable: e.target.value }))}
                                            className="pl-7 bg-white font-bold text-blue-700 text-lg border-blue-300"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 4: ESTADO Y SALDOS */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-green-50 p-4 rounded-lg border border-green-100">
                                <div>
                                    <Label>13. Estado</Label>
                                    <select
                                        aria-label="Estado de la cuota"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                        value={paymentForm.estado}
                                        onChange={e => setPaymentForm({ ...paymentForm, estado: e.target.value })}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {availableEstados.map(est => (
                                            <option key={est} value={est}>{est}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-green-800 font-bold">14. Valor Cuota Pago</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">$</span>
                                        <FormattedNumberInput step="0.01" className="pl-7 border-green-500 font-bold text-lg" value={paymentForm.valorCuotaPago} onChange={e => setPaymentForm({ ...paymentForm, valorCuotaPago: e.target.value })} required />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-red-800 font-bold">15. Saldo Final</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-700 font-bold">$</span>
                                        <FormattedNumberInput
                                            step="0.01"
                                            value={paymentForm.saldoFinal || ''}
                                            onChange={e => setPaymentForm(prev => ({ ...prev, saldoFinal: e.target.value }))}
                                            className="pl-7 bg-white font-bold text-red-700"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label>16. Total Cuotas Plan <span className="ml-1 text-xs font-normal text-gray-400">(informativo)</span></Label>
                                    {/* Campo de solo lectura: muestra el total de cuotas DEL PRÉSTAMO real.
                                        NO se guarda en BD. Lo que se guarda es el número de cuota (campo 7 = itemQuantity). */}
                                    <Input
                                        type="number"
                                        readOnly
                                        value={(() => {
                                            if (!paymentForm.idVm) return paymentForm.cuotasPrestamo || '';
                                            const loan = disbursedLoans.find(l => (l.idVm || l.orderId) === paymentForm.idVm);
                                            return loan?.cuotas ?? paymentForm.cuotasPrestamo ?? '';
                                        })()}
                                        className="bg-gray-50 text-gray-500 cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            {/* SECCIÓN 5: DETALLES */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <Label>17. Banco Desembolsado</Label>
                                    <select
                                        aria-label="Banco desembolsado"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                        value={paymentForm.banco}
                                        onChange={e => setPaymentForm({ ...paymentForm, banco: e.target.value })}
                                    >
                                        <option value="">-- Seleccionar Banco --</option>
                                        {COLOMBIAN_BANKS_WITH_OTHER.map(bank => (
                                            <option key={bank} value={bank}>{bank}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label>18. # Transaccion</Label>
                                    <Input value={paymentForm.numeroTransaccion} onChange={e => setPaymentForm({ ...paymentForm, numeroTransaccion: e.target.value })} />
                                </div>
                                <div>
                                    <Label>19. Cuenta de Ahorros</Label>
                                    <Input value={paymentForm.cuentaAhorros} onChange={e => setPaymentForm({ ...paymentForm, cuentaAhorros: e.target.value })} />
                                </div>
                                <div>
                                    <Label>20. Observaciones</Label>
                                    <Input value={paymentForm.observaciones} onChange={e => setPaymentForm({ ...paymentForm, observaciones: e.target.value })} />
                                </div>
                            </div>

                            {/* SECCIÓN 6: RELACIÓN PRÉSTAMO */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                <div>
                                    <Label>21. Id_VM (Ref. Préstamo)</Label>
                                    <select
                                        aria-label="Id_VM (Ref. préstamo)"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                        value={paymentForm.idVm}
                                        onChange={e => {
                                            const loan = disbursedLoans.find(l => (l.idVm === e.target.value || l.orderId === e.target.value));
                                            if (loan) {
                                                const existingPaymentsCount = payments.filter(p => p.idVm === (loan.idVm || loan.orderId)).length;
                                                setPaymentForm(prev => ({
                                                    ...prev,
                                                    idVm: e.target.value,
                                                    mesDesembolso: loan.mesDesembolso,
                                                    saldoInicial: loan.valorPrestado || loan.monto,
                                                    cuotasPrestamo: loan.cuotas,
                                                    interesMensual: loan.interesMensual,
                                                    estadoPrestamo: loan.estado,
                                                    banco: loan.banco,
                                                    cuentaAhorros: loan.cuentaAhorros,
                                                    itemQuantity: (existingPaymentsCount + 1).toString()
                                                }));
                                            } else {
                                                setPaymentForm(prev => ({ ...prev, idVm: e.target.value }));
                                            }
                                        }}
                                    >
                                        <option value="">-- Manual / Ninguno --</option>
                                        {(disbursedLoans || [])
                                            .filter(l => l && l.clientId && (!paymentForm.clientId || l.clientId.toString() === paymentForm.clientId.toString()))
                                            .map(l => (
                                                <option key={l.id} value={l.idVm || l.orderId}>
                                                    {l.idVm || l.orderId} - {l.estado} (${parseFloat(l.valorPrestado || l.monto || 0).toLocaleString()})
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>
                                <div>
                                    <Label>22. Estado Prestamo</Label>
                                    <select
                                        aria-label="Estado del préstamo"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                        value={paymentForm.estadoPrestamo}
                                        onChange={e => setPaymentForm({ ...paymentForm, estadoPrestamo: e.target.value })}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {availableEstadoPrestamo.map(est => (
                                            <option key={est} value={est}>{est}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* SECCIÓN 7: SOPORTE DE PAGO */}
                            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 space-y-3">
                                <Label className="text-gray-800 font-bold block">23. Subir Registro de Pago (Soporte)</Label>

                                {/* Soporte existente en BD */}
                                {isEditing && soportesInfo[editingId] && !soporteFile && (
                                    <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <FileDown className="h-5 w-5 text-blue-600 shrink-0" />
                                            <div>
                                                <p className="text-sm font-semibold text-blue-800">Soporte adjunto</p>
                                                <p className="text-xs text-blue-600">{soportesInfo[editingId].name}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadSoporte(editingId, soportesInfo[editingId].name)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
                                            >
                                                <FileDown className="h-3.5 w-3.5" /> Descargar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSoporte(editingId)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                                            >
                                                <X className="h-3.5 w-3.5" /> Eliminar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Zona de subida */}
                                <div
                                    className={`relative border-2 border-dashed rounded-lg p-6 transition-all duration-200 ease-in-out text-center ${soporteFile
                                        ? 'border-brand-primary bg-brand-primary/5'
                                        : 'border-gray-300 hover:border-brand-primary hover:bg-gray-50'
                                        }`}
                                >
                                    <input
                                        type="file"
                                        aria-label="Subir soporte de pago"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        accept=".jpg,.jpeg,.png,.pdf"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                setSoporteFile(e.target.files[0]);
                                            }
                                        }}
                                    />
                                    <div className="flex flex-col items-center justify-center space-y-2">
                                        {soporteFile ? (
                                            <>
                                                <div className="bg-brand-primary/20 p-3 rounded-full">
                                                    <FileDown className="h-6 w-6 text-brand-primary" />
                                                </div>
                                                <p className="text-sm font-medium text-gray-900">{soporteFile.name}</p>
                                                <p className="text-xs text-gray-500">{(soporteFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                <div className="z-10 relative mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setSoporteFile(null);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                                                    >
                                                        <X className="h-3.5 w-3.5" /> Eliminar Archivo
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="bg-gray-100 p-3 rounded-full">
                                                    <Plus className="h-6 w-6 text-gray-400" />
                                                </div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {isEditing && soportesInfo[editingId]
                                                        ? 'Arrastra para reemplazar el soporte actual'
                                                        : <>
                                                            Arrastra una imagen/PDF aquí o <span className="text-brand-primary">explora</span>
                                                          </>}
                                                </p>
                                                <p className="text-xs text-gray-500">JPG, PNG o PDF (Máximo 10MB)</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button type="button" variant="outline" onClick={handleCloseModal}>Cancelar</Button>
                                <Button type="submit" size="lg">💾 Actualizar Registro</Button>
                            </div>
                        </form>
                        )} {/* end selectingRecord ternary */}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentsPage;
