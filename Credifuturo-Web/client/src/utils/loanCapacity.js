// Lógica de veredicto y scoring de viabilidad de préstamo.
// Fuente única usada por LoanCapacityWidget (admin) y UserLoanAnalyzerPage (socio).
// Las reglas se centralizan acá para evitar divergencia entre vistas.

const FACTOR_MAX = 3;

const fmt = (n) => Math.round(n).toLocaleString('es-CO');

// Descripciones de las tarjetas KPI principales. Centralizadas acá para coherencia entre vistas.
export const kpiDescriptions = {
    ahorro: 'Capital aportado al fondo (aportes iniciales más ahorros mensuales acreditados). Constituye la base de cálculo de la capacidad de endeudamiento.',
    deuda: 'Saldo insoluto de los créditos vigentes — capital pendiente de amortización, sin incluir intereses futuros.',
    maximo: 'Cupo máximo aprobable directamente por el comité, equivalente a tres veces el ahorro acreditado (regla del 3× del fondo).',
    capacidadDisponible: 'Margen de crédito aún disponible sin requerir votación: cupo máximo menos la deuda vigente. Si es negativo, cualquier nuevo desembolso debe someterse a asamblea.'
};

// Techo de referencia para el componente "Constancia de ahorro" (monto promedio mensual saludable).
// Definido en $200.000 — alcanzar o superar este nivel otorga el máximo del subcomponente de monto.
const TECHO_AHORRO_PROMEDIO = 200_000;

