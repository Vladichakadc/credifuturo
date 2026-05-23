import React, { useState, useEffect, useMemo } from 'react';
import api from '../../config/api';
import { notifyUpdate } from '../../utils/sync';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Download, Edit, Trash2, Save, X, RefreshCw, Search, Filter, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Label, FormField } from '../../components/ui/Input';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../../utils/banks';

const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Banks imported from utils

const InitialContributionsPage = () => {
    const { toast } = useUi();
    const navigate = useNavigate();

    const { id } = useParams();
    const isEdit = !!id;

    // Data States
    const [clients, setClients] = useState([]);
    const [savings, setSavings] = useState([]);
    const [loading, setLoading] = useState(true);

    const emptyForm = () => ({
        externalId: '', // Id_A (Auto) - We'll map this to externalId in the backend
        clientId: '',   // Customer (Selected from list)
        name: '',       // Populated automatically
        surname: '',    // Populated automatically
        status: 'Activo',
        date: new Date().toISOString().split('T')[0], // Fecha Pago
        year: new Date().getFullYear(),              // Año
        month: monthNames[new Date().getMonth()],    // Mes
        amount: '',     // Valor
        itemQuantity: '1', // Item_Quantity
        banco: '',      // Banco
        numeroTransaccion: '', // # Transaccion
        origen: ''      // Desde Cuenta de Ahorro
    });

    const [form, setForm] = useState(emptyForm());

    // --- Fetch Data ---
    const fetchData = async () => {
        setLoading(true);
        try {
            const [resClients, resSavings] = await Promise.all([
                api.get('/admin/clients'),
                api.get('/admin/savings?type=Aporte Inicial')
            ]);
            setClients(Array.isArray(resClients.data) ? resClients.data : []);
            setSavings(Array.isArray(resSavings.data) ? resSavings.data : []);

            if (isEdit) {
                // Fetch specific saving record for editing
                const resEdit = await api.get(`/admin/savings`);
                // Filters from list since we don't have a direct GET /savings/:id that returns flattened data easily in this specific setup sometimes, 
                // but checking admin.js, router.get('/savings') is for general list. 
                // Actually, let's search for the saving in the fetched list or fetch directly if endpoint exists.
                // Looking at admin.js, there isn't a direct GET /savings/:id yet, but let's check.
                const savingToEdit = resSavings.data.find(s => String(s.id) === String(id));
                if (savingToEdit) {
                    setForm({
                        externalId: savingToEdit.externalId || '',
                        clientId: savingToEdit.clientId || '',
                        name: '', // Will be populated by useEffect
                        surname: '', // Will be populated by useEffect
                        status: savingToEdit.status || 'Abono',
                        date: savingToEdit.date || new Date().toISOString().split('T')[0],
                        year: savingToEdit.year || new Date().getFullYear(),
                        month: savingToEdit.month || monthNames[new Date().getMonth()],
                        amount: savingToEdit.amount || '',
                        itemQuantity: savingToEdit.itemQuantity || '1',
                        banco: savingToEdit.banco || '',
                        numeroTransaccion: savingToEdit.numeroTransaccion || '',
                        origen: savingToEdit.origen || ''
                    });
                } else {
                    toast.error('Aporte no encontrado');
                    navigate('/admin/initial-contributions/list');
                }
            }
        } catch (err) {
            console.error('Error fetching data:', err);
            toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [id]);

    // --- Auto-Increment Logic for Id_A ---
    const autoIncrementIdA = useMemo(() => {
        if (!savings || savings.length === 0) return 'AI001';
        const aiPattern = /^AI(\d+)$/;
        const aiNumbers = savings
            .map(s => s.externalId)
            .filter(id => id && aiPattern.test(id))
            .map(id => parseInt(id.match(aiPattern)[1]))
            .filter(n => !isNaN(n));
        if (aiNumbers.length === 0) return 'AI001';
        const nextNum = Math.max(...aiNumbers) + 1;
        return `AI${String(nextNum).padStart(3, '0')}`;
    }, [savings]);

    useEffect(() => {
        if (!form.externalId && !loading && !isEdit) {
            setForm(prev => ({ ...prev, externalId: autoIncrementIdA }));
        }
    }, [autoIncrementIdA, loading, isEdit]);

    // --- Handle Client Selection ---
    useEffect(() => {
        if (form.clientId) {
            const client = clients.find(c => String(c.id) === String(form.clientId));
            if (client) {
                setForm(prev => ({
                    ...prev,
                    name: client.name || '',
                    surname: client.surname1 || ''
                }));
            }
        }
    }, [form.clientId, clients]);

    // --- Handle Date Changes ---
    useEffect(() => {
        if (form.date) {
            const [y, m] = form.date.split('-');
            setForm(prev => ({
                ...prev,
                year: parseInt(y),
                month: monthNames[parseInt(m) - 1]
            }));
        }
    }, [form.date]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!form.clientId) {
            toast.error('Seleccione un socio');
            return;
        }

        const payload = {
            ...form,
            type: 'Aporte Inicial',
            amount: parseFloat(form.amount) || 0,
            itemQuantity: parseInt(form.itemQuantity) || 1,
            mesAbonado: monthNames.indexOf(form.month) + 1,
            anioAbonado: form.year,
            valorAhorrado: parseFloat(form.amount) || 0,
            valorAPenalizar: 0,
            penalizacion: 'NO'
        };

        try {
            if (isEdit) {
                await api.put(`/admin/savings/${id}`, payload);
                toast.success('Aporte inicial actualizado correctamente');
            } else {
                await api.post('/admin/savings', payload);
                toast.success('Aporte inicial registrado correctamente');
            }
            notifyUpdate('savings');
            navigate('/admin/initial-contributions/list');
        } catch (err) {
            console.error('Error saving contribution:', err);
            toast.error('Error al guardar: ' + (err.response?.data?.error || err.message));
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Volver
                    </Button>
                    <h1 className="text-2xl font-bold text-brand-primary">
                        {isEdit ? 'Editar Aporte Inicial' : 'Ingreso de Aportes Iniciales'}
                    </h1>
                </div>
            </div>

            <Card className="shadow-lg border-brand-primary/10">
                <CardContent className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Section 1: Identification */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <FormField label={isEdit ? "Id_A" : "Id_A (Auto)"}>
                                <Input value={form.externalId} readOnly className="bg-gray-50 font-bold text-brand-primary" />
                            </FormField>

                            <div className="md:col-span-3">
                                <Label className="text-gray-700 font-semibold mb-1.5 block">Customer (Socio)</Label>
                                <select
                                    className="flex h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                                    value={form.clientId}
                                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                                    required
                                >
                                    <option value="">-- Seleccionar Socio --</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.customerId} - {c.name} {c.surname1}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField label="Nombre">
                                <Input value={form.name} readOnly className="bg-gray-50 text-gray-600" />
                            </FormField>
                            <FormField label="Apellido">
                                <Input value={form.surname} readOnly className="bg-gray-50 text-gray-600" />
                            </FormField>
                        </div>

                        <div className="h-px bg-gray-100" />

                        {/* Section 2: Payment Details */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <FormField label="Estado">
                                <select
                                    className="flex h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none"
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                >
                                    <option value="Activo">Activo</option>
                                    <option value="Desactivado">Desactivado</option>
                                </select>
                            </FormField>
                            <FormField label="Fecha Pago">
                                <Input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                                    required
                                />
                            </FormField>
                            <FormField label="Año">
                                <Input value={form.year} readOnly className="bg-gray-50" />
                            </FormField>
                            <FormField label="Mes">
                                <Input value={form.month} readOnly className="bg-gray-50" />
                            </FormField>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormField label="Valor">
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-500 font-bold">$</span>
                                    <Input
                                        type="number"
                                        value={form.amount}
                                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                        className="pl-8 font-bold text-lg text-brand-primary"
                                        required
                                        placeholder="0.00"
                                    />
                                </div>
                            </FormField>
                            <FormField label="Item_Quantity">
                                <Input
                                    type="number"
                                    value={form.itemQuantity}
                                    onChange={(e) => setForm({ ...form, itemQuantity: e.target.value })}
                                />
                            </FormField>
                            <FormField label="Banco">
                                <select
                                    className="flex h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                                    value={form.banco}
                                    onChange={(e) => setForm({ ...form, banco: e.target.value })}
                                >
                                    <option value="">-- Seleccionar Banco --</option>
                                    {COLOMBIAN_BANKS_WITH_OTHER.map(bank => (
                                        <option key={bank} value={bank}>{bank}</option>
                                    ))}
                                </select>
                            </FormField>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField label="# Transaccion">
                                <Input
                                    value={form.numeroTransaccion}
                                    onChange={(e) => setForm({ ...form, numeroTransaccion: e.target.value })}
                                />
                            </FormField>
                            <FormField label="Desde Cuenta de Ahorro">
                                <Input
                                    value={form.origen}
                                    onChange={(e) => setForm({ ...form, origen: e.target.value })}
                                    placeholder="Si aplica"
                                />
                            </FormField>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={() => navigate('/admin/initial-contributions/list')}>
                                Cancelar
                            </Button>
                            <Button type="submit" className="bg-brand-primary hover:bg-brand-dark px-8">
                                <Save className="h-4 w-4 mr-2" /> {isEdit ? 'Guardar Cambios' : 'Guardar Aporte'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default InitialContributionsPage;
