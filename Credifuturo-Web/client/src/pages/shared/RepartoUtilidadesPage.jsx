import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2, RefreshCw, Coins, CalendarRange, Users, Percent, Award,
    Search, Info, AlertTriangle,
} from 'lucide-react';
import api from '../../config/api';
import { computeFundProjection } from '../../utils/fundProjection';
import { construirReparto, NOMBRE_MES } from '../../utils/reparto';
import PesoPorMes from '../../components/reparto/PesoPorMes';
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
const MESES_LARGO = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const enLetras = (iso) => {
    if (!iso) return '';
    const [a, m, d] = String(iso).split('-');
    return `${Number(d)} de ${MESES_LARGO[Number(m)] || ''} de ${a}`;
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
 * primero; lo que esta pantalla hace es dividir la ganancia del fondo en
 * proporción al capital que cada socio puso a trabajar y a los meses que estuvo.
 * El podio que había antes contaba la historia equivocada y, de paso, publicaba
 * en un pedestal cuánto dinero tiene cada persona en un fondo donde todos se
 * conocen.
 *
 * Lo que lo reemplaza son tres piezas, cada una respondiendo algo que el podio no
 * respondía: el PESO DE CADA MES (por qué me toca esto), el SIMULADOR (qué puedo
 * hacer para que me toque más) y la BARRA PROPORCIONAL (cómo se divide el total).
 * Para la Junta, el panel de parámetros con la redistribución en vivo.
 */
export default function RepartoUtilidadesPage() {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [refrescando, setRefrescando] = useState(false);
    const [anio, setAnio] = useState(null);
    const [ganancia, setGanancia] = useState({ monto: 0, origen: '' });
    const [guardado, setGuardado] = useState({ factorPermanencia: 1 });
    const [busqueda, setBusqueda] = useState('');
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

            // ── La ganancia que se reparte ──────────────────────────────────
            // Siempre la "Ganancia total del fondo" del Panel de Administración,
            // tomada en vivo de la MISMA fuente única que ese panel
            // (utils/fundProjection.js, gananciaRealYtd). No se lee ningún valor
            // guardado: el fondo sigue generando ganancia día a día, y una cifra
            // congelada en AppSettings queda desactualizada y reparte de menos.
            // Dos pantallas mostrando ganancias distintas del mismo fondo es el
            // problema que ese módulo existe para evitar.
            let monto = 0, origen = '';
            if (stats.status === 'fulfilled') {
                const s = stats.value.data;
                const proy = computeFundProjection({
                    exec: exec.status === 'fulfilled' ? exec.value.data : null,
                    stats: s,
                    anioActual: d.periodo.anio,
                });
                if (proy?.gananciaRealYtd != null) {
                    monto = Math.round(proy.gananciaRealYtd);
                    origen = `Intereses cobrados + rendimiento de la cuenta NU + recargos por mora, tomados del Panel de Administración.`;
                } else {
                    monto = Math.round((s.totalInteresesPagados || 0) + (s.rentabilidadCajaNU || 0) + (s.totalPenaltyValue || 0));
                    origen = 'Suma de las tres fuentes de ingreso. El Panel Ejecutivo no cargó, así que esta es una aproximación.';
                }
            }
            // La ganancia que expone el panel es SIEMPRE la del año en curso: sus
            // tres fuentes se acotan al calendario vigente. Presentarla como la de
            // un año cerrado sería repartir la ganancia de un año sobre el capital
            // de otro, así que se dice en vez de disimularse.
            if (!d.periodo.esAnioActual) {
                origen = `⚠ Esta cifra es la ganancia del año en curso, no la de ${d.periodo.anio}. El Panel de Administración solo calcula la del año vigente; verifíquela antes de repartir un año cerrado.`;
            }
            setGanancia({ monto, origen });
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
            monto: ganancia.monto,
        });
    }, [datos, guardado, ganancia.monto]);

    const yo = useMemo(() => reparto?.filas.find(f => f.id === datos?.yoId) || null, [reparto, datos]);

    // Ya vienen de mayor a menor desde construirReparto; la búsqueda no altera el orden.
    const listado = useMemo(() => {
        if (!reparto) return [];
        return busqueda
            ? reparto.filas.filter(f => f.fullName.toLowerCase().includes(busqueda.toLowerCase()))
            : reparto.filas;
    }, [reparto, busqueda]);

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
    const conParte = reparto.filas.filter(f => f.base > 0).length;

    return (
        <div className="max-w-6xl mx-auto space-y-5 pb-10">

            {/* ── Encabezado ───────────────────────────────────────────────── */}
            <Tarjeta className="overflow-hidden">
                <div className="bg-gradient-to-br from-brand-dark via-brand-primary to-brand-dark text-white px-6 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* Sin título: la cabecera de la ruta (paginasInfo.js) ya lo pinta
                            justo encima, y repetirlo deja el mismo texto dos veces. */}
                        <p className="text-sm font-bold text-white/90">
                            Ganancia de {periodo.anio}, repartida por capital y meses
                        </p>
                        <div className="flex items-center gap-2">
                            <select value={anio ?? ''} onChange={(e) => { const a = Number(e.target.value); setAnio(a); cargar(a, true); }}
                                className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-gold [&>option]:text-gray-800">
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
                            { icono: Coins, etiqueta: 'Ganancia del fondo', valor: fmtCorto(ganancia.monto) },
                            { icono: Users, etiqueta: 'Socios', valor: conParte },
                            { icono: Percent, etiqueta: 'Capital ponderado', valor: fmtCorto(reparto.totalCapitalPonderado) },
                            { icono: CalendarRange, etiqueta: periodo.cerrado ? 'Año' : 'Datos al', valor: periodo.cerrado ? 'cerrado' : enLetras(periodo.corte).replace(` de ${periodo.anio}`, '') },
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
                            {periodo.anio} va en curso. Los pesos se cuentan sobre los doce meses del año, así que
                            estas cifras son una <strong>proyección al cierre</strong>: se moverán con cada abono que
                            entre de aquí a diciembre.
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
                            <Dato etiqueta="Tu capital ponderado" valor={fmt(yo.capitalPonderado)}
                                pie="tu capital, por los meses que trabaja" />
                            <Dato etiqueta="Traías del año anterior" valor={fmt(yo.capitalApertura)}
                                pie={yo.aperturaPermanente > 0
                                    ? `${fmt(yo.aperturaPermanente)} sigue en el fondo`
                                    : 'retirado durante el año'} />
                            <Dato etiqueta="Ahorraste este año" valor={fmt(yo.abonosPeriodo)}
                                pie={yo.retirosPeriodo < 0 ? `y retiraste ${fmt(-yo.retirosPeriodo)}` : 'sin retiros'} />
                        </div>

                        {yo.premioPermanencia > 0 && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-900 leading-snug">
                                Por <strong>no haber retirado</strong> los {fmt(yo.aperturaPermanente)} que traías del año anterior,
                                la Junta te reconoce <strong>{fmt(yo.premioPermanencia)}</strong> adicionales de peso en el reparto.
                            </div>
                        )}

                        <div>
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                                <h3 className="text-xs font-bold text-gray-700">El peso de cada mes de tu ahorro</h3>
                                <p className="text-[10px] text-gray-400">un peso de enero rinde todo el año; uno de diciembre, un mes</p>
                            </div>
                            <PesoPorMes porMes={yo.porMes} periodo={periodo} />
                            <TablaPesos porMes={yo.porMes} total={yo.capitalPonderado} />
                        </div>
                    </div>
                </Tarjeta>
            )}

            {yo && <SimuladorAbono yo={yo} filas={reparto.filas} periodo={periodo} monto={ganancia.monto} />}

            {/* ── El reparto completo ──────────────────────────────────────── */}
            <Tarjeta className="overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <h2 className="font-bold text-sm text-gray-800">Cómo se divide el total</h2>
                    <p className="text-[11px] text-gray-500">
                        {fmt(ganancia.monto)} repartidos entre {conParte} socios.
                        {reparto.cuadra
                            ? ' La suma de todas las partes da exactamente esa cifra.'
                            : ' ⚠ La suma de las partes no cuadra con el total.'}
                    </p>
                </div>
                <div className="p-5">
                    <BarraReparto filas={reparto.filas} yoId={datos.yoId}
                        onSeleccionar={(f) => setExpandido(prev => prev === f.id ? null : f.id)} />
                </div>

                <div className="border-t border-gray-100">
                    <div className="px-5 py-3 flex flex-wrap items-center gap-2 justify-between">
                        <div className="relative flex-1 min-w-[12rem]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300" />
                            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar socio…"
                                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                        </div>
                        <span className="text-[11px] text-gray-400">de mayor a menor distribución</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr className="border-y border-gray-100">
                                    <th className="px-5 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">#</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">Socio</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">Capital ponderado</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider hidden sm:table-cell">Participación</th>
                                    <th className="px-5 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">Le corresponde</th>
                                </tr>
                            </thead>
                            <tbody>
                                {listado.map((f) => {
                                    const esYo = f.id === datos.yoId;
                                    const abierto = expandido === f.id;
                                    const puesto = reparto.filas.indexOf(f) + 1;
                                    return (
                                        <React.Fragment key={f.id}>
                                            <tr onClick={() => setExpandido(abierto ? null : f.id)}
                                                className={`border-b border-gray-50 transition-colors cursor-pointer hover:bg-gray-50 ${esYo ? 'bg-brand-gold/5' : ''}`}>
                                                <td className="px-5 py-2.5 text-[11px] font-black text-gray-300 tabular-nums">{puesto}</td>
                                                <td className="px-3 py-2.5">
                                                    <span className={`font-bold ${esYo ? 'text-brand-primary' : 'text-gray-800'}`}>{f.fullName}</span>
                                                    {esYo && <span className="ml-2 text-[9px] font-black uppercase tracking-wider text-brand-gold">tú</span>}
                                                    {f.premioPermanencia > 0 && (
                                                        <span className="ml-2 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                                                            conservó capital
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{fmt(f.capitalPonderado)}</td>
                                                <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums hidden sm:table-cell">{(f.participacion * 100).toFixed(2)}%</td>
                                                <td className="px-5 py-2.5 text-right font-black text-gray-900 tabular-nums">{fmt(f.utilidad)}</td>
                                            </tr>
                                            {abierto && (
                                                <tr className="bg-gray-50/70">
                                                    <td colSpan={5} className="px-5 py-4">
                                                        <PesoPorMes porMes={f.porMes} periodo={periodo} altura={170} />
                                                        <TablaPesos porMes={f.porMes} total={f.capitalPonderado} />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 border-t-2 border-gray-200">
                                    <td className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-gray-500" colSpan={2}>Total</td>
                                    <td className="px-3 py-2.5 text-right font-black text-gray-700 tabular-nums">{fmt(reparto.totalCapitalPonderado)}</td>
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
                    // Los controles arrancan en el valor guardado, así que si ese valor
                    // cambia el panel tiene que volver a montarse: si no, seguiría
                    // mostrando "sin guardar" sobre un parámetro que ya está guardado.
                    key={guardado.factorPermanencia}
                    socios={datos.socios}
                    guardado={guardado}
                    monto={ganancia.monto}
                    origenMonto={ganancia.origen}
                    puedeGuardar={(JSON.parse(localStorage.getItem('user') || '{}')).role === 'admin'}
                    onGuardado={(nuevos) => setGuardado(nuevos)}
                    periodo={periodo}
                    diagnostico={datos.diagnostico}
                    anomalias={datos.anomalias}
                />
            )}

            {/* ── Cómo se calcula ──────────────────────────────────────────── */}
            <Tarjeta className="p-5">
                <h2 className="font-bold text-sm text-gray-800 mb-2">Cómo se calcula</h2>
                <p className="text-xs text-gray-600 leading-relaxed">
                    Cada ahorro se multiplica por los <strong>meses que ese dinero alcanza a trabajar</strong> en el año,
                    dividido entre doce. Es el método con el que los bancos y las entidades de ahorro reparten
                    rendimientos. La suma de todo eso es tu <strong>capital ponderado</strong>; tu participación es tu
                    capital ponderado dividido por el de todos, y tu parte es esa participación aplicada a la ganancia del fondo.
                </p>
                <ul className="mt-3 space-y-1.5 text-[11px] text-gray-500 leading-snug">
                    <li>· <strong>Enero pesa 100%</strong> (doce meses), abril 75%, <strong>julio 50%</strong>, octubre 25% y diciembre 8%.</li>
                    <li>· Se usa la <strong>fecha de pago</strong> de cada abono, no el mes que acredita. Quien paga en enero las cuotas de todo el año tiene ese dinero trabajando desde enero, y así se cuenta.</li>
                    <li>· El <strong>aporte inicial cuenta como capital</strong>: ese dinero también está en el fondo prestándose.</li>
                    <li>· Lo que traías de años anteriores y <strong>no retiraste</strong> pesa el año completo, porque estuvo desde el primer día.</li>
                    <li>· Un retiro —total o parcial— <strong>descuenta con el peso de su propio mes</strong>: hasta ese mes ese dinero sí estuvo trabajando.</li>
                    <li>· Los pesos que sobran del redondeo se reparten uno a uno, así que la suma de todas las partes da exactamente la ganancia del fondo.</li>
                </ul>
            </Tarjeta>
        </div>
    );
}

/**
 * El desglose escrito: mes, lo ahorrado, su peso y lo que cuenta.
 *
 * El gráfico muestra la forma; esta tabla da las cifras exactas. Hacen falta las
 * dos: la forma se entiende de un vistazo, pero para reconstruir el propio número
 * con una calculadora —que es lo que un socio hace cuando desconfía— se necesita
 * la columna del peso al lado del importe.
 */
function TablaPesos({ porMes = [], total = 0 }) {
    const filas = porMes.filter(f => f.n > 0);
    if (!filas.length) return null;

    return (
        <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden bg-white">
            <div className="grid grid-cols-4 bg-gray-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <div>Mes</div>
                <div className="text-right">Movido</div>
                <div className="text-right">Peso</div>
                <div className="text-right">Cuenta</div>
            </div>
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {filas.map(f => {
                    const movido = (f.aportado || 0) + (f.retirado || 0);
                    return (
                        <div key={f.mes} className={`grid grid-cols-4 px-3 py-1.5 text-[10px] ${f.mes === 0 ? 'bg-amber-50/50' : ''}`}>
                            <div className="font-bold text-gray-600">
                                {f.mes === 0 ? 'De años anteriores' : NOMBRE_MES[f.mes]}
                            </div>
                            <div className={`text-right tabular-nums ${movido < 0 ? 'text-red-600' : 'text-gray-700'}`}>{fmt(movido)}</div>
                            <div className="text-right text-gray-500 tabular-nums">{Math.round(f.peso * 100)}%</div>
                            <div className={`text-right font-black tabular-nums ${f.ponderado < 0 ? 'text-red-600' : 'text-brand-primary'}`}>{fmt(f.ponderado)}</div>
                        </div>
                    );
                })}
            </div>
            <div className="grid grid-cols-4 px-3 py-2 bg-brand-primary/5 border-t border-gray-100 text-[10px]">
                <div className="font-black text-gray-600 col-span-3">Capital ponderado</div>
                <div className="text-right font-black text-brand-primary tabular-nums">{fmt(total)}</div>
            </div>
        </div>
    );
}
