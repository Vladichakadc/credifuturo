import React, { useState, useEffect, useMemo } from 'react';
import api from '../../config/api';
import { notifyUpdate } from '../../utils/sync';
import { useSearchParams } from 'react-router-dom';
import { Plus, Download, Edit, Trash2, Save, X, RefreshCw, Search, Filter, AlertTriangle, FileDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Label, FormField } from '../../components/ui/Input';
import { Card, CardContent } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import * as XLSX from 'xlsx';
import { useUi } from '../../context/UiContext';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../../utils/banks';
const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Bank list is imported from utils

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

    const currentMonth = new Date().getMonth();

    const emptyForm = () => ({
        id: '',
        clientId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        type: 'Mensual',
        banco: '',
        numeroTransaccion: '',
        origen: '',
        penalizacion: 'NO',
        diasPenalizacion: '0',
        valorAhorrado: '0',
        valorAPenalizar: '0',
        mesAbonado: new Date().getMonth() + 1,
        anioAbonado: new Date().getFullYear(),
        year: new Date().getFullYear(),
        month: monthNames[new Date().getMonth()],
        monthInt: new Date().getMonth() + 1,
        externalId: '',
        idAhorro: '', // LEGACY: No longer used in DB
        status: 'Abono',
        itemQuantity: '1',
        observaciones: ''
    });

    const [savingForm, setSavingForm] = useState(emptyForm());
    const [dormantInfo, setDormantInfo] = useState(null);
    const [pagoAdicionalInfo, setPagoAdicionalInfo] = useState(null); // Info pago adicional sin penalización
    const [soporteFile, setSoporteFile] = useState(null); // Para el archivo drag & drop

    // --- Dynamic Combo Box Options Data ---
    const uniqueBancos = useMemo(() => {
        const banks = savings.map(s => s.banco).filter(b => b && b.trim() !== '' && b !== 'N/A');
        return [...new Set(banks)].sort();
    }, [savings]);

    const uniqueStatuses = useMemo(() => {
        const statuses = savings.map(s => s.status).filter(st => st && st.trim() !== '');
        return [...new Set(statuses)].sort();
    }, [savings]);

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

    // --- Auto-Increment Logic ---
    const autoIncrementSavingId = () => {
        if (!savings || savings.length === 0) return 'AM339';
        const amPattern = /^AM(\d+)$/;
        const amNumbers = savings
            .map(s => s.externalId)
            .filter(id => id && amPattern.test(id))
            .map(id => parseInt(id.match(amPattern)[1]))
            .filter(n => !isNaN(n));
        if (amNumbers.length === 0) return 'AM339';
        return `AM${Math.max(...amNumbers) + 1}`;
    };

    // --- Deduce dormant months alert logic (Integrated into calculations effect below) ---
    // Removed old separate effect to prevent state discrepancies

    // --- Calculations Effect (CONSOLIDATED) ---
    useEffect(() => {
        if (!savingForm.date || !isModalOpen) return;

        // Parse date once
        const [yearStr, monthStr, dayStr] = savingForm.date.split('-');
        const dia = parseInt(dayStr);
        const anio = parseInt(yearStr);
        const mes = parseInt(monthStr);

        // Helper for consistent dates (start of day)
        const getBaseDate = (y, m, d) => {
            const date = new Date(y, m - 1, d);
            date.setHours(0, 0, 0, 0);
            return date;
        };

        const paymentDate = getBaseDate(anio, mes, dia);

        const mesMap = {
            'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
            'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        };
        const mesTexto = (savingForm.month || '').toLowerCase().trim();
        const mesAbonadoCalc = mesMap[mesTexto] || mes;

        const monto = parseFloat(savingForm.amount) || 0;
        const penalizacionPorDia = 1000;

        let penalizacionStatus = 'NO';
        let diasPenalizacion = 0;
        let valorAPenalizar = 0;

        const anioAbonadoUser = parseInt(savingForm.anioAbonado) || anio;
        const isPagoAdelantado = (anioAbonadoUser > anio) || (anioAbonadoUser === anio && mesAbonadoCalc > mes);
        const isPagoAtrasado = (anioAbonadoUser < anio) || (anioAbonadoUser === anio && mesAbonadoCalc < mes);

        // ── VALIDACIÓN: Pago adicional del mes actual (sin penalización) ──
        // Si el socio ya tiene un ahorro registrado para el mismo mes/año,
        // cualquier pago adicional NO genera penalización.
        let isPagoAdicionalMesActual = false;
        let pagoAdicionalDetectedInfo = null;
        if (!isEditing && savingForm.clientId) {
            const mesActualText = (savingForm.month || '').trim().toLowerCase();
            const existePagoMesActual = savings.find(s =>
                String(s.clientId) === String(savingForm.clientId) &&
                String(s.year) === String(anio) &&
                (s.month || '').trim().toLowerCase() === mesActualText &&
                s.type !== 'Aporte Inicial' &&
                String(s.externalId) !== String(savingForm.externalId)
            );
            if (existePagoMesActual) {
                isPagoAdicionalMesActual = true;
                const client = clients.find(c => String(c.id) === String(savingForm.clientId));
                const clientName = client ? `${client.name} ${client.surname1}` : 'El socio seleccionado';
                pagoAdicionalDetectedInfo = {
                    name: clientName,
                    month: savingForm.month,
                    year: anio,
                    existingId: existePagoMesActual.externalId
                };
            }
        }

        // 1. Cálculo Base
        if (isPagoAdicionalMesActual) {
            // Pago adicional: el socio ya pagó este mes, NO genera penalización
            penalizacionStatus = 'NO';
            diasPenalizacion = 0;
            valorAPenalizar = 0;
        } else if (isPagoAtrasado) {
            penalizacionStatus = 'SI';
            const targetDate = getBaseDate(anioAbonadoUser, mesAbonadoCalc - 1, 10);
            const diffMs = paymentDate - targetDate;
            diasPenalizacion = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            valorAPenalizar = diasPenalizacion * penalizacionPorDia;
        } else if (dia > 10 && !isPagoAdelantado) {
            penalizacionStatus = 'SI';
            diasPenalizacion = dia - 10;
            valorAPenalizar = diasPenalizacion * penalizacionPorDia;
        }

        // 2. Validación Acumulada (Dormant Info recalculated locally to avoid lag)
        let alertInfo = null;
        if (!isEditing && savingForm.clientId && !isPagoAdicionalMesActual) {
            const clientSavingsThisYear = savings.filter(s =>
                String(s.clientId) === String(savingForm.clientId) && 
                String(s.year) === String(anio) &&
                s.type !== 'Aporte Inicial' &&
                String(s.externalId) !== String(savingForm.externalId) // NEW: don't count me as an existing record!
            );

            if (clientSavingsThisYear.length === 0) {
                // Find missed months (Jan up to current mes)
                const missed = [];
                for (let m = 1; m <= mes; m++) {
                    const cutoff = getBaseDate(anio, m, 10);
                    if (paymentDate > cutoff) missed.push(m);
                }

                if (missed.length > 0) {
                    const earliest = missed[0];
                    const startPenaltyDate = getBaseDate(anio, earliest, 10);
                    const diffMs = paymentDate - startPenaltyDate;
                    const accDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                    const accPenalty = accDays * 1000;

                    if (accPenalty > valorAPenalizar) {
                        valorAPenalizar = accPenalty;
                        diasPenalizacion = accDays;
                        penalizacionStatus = 'SI';
                    }

                    const client = clients.find(c => String(c.id) === String(savingForm.clientId));
                    const clientName = client ? `${client.name} ${client.surname1}` : 'El socio seleccionado';
                    const mesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    const mesesTextoAlert = missed.map(m => mesNombres[m - 1]).join(', ');

                    alertInfo = {
                        name: clientName,
                        year: anio,
                        penalty: valorAPenalizar,
                        months: mesesTextoAlert
                    };
                }
            }
        }

        // Sync Alert State
        setDormantInfo(alertInfo);
        setPagoAdicionalInfo(pagoAdicionalDetectedInfo);

        const valorAhorrado = monto - valorAPenalizar;

        setSavingForm(prev => {
            const newState = {
                ...prev,
                year: isNaN(anio) ? prev.year : anio,
                mesAbonado: mesAbonadoCalc,
                penalizacion: penalizacionStatus,
                diasPenalizacion: diasPenalizacion,
                valorAPenalizar: valorAPenalizar.toFixed(2),
                valorAhorrado: valorAhorrado.toFixed(2),
                externalId: (prev.externalId || (isEditing ? '' : autoIncrementSavingId()))
            };
            if (JSON.stringify(prev) !== JSON.stringify(newState)) return newState;
            return prev;
        });
    }, [savingForm.date, savingForm.amount, savingForm.month, savingForm.anioAbonado, savingForm.clientId, isModalOpen, isEditing, savings]);

    const handleOpenModal = (saving = null) => {
        if (saving) {
            setIsEditing(true);
            setSavingForm({ ...saving });
        } else {
            setIsEditing(false);
            setSavingForm({
                ...emptyForm(),
                externalId: autoIncrementSavingId()
            });
        }
        setSoporteFile(null); // Limpiar soporte anterior al abrir
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Helper para limpiar strings de moneda a número puro
        const cleanNumber = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            const cleaned = String(val).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
            const parsed = Number(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        };

        const monto = cleanNumber(savingForm.amount);
        const valorAhorrado = cleanNumber(savingForm.valorAhorrado);
        const valorAPenalizar = cleanNumber(savingForm.valorAPenalizar);

        if (!monto || monto <= 0) {
            toast.error('⚠️ El monto debe ser mayor a 0');
            return;
        }
        if (valorAhorrado < 0) {
            toast.error(`⚠️ MONTO INSUFICIENTE\n\nEl monto ingresado no cubre la penalización.\n\nMonto: $${monto.toLocaleString('es-CO')}\nPenalización: $${valorAPenalizar.toLocaleString('es-CO')}\nDéficit: $${Math.abs(valorAhorrado).toLocaleString('es-CO')}`);
            return;
        }

        // Payload estrictamente parseado para que SQLite no tire SQLITE_MISMATCH
        const sanitizedForm = {
            ...savingForm,
            clientId: savingForm.clientId ? parseInt(savingForm.clientId, 10) : null,
            amount: monto,
            valorAhorrado: valorAhorrado,
            valorAPenalizar: valorAPenalizar,
            diasPenalizacion: savingForm.diasPenalizacion ? parseInt(savingForm.diasPenalizacion, 10) : 0,
            mesAbonado: savingForm.mesAbonado ? parseInt(savingForm.mesAbonado, 10) : new Date().getMonth() + 1,
            anioAbonado: savingForm.anioAbonado ? parseInt(savingForm.anioAbonado, 10) : new Date().getFullYear(),
            year: savingForm.year ? parseInt(savingForm.year, 10) : new Date().getFullYear(),
            monthInt: savingForm.monthInt ? parseInt(savingForm.monthInt, 10) : new Date().getMonth() + 1,
            itemQuantity: savingForm.itemQuantity ? parseInt(savingForm.itemQuantity, 10) : 1
        };

        try {
            let savingId;
            let successMessage = '';

            if (isEditing) {
                await api.put(`/admin/savings/${savingForm.id}`, sanitizedForm);
                savingId = savingForm.id;
                successMessage = '✅ Ahorro actualizado exitosamente';
            } else {
                const response = await api.post(`/admin/savings`, sanitizedForm);
                savingId = response.data.id;
                const calc = response.data._calculado;
                if (calc) {
                    successMessage = `✅ Ahorro registrado\n\n${calc.mensaje}\nValor Ahorrado: $${parseFloat(calc.valorAhorrado).toLocaleString('es-CO')}`;
                } else {
                    successMessage = '✅ Ahorro registrado exitosamente';
                }
            }

            // --- Subir archivo Soporte si existe ---
            if (soporteFile && savingId) {
                const formData = new FormData();
                formData.append('soporte', soporteFile);
                try {
                    await api.post(`/admin/savings/${savingId}/soporte`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    successMessage += '\n📎 Soporte adjunto guardado';
                } catch (errFile) {
                    console.error('Error subiendo soporte:', errFile);
                    toast.error('Ahorro guardado, pero falló la subida del soporte adjunto');
                }
            }

            toast.success(successMessage);
            setIsModalOpen(false);
            fetchData();
            notifyUpdate('savings');
        } catch (err) {
            console.error('Error saving saving:', err);
            const serverDetail = err.response?.data?.error || err.message;
            toast.error(`❌ ERROR DE BASE DE DATOS\n\n${serverDetail}`);
        }
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
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-8 max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
                            <h2 className="text-xl font-bold text-brand-primary">
                                {isEditing ? 'Editar Ahorro' : 'Registrar Nuevo Ahorro'}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-gray-700 transition-colors"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* Row 1: ID & Client Info */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField label="1. Id_VM (Auto)">
                                    <Input value={savingForm.externalId} readOnly className="bg-gray-50 font-bold text-brand-primary" />
                                </FormField>
                                <div className="md:col-span-2">
                                    <Label className="text-gray-700 font-semibold">2-4. Cliente (Customer_id, Nombre, Apellido)</Label>
                                    <select
                                        aria-label="Cliente (Customer_id)"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                        value={savingForm.clientId}
                                        onChange={(e) => setSavingForm({ ...savingForm, clientId: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Seleccionar Socio --</option>
                                        {clients.map(c => (
                                            <option key={c.id} value={c.id}>{c.customerId} - {c.name} {c.surname1}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {pagoAdicionalInfo && (
                                <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-md">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <svg className="h-5 w-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                        </div>
                                        <div className="ml-3">
                                            <h3 className="text-sm font-medium text-emerald-800">
                                                ✅ Pago adicional detectado — Sin penalización
                                            </h3>
                                            <div className="mt-2 text-sm text-emerald-700">
                                                <p>
                                                    <strong>{pagoAdicionalInfo.name}</strong> ya tiene un ahorro registrado en <strong>{pagoAdicionalInfo.month} {pagoAdicionalInfo.year}</strong> (ID: {pagoAdicionalInfo.existingId}).
                                                </p>
                                                <p className="mt-1">
                                                    Este pago adicional <strong>no genera penalización</strong> ya que la cuota del mes ya fue cubierta.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {dormantInfo && (
                                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <AlertTriangle className="h-5 w-5 text-red-500" />
                                        </div>
                                        <div className="ml-3">
                                            <h3 className="text-sm font-medium text-red-800">
                                                Atención: Sin registros en {dormantInfo.year}
                                            </h3>
                                            <div className="mt-2 text-sm text-red-700">
                                                <p>
                                                    <strong>{dormantInfo.name}</strong> no tiene ahorros registrados en este año.
                                                </p>
                                                {dormantInfo.months && (
                                                    <p className="mt-1">
                                                        <strong>Meses adeudados:</strong> {dormantInfo.months}
                                                    </p>
                                                )}
                                                <p className="mt-1 font-bold">
                                                    Penalización Acumulada: ${dormantInfo.penalty.toLocaleString('es-CO')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Row 2: Payment Date & Year/Month */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <FormField label="5. Estado">
                                    <select
                                        aria-label="Estado"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                        value={savingForm.status}
                                        onChange={(e) => setSavingForm({ ...savingForm, status: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Seleccionar Estado --</option>
                                        {uniqueStatuses.map(st => (
                                            <option key={st} value={st}>{st}</option>
                                        ))}
                                    </select>
                                </FormField>
                                <FormField label="6. Fecha Pago">
                                    <Input
                                        type="date"
                                        value={savingForm.date}
                                        onChange={(e) => setSavingForm({ ...savingForm, date: e.target.value })}
                                        required
                                        className="text-gray-800"
                                    />
                                </FormField>
                                <FormField label="7. Año Pago (Auto)">
                                    <Input value={savingForm.year} readOnly className="bg-white font-mono text-gray-700" />
                                </FormField>
                                <FormField label="8. Mes Pago">
                                    <select
                                        aria-label="Mes de pago"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none"
                                        value={savingForm.month}
                                        onChange={(e) => setSavingForm({ ...savingForm, month: e.target.value })}
                                    >
                                        {monthNames.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </FormField>
                            </div>

                            {/* Row 3: Financials & Penalty */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-green-50 p-4 rounded-lg border border-green-100">
                                <FormField label="11. Valor Mensual (Monto)">
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                                        <Input
                                            type="number"
                                            value={savingForm.amount}
                                            onChange={(e) => setSavingForm({ ...savingForm, amount: e.target.value })}
                                            className="pl-7 font-bold text-lg text-green-700"
                                            required
                                        />
                                    </div>
                                </FormField>
                                <FormField label="9. Penalización (SI/NO)">
                                    <Input
                                        value={savingForm.penalizacion}
                                        readOnly
                                        className={`bg-white font-bold ${savingForm.penalizacion === 'SI' ? 'text-red-600' : 'text-green-700'}`}
                                    />
                                </FormField>
                                <FormField label="10. Dias Penalización">
                                    <Input value={savingForm.diasPenalizacion} readOnly className="bg-white text-gray-700" />
                                </FormField>
                            </div>

                            {/* Row 4: Calculated Results */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="12. Valor a Penalizar">
                                    <Input
                                        value={parseFloat(savingForm.valorAPenalizar).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                                        readOnly
                                        className="bg-gray-50 text-red-600 font-bold"
                                    />
                                </FormField>
                                <FormField label="13. Valor Ahorrado (Neto)">
                                    <Input
                                        value={parseFloat(savingForm.valorAhorrado).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                                        readOnly
                                        className="bg-gray-50 text-green-700 font-bold"
                                    />
                                </FormField>
                            </div>

                            {/* Row 5: Additional Info */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <FormField label="14. Mes Abonado (#)">
                                    <Input value={savingForm.mesAbonado} readOnly className="bg-gray-50 text-gray-700" />
                                </FormField>
                                <FormField label="15. Año Abonado">
                                    <Input
                                        type="number"
                                        value={savingForm.anioAbonado}
                                        onChange={(e) => setSavingForm({ ...savingForm, anioAbonado: e.target.value })}
                                        className="text-gray-800"
                                    />
                                </FormField>
                                <FormField label="16. Item Quantity">
                                    <Input
                                        type="number"
                                        value={savingForm.itemQuantity}
                                        onChange={(e) => setSavingForm({ ...savingForm, itemQuantity: e.target.value })}
                                        className="text-gray-800"
                                    />
                                </FormField>

                                <FormField label="20. Tipo de Ahorro">
                                    <select
                                        aria-label="Tipo de ahorro"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none"
                                        value={savingForm.type}
                                        onChange={(e) => setSavingForm({ ...savingForm, type: e.target.value })}
                                    >
                                        <option value="Mensual">Mensual</option>
                                        <option value="Aporte Inicial">Aporte Inicial</option>
                                    </select>
                                </FormField>
                            </div>

                            {/* Row 6: Banking & Observations */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="17. Banco">
                                    <select
                                        aria-label="Banco"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                        value={savingForm.banco}
                                        onChange={(e) => setSavingForm({ ...savingForm, banco: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Seleccionar Banco --</option>
                                        {COLOMBIAN_BANKS_WITH_OTHER.map(bank => (
                                            <option key={bank} value={bank}>{bank}</option>
                                        ))}
                                    </select>
                                </FormField>
                                <FormField label="18. # Transaccion">
                                    <Input
                                        value={savingForm.numeroTransaccion}
                                        onChange={(e) => setSavingForm({ ...savingForm, numeroTransaccion: e.target.value })}
                                        className="text-gray-800"
                                    />
                                </FormField>
                                <FormField label="19. Desde Cuenta de Ahorros">
                                    <Input
                                        value={savingForm.origen}
                                        onChange={(e) => setSavingForm({ ...savingForm, origen: e.target.value })}
                                        placeholder="Ej: Cuenta externa..."
                                        className="text-gray-800"
                                    />
                                </FormField>
                                <FormField label="21. Observaciones">
                                    <Input
                                        value={savingForm.observaciones}
                                        onChange={(e) => setSavingForm({ ...savingForm, observaciones: e.target.value })}
                                        className="text-gray-800"
                                    />
                                </FormField>
                            </div>

                            {/* Row 7: Soporte de Pago */}
                            <div className="grid grid-cols-1 border border-dashed border-brand-primary/50 bg-brand-primary/[0.02] p-4 rounded-xl mt-4">
                                <Label className="text-brand-dark font-bold mb-2">22. Subir Registro de Pago (Opcional)</Label>
                                <div className="flex items-center justify-center w-full">
                                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 rounded-lg cursor-pointer bg-white hover:bg-gray-50 border-2 border-dashed border-gray-300">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <svg className="w-8 h-8 mb-3 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" />
                                            </svg>
                                            <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click para subir</span> o arrastra y suelta</p>
                                            <p className="text-xs text-gray-500">JPG, PNG o PDF (Max. 10MB)</p>
                                        </div>
                                        <input
                                            id="dropzone-file"
                                            type="file"
                                            className="hidden"
                                            accept=".jpg,.jpeg,.png,.pdf,.webp"
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    setSoporteFile(e.target.files[0]);
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                                {soporteFile && (
                                    <div className="mt-3 p-3 bg-green-50 text-green-700 rounded-lg text-sm flex justify-between items-center border border-green-200">
                                        <span className="font-medium truncate mr-2">📎 {soporteFile.name} ({(soporteFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                                        <button type="button" onClick={() => setSoporteFile(null)} className="text-red-500 hover:text-red-700">Eliminar</button>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" size="lg">
                                    <Save className="mr-2 h-4 w-4" />
                                    {isEditing ? 'Guardar Cambios' : 'Registrar Ahorro'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SavingsPage;
