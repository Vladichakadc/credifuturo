import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, AlertTriangle, CheckCircle2, UploadCloud, UserCircle2, CalendarDays, Calculator, Landmark, FileText } from 'lucide-react';
import api from '../../config/api';
import { useUi } from '../../context/UiContext';
import { Button } from '../ui/Button';
import { Input, Label, FormField } from '../ui/Input';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../../utils/banks';
import { MONTH_NAMES, calcularAhorro, autoIncrementId } from '../../utils/savingsCalculations';
import { hoyISO } from '../../utils/fechas';

const emptyForm = () => ({
    id: '',
    clientId: '',
    amount: '',
    date: hoyISO(),
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
    month: MONTH_NAMES[new Date().getMonth()],
    monthInt: new Date().getMonth() + 1,
    externalId: '',
    status: 'Abono',
    itemQuantity: '1',
    observaciones: ''
});

// Encabezado de sección reutilizado dentro del formulario — reemplaza la
// numeración cruda heredada del mapeo de columnas Excel por agrupación visual.
const SectionHeader = ({ icon: Icon, title, subtitle }) => (
    <div className="flex items-center gap-2 mb-3">
        <div className="bg-brand-primary/10 rounded-lg p-1.5">
            <Icon className="h-4 w-4 text-brand-primary" />
        </div>
        <div>
            <h3 className="text-sm font-bold text-gray-800">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
    </div>
);

