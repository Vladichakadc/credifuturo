import React, { useMemo, useState } from 'react';
import { Sliders, Save, CheckCircle, Loader2, AlertTriangle, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../../config/api';
import { useUi } from '../../context/UiContext';
import { Button } from '../ui/Button';
import { construirReparto } from '../../utils/reparto';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * El puesto de mando del reparto: el efecto del premio por permanencia ANTES de
 * guardarlo, y las comprobaciones que hacen falta para poder aprobarlo.
 *
 * Un reparto se aprueba en una reunión, no en un formulario. Lo que la Junta
 * necesita no es un campo donde escribir un factor, sino ver a quién le sube y a
 * quién le baja el ajuste, con nombre y cifra, mientras todavía puede cambiarlo.
 * Por eso la comparación "guardado vs. simulado" es la pieza central y no un
 * extra: convierte un parámetro abstracto en una decisión defendible.
 *
 * Guardar queda reservado al gerente, como hasta ahora. La Junta simula cuanto
 * quiera —eso no toca nada— pero el valor que rige el reparto lo escribe una sola
 * persona, que es como estaba antes y no algo que corresponda ampliar de paso.
 */
export default function PanelJunta({ socios, guardado, monto, puedeGuardar, onGuardado, periodo, diagnostico, anomalias, origenMonto, retencion, descuentos, reparto }) {
    const { toast } = useUi();
    const factorGuardado = guardado.factorPermanencia ?? 1;
    const [factor, setFactor] = useState(factorGuardado);
    const [guardando, setGuardando] = useState(false);

    // Las dos simulaciones llevan la retención y los descuentos vigentes: medir
    // el efecto del premio sobre un reparto sin ellos compararía contra algo que
    // ya no existe.
    const actual = useMemo(
        () => construirReparto(socios, { factorPermanencia: factorGuardado, monto, retencion, descuentos }),
        [socios, factorGuardado, monto, retencion, descuentos]);
    const simulado = useMemo(
        () => construirReparto(socios, { factorPermanencia: factor, monto, retencion, descuentos }),
        [socios, factor, monto, retencion, descuentos]);

    const hayCambio = factor !== factorGuardado;

    // Quién gana y quién pierde con el ajuste. Ordenado por magnitud del cambio:
    // de una redistribución no importa quién recibe más, sino a quién se le mueve
    // más respecto de lo que hoy está aprobado.
    const efecto = useMemo(() => {
        if (!hayCambio) return [];
        const antes = new Map(actual.filas.map(f => [f.id, f.utilidad]));
        return simulado.filas
            .map(f => ({ id: f.id, nombre: f.fullName, antes: antes.get(f.id) || 0, delta: f.utilidad - (antes.get(f.id) || 0) }))
            .filter(e => e.delta !== 0)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }, [hayCambio, actual, simulado]);

    // Los tres ajustes se guardan juntos porque juntos definen un reparto: dejar
    // guardada la retención sin los descuentos —o al revés— dejaría a los socios
    // viendo un reparto que la Junta nunca aprobó entero.
    const guardar = async () => {
        setGuardando(true);
        try {
            await Promise.all([
                api.put('/admin/settings/reparto.factorPermanencia', { value: factor }),
                api.put('/admin/settings/reparto.retencion', { value: JSON.stringify(retencion || {}) }),
                api.put('/admin/settings/reparto.descuentos', { value: JSON.stringify(descuentos || {}) }),
            ]);
            toast.success('Reparto guardado. Lo que ven los socios ya usa estos valores.', 7000);
            onGuardado?.({ factorPermanencia: factor });
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo guardar el reparto.');
        } finally {
            setGuardando(false);
        }
    };

    const calidad = diagnostico?.total ? Math.round((diagnostico.pago / diagnostico.total) * 100) : 100;

    return (
        <div className="bg-white rounded-2xl border-2 border-brand-primary/20 shadow-sm overflow-hidden">
            <div className="bg-brand-primary px-5 py-3 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-white" />
                <p className="text-white font-bold text-sm">Parámetros del reparto · Junta Administrativa</p>
            </div>

            <div className="p-5 space-y-5">
                {/* ── La ganancia que se reparte ── */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ganancia total del fondo · {periodo?.anio}</p>
                    <p className="text-2xl font-black text-brand-primary tabular-nums leading-tight">{fmt(monto)}</p>
                    {/* No es un campo: es la misma cifra que el Panel de Administración
                        muestra como "Ganancia total del fondo", tomada en vivo. Dejarla
                        escribir aquí abriría la puerta a que la pantalla repartiera un
                        número distinto del que el panel declara ganado. */}
                    <p className="text-[11px] text-gray-500 leading-snug mt-1">{origenMonto}</p>
                </div>

                {/* ── Premio por permanencia ── */}
                <div>
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Premio por permanencia</span>
                        <span className="text-sm font-black text-brand-primary tabular-nums">
                            {factor === 1 ? 'sin premio' : `+${Math.round((factor - 1) * 100)}%`}
                        </span>
                    </div>
                    <input type="range" min="1" max="2" step="0.05" value={factor}
                        onChange={(e) => setFactor(Number(e.target.value))}
                        className="mt-2 w-full accent-brand-primary" />
                    <p className="text-[11px] text-gray-500 leading-snug mt-1.5">
                        Cuánto pesa de más el capital que un socio traía del año anterior y <strong>no retiró</strong>.
                        Se aplica solo sobre la parte que siguió en el fondo: quien lo retiró en marzo no recibe
                        premio por un dinero que ya no está, y quien retiró la mitad lo recibe solo sobre la mitad que dejó.
                        {factor === 1 && <> Hoy está en <strong>sin premio</strong>: el reparto es puro capital ponderado.</>}
                    </p>
                </div>

                {/* ── El efecto del ajuste ── */}
                {hayCambio ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-amber-200 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <p className="text-xs font-bold text-amber-900">Sin guardar todavía. Así quedaría frente a lo aprobado hoy:</p>
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
                        El premio en pantalla es el que está guardado. Muévelo para ver el efecto antes de aplicarlo. La retención y los descuentos se guardan con este mismo botón.
                    </div>
                )}

                {/* ── Comprobaciones ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* La identidad completa, no solo "repartido = ganancia": desde que
                        el fondo puede retener, lo que un acta firma es que nada se
                        pierde y nada aparece. */}
                    <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 ${simulado.cuadra ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <ShieldCheck className={`h-4 w-4 flex-shrink-0 mt-0.5 ${simulado.cuadra ? 'text-emerald-600' : 'text-red-600'}`} />
                        <div className="min-w-0">
                            <p className={`text-[10px] font-black uppercase tracking-wider ${simulado.cuadra ? 'text-emerald-700' : 'text-red-700'}`}>
                                {simulado.cuadra ? 'Todo cuadra' : 'NO cuadra'}
                            </p>
                            <p className="text-[11px] text-gray-600 tabular-nums leading-snug">
                                Repartido {fmt(simulado.totalRepartido)}
                                {simulado.retenido > 0 && <> · retenido {fmt(simulado.retenido)}</>}
                                {/* El aporte por cabeza y los descuentos uno a uno se
                                    nombran aparte: llamar "descuentos a socios" a una
                                    cuota que pagan todos hace pensar en veinticinco
                                    decisiones individuales que nadie tomó. */}
                                {simulado.totalAporteGeneral > 0 && <> · aporte de todos {fmt(simulado.totalAporteGeneral)}</>}
                                {simulado.totalDescuentosIndividuales > 0 && <> · descuentos {fmt(simulado.totalDescuentosIndividuales)}</>}
                                {' '}= {fmt(simulado.ganancia)}
                            </p>
                        </div>
                    </div>

                    <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 ${calidad >= 95 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <CheckCircle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${calidad >= 95 ? 'text-emerald-600' : 'text-amber-600'}`} />
                        <div>
                            <p className={`text-[10px] font-black uppercase tracking-wider ${calidad >= 95 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                Calidad de las fechas · {calidad}%
                            </p>
                            {/* Una pantalla de reparto que no dice de qué calidad son sus
                                datos invita a confiar en una cifra que quizá se apoya en
                                fechas supuestas. */}
                            <p className="text-[11px] text-gray-600">
                                {diagnostico?.pago ?? 0} con fecha de pago real
                                {(diagnostico?.periodo ?? 0) > 0 && <> · {diagnostico.periodo} estimados por el mes acreditado</>}
                                {(diagnostico?.sin ?? 0) > 0 && <> · <strong className="text-red-600">{diagnostico.sin} sin fecha, fuera del cálculo</strong></>}
                            </p>
                        </div>
                    </div>
                </div>

                {(reparto?.totalRetenido > 0) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-900 leading-snug">
                        <strong>{fmt(reparto.totalRetenido)}</strong> se quedan en el fondo y no se reparten
                        {reparto.retenido > 0 && <> — {fmt(reparto.retenido)} de retención general{retencion?.destino ? ` para «${retencion.destino}»` : ' (sin destino escrito)'}</>}
                        {reparto.totalAporteGeneral > 0 && <> — {fmt(reparto.totalAporteGeneral)} del aporte que pagan todos los socios{retencion?.destino ? ` para «${retencion.destino}»` : ' (sin destino escrito)'}</>}
                        {reparto.totalDescuentosIndividuales > 0 && <> — {fmt(reparto.totalDescuentosIndividuales)} en descuentos a socios concretos</>}.
                        {reparto.totalDescuentosIndividuales > 0
                            ? <> Lo descontado a un socio <strong>no se reparte entre los demás</strong>: queda en el fondo, que es de todos por igual.</>
                            : <> Ese dinero <strong>queda en el fondo</strong>, que es de todos por igual.</>}
                    </div>
                )}

                {/* Cuadrar no es lo mismo que estar bien: un aporte que se come
                    toda la utilidad deja el reparto en cero y la tarjeta verde
                    seguiría diciendo "todo cuadra", que es cierto y no sirve. */}
                {reparto?.ganancia > 0 && reparto?.totalRepartido === 0 && (
                    <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[11px] text-red-800 leading-snug">
                        <strong>Ningún socio recibiría nada.</strong> Lo apartado se lleva la totalidad
                        de {fmt(reparto.ganancia)}. Las cuentas cuadran, pero esto no es un reparto —
                        revise el valor antes de guardar.
                    </div>
                )}

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
                        <Button onClick={guardar} disabled={guardando} className="gap-2">
                            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar reparto
                        </Button>
                    </div>
                ) : (
                    <p className="text-[11px] text-gray-400 text-right">
                        Puedes simular libremente; guardar el parámetro le corresponde al gerente.
                    </p>
                )}
            </div>
        </div>
    );
}