// Explicación dinámica de cada componente del score, contextualizada con los datos del socio.
function explicarComponente(key, a, scoreData) {
    const fmt = (n) => Math.round(n).toLocaleString('es-CO');
    if (key === 'capacidad') {
        const techo = (a.ahorroTotal || 0) * 3;
        if (a.ahorroTotal === 0) return 'Sin ahorro acreditado — no se puede calcular cupo. Componente neutralizado en cero.';
        if (a.totalDeudaPendiente === 0) return `Sin deuda vigente. Capacidad ocupada al 0% del techo ($${fmt(techo)}). Puntaje máximo en este componente.`;
        const pctOcupado = (a.totalDeudaPendiente / techo) * 100;
        return `La deuda actual ($${fmt(a.totalDeudaPendiente)}) ocupa el ${pctOcupado.toFixed(0)}% del cupo máximo ($${fmt(techo)}). Queda ${(100 - pctOcupado).toFixed(0)}% de capacidad disponible.`;
    }
    if (key === 'cumplimiento') {
        // Unifica comportamiento histórico (mora pasada) + cartera al día (mora EP actual)
        if (a.enMoraActual) {
            const totalEP = a.totalCuotasMoraEP || 0;
            return `Mora EP vigente con ${totalEP} cuota(s) sin pagar — el componente se anula automáticamente. Regularice los pagos para recuperar puntaje.`;
        }
        if (scoreData.cuotasConResultado === 0) return 'Cartera al día y sin cuotas históricas resueltas aún. Puntaje provisional completo hasta que existan datos de pago.';
        const pct = scoreData.tasaMoraReal;
        if (pct === 0) return `Cumplimiento perfecto: ${scoreData.cuotasConResultado} cuota(s) resuelta(s) sin mora ni atrasos. Cartera al día. Puntaje máximo.`;
        return `${scoreData.moraReal} de ${scoreData.cuotasConResultado} cuota(s) con incumplimiento (${pct.toFixed(0)}% de mora histórica) — cartera al día. Se penaliza linealmente hasta 30% donde el puntaje cae a cero.`;
    }
    if (key === 'antiguedad') {
        const m = a.mesesComoSocio || 0;
        if (m === 0) return 'Sin tiempo registrado como socio. El puntaje escala linealmente hasta alcanzar el máximo a los 24 meses.';
        if (m < 24) return `${m} de 24 meses completados (${Math.round((m/24)*100)}% del máximo). Puntaje crece ~0.42 pts por mes hasta llegar a 10 pts.`;
        return `${m} meses como socio — antigüedad consolidada. Puntaje máximo de 10 pts alcanzado.`;
    }
    if (key === 'lealtad') {
        const liq = a.prestamosLiquidados || 0;
        const vAlDia = (a.prestamosVigentes || []).filter(l => !l.enMoraEP).length;
        const partes = [];

        if (liq === 0) {
            partes.push('Sin créditos saldados aún (0 / 3 para puntaje máximo en este sub-ítem · 6 pts).');
        } else if (liq < 3) {
            partes.push(`${liq} crédito(s) cancelado(s) a satisfacción — ${3 - liq} más para el máximo de 6 pts en este sub-ítem.`);
        } else {
            partes.push(`${liq} créditos cancelados — track record sólido. Sub-ítem liquidados al máximo (6 pts).`);
        }

        if (vAlDia > 0) {
            partes.push(`+2 pts bonus: tiene ${vAlDia} crédito(s) vigente(s) pagándose al día, lo que demuestra compromiso activo con el fondo.`);
        } else if ((a.totalPrestamosVigentes || 0) > 0) {
            partes.push(`⚠ Crédito(s) vigente(s) con mora activa — el bonus de 2 pts por compromiso activo no aplica.`);
        } else {
            partes.push(`Sin créditos vigentes actualmente (el bonus de +2 pts se activa al tener un crédito vigente y al día).`);
        }

        return partes.join(' ');
    }
    if (key === 'constancia') {
        const meses = a.mesesConAhorroMensual || 0;
        const esperados = a.mesesComoSocio || 0;
        const prom = a.promedioAhorroMensual || 0;
        if (meses === 0) return 'Sin aportes mensuales registrados aún. Comience aportando con regularidad para escalar este componente (hasta 12 pts).';
        const cobertura = esperados > 0 ? Math.min(100, (meses / esperados) * 100) : 100;
        const pctMonto = Math.min(100, (prom / TECHO_AHORRO_PROMEDIO) * 100);
        return `${meses} mes(es) con aporte de ${esperados} esperados (${cobertura.toFixed(0)}% de regularidad) · Aporte promedio $${fmt(prom)} (${pctMonto.toFixed(0)}% del referente $${fmt(TECHO_AHORRO_PROMEDIO)}). Premia a quien ahorra constante y con monto significativo.`;
    }
    if (key === 'penalizaciones') {
        const pen = a.totalAhorrosConPenalizacion || 0;
        const meses = a.mesesConAhorroMensual || 0;
        if (pen === 0) return 'Sin penalizaciones por atraso en todo el historial del fondo. Disciplina perfecta en los pagos de ahorro — no se restan puntos.';
        const dias = a.totalDiasPenalizacionAhorro || 0;
        const ratio = meses > 0 ? ((pen / meses) * 100).toFixed(1) : '—';
        const desc = meses > 0
            ? `(${ratio}% de los meses ahorrados)`
            : '';
        return `${pen} aporte(s) con mora en toda la historia del fondo ${desc}. ${dias} día(s) de atraso acumulados. Penalización proporcional: socios más antiguos con la misma tasa son tratados igual que los recientes.`;
    }
    return '';
}

