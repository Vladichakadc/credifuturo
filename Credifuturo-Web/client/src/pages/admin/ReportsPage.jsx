import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { Download, FileText, TrendingUp, Users, DollarSign, AlertTriangle, PiggyBank, Archive, CheckCircle, Loader, Calendar, HardDrive, Clock, FolderOpen, RefreshCw, Database } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { exportToExcel, formatDate } from '../../utils/excelUtils';
import { useUi } from '../../context/UiContext';

const ReportsPage = () => {
    const { toast } = useUi();
    const [loading, setLoading] = useState(true);
    const [backingUp, setBackingUp] = useState(false);
    const [backingUpFull, setBackingUpFull] = useState(false);
    const [lastBackup, setLastBackup] = useState(null);
    const [lastFullBackup, setLastFullBackup] = useState(null);
    const [backupHistory, setBackupHistory] = useState([]);

    // Raw Data for exports
    const [clients, setClients] = useState([]);
    const [savings, setSavings] = useState([]);
    const [disbursedLoans, setDisbursedLoans] = useState([]);
    const [payments, setPayments] = useState([]);

    useEffect(() => {
        fetchData();
        fetchBackupHistory();
    }, []);

    const fetchBackupHistory = async () => {
        try {
            const res = await api.get('/admin/backup-history');
            setBackupHistory(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Error fetching backup history:', err);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [resClients, resSavings, resDisbursed, resPayments] = await Promise.all([
                api.get('/admin/clients'),
                api.get('/admin/savings'),
                api.get('/admin/disbursed-loans'),
                api.get('/admin/payments')
            ]);
            setClients(Array.isArray(resClients.data) ? resClients.data : []);
            setSavings(Array.isArray(resSavings.data) ? resSavings.data : []);
            setDisbursedLoans(Array.isArray(resDisbursed.data) ? resDisbursed.data : []);
            setPayments(Array.isArray(resPayments.data) ? resPayments.data : []);
        } catch (error) {
            console.error('Error fetching backup data:', error);
        } finally {
            setLoading(false);
        }
    };

    // --- Backup Masivo ---
    const handleBackupAll = async () => {
        setBackingUp(true);
        try {
            const res = await api.post('/admin/backup/all');
            if (res.data && res.data.ok) {
                const { folder, files, timestamp } = res.data;
                setLastBackup({ folder, count: files.length, timestamp });
                toast.success(`✅ Backup completado: ${files.length} archivos guardados en ${folder}`);
                // Refresh backup history card
                fetchBackupHistory();
            } else {
                toast.error('Error al generar backup: ' + (res.data?.error || 'Error desconocido'));
            }
        } catch (err) {
            console.error('Backup error:', err);
            toast.error('Error al conectar con el servidor: ' + (err.response?.data?.error || err.message));
        } finally {
            setBackingUp(false);
        }
    };

    // --- Backup Completo (Excel + BD) ---
    const handleBackupFull = async () => {
        setBackingUpFull(true);
        try {
            const res = await api.post('/admin/backup/full');
            if (res.data && res.data.ok) {
                const { folder, files, timestamp, dbCopied, dbSizeKB } = res.data;
                setLastFullBackup({ folder, count: files.length, timestamp, dbCopied, dbSizeKB });
                const dbMsg = dbCopied ? ` + BD (${dbSizeKB} KB)` : '';
                toast.success(`✅ Backup completo: ${files.length} archivos${dbMsg} en ${folder}`);
                fetchBackupHistory();
            } else {
                toast.error('Error al generar backup completo: ' + (res.data?.error || 'Error desconocido'));
            }
        } catch (err) {
            console.error('Full backup error:', err);
            toast.error('Error al generar backup completo: ' + (err.response?.data?.error || err.message));
        } finally {
            setBackingUpFull(false);
        }
    };

    // --- Report Generators ---

    const generateClientsReport = () => {
        if (clients.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const data = clients.map(c => ({
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
            'Fecha de Ingreso': formatDate(c.fechaIngreso ?? ''),
            'Fecha de baja': formatDate(c.fechaBaja ?? ''),
            'Cedula': c.cedula ?? '',
            'Correo': c.email ?? '',
        }));
        const result = exportToExcel(data, 'Tabla_Clientes');
        if (!result.success) toast.error(result.error);
        else toast.success('Tabla_Clientes.xlsx descargado');
    };

    const generateSavingsReport = () => {
        // Sort DESC by date
        const sortedSavings = [...savings].sort((a, b) => {
            const da = new Date(a.date || '1900-01-01');
            const db = new Date(b.date || '1900-01-01');
            return db - da; // DESC
        });

        const dataToExport = sortedSavings.map(s => {
            const client = clients.find(c => c.id === s.clientId);
            return {
                'Id_VM': s.externalId ?? '',
                'Customer_id': client ? client.customerId : '',
                'Nombre': client ? client.name : '',
                'Apellido': client ? client.surname1 : '',
                'Estado': s.status ?? '',
                'Fecha Pago': formatDate(s.date ?? ''),
                'Año pago': s.year ?? '',
                'Mes pago': s.month ?? '',
                'Penalizacion': s.penalizacion ?? '',
                'Dias Penalizacion': s.diasPenalizacion || 0,
                'Valor Mensual': parseFloat(s.amount || 0),
                'Valor a Penalizar': parseFloat(s.valorAPenalizar || 0),
                'Valor Ahorrado': parseFloat(s.valorAhorrado || 0),
                'Mes Abonado': s.mesAbonado ?? '',
                'Año Abonado': s.anioAbonado ?? '',
                'Item_Quantity': s.itemQuantity ?? '',
                'Banco': s.banco ?? '',
                '# Transaccion': s.numeroTransaccion ?? '',
                'Desde Cuenta de Ahorros': s.origen ?? '',
                'Tipo de Ahorro': s.type ?? '',
                'Observaciones': s.observaciones ?? ''
            };
        });

        const columnFormats = {
            'Valor Mensual': '"$"#,##0',
            'Valor a Penalizar': '"$"#,##0',
            'Valor Ahorrado': '"$"#,##0'
        };

        const result = exportToExcel(dataToExport, '1-orders_table_ahorro_mensual', 'Reporte', columnFormats);
        if (!result.success) toast.error(result.error);
        else toast.success('1-orders_table_ahorro_mensual.xlsx descargado');
    };

    const generateAportesInicialesReport = () => {
        const aportes = savings.filter(s => s.type === 'Aporte Inicial');
        if (aportes.length === 0) { toast.error('No hay datos de Aportes Iniciales para exportar.'); return; }

        // Sort ASC by Id_AI (externalId), e.g. AI1, AI2, ...
        const sorted = [...aportes].sort((a, b) => {
            const numA = parseInt((a.externalId || '').replace(/\D/g, '') || '0', 10);
            const numB = parseInt((b.externalId || '').replace(/\D/g, '') || '0', 10);
            return numA - numB;
        });

        const dataToExport = sorted.map(s => {
            const client = clients.find(c => c.id === s.clientId);
            return {
                'Id_AI': s.externalId ?? '',
                'Customer_id': client ? client.customerId : '',
                'Nombre': client ? client.name : '',
                'Apellido': client ? client.surname1 : '',
                'Estado': s.status ?? '',
                'Fecha Pago': formatDate(s.date ?? ''),
                'Año': s.year ?? '',
                'Mes': s.month ?? '',
                'Valor ': parseFloat(s.amount || 0),
                'Item_Quantity': s.itemQuantity ?? '',
                'Banco ': s.banco ?? '',
                '# Transaccion': s.numeroTransaccion ?? '',
                'Desde Cuenta de Ahorros': s.origen ?? ''
            };
        });

        const columnFormats = {
            'Valor ': '"$"#,##0'
        };

        const result = exportToExcel(dataToExport, '1-orders_table_aportes_iniciales', 'Reporte', columnFormats);
        if (!result.success) toast.error(result.error);
        else toast.success('1-orders_table_aportes_iniciales.xlsx descargado');
    };

    const generateLoansReport = () => {
        const dataToExport = disbursedLoans.map(loan => {
            const client = clients.find(c => c.id === loan.clientId);
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
        });

        const columnFormats = {
            'valor prestado': '"$"#,##0',
            'interes mensual': '0.00%'
        };

        const result = exportToExcel(dataToExport, '1-orders_table_prestamos_desembolsados', 'Reporte', columnFormats);
        if (!result.success) toast.error(result.error);
        else toast.success('1-orders_table_prestamos_desembolsados.xlsx descargado');
    };

    const generateLoanStatusReport = () => {
        if (payments.length === 0) { toast.error('No hay datos para exportar.'); return; }

        // Ordenar principalmente por Id_EP (externalId) de mayor a menor (descendente)
        const sortedPayments = [...payments].sort((a, b) => {
            const numA = parseInt(a.externalId?.replace(/\D/g, '') || '0', 10);
            const numB = parseInt(b.externalId?.replace(/\D/g, '') || '0', 10);

            // Sort by Id_EP descending
            if (numA !== numB) return numB - numA;

            // Optional fallback: sort by recent date
            const dateA = new Date(a.fechaPagoMax || 0).getTime();
            const dateB = new Date(b.fechaPagoMax || 0).getTime();
            return dateB - dateA;
        });

        const dataToExport = sortedPayments.map(item => {
            const client = clients.find(c => c.id === item.clientId || c.id === parseInt(item.clientId));
            const realCustomerId = client ? client.customerId : (item.Client?.customerId || item.clientId);
            const nombre = client?.name || item.Client?.name || '';
            const apellido1 = client?.surname1 || item.Client?.surname1 || '';
            const apellido2 = client?.surname2 || item.Client?.surname2 || '';

            return {
                'Id_EP': item.externalId ?? '',
                'Customer_id': realCustomerId ?? '',
                'Id_VM': item.idVm ?? '',
                'Nombre': nombre,
                'Apellido': `${apellido1} ${apellido2}`.trim(),
                'Mes Desembolso': item.mesDesembolso ?? '',
                'Saldo Inicial': parseFloat(item.saldoInicial || 0),
                '# Cuotas Prestamo': item.cuotasPrestamo ?? '',
                'Interes Mensual': parseFloat(item.interesMensual || 0),
                'Valor Intereses amortizados': parseFloat(item.valorInteresesAmortizados || 0),
                'Fecha de Pago Max': formatDate(item.fechaPagoMax ?? ''),
                'Mes de Pago': item.mesPago ?? '',
                'Valor Cuota Variable': parseFloat(item.valorCuotaVariable || 0),
                'Estado': item.estado ?? '',
                'Valor Cuota Pago': parseFloat(item.valorCuotaPago || 0),
                'Saldo Final': parseFloat(item.saldoFinal || 0),
                'Item_Quantity': item.itemQuantity ?? '',
                'Banco desembolsado': item.banco ?? '',
                '# Transaccion': item.numeroTransaccion ?? '',
                'Cuenta de Ahorros': item.cuentaAhorros ?? '',
                'Observaciones': item.observaciones ?? '',
                'Estado Prestamo': item.estadoPrestamo ?? ''
            };
        });

        const columnFormats = {
            'Saldo Inicial': '"$"#,##0',
            'Interes Mensual': '0.00%',
            'Valor Intereses amortizados': '"$"#,##0',
            'Valor Cuota Variable': '"$"#,##0',
            'Valor Cuota Pago': '"$"#,##0',
            'Saldo Final': '"$"#,##0'
        };

        const result = exportToExcel(dataToExport, '1-orders_table_estado_prestamos', 'Reporte', columnFormats);
        if (!result.success) toast.error(result.error);
        else toast.success('1-orders_table_estado_prestamos.xlsx descargado');
    };

    const generateDelinquencyReport = () => {
        const delinquencyData = payments.filter(p => p.estado === 'Mora').map(p => {
            const client = clients.find(c => c.id === p.clientId);
            return {
                ID_Pago: p.externalId,
                ID_Prestamo: p.idVm,
                Socio: client ? `${client.name} ${client.surname1}` : 'Desconocido',
                'Mes Pago': p.mesPago,
                'Fecha Límite': formatDate(p.fechaPagoMax ?? ''),
                'Valor Cuota': parseFloat(p.valorCuotaPago || 0),
                Estado: p.estado
            };
        });
        const result = exportToExcel(delinquencyData, 'Reporte_Morosidad');
        if (!result.success) toast.error(result.error);
        else toast.success('Reporte descargado');
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-brand-primary">Generar Backups de las Tablas de Credifuturo</h1>
                <p className="text-gray-500">Descarga los datos de cada tabla en formato Excel.</p>
            </div>

            {/* ── Backup Masivo ─────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-700 p-6 text-white shadow-xl">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                            <Archive className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">Respaldar Todo Ahora</h2>
                            <p className="text-sm text-white/80 mt-0.5">
                                Genera los 6 reportes simultáneamente: Socios, Ahorros, Aportes Iniciales, Préstamos, Estado de Préstamos y Morosidad.
                            </p>
                            {lastBackup && (
                                <p className="mt-1.5 text-xs text-emerald-300 flex items-center gap-1">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Último backup: {lastBackup.count} archivos · {new Date(lastBackup.timestamp).toLocaleString('es-CO')} · {lastBackup.folder}
                                </p>
                            )}
                            <p className="mt-1 text-xs text-white/60">
                                📅 Backup automático programado: todos los días a las <strong>8:00 PM</strong> (hora Colombia)
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleBackupAll}
                        disabled={backingUp || loading}
                        className="shrink-0 flex items-center gap-2 rounded-xl bg-white text-indigo-700 font-semibold px-6 py-3 text-sm shadow-lg hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {backingUp ? (
                            <><Loader className="h-4 w-4 animate-spin" /> Generando...</>
                        ) : (
                            <><Archive className="h-4 w-4" /> Respaldar Todo</>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Backup Completo (Excel + BD) ─────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-6 text-white shadow-xl">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                            <Database className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">Backup Completo (Excel + Base de Datos)</h2>
                            <p className="text-sm text-white/80 mt-0.5">
                                Genera los 6 Excel <strong>y guarda una copia del archivo database.sqlite</strong> en la carpeta de Backups. Ideal antes de cambios importantes.
                            </p>
                            {lastFullBackup && (
                                <p className="mt-1.5 text-xs text-yellow-100 flex items-center gap-1">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Último: {lastFullBackup.count} archivos · {lastFullBackup.dbSizeKB} KB BD · {new Date(lastFullBackup.timestamp).toLocaleString('es-CO')}
                                </p>
                            )}
                            <p className="mt-1 text-xs text-white/60">
                                📦 Incluye: Tabla_Clientes, Ahorros, Aportes, Préstamos, Estado, Morosidad + <strong>database.sqlite</strong>
                            </p>
                        </div>
                    </div>
                    <button
                        id="btn-backup-completo"
                        onClick={handleBackupFull}
                        disabled={backingUpFull || loading}
                        className="shrink-0 flex items-center gap-2 rounded-xl bg-white text-orange-600 font-semibold px-6 py-3 text-sm shadow-lg hover:bg-orange-50 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {backingUpFull ? (
                            <><Loader className="h-4 w-4 animate-spin" /> Generando...</>
                        ) : (
                            <><Database className="h-4 w-4" /> Backup Completo</>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Historial de Backups ────────────────────────────────── */}
            {backupHistory.length > 0 && (
                <Card className="overflow-hidden border-0 shadow-lg">
                    <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                                    <Clock className="h-5 w-5 text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white">Historial de Backups</h2>
                                    <p className="text-xs text-slate-400">{backupHistory.length} respaldos realizados · Carpeta: C:\Credifuturo\Backups</p>
                                </div>
                            </div>
                            <span className="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full">
                                {backupHistory.length} fechas
                            </span>
                            <button
                                onClick={fetchBackupHistory}
                                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all"
                                title="Actualizar historial"
                            >
                                <RefreshCw className="h-3.5 w-3.5" /> Actualizar
                            </button>
                        </div>
                    </div>
                    <CardContent className="p-0">
                        <div className="divide-y divide-gray-100">
                            {backupHistory.slice(0, 3).map((bk, i) => {
                                const dateObj = new Date(bk.date + 'T12:00:00');
                                const dayName = dateObj.toLocaleDateString('es-CO', { weekday: 'long' });
                                const dayNum = dateObj.getDate();
                                const monthName = dateObj.toLocaleDateString('es-CO', { month: 'short' }).toUpperCase();
                                const year = dateObj.getFullYear();
                                const isLatest = i === 0;
                                return (
                                    <div key={bk.date} className={`flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-gray-50 ${isLatest ? 'bg-emerald-50/50' : ''}`}>
                                        {/* Date circle */}
                                        <div className={`shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center ${isLatest ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                            <span className="text-lg font-bold leading-none">{dayNum}</span>
                                            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">{monthName}</span>
                                        </div>
                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className={`text-sm font-semibold ${isLatest ? 'text-emerald-800' : 'text-gray-800'}`}>
                                                    {dayName.charAt(0).toUpperCase() + dayName.slice(1)}, {bk.date}
                                                </p>
                                                {isLatest && (
                                                    <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md">Más reciente</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                    <Clock className="h-3 w-3" />{new Date(bk.modifiedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                </span>
                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                    <FolderOpen className="h-3 w-3" />{bk.filesCount} archivos
                                                </span>
                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                    <HardDrive className="h-3 w-3" />{bk.totalSizeKB > 1024 ? `${(bk.totalSizeKB / 1024).toFixed(1)} MB` : `${bk.totalSizeKB} KB`}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Status */}
                                        <div className="shrink-0">
                                            <CheckCircle className={`h-5 w-5 ${isLatest ? 'text-emerald-500' : 'text-gray-300'}`} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Export Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-brand-primary" /> Reporte de Socios
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-500 mb-4">Descarga el listado completo de socios con sus datos de contacto y estado actual.</p>
                        <Button onClick={generateClientsReport} className="w-full" variant="secondary">
                            <Download className="mr-2 h-4 w-4" /> Descargar Excel
                        </Button>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-green-600" /> Reporte de Ahorros
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-500 mb-4">Historial completo de transacciones de ahorro, aportes iniciales y mensuales.</p>
                        <Button onClick={generateSavingsReport} className="w-full" variant="secondary">
                            <Download className="mr-2 h-4 w-4" /> Descargar Excel
                        </Button>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-blue-600" /> Reporte de Préstamos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-500 mb-4">Listado de préstamos desembolsados, historial de estados y montos.</p>
                        <Button onClick={generateLoansReport} className="w-full" variant="secondary">
                            <Download className="mr-2 h-4 w-4" /> Descargar Excel
                        </Button>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-indigo-600" /> Estado de Préstamos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-500 mb-4">Listado de préstamos y sus estados actuales detallados.</p>
                        <Button onClick={generateLoanStatusReport} className="w-full" variant="secondary">
                            <Download className="mr-2 h-4 w-4" /> Descargar Excel
                        </Button>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PiggyBank className="h-5 w-5 text-emerald-600" /> Reporte de Aportes Iniciales
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-500 mb-4">Historial de aportes iniciales de cada socio con formato idéntico a la tabla de origen.</p>
                        <Button onClick={generateAportesInicialesReport} className="w-full" variant="secondary">
                            <Download className="mr-2 h-4 w-4" /> Descargar Excel
                        </Button>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow border-red-100">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-700">
                            <AlertTriangle className="h-5 w-5" /> Reporte de Morosidad
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-500 mb-4">Listado detallado de pagos vencidos o en estado de mora.</p>
                        <Button onClick={generateDelinquencyReport} className="w-full border-red-200 text-red-700 hover:bg-red-50">
                            <Download className="mr-2 h-4 w-4" /> Descargar Mora
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ReportsPage;
