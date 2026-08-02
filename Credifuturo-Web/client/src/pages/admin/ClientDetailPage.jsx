import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, Pencil, PiggyBank, Landmark, Wallet, TrendingUp, Mail, MapPin,
    CreditCard, CalendarDays, AlertTriangle, PowerOff, Power, Inbox
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from 'recharts';
import api, { apiWithRetry } from '../../config/api';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ClientForm from '../../components/admin/ClientForm';
import { useUi } from '../../context/UiContext';
import { formatDate } from '../../utils/excelUtils';

const fmtCOP = (n) => '$' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const StatusBadge = ({ value }) => {
    const isActive = (value || '').trim().toLowerCase().startsWith('activo');
    return (
        <Badge variant={isActive ? 'success' : 'error'}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {value || '—'}
        </Badge>
    );
};

const KpiCard = ({ icon: Icon, label, value, tone = 'brand', hint }) => {
    const tones = {
        brand: 'bg-brand-primary/10 text-brand-primary',
        green: 'bg-emerald-100 text-emerald-700',
        red: 'bg-red-100 text-red-700',
        blue: 'bg-blue-100 text-blue-700',
    };
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
                        <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
                        <p className="text-lg font-bold text-gray-900 tabular-nums truncate">{value}</p>
                    </div>
                </div>
                {hint && <p className="mt-2 text-[11px] text-gray-400">{hint}</p>}
            </CardContent>
        </Card>
    );
};

const ClientDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { toast } = useUi();
    const [searchParams, setSearchParams] = useSearchParams();

    const [client, setClient] = useState(null);
    const [balance, setBalance] = useState(null);
    const [savings, setSavings] = useState([]);
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [editing, setEditing] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // 'deactivate' | 'reactivate'
    const [confirmLoading, setConfirmLoading] = useState(false);

    const loadCore = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiWithRetry(() => api.get(`/admin/clients/${id}`));
            setClient(res.data);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'No se pudo cargar el socio.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    const loadFinancials = useCallback(async () => {
        // Cada bloque falla de forma aislada; la ficha no se cae si uno no responde.
        try {
            const b = await api.get(`/admin/clients/${id}/balance`);
            setBalance(b.data);
        } catch { setBalance(null); }
        try {
            const s = await api.get(`/admin/savings/list?clientId=${id}&type=Todos`);
            setSavings(s.data?.data || []);
        } catch { setSavings([]); }
        try {
            const l = await api.get('/admin/disbursed-loans/list');
            const arr = Array.isArray(l.data) ? l.data : (l.data?.data || []);
            setLoans(arr.filter(x => String(x.clientId) === String(id)));
        } catch { setLoans([]); }
    }, [id]);

    useEffect(() => { loadCore(); loadFinancials(); }, [loadCore, loadFinancials]);

    // Abre el modal de edición si se llegó con ?edit=1 (desde la lista)
    useEffect(() => {
        if (client && searchParams.get('edit') === '1') setEditing(true);
    }, [client, searchParams]);

    // Serie mensual de ahorros (net valorAhorrado) del año más reciente con datos.
    // Se usa mesAbonado/anioAbonado (periodo acreditado), no la fecha de transacción.
    const { chartData, chartYear, chartTotal } = useMemo(() => {
        const mensuales = savings.filter(s => s.type !== 'Aporte Inicial');
        if (!mensuales.length) return { chartData: [], chartYear: null, chartTotal: 0 };
        const year = Math.max(...mensuales.map(s => Number(s.anioAbonado) || 0));
        const buckets = Array.from({ length: 12 }, (_, i) => ({ mes: MESES[i], valor: 0 }));
        let total = 0;
        mensuales.forEach(s => {
            if (Number(s.anioAbonado) !== year) return;
            const m = Number(s.mesAbonado);
            if (m >= 1 && m <= 12) {
                const v = Number(s.valorAhorrado) || 0;
                buckets[m - 1].valor += v;
                total += v;
            }
        });
        return { chartData: buckets, chartYear: year, chartTotal: total };
    }, [savings]);

    const onSaved = (updated) => { setClient(updated); loadFinancials(); };

    const runConfirm = async () => {
        setConfirmLoading(true);
        try {
            if (confirmAction === 'deactivate') {
                await api.delete(`/admin/clients/${id}`);
                toast.success('Socio desactivado.');
            } else {
                await api.put(`/admin/clients/${id}`, { estatus: 'Activo' });
                toast.success('Socio reactivado.');
            }
            setConfirmAction(null);
            await loadCore();
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo actualizar el estado.');
        } finally {
            setConfirmLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
                <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (error || !client) {
        return (
            <div className="space-y-6">
                <Button variant="ghost" onClick={() => navigate('/admin/clients/list')} className="px-2">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Volver a la lista
                </Button>
                <Card>
                    <CardContent className="p-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                            <AlertTriangle className="h-8 w-8 text-red-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No se pudo cargar la ficha</h3>
                        <p className="text-gray-500 mb-6">{error || 'Socio no encontrado.'}</p>
                        <Button onClick={loadCore}>Reintentar</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const isActive = (client.estatus || '').trim().toLowerCase().startsWith('activo');
    const fullName = [client.name, client.surname1, client.surname2].filter(Boolean).join(' ');

    return (
        <div className="space-y-6">
            {/* Barra superior */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => navigate('/admin/clients/list')} className="px-2">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Volver
                </Button>
                <div className="flex items-center gap-2">
                    {isActive ? (
                        <Button variant="danger" onClick={() => setConfirmAction('deactivate')}>
                            <PowerOff className="h-4 w-4 mr-2" /> Desactivar
                        </Button>
                    ) : (
                        <Button variant="secondary" onClick={() => setConfirmAction('reactivate')}>
                            <Power className="h-4 w-4 mr-2" /> Reactivar
                        </Button>
                    )}
                    <Button variant="primary" onClick={() => setEditing(true)}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                    </Button>
                </div>
            </div>

            {/* Encabezado de identidad */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary text-xl font-bold">
                                {(client.name || '?').trim().charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{fullName || 'Socio'}</h1>
                                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                                    <span className="inline-flex items-center gap-1"><CreditCard className="h-4 w-4" /> CC {client.cedula}</span>
                                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">ID {client.customerId || '—'}</span>
                                    <StatusBadge value={client.estatus} />
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-1 text-sm text-gray-600">
                            {client.email && <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /> {client.email}</span>}
                            {(client.ciudad || client.pais) && <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /> {[client.ciudad, client.pais].filter(Boolean).join(', ')}</span>}
                            {client.fechaIngreso && <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gray-400" /> Ingreso: {formatDate(client.fechaIngreso)}</span>}
                            {client.tipoCliente && <span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4 text-gray-400" /> {client.tipoCliente}</span>}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon={PiggyBank} tone="green" label="Capital Ahorrado (bruto)" value={fmtCOP(balance?.totalSavings)} hint="Suma de aportes recibidos" />
                <KpiCard icon={Landmark} tone="red" label="Deuda Vigente" value={fmtCOP(balance?.debt)} hint="Desembolsado − pagos" />
                <KpiCard icon={TrendingUp} tone="brand" label={`Ahorrado ${chartYear || ''} (neto)`} value={fmtCOP(chartTotal)} hint="valorAhorrado del año en curso" />
                <KpiCard icon={Wallet} tone="blue" label="Préstamos" value={loans.length} hint="Desembolsos registrados" />
            </div>

            {/* Gráfico de evolución de ahorros */}
            <Card>
                <CardContent className="p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Evolución de ahorros{chartYear ? ` · ${chartYear}` : ''}</h2>
                            <p className="text-xs text-gray-500">Ahorro neto mensual (valorAhorrado) en pesos colombianos</p>
                        </div>
                    </div>
                    {chartData.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-400">
                            <Inbox className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            Sin ahorros mensuales registrados.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" vertical={false} />
                                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                                <YAxis
                                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                                    tickLine={false}
                                    axisLine={false}
                                    width={70}
                                    tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toLocaleString('es-CO', { maximumFractionDigits: 0 })}k` : `$${v}`}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                                    formatter={(v) => [fmtCOP(v), 'Ahorro neto']}
                                    labelFormatter={(l) => `Mes: ${l}`}
                                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                                />
                                <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={44}>
                                    {chartData.map((d, i) => (
                                        <Cell key={i} fill={d.valor > 0 ? '#10b981' : '#e5e7eb'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Secciones: préstamos + ahorros recientes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-base font-bold text-gray-900 mb-3">Préstamos</h2>
                        {loans.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4">Sin préstamos desembolsados.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-gray-500 border-b">
                                            <th className="py-2 pr-2">ID</th>
                                            <th className="py-2 px-2 text-right">Valor</th>
                                            <th className="py-2 px-2 text-center">Cuotas</th>
                                            <th className="py-2 pl-2">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {loans.slice(0, 8).map((l, i) => (
                                            <tr key={l.idVm || l.id || i}>
                                                <td className="py-2 pr-2 font-mono text-xs">{l.idVm || l.id || '—'}</td>
                                                <td className="py-2 px-2 text-right tabular-nums">{fmtCOP(l.valorPrestado ?? l.monto)}</td>
                                                <td className="py-2 px-2 text-center">{l.cuotas ?? '—'}</td>
                                                <td className="py-2 pl-2">
                                                    <span className="text-xs">{l.estado || '—'}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-base font-bold text-gray-900 mb-3">Ahorros recientes</h2>
                        {savings.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4">Sin ahorros registrados.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-gray-500 border-b">
                                            <th className="py-2 pr-2">Periodo</th>
                                            <th className="py-2 px-2 text-right">Bruto</th>
                                            <th className="py-2 px-2 text-right">Neto</th>
                                            <th className="py-2 pl-2">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {savings.slice(0, 8).map((s, i) => (
                                            <tr key={s.id || i}>
                                                <td className="py-2 pr-2">
                                                    {s.mesAbonado ? `${MESES[Number(s.mesAbonado) - 1] || s.mesAbonado} ${s.anioAbonado || ''}` : formatDate(s.date)}
                                                </td>
                                                <td className="py-2 px-2 text-right tabular-nums">{fmtCOP(s.amount)}</td>
                                                <td className="py-2 px-2 text-right tabular-nums text-emerald-700">{fmtCOP(s.valorAhorrado)}</td>
                                                <td className="py-2 pl-2 text-xs">{s.status || s.type || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Modales */}
            <ClientForm
                open={editing}
                client={client}
                onClose={() => { setEditing(false); if (searchParams.get('edit')) { searchParams.delete('edit'); setSearchParams(searchParams, { replace: true }); } }}
                onSaved={onSaved}
            />
            <ConfirmDialog
                open={!!confirmAction}
                title={confirmAction === 'deactivate' ? 'Desactivar socio' : 'Reactivar socio'}
                message={confirmAction === 'deactivate'
                    ? `Se marcará a ${fullName} como Desactivado. Su historial se conserva y podrás reactivarlo después.`
                    : `Se reactivará a ${fullName} (estatus Activo).`}
                confirmLabel={confirmAction === 'deactivate' ? 'Desactivar' : 'Reactivar'}
                variant={confirmAction === 'deactivate' ? 'danger' : 'primary'}
                loading={confirmLoading}
                onConfirm={runConfirm}
                onClose={() => !confirmLoading && setConfirmAction(null)}
            />
        </div>
    );
};

export default ClientDetailPage;