// Score crediticio 0-100 con 4 componentes ponderados.
// Devuelve también el desglose para poder mostrarlo en UI.
export function calcScore(a) {
    if (!a) return null;

    // Tasa mora real: solo sobre cuotas con resultado conocido (pagadas + mora histórica + tardías).
    // No incluye pendientes futuras (no son juzgables aún).
    const moraReal = (a.historialMoraTotal || 0) + (a.pagosTardios || 0);
    const cuotasConResultado = (a.historialPagoTotal || 0) + moraReal;
    const tasaMoraReal = cuotasConResultado > 0 ? (moraReal / cuotasConResultado) * 100 : 0;

    // ── Componente 1: Capacidad financiera (35 pts) ──────────────────────
    // 100% si está libre de deuda; 0% si la deuda iguala o supera el techo 3×.
    const techo3x = (a.ahorroTotal || 0) * FACTOR_MAX;
    const capacidadDisponible = techo3x - (a.totalDeudaPendiente || 0);
    let capacidadPts = 0;
    if (a.ahorroTotal > 0) {
        const ratio = Math.max(0, Math.min(1, capacidadDisponible / techo3x));
        capacidadPts = ratio * 35;
    }

    // ── Componente 2: Cumplimiento crediticio (35 pts) ───────────────────
    // Unifica comportamiento histórico (mora pasada) + cartera al día (mora EP actual).
    // Si tiene mora EP activa → 0 pts (es bloqueante).
    // Si no, escala con la tasa mora histórica real.
    let cumplimientoPts;
    if (a.enMoraActual) {
        cumplimientoPts = 0;
    } else if (cuotasConResultado === 0) {
        cumplimientoPts = 35;
    } else if (tasaMoraReal >= 30) {
        cumplimientoPts = 0;
    } else {
        cumplimientoPts = 35 * (1 - tasaMoraReal / 30);
    }

    // ── Componentes 3 y 4: Antigüedad (10 pts) y Lealtad (8 pts) ────────
    // Antigüedad: escala linealmente 0→10 pts en 24 meses de permanencia.
    // Lealtad (8 pts):
    //   - 6 pts por créditos liquidados: escala lineal, satura a 3 cancelados (2 pts c/u).
    //   - 2 pts bonus si tiene al menos 1 crédito vigente pagándose al día (sin mora EP):
    //     reconoce el compromiso activo, no solo el historial pasado.
    const meses = a.mesesComoSocio || 0;
    const antiguedadPts = Math.min(meses / 24, 1) * 10;
    const vigentesAlDia = (a.prestamosVigentes || []).filter(l => !l.enMoraEP).length;
    const liquidadosPts = Math.min((a.prestamosLiquidados || 0) / 3, 1) * 6
        + (vigentesAlDia > 0 ? 2 : 0);

    // ── Componente 5: Constancia de ahorro (12 pts) ──────────────────────
    // Reconoce al socio que ahorra con regularidad Y con monto significativo.
    //  - 6 pts por regularidad: % de meses con aporte vs meses como socio.
    //  - 6 pts por monto: promedio mensual escalado contra un referente ($200.000).
    // Premia a quien más ahorra: ahorrar todos los meses Y con monto alto → 12 pts.
    const mesesConAhorro = a.mesesConAhorroMensual || 0;
    const promedio = a.promedioAhorroMensual || 0;
    const regularidadRatio = meses > 0 ? Math.min(mesesConAhorro / meses, 1) : (mesesConAhorro > 0 ? 1 : 0);
    const montoRatio = Math.min(promedio / TECHO_AHORRO_PROMEDIO, 1);
    const constanciaPts = (regularidadRatio * 6) + (montoRatio * 6);

    // ── Castigo: Penalizaciones por Ahorro (historial completo) ──────────
    // Se usa el RATIO penalizaciones/meses-ahorrados para ser equitativo entre
    // socios con distinta antigüedad. Un socio de 5 años con 3 penalizaciones
    // en 60 meses (5%) es mejor que uno de 1 año con 3 en 12 meses (25%).
    // Escala: 0% → 0 pts, ≥50% → −15 pts (cap). Sin datos → sin castigo.
    const cantPenalizaciones = a.totalAhorrosConPenalizacion || 0;
    const mesesParaRatio = mesesConAhorro || 1;
    const ratioPenalizacion = cantPenalizaciones / mesesParaRatio;
    const penalizacionesPts = mesesConAhorro > 0
        ? -Math.min(15, Math.round(ratioPenalizacion * 30))
        : 0;

    let score = Math.round(capacidadPts + cumplimientoPts + antiguedadPts + liquidadosPts + constanciaPts + penalizacionesPts);
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    let nivel, color;
    if (score >= 80)      { nivel = 'EXCELENTE'; color = 'green'; }
    else if (score >= 65) { nivel = 'BUENO';     color = 'emerald'; }
    else if (score >= 50) { nivel = 'ACEPTABLE'; color = 'yellow'; }
    else if (score >= 30) { nivel = 'DÉBIL';     color = 'amber'; }
    else                  { nivel = 'CRÍTICO';   color = 'red'; }

    const scoreData = {
        score, nivel, color,
        tasaMoraReal, moraReal, cuotasConResultado
    };
    scoreData.componentes = [
        { key: 'capacidad',      label: 'Capacidad financiera',   pts: Math.round(capacidadPts * 10) / 10,   max: 35, hint: 'Margen entre tu deuda actual y el cupo máximo (regla 3×).', detalle: explicarComponente('capacidad', a, scoreData) },
        { key: 'cumplimiento',   label: 'Cumplimiento crediticio',pts: Math.round(cumplimientoPts * 10) / 10, max: 35, hint: 'Historial de pagos + cartera al día (sin mora EP vigente).', detalle: explicarComponente('cumplimiento', a, scoreData) },
        { key: 'antiguedad',     label: 'Antigüedad como socio',  pts: Math.round(antiguedadPts * 10) / 10,  max: 10, hint: 'Meses de permanencia continua en el fondo. Máximo a los 24 meses.', detalle: explicarComponente('antiguedad', a, scoreData) },
        { key: 'lealtad',        label: 'Lealtad crediticia',     pts: Math.round(liquidadosPts * 10) / 10,  max: 8,  hint: 'Créditos cancelados a satisfacción. Máximo con 3 créditos saldados.', detalle: explicarComponente('lealtad', a, scoreData) },
        { key: 'constancia',     label: 'Constancia de ahorro',   pts: Math.round(constanciaPts * 10) / 10,  max: 12, hint: 'Regularidad + monto promedio de tus aportes mensuales. Premia al que más ahorra.', detalle: explicarComponente('constancia', a, scoreData) },
        { key: 'penalizaciones', label: 'Penalizaciones Ahorro',  pts: penalizacionesPts,                    max: 0,  hint: 'Se restan 2 pts por cada ahorro mensual pagado con atraso en el año en curso.', detalle: explicarComponente('penalizaciones', a, scoreData) },
    ];
    return scoreData;
}

