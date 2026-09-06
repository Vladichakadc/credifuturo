import React, { useState, useMemo } from 'react';
import { Pencil, Save, X, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../config/api';
import { useUi } from '../context/UiContext';
import { Button } from './ui/Button';
import { COLOMBIAN_BANKS_WITH_OTHER } from '../utils/banks';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * Corregir una solicitud que el socio envió con algún dato errado.
 *
 * El socio la diligencia desde su panel y a veces llega con un cero de más en el monto,
 * el plazo cambiado o la cuenta equivocada. Antes la única salida era rechazarla y
 * pedirle que la volviera a enviar; ahora la Junta o el gerente la arreglan aquí.
 *
 * Dos cosas que el formulario deja explícitas, porque son las que se olvidan:
 *
 *   - Cambiar monto, plazo o tasa BORRA los votos ya emitidos. Quien votó lo hizo sobre
 *     unas condiciones concretas, y mantener su voto sobre otras distintas lo convertiría
 *     en el aval de algo que nunca vio. El aviso aparece en cuanto el cambio lo provoca,
 *     no después de guardar.
 *   - Corregir el banco, la cuenta o las observaciones no toca los votos, porque no
 *     cambia lo que se está aprobando.
 */
export default function EditarSolicitud({ solicitud, votosEmitidos = 0, onGuardado }) {
    const { toast } = useUi();
    const [abierto, setAbierto] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [form, setForm] = useState(null);

    const abrir = () => {
        setForm({
            amount: String(Number(solicitud.amount) || ''),
            installments: String(Number(solicitud.installments) || ''),
            monthlyRate: String(Number(solicitud.monthlyRate) || ''),
            banco: solicitud.banco || '',
            cuentaAhorros: solicitud.cuentaAhorros || '',
            observaciones: solicitud.observaciones || '',
        });
        setAbierto(true);
    };

    const cambiaCondiciones = useMemo(() => {
        if (!form) return false;
        return Number(form.amount) !== Number(solicitud.amount)
            || parseInt(form.installments, 10) !== parseInt(solicitud.installments, 10)
            || Number(form.monthlyRate) !== Number(solicitud.monthlyRate);
    }, [form, solicitud]);

    // Se recalcula aquí para que el efecto del cambio se vea ANTES de guardar. El
    // servidor rehace la misma cuenta al recibirla; esto es solo la vista previa.
    const previa = useMemo(() => {
        if (!form) return null;
        const P = Number(form.amount), n = parseInt(form.installments, 10);
        let i = Number(form.monthlyRate);
        if (!(P > 0) || !(n > 0) || !(i >= 0)) return null;
        if (i > 1) i = i / 100;
        const capital = P / n;
        let saldo = P, interesTotal = 0, primera = 0, ultima = 0;
        for (let k = 1; k <= n; k++) {
            const interes = saldo * i;
            const capK = k === n ? saldo : capital;
            if (k === 1) primera = capK + interes;
            if (k === n) ultima = capK + interes;
            interesTotal += interes;
            saldo -= capK;
        }
        return { primera, ultima, interesTotal, total: P + interesTotal };
    }, [form]);

    const guardar = async () => {
        const P = Number(form.amount), n = parseInt(form.installments, 10), i = Number(form.monthlyRate);
        if (!(P > 0)) return toast.error('El monto debe ser mayor a 0.');
        if (!(n > 0)) return toast.error('El número de cuotas debe ser mayor a 0.');
        if (!(i >= 0) || i > 10) return toast.error('La tasa mensual debe estar entre 0 y 10 (en porcentaje, ej. 1.4).');

        setGuardando(true);
        try {
            const res = await api.put(`/admin/loan-requests/${solicitud.id}`, {
                amount: P, installments: n, monthlyRate: i,
                banco: form.banco, cuentaAhorros: form.cuentaAhorros, observaciones: form.observaciones,
            });
            const borrados = res.data?.votosBorrados || 0;
            toast.success(
                borrados > 0
                    ? `Solicitud corregida. Se borraron ${borrados} voto(s): la Junta tiene que votar de nuevo sobre las condiciones nuevas.`
                    : 'Solicitud corregida.',
                borrados > 0 ? 9000 : 4000
            );
            setAbierto(false);
            onGuardado?.(res.data?.data);
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo guardar la corrección.');
        } finally {
            setGuardando(false);
        }
    };

    // Una solicitud ya decidida no se edita: sus condiciones son las que se aprobaron.
    if (solicitud.status !== 'pending') return null;

    if (!abierto) {
        return (
            <Button variant="secondary" onClick={abrir} className="gap-2">
                <Pencil className="h-4 w-4" /> Corregir solicitud
            </Button>
        );
    }

    return (
        <div className="bg-white rounded-2xl border-2 border-brand-primary/30 shadow-sm overflow-hidden">
            <div className="bg-brand-primary px-5 py-3 flex items-center gap-2">
                <Pencil className="h-4 w-4 text-white" />
                <p className="text-white font-bold text-sm">Corregir la solicitud</p>
            </div>

            <div className="p-5 space-y-4">
                <p className="text-xs text-gray-500">
                    Para cuando el socio envía un dato equivocado. Los cambios quedan registrados.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monto</span>
                        <input type="number" min="0" step="1000" value={form.amount}
                            onChange={e => setForm({ ...form, amount: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                    </label>
                    <label className="block">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cuotas</span>
                        <input type="number" min="1" step="1" value={form.installments}
                            onChange={e => setForm({ ...form, installments: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                    </label>
                    <label className="block">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tasa mensual (%)</span>
                        <input type="number" min="0" max="10" step="0.1" value={form.monthlyRate}
                            onChange={e => setForm({ ...form, monthlyRate: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                    </label>
                </div>

                {previa && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 rounded-xl p-3">
                        {[
                            ['Primera cuota', fmt(previa.primera)],
                            ['Última cuota', fmt(previa.ultima)],
                            ['Total intereses', fmt(previa.interesTotal)],
                            ['Total a pagar', fmt(previa.total)],
                        ].map(([k, v]) => (
                            <div key={k}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{k}</p>
                                <p className="text-sm font-black text-gray-800 tabular-nums">{v}</p>
                            </div>
                        ))}
                    </div>
                )}

                {cambiaCondiciones && votosEmitidos > 0 && (
                    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl p-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 leading-snug">
                            Al cambiar monto, plazo o tasa se borrarán los <strong>{votosEmitidos} voto(s)</strong> ya emitidos.
                            Quien votó lo hizo sobre las condiciones anteriores, así que la Junta tendrá que volver a votar.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Banco</span>
                        <select value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary">
                            <option value="">— Sin especificar —</option>
                            {COLOMBIAN_BANKS_WITH_OTHER.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cuenta de ahorros</span>
                        <input type="text" value={form.cuentaAhorros}
                            onChange={e => setForm({ ...form, cuentaAhorros: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                    </label>
                </div>

                <label className="block">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Observaciones</span>
                    <textarea rows={2} value={form.observaciones}
                        onChange={e => setForm({ ...form, observaciones: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                </label>

                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1">
                    <Button variant="ghost" onClick={() => setAbierto(false)} disabled={guardando} className="gap-2">
                        <X className="h-4 w-4" /> Cancelar
                    </Button>
                    <Button onClick={guardar} disabled={guardando} className="gap-2">
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Guardar corrección
                    </Button>
                </div>
            </div>
        </div>
    );
}
