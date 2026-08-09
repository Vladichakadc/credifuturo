// Fuente ÚNICA de la serie mensual de ahorros (stock/flujo), consumida por
// SavingsEvolutionPage (por socio o de todo el fondo) y por el "Movimiento
// mensual" del Panel de Inteligencia Financiera (siempre de todo el fondo).
// Antes esta cuenta vivía inline en SavingsEvolutionPage; al mover "Movimiento
// mensual" a Inteligencia Financiera, duplicar el cálculo habría arriesgado que
// las dos pantallas mostraran cifras distintas del mismo mes — el mismo
// problema que ya motivó fondoIndicadores.js y fundProjection.js.

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

export const fmtCorto = (n) => {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
    return `${sign}$${abs}`;
};

/**
 * @param {object} data   Respuesta de GET /admin/savings-evolution ({ serieMensual, aportes }).
 * @param {number} hoyKey Mes actual como `año*12 + (mes-1)`, para distinguir tramo causado de prepagos futuros.
 * @returns {object|null} Serie continua mes a mes (sin huecos) más los derivados de stock/composición, o null sin datos.
 */
export function buildSerieMensual(data, hoyKey) {
    if (!data?.serieMensual?.length) return null;

    // Serie continua mes a mes (meses sin abono = flujo 0, acumulado plano)
    const porKey = {};
    data.serieMensual.forEach(r => {
        const k = Number(r.anio) * 12 + (Number(r.mes) - 1);
        porKey[k] = {
            neto: Number(r.neto) || 0,
            bruto: Number(r.bruto) || 0,
            abonos: Number(r.abonos) || 0,
            retiros: Number(r.retiros) || 0
        };
    });
    const keys = Object.keys(porKey).map(Number);
    const minK = Math.min(...keys);
    const maxK = Math.max(...keys);

    const serie = [];
    let acum = 0;
    for (let k = minK; k <= maxK; k++) {
        const flujo = porKey[k]?.neto || 0;
        const abonos = porKey[k]?.abonos || 0;
        const retiros = porKey[k]?.retiros || 0;
        acum += flujo;
        const esFuturo = k > hoyKey;
        const esBorde = k === hoyKey || (k === minK && minK > hoyKey);
        serie.push({
            key: k,
            label: `${MESES[k % 12]} ${String(Math.floor(k / 12)).slice(2)}`,
            flujo,
            abonos,
            retiros,
            // Dos series para el área: causado (sólido) y futuro/prepagos (punteado).
            // El mes actual pertenece a ambas para que la línea conecte sin salto.
            acumCausado: !esFuturo ? acum : null,
            acumFuturo: esFuturo || esBorde ? acum : null,
            esFuturo,
        });
    }

    const mesesNegativos = serie.filter(s => s.flujo < 0);
    const acumHoy = [...serie].reverse().find(s => !s.esFuturo)?.acumCausado ?? acum;
    const totalNeto = serie.reduce((s, r) => s + r.flujo, 0);
    const aportes = Number(data.aportes?.total) || 0;
    const composicion = [
        { name: 'Ahorros netos', value: Math.max(0, totalNeto), color: '#166534' },
        { name: 'Aportes iniciales', value: aportes, color: '#f59e0b' },
    ].filter(d => d.value > 0);
    const patrimonio = Math.max(0, totalNeto) + aportes;
    const tienePrepagos = serie.some(s => s.esFuturo && s.flujo !== 0);

    return { serie, mesesNegativos, acumHoy, totalNeto, aportes, composicion, patrimonio, tienePrepagos };
}