export function calcVerdict(a, { audience = 'admin' } = {}) {
    if (!a) return null;

    const montoMaxSinVotacion = a.ahorroTotal * FACTOR_MAX;
    const capacidadDisponible = montoMaxSinVotacion - a.totalDeudaPendiente;
    const tasaApalancamiento  = a.ahorroTotal > 0 ? (a.totalDeudaPendiente / a.ahorroTotal) * 100 : 0;

    // Score y tasa mora real (P1.2 + P2.2)
    const scoreData = calcScore(a);
    const tasaMora = scoreData.tasaMoraReal;
    const totalMoraEP = a.totalCuotasMoraEP || 0;
    const compromiso = !!a.tieneCompromisoNoRetiroAhorros;

    const tu = audience === 'user';
    const riesgos = [];
    const positivos = [];

    if (a.enMoraActual)
        riesgos.push(`Mora EP vigente: ${totalMoraEP} cuota(s) vencida(s) sin pago por $${fmt(a.totalMoraEPValor || 0)}`);
    else
        positivos.push('Cartera vigente al día — sin cuotas en mora EP');

    if (a.pagosTardios > 0)
        riesgos.push(`Histórico de cumplimiento: ${a.pagosTardios} cuota(s) liquidada(s) fuera de la fecha límite`);
    else if (a.pagosEvaluables > 0)
        positivos.push(`Cumplimiento perfecto en ${a.pagosEvaluables} cuota(s) registradas en el sistema`);

    if (a.historialMoraTotal > 0)
        riesgos.push(`Historial con ${a.historialMoraTotal} marca(s) de mora registrada(s)`);

    if (tasaApalancamiento > 200)
        riesgos.push(`Apalancamiento crítico: la deuda representa el ${tasaApalancamiento.toFixed(0)}% del ahorro acreditado`);
    else if (tasaApalancamiento > 100)
        riesgos.push(`Apalancamiento elevado: la deuda supera el ahorro (${tasaApalancamiento.toFixed(0)}% deuda/ahorro)`);
    else if (tasaApalancamiento > 0)
        positivos.push(`Nivel de endeudamiento dentro del rango óptimo (${tasaApalancamiento.toFixed(0)}% deuda/ahorro)`);
    else
        positivos.push('Sin obligaciones financieras vigentes con el fondo');

    if (a.ahorroTotal === 0)
        riesgos.push('Sin capital acreditado — no es posible calcular cupo de crédito');
    else if (a.ahorroTotal < 500000)
        riesgos.push(`Base de ahorro reducida ($${fmt(a.ahorroTotal)}) — restringe la capacidad de endeudamiento`);
    else
        positivos.push(`Base de ahorro consolidada: $${fmt(a.ahorroTotal)} (aportes iniciales + ahorros mensuales)`);

    if (capacidadDisponible > 0)
        positivos.push(`Cupo disponible para aprobación directa: $${fmt(capacidadDisponible)}`);
    else
        riesgos.push('Cupo agotado — cualquier nuevo desembolso requiere aprobación en asamblea');

    if (a.prestamosLiquidados > 0)
        positivos.push(`Track record positivo: ${a.prestamosLiquidados} crédito(s) cancelado(s) a satisfacción`);

    if (a.mesesComoSocio != null) {
        if (a.mesesComoSocio >= 12)
            positivos.push(`Antigüedad consolidada: ${a.mesesComoSocio} meses de permanencia en el fondo`);
        else
            riesgos.push(`Antigüedad reciente: ${a.mesesComoSocio} mes(es) como socio — historial corto para análisis`);
    }

    if (compromiso)
        riesgos.push(`Compromiso vigente del Primer Informe 2026: ${tu ? 'no retirar' : 'el socio no debe retirar'} ahorros mientras el crédito vigente supere el 31-dic-${a.yearActual}`);

    let verdict, color, icon, mensaje, recomendacion;
    if (a.ahorroTotal === 0) {
        verdict = 'NO VIABLE';
        color = 'red'; icon = 'X';
        mensaje = tu
            ? 'No tienes ahorro acumulado registrado. La política del fondo exige ahorro base para calcular el límite de endeudamiento.'
            : 'El socio no tiene ahorro acumulado registrado. La política del fondo exige ahorro base para calcular el límite de endeudamiento.';
        recomendacion = tu
            ? 'Invitamos a regularizar tus aportes antes de presentar una nueva solicitud de préstamo.'
            : 'Rechazar solicitud. Invitar al socio a regularizar sus aportes antes de presentar una nueva solicitud.';
    } else if (a.enMoraActual) {
        verdict = 'NO VIABLE — MORA EP ACTIVA';
        color = 'red'; icon = 'X';
        mensaje = tu
            ? `Tienes ${totalMoraEP} cuota(s) vencida(s) sin pagar por $${fmt(a.totalMoraEPValor || 0)}. La fecha límite de pago ya venció. Ningún reglamento de fondo solidario autoriza nuevos desembolsos con mora vigente.`
            : `El socio tiene ${totalMoraEP} cuota(s) vencida(s) sin pagar por $${fmt(a.totalMoraEPValor || 0)}. La fecha límite de pago ya venció. Ningún reglamento de fondo solidario autoriza nuevos desembolsos con mora vigente.`;
        recomendacion = tu
            ? 'Requerimos paz y salvo total antes de cualquier nuevo trámite. Tus cuotas en mora deben quedar en estado "Pago" para reconsiderar.'
            : 'Rechazar solicitud. Exigir paz y salvo total antes de cualquier nuevo trámite. Las cuotas en mora deben quedar en estado "Pago" para reconsiderar.';
    } else if (capacidadDisponible <= 0) {
        verdict = 'REQUIERE VOTACIÓN DEL FONDO';
        color = 'amber'; icon = 'vote';
        mensaje = tu
            ? `Tu deuda pendiente ($${fmt(a.totalDeudaPendiente)}) supera tu límite actual de 3× tu ahorro ($${fmt(montoMaxSinVotacion)}). Cualquier nuevo préstamo excede el techo sin votación.`
            : `La deuda pendiente ($${fmt(a.totalDeudaPendiente)}) supera el límite de 3× el ahorro ($${fmt(montoMaxSinVotacion)}). Cualquier nuevo préstamo excede el techo sin votación.`;
        recomendacion = tu
            ? 'Sujeto a votación del fondo. El monto solicitado no puede exceder tu capacidad de pago histórica demostrada.'
            : 'Someter a votación del fondo. El monto solicitado no puede exceder la capacidad de pago histórica demostrada. Se recomienda análisis caso a caso con todos los asociados.';
    } else if (tasaMora > 20 || a.pagosTardios > 2) {
        // P1.2: ahora usa tasaMoraReal (sin pendientes en denominador) + considera pagos tardíos como señal
        verdict = 'VIABLE CON RESTRICCIONES';
        color = 'yellow'; icon = 'warn';
        mensaje = tu
            ? `Calificas por nivel de ahorro (máximo sin votación: $${fmt(montoMaxSinVotacion)}), pero tu historial registra ${tasaMora.toFixed(0)}% de incumplimiento sobre cuotas resueltas. Tu solicitud será revisada con precaución.`
            : `El socio califica por ahorro (max sin votación: $${fmt(montoMaxSinVotacion)}), pero su historial registra ${tasaMora.toFixed(0)}% de incumplimiento sobre cuotas resueltas. Se recomienda precaución.`;
        recomendacion = tu
            ? 'Se puede requerir presentar garantía adicional o un codeudor debido al historial de pagos.'
            : `Puede aprobarse hasta $${fmt(Math.min(capacidadDisponible, montoMaxSinVotacion * 0.5))} (50% del techo) como medida de mitigación. Exigir garantía adicional o codeudor.`;
    } else {
        verdict = compromiso ? 'VIABLE — CON COMPROMISO DE NO RETIRO' : 'VIABLE SIN VOTACIÓN';
        color = compromiso ? 'amber' : 'green';
        icon = compromiso ? 'lock' : 'check';
        mensaje = tu
            ? `Cumples todos los requisitos. Puedes solicitar hasta $${fmt(capacidadDisponible)} sin necesidad de votación del fondo (techo de 3× tu ahorro: $${fmt(montoMaxSinVotacion)}).`
            : `El socio cumple todos los requisitos. Puede solicitar hasta $${fmt(capacidadDisponible)} sin necesidad de votación del fondo (techo 3×: $${fmt(montoMaxSinVotacion)}).`;
        recomendacion = tu
            ? `Viable hasta $${fmt(capacidadDisponible)} sin votación. Para montos superiores, será necesario someter la solicitud a votación en el fondo.`
            : `Aprobar hasta $${fmt(capacidadDisponible)} sin votación. Para montos superiores hasta $${fmt(montoMaxSinVotacion)}, también es viable pero requiere votación del fondo.`;
    }

    return {
        verdict, color, icon, mensaje, recomendacion,
        montoMaxSinVotacion, capacidadDisponible,
        tasaApalancamiento, tasaMora, totalMoraEP,
        compromisoActivo: compromiso,
        score: scoreData,
        riesgos, positivos
    };
}

export const colorMap = {
    green:   { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-500' },
    yellow:  { bg: 'bg-yellow-50',  border: 'border-yellow-300',  text: 'text-yellow-800',  badge: 'bg-yellow-500'  },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-800',   badge: 'bg-amber-500'   },
    red:     { bg: 'bg-red-50',     border: 'border-red-300',     text: 'text-red-800',     badge: 'bg-red-600'     },
};
