import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { useUi } from '../../context/UiContext';
import { AlertTriangle, Search, User, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Label } from '../../components/ui/Input';

const OrphanLoansPage = () => {
    const { toast } = useUi();
    const [orphans, setOrphans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [assignTarget, setAssignTarget] = useState(null);
    const [cedula, setCedula] = useState('');
    const [match, setMatch] = useState(null);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);

    const fetchOrphans = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/disbursed-loans/orphans');
            setOrphans(res.data.data || []);
        } catch (err) {
            toast.error('Error al cargar préstamos huérfanos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrphans(); }, []);

    const lookupCedula = async () => {
        if (!cedula.trim()) return;
        setSearching(true);
        setMatch(null);
        try {
            const res = await api.get(`/admin/clients/cedula/${cedula.trim()}`);
            setMatch(res.data);
        } catch {
            toast.error('Socio no encontrado con esa cédula.');
        } finally {
            setSearching(false);
        }
    };

    const confirmAssign = async () => {
        if (!assignTarget || !match) return;
        setSaving(true);
        try {
            await api.put(`/admin/disbursed-loans/${assignTarget.id}/assign`, { clientId: match.id });
            toast.success(`Préstamo asignado a ${match.name} ${match.surname1 || ''}.`);
            setAssignTarget(null);
            setCedula('');
            setMatch(null);
            fetchOrphans();
        } catch (err) {
            toast.error('Error: ' + (err.response?.data?.error || err.message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-orange-500" />
                    Préstamos sin socio asignado
                </h1>
                <p className="text-gray-500 text-sm mt-1">
                    Préstamos cargados sin <code className="text-xs bg-gray-100 px-1 rounded">clientId</code>. Reasigna cada uno a un socio existente para que entren al análisis de capacidad.
                </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">
                        {loading ? 'Cargando...' : `${orphans.length} préstamo(s) sin asignar`}
                    </p>
                </div>
                {loading ? (
                    <div className="py-12 flex items-center justify-center gap-2 text-gray-400">
                        <Loader2 className="h-5 w-5 animate-spin" /> Cargando...
                    </div>
                ) : orphans.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">
                        🎉 No hay préstamos huérfanos. Todos los registros tienen socio asignado.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
                                <tr>
                                    <th className="px-3 py-2 text-left">ID</th>
                                    <th className="px-3 py-2 text-left">idVm</th>
                                    <th className="px-3 py-2 text-right">Valor Prestado</th>
                                    <th className="px-3 py-2 text-center">Cuotas</th>
                                    <th className="px-3 py-2 text-center">Fecha</th>
                                    <th className="px-3 py-2 text-center">Estado</th>
                                    <th className="px-3 py-2 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orphans.map((o, i) => (
                                    <tr key={o.id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                        <td className="px-3 py-2.5 font-mono text-gray-500">{o.id}</td>
                                        <td className="px-3 py-2.5 font-bold text-gray-700">{o.idVm || '—'}</td>
                                        <td className="px-3 py-2.5 text-right text-gray-700">
                                            {o.valorPrestado ? `$${Math.round(o.valorPrestado).toLocaleString('es-CO')}` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-gray-600">{o.cuotas || '—'}</td>
                                        <td className="px-3 py-2.5 text-center text-gray-500">{o.fechaPrestamo || '—'}</td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${o.estado === 'Vigente' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                                                {o.estado || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <Button size="sm" variant="secondary" onClick={() => { setAssignTarget(o); setCedula(''); setMatch(null); }}>
                                                Asignar
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal asignación */}
            {assignTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-1">Asignar préstamo</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Préstamo <strong>{assignTarget.idVm || `ID ${assignTarget.id}`}</strong> · ${Math.round(assignTarget.valorPrestado || 0).toLocaleString('es-CO')}
                        </p>
                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="ced">Cédula del socio</Label>
                                <div className="flex gap-2 mt-1">
                                    <Input
                                        id="ced"
                                        type="text"
                                        inputMode="numeric"
                                        value={cedula}
                                        onChange={(e) => setCedula(e.target.value)}
                                        placeholder="Ej: 12345678"
                                        onKeyDown={(e) => { if (e.key === 'Enter') lookupCedula(); }}
                                    />
                                    <Button onClick={lookupCedula} disabled={searching || !cedula.trim()}>
                                        {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                            {match && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
                                    <User className="h-5 w-5 text-emerald-600 shrink-0" />
                                    <div className="text-sm">
                                        <p className="font-bold text-emerald-800">{match.name} {match.surname1 || ''} {match.surname2 || ''}</p>
                                        <p className="text-[11px] text-emerald-600">C.C. {match.cedula} · Estatus: {match.estatus}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <Button variant="ghost" onClick={() => setAssignTarget(null)}>Cancelar</Button>
                            <Button onClick={confirmAssign} disabled={!match || saving}>
                                {saving ? 'Guardando...' : 'Confirmar asignación'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrphanLoansPage;
