import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2, RefreshCw, Coins, CalendarRange, Users, Clock, Award,
    ArrowUpDown, Search, Info, AlertTriangle,
} from 'lucide-react';
import api from '../../config/api';
import { computeFundProjection } from '../../utils/fundProjection';
import { construirReparto } from '../../utils/reparto';
import LineaDeTiempoSaldo from '../../components/reparto/LineaDeTiempoSaldo';
import BarraReparto from '../../components/reparto/BarraReparto';
import SimuladorAbono from '../../components/reparto/SimuladorAbono';
import PanelJunta from '../../components/reparto/PanelJunta';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtCorto = (n) => {
    const v = Math.abs(Number(n) || 0);
    if (v >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${Math.round(n)}`;
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const enLetras = (iso) => {
    if (!iso) return '';
    const [a, m, d] = String(iso).split('-');
    return `${Number(d)} de ${MESES[Number(m) - 1] || ''} de ${a}`;
};

const Tarjeta = ({ children, className = '' }) =>
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>{children}</div>;

const Dato = ({ etiqueta, valor, pie, acento = 'text-gray-900' }) => (
    <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{etiqueta}</p>
        <p className={`text-lg font-black tabular-nums leading-tight ${acento}`}>{valor}</p>
        {pie && <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{pie}</p>}
    </div>
);

/**
 * Reparto de Utilidades — lo que antes era el "Ranking de Ahorro".
 *
 * El cambio de nombre no es cosmético. Un ranking ordena personas y declara un
 * primero; lo que esta pantalla hace es dividir una ganancia en proporción al
 * capital que cada socio tuvo trabajando en el fondo, y durante cuánto tiempo.
 * El podio que había antes contaba la historia equivocada: convertía en
 * competencia un reparto proporcional y, de paso, publicaba en un pedestal
 * cuánto dinero tiene cada persona en un fondo donde todos se conocen.
 *
 * Lo que reemplaza al podio son tres cosas, cada una respondiendo una pregunta
 * que el podio no respondía:
 *
 *   · La línea de tiempo del saldo — POR QUÉ me toca esto. El área bajo la
 *     curva es, literalmente, la magnitud que se reparte.
 *   · El simulador — QUÉ PUEDO HACER para que me toque más.
 *   · La barra proporcional — CÓMO se divide el total, sin ordenar a nadie.
 *
 * Y para la Junta, el panel de parámetros con la redistribución en vivo: ver a
 * quién le sube y a quién le baja cada ajuste mientras todavía se puede cambiar.
 */
export default function RepartoUtilidadesPage() {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [refrescando, setRefrescando] = useState(false);
    const [anio, setAnio] = useState(null);
    const [monto, setMonto] = useState(0);
    const [guardado, setGuardado] = useState({ factorPermanencia: 1, incluyeAporteInicial: false });
    const [busqueda, setBusqueda] = useState('');
    const [ordenPorMonto, setOrdenPorMonto] = useState(false);
    const [expandido, setExpandido] = useState(null);
    const [error, setError] = useState(null);

    const cargar = useCallback(async (anioPedido, manual = false) => {
        manual ? setRefrescando(true) : setCargando(true);
        setError(null);
        try {
            const [rep, stats, exec] = await Promise.allSettled([
                api.get('/admin/savings/ranking', { params: anioPedido ? { anio: anioPedido } : {} }),
                api.get('/admin/dashboard-stats'),
                api.get('/admin/executive-stats'),
            ]);

            if (rep.status !== 'fulfilled' || !rep.value.data?.ok) {
                throw new Error(rep.reason?.response?.data?.error || 'No se pudo cargar el reparto.');
            }
            const d = rep.value.data;
            setDatos(d);
            setAnio(d.periodo.anio);
            setGuardado(d.parametros);

            // La ganancia a repartir sale de la MISMA fuente única que el Panel
            // Principal y el Panel Ejecutivo (utils/fundProjection.js), nunca de
            // un cálculo propio de esta pantalla: dos paneles que muestran la
            // ganancia del fondo con cifras distintas es el problema que ese
            // módulo existe para evitar. El valor guardado por el comité manda
            // si existe; si no, se propone la ganancia real calculada en vivo.
            let sugerido = 0;
            if (stats.status === 'fulfilled') {
                const proy = computeFundProjection({
                    exec: exec.status === 'fulfilled' ? exec.value.data : null,
                    stats: stats.value.data,
                    anioActual: d.periodo.anio,
                });
                const s = stats.value.data;
                sugerido = proy?.gananciaRealYtd
                    || (s.totalInteresesPagados || 0) + (s.rentabilidadCajaNU || 0) + (s.totalPenaltyValue || 0);
            }
            setMonto(Number(d.utilidadesADistribuir) || Math.round(sugerido) || 0);
        } catch (err) {
            setError(err.message || 'No se pudo cargar el reparto.');
        } finally {
            setCargando(false);
            setRefrescando(false);
        }
    }, []);

    useEffect(() => { cargar(null, false); }, [cargar]);

    const reparto = useMemo(() => {
        if (!datos) return null;
        return construirReparto(datos.socios, {
            factorPermanencia: guardado.factorPermanencia,
            incluyeAporteInicial: guardado.incluyeAporteInicial,
            monto,
        });
    }, [datos, guardado, monto]);

    const yo = useMemo(
        () => reparto?.filas.find(f => f.id === datos?.yoId) || null,
        [reparto, datos]
    );

    const listado = useMemo(() => {
        if (!reparto) return [];
        const filtradas = busqueda
            ? reparto.filas.filter(f => f.fullName.toLowerCase().includes(busqueda.toLowerCase()))
            : reparto.filas;
        // Por nombre por defecto. Ordenar por monto es una lectura legítima —la
        // Junta la necesita— pero no puede ser la primera imagen: eso reconstruye
        // el podio con otra forma.
        return ordenPorMonto
            ? [...filtradas].sort((a, b) => b.utilidad - a.utilidad)
            : [...filtradas].sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), 'es'));
    }, [reparto, busqueda, ordenPorMonto]);

    if (cargando) {
        return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-primary" /></div>;
    }

    if (error || !datos || !reparto) {
        return (
            <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-center p-6">
                <AlertTriangle className="h-10 w-10 text-amber-400" />
                <p className="font-bold text-gray-700">{error || 'No hay datos de reparto.'}</p>
                <button onClick={() => cargar(anio, true)} className="text-sm font-bold text-brand-primary hover:underline">Reintentar</button>
            </div>
        );
    }

    const { periodo, puedeVerTodo } = datos;

    return (
        <div className="max-w-6xl mx-auto space-y-5 pb-10">

            {/* ── Encabezado ───────────────────────────────────────────────── */}
            <Tarjeta className="overflow-hidden">
                <div className="bg-gradient-to-br from-brand-dark via-brand-primary to-brand-dark text-white px-6 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* Sin título: la cabecera de la ruta (paginasInfo.js) ya lo
                            pinta justo encima, y repetirlo deja el mismo texto dos
                            veces seguidas en la pantalla. */}
                        <p className="text-sm font-bold text-white/90">
                            Ganancia de {periodo.anio}, repartida por capital y tiempo
                        </p>
                        <div className="flex items-center gap-2">
                            <select
                                value={anio ?? ''}
                                onChange={(e) => { const a = Number(e.target.value); setAnio(a); cargar(a, true); }}
                                className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-gold [&>option]:text-gray-800"
                            >
                                {datos.anios.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                            <button onClick={() => cargar(anio, true)} disabled={refrescando}
                                className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl p-2 transition-colors disabled:opacity-50">
                                <RefreshCw className={`h-4 w-4 ${refrescando ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                        {[
                            { icono: Coins, etiqueta: 'A repartir', valor: fmtCorto(monto) },
                            { icono: Users, etiqueta: 'Socios', valor: reparto.filas.filter(f => f.base > 0).length },
                            { icono: CalendarRange, etiqueta: 'Período', valor: `${periodo.dias} días` },
                            { icono: Clock, etiqueta: 'Corte', valor: periodo.cerrado ? 'año cerrado' : enLetras(periodo.corte).replace(` de ${periodo.anio}`, '') },
                        ].map(k => (
                            <div key={k.etiqueta} className="bg-white/10 rounded-xl px-3 py-2.5 border border-white/10">
                                <div className="flex items-center gap-1.5 text-white/60">
                                    <k.icono className="h-3 w-3" />
                                    <span className="text-[9px] font-black uppercase tracking-wider">{k.etiqueta}</span>
                                </div>
                                <p className="text-sm font-black mt-0.5 tabular-nums">{k.valor}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {!periodo.cerrado && (
                    <div className="px-6 py-2.5 bg-blue-50 border-t border-blue-100 flex items-start gap-2">
                        <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-blue-900 leading-snug">
                            {periodo.anio} todavía va en curso: las cifras son el <strong>promedio de lo que va corrido</strong>,
                            del 1 de enero al {enLetras(periodo.corte)}, y seguirán moviéndose hasta el cierre.
                        </p>
                    </div>
                )}
            </Tarjeta>

            {/* ── Lo tuyo ──────────────────────────────────────────────────── */}
            {yo && (
                <Tarjeta className="overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                        <Award className="h-4 w-4 text-brand-gold" />
                        <h2 className="font-bold text-sm text-gray-800">Tu parte</h2>
                    </div>
                    <div className="p-5 space-y-5">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <Dato etiqueta="Te correspondería" valor={fmt(yo.utilidad)} acento="text-brand-primary"
                                pie={`${(yo.participacion * 100).toFixed(2)}% del reparto`} />
                            <Dato etiqueta="Tu saldo promedio" valor={fmt(yo.agg.saldoPromedio)}
                                pie="dinero tuyo en el fondo, en promedio" />
                            <Dato etiqueta="Traías del año anterior" valor={fmt(yo.agg.saldoApertura)}
                                pie={yo.agg.aperturaPermanente > 0 ? `${fmt(yo.agg.aperturaPermanente)} sigue ahí` : 'retirado durante el período'} />
                            <Dato etiqueta="Abonaste este período" valor={fmt(yo.agg.abonosPeriodo)}
                                pie={yo.agg.retirosPeriodo < 0 ? `y retiraste ${fmt(-yo.agg.retirosPeriodo)}` : 'sin retiros'} />
                        </div>

                        {yo.premioPermanencia > 0 && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-900 leading-snug">
                                Por <strong>no haber retirado</strong> los {fmt(yo.agg.aperturaPermanente)} que traías del año anterior,
                                la Junta te reconoce <strong>{fmt(yo.premioPermanencia)}</strong> adicionales de peso en el reparto.
                            </div>
                        )}

                        <div>
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                                <h3 className="text-xs font-bold text-gray-700">Tu dinero, día a día</h3>
                                <p className="text-[10px] text-gray-400">el área bajo la línea es lo que se reparte</p>
                            </div>
                            <LineaDeTiempoSaldo
                                movimientos={yo.movimientos || []}
                                periodo={periodo}
                                saldoApertura={yo.agg.saldoApertura}
                                saldoPromedio={yo.agg.saldoPromedio}
                            />
                            <p className="text-[11px] text-gray-500 leading-snug mt-2">
                                No cuenta solo <em>cuánto</em> ahorraste, sino <em>desde cuándo</em>. Un peso que entró en enero
                                trabajó los {periodo.dias} días del período; uno que entró la semana pasada, casi ninguno.
                                Por eso quien paga sus cuotas por adelantado pesa más que quien paga lo mismo en diciembre.
                            </p>
                        </div>
                    </div>
                </Tarjeta>
            )}

            {yo && (
                <SimuladorAbono yo={yo} filas={reparto.filas} periodo={periodo} monto={monto} />
            )}

            {/* ── El reparto completo ──────────────────────────────────────── */}
            <Tarjeta className="overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <h2 className="font-bold text-sm text-gray-800">Cómo se divide el total</h2>
                    <p className="text-[11px] text-gray-500">
                        {fmt(monto)} repartidos entre {reparto.filas.filter(f => f.base > 0).length} socios.
                        {reparto.cuadra
                            ? ' La suma de todas las partes da exactamente esa cifra.'
                            : ' ⚠ La suma de las partes no cuadra con el total.'}
                    </p>
                </div>
                <div className="p-5">
                    <BarraReparto filas={reparto.filas} yoId={datos.yoId}
                        onSeleccionar={(f) => setExpandido(prev => prev === f.id ? null : f.id)} />
                </div>

                {/* ── Tabla ── */}
                <div className="border-t border-gray-100">
                    <div className="px-5 py-3 flex flex-wrap items-center gap-2 justify-between">
                        <div className="relative flex-1 min-w-[12rem]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300" />
                            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar socio…"
                                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                        </div>
                        <button onClick={() => setOrdenPorMonto(v => !v)}
                            className="text-[11px] font-bold text-gray-500 hover:text-brand-primary flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 hover:border-brand-primary transition-colors">
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            {ordenPorMonto ? 'Ordenado por participación' : 'Ordenado por nombre'}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr className="border-y border-gray-100">
                                    <th className="px-5 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">Socio</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">Saldo promedio</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider hidden sm:table-cell">Participación</th>
                                    <th className="px-5 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">Le corresponde</th>
                                </tr>
                            </thead>
                            <tbody>
                                {listado.map(f => {
                                    const esYo = f.id === datos.yoId;
                                    const abierto = expandido === f.id;
                                    const puedeAbrir = !!f.movimientos;
                                    return (
                                        <React.Fragment key={f.id}>
                                            <tr
                                                onClick={() => puedeAbrir && setExpandido(abierto ? null : f.id)}
                                                className={`border-b border-gray-50 transition-colors ${puedeAbrir ? 'cursor-pointer hover:bg-gray-50' : ''} ${esYo ? 'bg-brand-gold/5' : ''}`}>
                                                <td className="px-5 py-2.5">
                                                    <span className={`font-bold ${esYo ? 'text-brand-primary' : 'text-gray-800'}`}>{f.fullName}</span>
                                                    {esYo && <span className="ml-2 text-[9px] font-black uppercase tracking-wider text-brand-gold">tú</span>}
                                                    {f.premioPermanencia > 0 && (
                                                        <span className="ml-2 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                                                            conservó saldo
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{fmt(f.agg.saldoPromedio)}</td>
                                                <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums hidden sm:table-cell">{(f.participacion * 100).toFixed(2)}%</td>
                                                <td className="px-5 py-2.5 text-right font-black text-gray-900 tabular-nums">{fmt(f.utilidad)}</td>
                                            </tr>
                                            {abierto && puedeAbrir && (
                                                <tr className="bg-gray-50/70">
                                                    <td colSpan={4} className="px-5 py-4">
                                                        <DesgloseSocio fila={f} periodo={periodo} />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 border-t-2 border-gray-200">
                                    <td className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-gray-500">Total</td>
                                    <td className="px-3 py-2.5 text-right font-black text-gray-700 tabular-nums">{fmt(reparto.totalSaldoPromedio)}</td>
                                    <td className="px-3 py-2.5 text-right font-black text-gray-500 tabular-nums hidden sm:table-cell">100,00%</td>
                                    <td className="px-5 py-2.5 text-right font-black text-gray-900 tabular-nums">{fmt(reparto.totalRepartido)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </Tarjeta>

            {/* ── Panel de la Junta ────────────────────────────────────────── */}
            {puedeVerTodo && (
                <PanelJunta
                    // Los controles arrancan en el valor guardado, así que si ese
                    // valor cambia —al recargar, o después de guardar— el panel
                    // tiene que volver a montarse. Sin esto seguiría mostrando
                    // "sin guardar" sobre un parámetro que ya está guardado.
                    key={`${guardado.factorPermanencia}-${guardado.incluyeAporteInicial}`}
                    socios={datos.socios}
                    guardado={guardado}
                    monto={monto}
                    onMonto={setMonto}
                    puedeGuardar={(JSON.parse(localStorage.getItem('user') || '{}')).role === 'admin'}
                    onGuardado={(nuevos) => setGuardado(nuevos)}
                    periodo={periodo}
                    diagnostico={datos.diagnostico}
                    anomalias={datos.anomalias}
                />
            )}

            {/* ── Cómo se calcula ──────────────────────────────────────────── */}
            <Tarjeta className="p-5">
                <h2 className="font-bold text-sm text-gray-800 mb-2">Cómo se calcula, en una línea</h2>
                <p className="text-xs text-gray-600 leading-relaxed">
                    <strong>Saldo promedio</strong> = por cada movimiento, su importe × los días que estuvo en el fondo ÷ los {periodo.dias} días del período.
                    Es, literalmente, el promedio de dinero tuyo que el fondo tuvo disponible para prestar.
                    Tu <strong>participación</strong> es tu saldo promedio dividido por el de todos, y tu parte es esa participación aplicada a la ganancia.
                </p>
                <ul className="mt-3 space-y-1.5 text-[11px] text-gray-500 leading-snug">
                    <li>· Se usa la <strong>fecha de pago</strong> de cada movimiento, no el mes que acredita. Quien paga en enero las cuotas de todo el año tiene ese dinero trabajando desde enero, y así se cuenta.</li>
                    <li>· Lo que traías del año anterior pesa el período completo, porque estuvo desde el primer día.</li>
                    <li>· Un retiro descuenta <strong>desde el día en que se retiró</strong>, no desde el principio: hasta ese día ese dinero sí estuvo trabajando.</li>
                    <li>· Los pesos que sobran del redondeo se reparten uno a uno, así que la suma de todas las partes da exactamente la ganancia aprobada.</li>
                    {!guardado.incluyeAporteInicial && <li>· El <strong>aporte inicial</strong> no cuenta como capital en este reparto, como ha sido siempre en el fondo.</li>}
                </ul>
            </Tarjeta>
        </div>
    );
}

/** El detalle movimiento a movimiento: de dónde sale el saldo promedio de un socio. */
function DesgloseSocio({ fila, periodo }) {
    const movs = (fila.movimientos || []).filter(m => m.fecha);
    if (!movs.length) return <p className="text-xs text-gray-400">Sin movimientos registrados.</p>;

    return (
        <div className="space-y-3">
            <LineaDeTiempoSaldo movimientos={fila.movimientos} periodo={periodo}
                saldoApertura={fila.agg.saldoApertura} saldoPromedio={fila.agg.saldoPromedio} altura={160} />

            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                <div className="grid grid-cols-5 bg-gray-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <div>Fecha de pago</div>
                    <div className="text-right">Importe</div>
                    <div className="text-right">Días</div>
                    <div className="text-right">Peso</div>
                    <div className="text-right">Aporta</div>
                </div>
                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                    {movs.map((m, i) => (
                        <div key={m.id ?? i} className={`grid grid-cols-5 px-3 py-1.5 text-[10px] ${m.previo ? 'bg-amber-50/50' : m.futuro ? 'opacity-50' : ''}`}>
                            <div className="font-bold text-gray-600">
                                {m.fecha}
                                {m.previo && <span className="ml-1 text-amber-600">· previo</span>}
                                {m.futuro && <span className="ml-1 text-gray-400">· posterior al corte</span>}
                                {/* Un movimiento fechado por el mes acreditado no es
                                    un dato malo, pero tampoco es la fecha real: quien
                                    audite el reparto tiene que poder distinguirlos. */}
                                {m.origenFecha === 'periodo' && <span className="ml-1 text-blue-500" title="Sin fecha de pago registrada: se estimó a mitad del mes acreditado">· estimada</span>}
                            </div>
                            <div className={`text-right tabular-nums ${m.valor < 0 ? 'text-red-600' : 'text-gray-700'}`}>{fmt(m.valor)}</div>
                            <div className="text-right text-gray-500 tabular-nums">{m.dias}</div>
                            <div className="text-right text-gray-500 tabular-nums">{(m.factor * 100).toFixed(0)}%</div>
                            <div className="text-right font-black text-brand-primary tabular-nums">{fmt(m.aporte)}</div>
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-5 px-3 py-2 bg-brand-primary/5 border-t border-gray-100 text-[10px]">
                    <div className="font-black text-gray-600 col-span-4">Saldo promedio del período</div>
                    <div className="text-right font-black text-brand-primary tabular-nums">{fmt(fila.agg.saldoPromedio)}</div>
                </div>
            </div>
        </div>
    );
}
