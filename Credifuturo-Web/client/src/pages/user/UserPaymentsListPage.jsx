import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import { BarChart2, RefreshCw, Download } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import EstadoPrestamosSection from '../../components/EstadoPrestamosSection';

/**
 * UserPaymentsListPage — Estado de Préstamos del socio.
 * Usa EstadoPrestamosSection: la MISMA sección "Lista Estado Préstamos (Cuotas)"
 * que ve el admin en Detalle de la Cuenta (KPIs, filtros, orden y tabla idénticos).
 */
const UserPaymentsListPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    const { toast } = useUi();
    const [payments, setPayments] = useState([]);
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [payRes, loanRes] = await Promise.allSettled([
                api.get('/admin/my/payments'),
                api.get('/admin/my/loans'),
            ]);
            if (payRes.status === 'fulfilled' && payRes.value.data?.ok) {
                setPayments(payRes.value.data.data || []);
            } else {
                throw new Error('Error del servidor al cargar pagos');
            }
            if (loanRes.status === 'fulfilled') {
                setLoans(loanRes.value.data?.data || []);
            }
        } catch (err) {
            setError(err.message || 'Error de conexión');
            setPayments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleExport = () => {
        if (payments.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const exportData = payments.map(p => ({
            'ID Pago': p.externalId,
            'Préstamo': p.idVm,
            'Cuota #': p.itemQuantity,
            'Estado': p.estado,
            'Fecha Máx': formatDate(p.fechaPagoMax),
            'Valor Cuota': p.valorCuotaVariable,
            'Valor Pagado': p.valorCuotaPago,
            'Intereses': p.valorInteresesAmortizados,
            'Saldo Final': p.saldoFinal,
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mis Pagos');
        XLSX.writeFile(wb, 'Mis_Pagos.xlsx');
        toast.success('Exportado exitosamente');
    };

    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    const nombre = !user?.name ? '' : `${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim();

    return (
        <div className="space-y-2">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart2 className="h-6 w-6 text-brand-primary" />
                        Estado Préstamos{nombre ? ` - ${nombre}` : ''}
                    </h2>
                    <p className="text-gray-500 text-sm">La misma vista de cuotas que usa la administración del fondo</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <Button variant="secondary" onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
                    <Button variant="ghost" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                </div>
            </div>

            {!loading && payments.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">
                    No tienes pagos de préstamos registrados.
                </div>
            ) : (
                <EstadoPrestamosSection payments={payments} loans={loans} loading={loading} socioName={nombre} />
            )}
        </div>
    );
};

export default UserPaymentsListPage;
