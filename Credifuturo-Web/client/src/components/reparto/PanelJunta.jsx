import React, { useMemo, useState } from 'react';
import { Sliders, Save, CheckCircle, Loader2, AlertTriangle, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../../config/api';
import { useUi } from '../../context/UiContext';
import { Button } from '../ui/Button';
import { construirReparto } from '../../utils/reparto';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * El puesto de mando del reparto: los tres números que lo deciden, y el efecto
 * de moverlos ANTES de guardarlos.
 *
 * Un reparto se aprueba en una reunión, no en un formulario. Lo que la Junta
 * necesita no es un campo donde escribir un factor, sino ver a quién le sube y a
 * quién le baja cada ajuste, con nombre y cifra, mientras todavía puede
 * cambiarlo. Por eso la comparación "guardado vs. simulado" es la pieza central
 * y no un extra: es lo que convierte un parámetro abstracto en una decisión que
 * se puede defender ante una asamblea.
 *
 * Guardar queda reservado al gerente, igual que hasta ahora. La Junta simula
 * cuanto quiera —eso no toca nada— pero el valor que rige el reparto lo escribe
 * una sola persona, que es como estaba antes de esta pantalla y no algo que
 * corresponda ampliar de paso.
 */
export default function PanelJunta({ socios, guardado, monto, onMonto, puedeGuardar, onGuardado, periodo, diagnostico, anomalias }) {
    const { toast } = useUi();
    const [factor, setFactor] = useState(guardado.factorPermanencia ?? 1);
    const [incluye, setIncluye] = useState(!!guardado.incluyeAporteInicial);
    const [guardando, setGuardando] = useState(false);

    const factorGuardado = guardado.factorPermanencia ?? 1;
    const incluyeGuardado = !!guardado.incluyeAporteInicial;

    // Los dos repartos que la pantalla compara: el que rige hoy y el que
    // resultaría de los controles. Es la comparación, no cada cifra por
    // separado, lo que permite decidir un ajuste antes de aplicarlo.
    const actual = useMemo(
        () => construirReparto(socios, { factorPermanencia: factorGuardado, incluyeAporteInicial: incluyeGuardado, monto }),
        [socios, factorGuardado, incluyeGuardado, monto]);
    const simulado = useMemo(
        () => construirReparto(socios, { factorPermanencia: factor, incluyeAporteInicial: incluye, monto }),
        [socios, factor, incluye, monto]);

    const hayCambio = factor !== factorGuardado || incluye !== incluyeGuardado;

    // Quién gana y quién pierde con el ajuste. Ordenado por magnitud del cambio:
    // lo que importa de una redistribución no es quién recibe más, sino a quién
    // se le mueve más respecto de lo que hoy está aprobado.
    const efecto = useMemo(() => {
        if (!hayCambio) return [];
        const antes = new Map(actual.filas.map(f => [f.id, f.utilidad]));
        return simulado.filas
            .map(f => ({ id: f.id, nombre: f.fullName, antes: antes.get(f.id) || 0, despues: f.utilidad, delta: f.utilidad - (antes.get(f.id) || 0) }))
            .filter(e => e.delta !== 0)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }, [hayCambio, actual, simulado]);

    const guardar = async () => {
        setGuardando(true);
        try {
            await Promise.all([
                api.put('/admin/settings/reparto.factorPermanencia', { value: factor }),
                api.put('/admin/settings/reparto.incluyeAporteInicial', { value: incluye ? 1 : 0 }),
            ]);
            toast.success('Parámetros del reparto guardados. El reparto que ven los socios ya usa estos valores.', 7000);
            onGuardado?.({ factorPermanencia: factor, incluyeAporteInicial: incluye });
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudieron guardar los parámetros.');
        } finally {
            setGuardando(false);
        }
    };

    const calidad = diagnostico?.total
        ? Math.round((diagnostico.pago / diagnostico.total) * 100)
        : 100;

    return (
        <div className="bg-white rounded-2xl border-2 border-brand-primary/20 shadow-sm overflow-hidden">
            <div className="bg-brand-primary px-5 py-3 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-white" />
                <p className="text-white font-bold text-sm">Parámetros del reparto · Junta Administrativa</p>
            </div>

            <div className="p-5 space-y-5">
                {/* ── Ganancia a repartir ── */}
                <label className="block">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ganancia a repartir en {periodo?.anio}</span>
                    <input
                        inputMode="numeric"
                        value={Number(monto || 0).toLocaleString('es-CO')}
                        onChange={(e) => onMonto(Number(e.target.value.replace(/\D/g, '')) || 0)}
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-lg font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                </label>

                {/* ── Factor de permanencia ── */}
                <div>
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Premio por permanencia</span>
                        <span className="text-sm font-black text-brand-primary tabular-nums">
                            {factor === 1 ? 'sin premio' : `+${Math.round((factor - 1) * 100)}%`}
                        </span>
                    </div>
                    <input
                        type="range" min="1" max="2" step="0.05" value={factor}
                        onChange={(e) => setFactor(Number(e.target.value))}
                        className="mt-2 w-full accent-brand-primary"
                    />
                    <p className="text-[11px] text-gray-500 leading-snug mt-1.5">
                        Cuánto pesa de más el saldo que un socio traía del año anterior y <strong>no retiró</strong>.
                        Se aplica solo sobre la parte que siguió en el fondo hasta hoy: quien abrió el año con saldo
                        y lo retiró en marzo no recibe premio por un dinero que ya no está.
                        {factor === 1 && <> Hoy está en <strong>sin premio</strong>: el reparto es puro capital-tiempo.</>}
                    </p>
                </div>

                {/* ── Aporte inicial ── */}
                <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={incluye} onChange={(e) => setIncluye(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-brand-primary flex-shrink-0" />
                    <span className="text-[11px] text-gray-600 leading-snug">
                        <strong className="text-gray-800">Contar el aporte inicial como capital.</strong> El aporte de ingreso
                        también está en el fondo prestándose, pero el reparto histórico nunca lo ha contado. Activarlo
                        favorece a los socios más antiguos; dejarlo apagado mantiene el criterio de siempre.
                    </span>
                </label>

                {/* ── El efecto del ajuste ── */}
                {hayCambio ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-amber-200 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <p className="text-xs font-bold text-amber-900">
                                Sin guardar todavía. Así quedaría el reparto frente a lo aprobado hoy:
                            </p>
                        </div>
                        <div className="max-h-56 overflow-y-auto divide-y divide-amber-100">
                            {efecto.map(e => (
                                <div key={e.id} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
                                    <span className="font-medium text-gray-700 truncate">{e.nombre}</span>
                                    <span className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                                        <span className="text-gray-400">{fmt(e.antes)}</span>
                                        <span className={`font-black flex items-center gap-0.5 ${e.delta > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {e.delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                            {e.delta > 0 ? '+' : ''}{fmt(e.delta)}
                                        </span>
                                    </span>
                                </div>
                            ))}
                            {!efecto.length && <p className="px-4 py-3 text-xs text-amber-800">Este ajuste no cambia el reparto de nadie.</p>}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                        Los parámetros en pantalla son los que están guardados. Muévelos para ver el efecto antes de aplicar.
                    </div>
                )}

                {/* ── Comprobaciones ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 ${simulado.cuadra ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <ShieldCheck className={`h-4 w-4 flex-shrink-0 mt-0.5 ${simulado.cuadra ? 'text-emerald-600' : 'text-red-600'}`} />
                        <div>
                            <p className={`text-[10px] font-black uppercase tracking-wider ${simulado.cuadra ? 'text-emerald-700' : 'text-red-700'}`}>
                                {simulado.cuadra ? 'El reparto cuadra' : 'El reparto NO cuadra'}
                            </p>
                            <p className="text-[11px] text-gray-600 tabular-nums">
                                Repartido {fmt(simulado.totalRepartido)} de {fmt(monto)}
                            </p>
                        </div>
                    </div>

                    <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 ${calidad >= 95 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <CheckCircle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${calidad >= 95 ? 'text-emerald-600' : 'text-amber-600'}`} />
                        <div>
                            <p className={`text-[10px] font-black uppercase tracking-wider ${calidad >= 95 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                Calidad de las fechas · {calidad}%
                            </p>
                            {/* Una pantalla de reparto que no dice de qué calidad son
                                sus datos invita a confiar en una cifra que quizá se
                                apoya en fechas supuestas. */}
                            <p className="text-[11px] text-gray-600">
                                {diagnostico?.pago ?? 0} con fecha de pago real
                                {(diagnostico?.periodo ?? 0) > 0 && <> · {diagnostico.periodo} estimados por el mes acreditado</>}
                                {(diagnostico?.sin ?? 0) > 0 && <> · <strong className="text-red-600">{diagnostico.sin} sin fecha, fuera del cálculo</strong></>}
                            </p>
                        </div>
                    </div>
                </div>

                {!!anomalias?.length && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-1.5">
                        <p className="text-[10px] font-black uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" /> Revisar antes de repartir
                        </p>
                        {anomalias.map((a, i) => (
                            <p key={i} className="text-[11px] text-red-900 leading-snug"><strong>{a.fullName}:</strong> {a.detalle}</p>
                        ))}
                    </div>
                )}

                {puedeGuardar ? (
                    <div className="flex justify-end">
                        <Button onClick={guardar} disabled={guardando || !hayCambio} className="gap-2">
                            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar parámetros
                        </Button>
                    </div>
                ) : (
                    <p className="text-[11px] text-gray-400 text-right">
                        Puedes simular libremente; guardar los parámetros le corresponde al gerente.
                    </p>
                )}
            </div>
        </div>
    );
}
