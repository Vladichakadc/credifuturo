import React, { useMemo } from 'react';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

/**
 * Centro de Alertas — semáforo operativo del fondo.
 *
 * Vivía dentro de ExecutivePanelPage, con las reglas mezcladas en el `useMemo`
 * gigante de esa página y el JSX a 350 líneas de distancia. Al moverlo a "Mi
 * Panel" se extrae aquí entero (reglas + pintura) en vez de duplicarlo: si
 * mañana se ajusta un umbral, se ajusta una sola vez.
 *
 * Recibe la respuesta cruda de /admin/executive-stats. Ese endpoint está en
 * READ_ONLY_FOR_ALL, así que cualquier socio autenticado puede pedirlo; para un
 * socio el backend omite `concentracion` (el desglose nominal por deudor) y
 * manda solo los agregados top3/top3Pct ya calculados — de ahí que las reglas
 * lean primero esos campos y solo caigan al detalle si viene.
 */

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const TONOS = {
    ok:   { caja: 'bg-emerald-50 border-emerald-200 text-emerald-800', icono: 'text-emerald-500' },
    warn: { caja: 'bg-amber-50 border-amber-200 text-amber-800',       icono: 'text-amber-500' },
    risk: { caja: 'bg-red-50 border-red-200 text-red-800',             icono: 'text-red-500' },
    info: { caja: 'bg-blue-50 border-blue-200 text-blue-800',          icono: 'text-blue-500' },
};

/** Reglas sobre los datos reales. Exportada aparte para poder probarla sin montar el componente. */
export function construirAlertas(exec) {
    if (!exec) return [];

    const cartera = exec.cartera || {};
    const conc = exec.concentracion || [];
    const top3 = exec.top3 ?? conc.slice(0, 3).reduce((s, d) => s + (d.saldo || 0), 0);
    const top3Pct = exec.top3Pct ?? (cartera.total > 0 ? (top3 / cartera.total) * 100 : 0);
    const pen = exec.penetracion || { conCredito: 0, activos: 0 };
    const penPct = pen.activos > 0 ? (pen.conCredito / pen.activos) * 100 : 0;

    const alertas = [];

    if ((cartera.vencida || 0) > 0) {
        alertas.push({ tone: 'risk', icon: AlertTriangle, texto: `Cartera vencida por ${fmt(cartera.vencida)} — revisar cuotas en mora EP y gestionar cobro.` });
    }

    if (top3Pct > 60) {
        alertas.push({ tone: 'risk', icon: AlertTriangle, texto: `Concentración crítica: el top 3 de deudores acumula el ${top3Pct.toFixed(0)}% de la cartera.` });
    } else if (top3Pct > 40) {
        alertas.push({ tone: 'warn', icon: Info, texto: `Concentración a vigilar: el top 3 de deudores acumula el ${top3Pct.toFixed(0)}% de la cartera (${fmt(top3)}). Diversificar los próximos préstamos.` });
    }

    const efic = exec.recaudoYtd?.eficienciaPct;
    if (efic != null && efic < 90) {
        alertas.push({ tone: 'risk', icon: AlertTriangle, texto: `Eficiencia de recaudo en ${efic}% — por debajo del umbral del 90%.` });
    } else if (efic != null && efic < 95) {
        alertas.push({ tone: 'warn', icon: Info, texto: `Eficiencia de recaudo en ${efic}% — vigilar cuotas próximas.` });
    }

    if (penPct < 50 && pen.activos > 0) {
        alertas.push({ tone: 'info', icon: Info, texto: `Oportunidad: ${pen.activos - pen.conCredito} socios activos sin crédito vigente (penetración ${penPct.toFixed(0)}%). Los intereses son el motor de ingresos del fondo.` });
    }

    // El "todo en orden" se antepone solo si no hay ningún riesgo: si lo hubiera,
    // encabezar con un mensaje verde restaría gravedad a lo que viene debajo.
    if (alertas.filter(a => a.tone === 'risk').length === 0) {
        alertas.unshift({ tone: 'ok', icon: CheckCircle2, texto: 'Sin alertas críticas: cartera al día y recaudo dentro de los umbrales.' });
    }

    return alertas;
}

const CentroDeAlertas = ({ exec, className = '' }) => {
    const alertas = useMemo(() => construirAlertas(exec), [exec]);

    // Sin datos no se pinta un encabezado huérfano: en Mi Panel esto va entre
    // el saludo y el patrimonio, y una caja vacía ahí solo mete ruido.
    if (alertas.length === 0) return null;

    const criticas = alertas.filter(a => a.tone === 'risk').length;

    return (
        <section className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
            <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm sm:text-base font-extrabold text-gray-900 flex items-center gap-2 min-w-0">
                    <AlertTriangle className="h-4 w-4 text-brand-primary flex-shrink-0" />
                    <span className="truncate">Centro de Alertas</span>
                </h2>
                <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                        criticas > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}
                >
                    {criticas > 0 ? `${criticas} crítica${criticas > 1 ? 's' : ''}` : 'Todo en orden'}
                </span>
            </header>

            <div className="p-3 sm:p-4 space-y-2">
                {alertas.map((a, i) => {
                    const AIcon = a.icon;
                    const tono = TONOS[a.tone] || TONOS.info;
                    return (
                        <div key={i} className={`flex items-start gap-2.5 border rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-[13px] sm:text-sm ${tono.caja}`}>
                            <AIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${tono.icono}`} />
                            <p className="leading-snug">{a.texto}</p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default CentroDeAlertas;
