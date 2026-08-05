import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import api from '../../config/api';
import { Button } from '../ui/Button';
import { Input, FormField } from '../ui/Input';
import { useUi } from '../../context/UiContext';

// Campos editables del socio (espejo de ALLOWED_CLIENT_FIELDS en el backend,
// menos porcentajePrestamo que se gestiona desde el flujo de préstamos).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CEDULA_RE = /^\d{4,15}$/;
const ESTATUS_OPTS = ['Activo', 'Desactivado'];

const emptyErrors = {};

/**
 * Formulario de edición de un socio en modal. Validación inline con el slot
 * `error` de FormField. Hace PUT /admin/clients/:id y devuelve el socio
 * actualizado por onSaved.
 *
 * Props: open, client, onClose, onSaved
 */
const ClientForm = ({ open, client, onClose, onSaved }) => {
    const { toast } = useUi();
    const [form, setForm] = useState({});
    const [errors, setErrors] = useState(emptyErrors);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (client) {
            setForm({
                cedula: client.cedula ?? '',
                name: client.name ?? '',
                surname1: client.surname1 ?? '',
                surname2: client.surname2 ?? '',
                email: client.email ?? '',
                genero: client.genero ?? '',
                pais: client.pais ?? '',
                ciudad: client.ciudad ?? '',
                tipoCliente: client.tipoCliente ?? '',
                socioFundador: client.socioFundador ?? '',
                referido: client.referido ?? '',
                cargo: client.cargo ?? '',
                fechaIngreso: (client.fechaIngreso || '').toString().split('T')[0],
                fechaBaja: (client.fechaBaja || '').toString().split('T')[0],
                estatus: client.estatus ?? 'Activo',
            });
            setErrors(emptyErrors);
        }
    }, [client, open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, saving, onClose]);

    if (!open || !client) return null;

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const validate = () => {
        const e = {};
        if (!form.name?.trim()) e.name = 'El nombre es obligatorio.';
        if (!form.cedula?.trim()) e.cedula = 'La cédula es obligatoria.';
        else if (!CEDULA_RE.test(form.cedula.trim())) e.cedula = 'La cédula debe tener solo dígitos (4 a 15).';
        if (form.email?.trim() && !EMAIL_RE.test(form.email.trim())) e.email = 'Correo con formato inválido.';
        if (form.estatus && !ESTATUS_OPTS.includes(form.estatus)) e.estatus = 'Estatus inválido.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            const payload = { ...form };
            if (!payload.email?.trim()) payload.email = null;
            if (!payload.fechaBaja?.trim()) payload.fechaBaja = null;
            const res = await api.put(`/admin/clients/${client.id}`, payload);
            toast.success('Socio actualizado.');
            onSaved?.(res.data);
            onClose?.();
        } catch (err) {
            const msg = err.response?.data?.error || 'No se pudo guardar el socio.';
            // Errores de unicidad → resáltalos en el campo correspondiente
            if (/cédula|cedula/i.test(msg)) setErrors(e => ({ ...e, cedula: msg }));
            else if (/email|correo/i.test(msg)) setErrors(e => ({ ...e, email: msg }));
            else toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const inputCls = 'h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary';

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && onClose?.()} />
            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-gray-100">
                <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white/95 backdrop-blur px-6 py-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Editar socio</h3>
                        <p className="text-xs text-gray-500">{client.name} {client.surname1} · CC {client.cedula}</p>
                    </div>
                    <button onClick={() => !saving && onClose?.()} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Cédula *" error={errors.cedula}>
                        <Input value={form.cedula} error={!!errors.cedula} onChange={(e) => set('cedula', e.target.value)} />
                    </FormField>
                    <FormField label="Nombre *" error={errors.name}>
                        <Input value={form.name} error={!!errors.name} onChange={(e) => set('name', e.target.value)} />
                    </FormField>
                    <FormField label="1er Apellido">
                        <Input value={form.surname1} onChange={(e) => set('surname1', e.target.value)} />
                    </FormField>
                    <FormField label="2do Apellido">
                        <Input value={form.surname2} onChange={(e) => set('surname2', e.target.value)} />
                    </FormField>
                    <FormField label="Correo" error={errors.email}>
                        <Input value={form.email} error={!!errors.email} onChange={(e) => set('email', e.target.value)} placeholder="socio@credifuturo.com" />
                    </FormField>
                    <FormField label="Género">
                        <Input value={form.genero} onChange={(e) => set('genero', e.target.value)} />
                    </FormField>
                    <FormField label="País">
                        <Input value={form.pais} onChange={(e) => set('pais', e.target.value)} />
                    </FormField>
                    <FormField label="Ciudad">
                        <Input value={form.ciudad} onChange={(e) => set('ciudad', e.target.value)} />
                    </FormField>
                    <FormField label="Tipo Cliente">
                        <Input value={form.tipoCliente} onChange={(e) => set('tipoCliente', e.target.value)} />
                    </FormField>
                    <FormField label="Socio Fundador">
                        <select className={inputCls} value={form.socioFundador} onChange={(e) => set('socioFundador', e.target.value)}>
                            <option value="">—</option>
                            <option value="SI">SI</option>
                            <option value="NO">NO</option>
                        </select>
                    </FormField>
                    <FormField label="Referido">
                        <Input value={form.referido} onChange={(e) => set('referido', e.target.value)} />
                    </FormField>
                    <FormField label="Cargo">
                        <Input value={form.cargo} onChange={(e) => set('cargo', e.target.value)} />
                    </FormField>
                    <FormField label="Fecha Ingreso">
                        <Input type="date" value={form.fechaIngreso} onChange={(e) => set('fechaIngreso', e.target.value)} />
                    </FormField>
                    <FormField label="Fecha Baja">
                        <Input type="date" value={form.fechaBaja} onChange={(e) => set('fechaBaja', e.target.value)} />
                    </FormField>
                    <FormField label="Estatus" error={errors.estatus}>
                        <select className={inputCls} value={form.estatus} onChange={(e) => set('estatus', e.target.value)}>
                            {ESTATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </FormField>
                </div>

                <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 bg-white/95 backdrop-blur px-6 py-4">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} isLoading={saving}>Guardar cambios</Button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ClientForm;