const SavingFormModal = ({ isOpen, onClose, isEditing, initialSaving, clients, savings, onSaved }) => {
    const { toast } = useUi();
    const [form, setForm] = useState(emptyForm());
    const [soporteFile, setSoporteFile] = useState(null);
    const [saving, setSavingState] = useState(false);

    // Inicializa el formulario únicamente al abrir el modal — evita pisar lo que
    // el admin está escribiendo si `savings`/`clients` se refrescan en segundo plano.
    useEffect(() => {
        if (!isOpen) return;
        if (isEditing && initialSaving) {
            setForm({ ...initialSaving, date: hoyISO() });
        } else {
            setForm({ ...emptyForm(), externalId: autoIncrementId(savings, { prefix: 'AM', start: 339 }) });
        }
        setSoporteFile(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const selectedClient = useMemo(
        () => clients.find(c => String(c.id) === String(form.clientId)),
        [clients, form.clientId]
    );

    const uniqueStatuses = useMemo(() => {
        const statuses = savings.map(s => s.status).filter(st => st && st.trim() !== '');
        return [...new Set(statuses)].sort();
    }, [savings]);

    // ——— Cálculo automático de penalización / valor neto ahorrado ———
    const calculo = useMemo(() => {
        if (!isOpen || !form.date) return null;
        return calcularAhorro({
            date: form.date,
            month: form.month,
            anioAbonado: form.anioAbonado,
            amount: form.amount,
            clientId: form.clientId,
            isEditing,
            externalId: form.externalId,
            fechaIngresoCliente: selectedClient?.fechaIngreso,
            savings
        });
    }, [isOpen, form.date, form.amount, form.month, form.anioAbonado, form.clientId, form.externalId, isEditing, selectedClient, savings]);

    // Aplica el resultado del cálculo al formulario sin pisar lo que el usuario edita.
    useEffect(() => {
        if (!calculo) return;
        setForm(prev => {
            const next = {
                ...prev,
                year: calculo.year ?? prev.year,
                mesAbonado: calculo.mesAbonado,
                penalizacion: calculo.penalizacion,
                diasPenalizacion: calculo.diasPenalizacion,
                valorAPenalizar: calculo.valorAPenalizar.toFixed(2),
                valorAhorrado: calculo.valorAhorrado.toFixed(2)
            };
            const changed = Object.keys(next).some(k => String(next[k]) !== String(prev[k]));
            return changed ? next : prev;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calculo]);

    if (!isOpen) return null;

    const pagoAdicionalInfo = calculo?.pagoAdicionalInfo;
    const dormantInfo = calculo?.dormantInfo;
    const clientName = selectedClient ? `${selectedClient.name} ${selectedClient.surname1}` : 'El socio seleccionado';

    const handleSubmit = async (e) => {
        e.preventDefault();

        const cleanNumber = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            const cleaned = String(val).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
            const parsed = Number(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        };

        const monto = cleanNumber(form.amount);
        const valorAhorrado = cleanNumber(form.valorAhorrado);
        const valorAPenalizar = cleanNumber(form.valorAPenalizar);

        if (!monto || monto <= 0) {
            toast.error('⚠️ El monto debe ser mayor a 0');
            return;
        }
        if (valorAhorrado < 0) {
            toast.error(`⚠️ MONTO INSUFICIENTE\n\nEl monto ingresado no cubre la penalización.\n\nMonto: $${monto.toLocaleString('es-CO')}\nPenalización: $${valorAPenalizar.toLocaleString('es-CO')}\nDéficit: $${Math.abs(valorAhorrado).toLocaleString('es-CO')}`);
            return;
        }

        const sanitizedForm = {
            ...form,
            clientId: form.clientId ? parseInt(form.clientId, 10) : null,
            amount: monto,
            valorAhorrado,
            valorAPenalizar,
            diasPenalizacion: form.diasPenalizacion ? parseInt(form.diasPenalizacion, 10) : 0,
            mesAbonado: form.mesAbonado ? parseInt(form.mesAbonado, 10) : new Date().getMonth() + 1,
            anioAbonado: form.anioAbonado ? parseInt(form.anioAbonado, 10) : new Date().getFullYear(),
            year: form.year ? parseInt(form.year, 10) : new Date().getFullYear(),
            monthInt: form.monthInt ? parseInt(form.monthInt, 10) : new Date().getMonth() + 1,
            itemQuantity: form.itemQuantity ? parseInt(form.itemQuantity, 10) : 1
        };

        setSavingState(true);
        try {
            let savingId;
            let successMessage = '';

            if (isEditing) {
                await api.put(`/admin/savings/${form.id}`, sanitizedForm);
                savingId = form.id;
                successMessage = '✅ Ahorro actualizado exitosamente';
            } else {
                const response = await api.post(`/admin/savings`, sanitizedForm);
                savingId = response.data.id;
                const calc = response.data._calculado;
                successMessage = calc
                    ? `✅ Ahorro registrado\n\n${calc.mensaje}\nValor Ahorrado: $${parseFloat(calc.valorAhorrado).toLocaleString('es-CO')}`
                    : '✅ Ahorro registrado exitosamente';
            }

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
            onSaved();
            onClose();
        } catch (err) {
            console.error('Error saving saving:', err);
            const serverDetail = err.response?.data?.error || err.message;
            toast.error(`❌ ERROR DE BASE DE DATOS\n\n${serverDetail}`);
        } finally {
            setSavingState(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-8 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
                    <h2 className="text-xl font-bold text-brand-primary">
                        {isEditing ? 'Editar Ahorro' : 'Registrar Nuevo Ahorro'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* ——— Socio ——— */}
                    <div>
                        <SectionHeader icon={UserCircle2} title="Socio" subtitle="A quién se le registra el ahorro" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField label="Id_VM (auto)">
                                <Input value={form.externalId} readOnly className="bg-gray-50 font-bold text-brand-primary" />
                            </FormField>
                            <div className="md:col-span-2">
                                <Label>Socio</Label>
                                <select
                                    aria-label="Socio"
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
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
                    </div>

                    {pagoAdicionalInfo && (
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-md flex gap-3">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                            <div>
                                <h3 className="text-sm font-medium text-emerald-800">✅ Pago adicional detectado — Sin penalización</h3>
                                <div className="mt-2 text-sm text-emerald-700 space-y-1">
                                    <p><strong>{clientName}</strong> ya tiene un ahorro registrado en <strong>{form.month} {form.year}</strong> (ID: {pagoAdicionalInfo.existingId}).</p>
                                    <p>Este pago adicional <strong>no genera penalización</strong> ya que la cuota del mes ya fue cubierta.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {dormantInfo && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex gap-3">
                            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                            <div>
                                <h3 className="text-sm font-medium text-red-800">Atención: Sin registros en {form.year}</h3>
                                <div className="mt-2 text-sm text-red-700 space-y-1">
                                    <p><strong>{clientName}</strong> no tiene ahorros registrados en este año.</p>
                                    <p><strong>Meses adeudados:</strong> {dormantInfo.months}</p>
                                    <p className="font-bold">Penalización Acumulada: ${dormantInfo.penalty.toLocaleString('es-CO')}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ——— Periodo del pago ——— */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <SectionHeader icon={CalendarDays} title="Periodo del Pago" subtitle="Fecha real de pago y mes que se está abonando" />
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <FormField label="Estado">
                                <select
                                    aria-label="Estado"
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    required
                                >
                                    <option value="">-- Seleccionar Estado --</option>
                                    {uniqueStatuses.map(st => <option key={st} value={st}>{st}</option>)}
                                </select>
                            </FormField>
                            <FormField label="Fecha Pago">
                                <Input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                                    required
                                    className="text-gray-800"
                                />
                            </FormField>
                            <FormField label="Año Pago (auto)">
                                <Input value={form.year} readOnly className="bg-white font-mono text-gray-700" />
                            </FormField>
                            <FormField label="Mes Pago">
                                <select
                                    aria-label="Mes de pago"
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none"
                                    value={form.month}
                                    onChange={(e) => setForm({ ...form, month: e.target.value })}
                                >
                                    {MONTH_NAMES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </FormField>
                        </div>
                    </div>

                    {/* ——— Cálculo de penalización (automático) ——— */}
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                        <SectionHeader icon={Calculator} title="Monto y Penalización" subtitle="Se calcula automáticamente al cambiar fecha, mes o monto" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField label="Valor Mensual (monto)">
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                                    <Input
                                        type="number"
                                        value={form.amount}
                                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                        className="pl-7 font-bold text-lg text-green-700"
                                        required
                                    />
                                </div>
                            </FormField>
                            <FormField label="Penalización (SI/NO)">
                                <Input
                                    value={form.penalizacion}
                                    readOnly
                                    className={`bg-white font-bold ${form.penalizacion === 'SI' ? 'text-red-600' : 'text-green-700'}`}
                                />
                            </FormField>
                            <FormField label="Días de Penalización">
                                <Input value={form.diasPenalizacion} readOnly className="bg-white text-gray-700" />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-green-200">
                            <FormField label="Valor a Penalizar">
                                <Input
                                    value={parseFloat(form.valorAPenalizar).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                                    readOnly
                                    className="bg-white text-red-600 font-bold"
                                />
                            </FormField>
                            <FormField label="Valor Ahorrado (neto)">
                                <Input
                                    value={parseFloat(form.valorAhorrado).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                                    readOnly
                                    className="bg-white text-green-700 font-bold"
                                />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-green-200">
                            <FormField label="Mes Abonado (#)">
                                <Input value={form.mesAbonado} readOnly className="bg-white text-gray-700" />
                            </FormField>
                            <FormField label="Año Abonado">
                                <Input
                                    type="number"
                                    value={form.anioAbonado}
                                    onChange={(e) => setForm({ ...form, anioAbonado: e.target.value })}
                                    className="text-gray-800 bg-white"
                                />
                            </FormField>
                            <FormField label="Cantidad">
                                <Input
                                    type="number"
                                    value={form.itemQuantity}
                                    onChange={(e) => setForm({ ...form, itemQuantity: e.target.value })}
                                    className="text-gray-800 bg-white"
                                />
                            </FormField>
                            <FormField label="Tipo de Ahorro">
                                <select
                                    aria-label="Tipo de ahorro"
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none"
                                    value={form.type}
                                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                                >
                                    <option value="Mensual">Mensual</option>
                                    <option value="Aporte Inicial">Aporte Inicial</option>
                                </select>
                            </FormField>
                        </div>
                    </div>

                    {/* ——— Información bancaria ——— */}
                    <div>
                        <SectionHeader icon={Landmark} title="Información Bancaria" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Banco">
                                <select
                                    aria-label="Banco"
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                                    value={form.banco}
                                    onChange={(e) => setForm({ ...form, banco: e.target.value })}
                                    required
                                >
                                    <option value="">-- Seleccionar Banco --</option>
                                    {COLOMBIAN_BANKS_WITH_OTHER.map(bank => (
                                        <option key={bank} value={bank}>{bank}</option>
                                    ))}
                                </select>
                            </FormField>
                            <FormField label="# Transacción">
                                <Input
                                    value={form.numeroTransaccion}
                                    onChange={(e) => setForm({ ...form, numeroTransaccion: e.target.value })}
                                    className="text-gray-800"
                                />
                            </FormField>
                            <FormField label="Desde Cuenta de Ahorros">
                                <Input
                                    value={form.origen}
                                    onChange={(e) => setForm({ ...form, origen: e.target.value })}
                                    placeholder="Ej: Cuenta externa..."
                                    className="text-gray-800"
                                />
                            </FormField>
                            <FormField label="Observaciones">
                                <Input
                                    value={form.observaciones}
                                    onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                                    className="text-gray-800"
                                />
                            </FormField>
                        </div>
                    </div>

                    {/* ——— Soporte de pago ——— */}
                    <div className="border border-dashed border-brand-primary/50 bg-brand-primary/[0.02] p-4 rounded-xl">
                        <SectionHeader icon={FileText} title="Soporte de Pago" subtitle="Opcional — comprobante de la transacción" />
                        <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 rounded-lg cursor-pointer bg-white hover:bg-gray-50 border-2 border-dashed border-gray-300">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-8 h-8 mb-3 text-gray-400" />
                                <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click para subir</span> o arrastra y suelta</p>
                                <p className="text-xs text-gray-500">JPG, PNG o PDF (máx. 10MB)</p>
                            </div>
                            <input
                                id="dropzone-file"
                                type="file"
                                className="hidden"
                                accept=".jpg,.jpeg,.png,.pdf,.webp"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) setSoporteFile(e.target.files[0]);
                                }}
                            />
                        </label>
                        {soporteFile && (
                            <div className="mt-3 p-3 bg-green-50 text-green-700 rounded-lg text-sm flex justify-between items-center border border-green-200">
                                <span className="font-medium truncate mr-2">📎 {soporteFile.name} ({(soporteFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                                <button type="button" onClick={() => setSoporteFile(null)} className="text-red-500 hover:text-red-700">Eliminar</button>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button type="submit" size="lg" disabled={saving}>
                            <Save className="mr-2 h-4 w-4" />
                            {saving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Registrar Ahorro'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SavingFormModal;
