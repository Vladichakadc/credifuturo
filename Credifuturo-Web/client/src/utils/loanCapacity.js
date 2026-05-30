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
    if (key === 'comportamiento') {
        if (scoreData.cuotasConResultado === 0) return 'Sin cuotas con resultado conocido aún. Puntaje provisional completo hasta que existan datos de pago en el sistema.';
        const pct = scoreData.tasaMoraReal;
        return `${scoreData.moraReal} cuota(s) con incumplimiento sobre ${scoreData.cuotasConResultado} resueltas (${pct.toFixed(0)}% de mora). Se penaliza linealmente hasta 30% donde el puntaje cae a cero.`;
    }
    if (key === 'antiguedad') {
        const m = a.mesesComoSocio || 0;
        const liq = a.prestamosLiquidados || 0;
        const partes = [];
        if (m < 24) partes.push(`${m} meses como socio (satura a 24m para 12 pts)`);
        else partes.push(`${m} meses como socio — antigüedad consolidada`);
        if (liq === 0) partes.push('sin créditos saldados aún');
        else if (liq < 3) partes.push(`${liq} crédito(s) saldado(s) (satura a 3 para 8 pts)`);
        else partes.push(`${liq} créditos saldados — track record sólido`);
        return partes.join(' · ');
    }
    if (key === 'compromiso') {
        return a.enMoraActual
            ? 'Cuota(s) vencida(s) sin pagar. Este componente se anula automáticamente mientras exista mora EP activa.'
            : 'Cartera al día — ninguna cuota vencida sin pagar. Componente al máximo.';
    }
    return '';
}

// Score crediticio 0-100 con 4 componentes ponderados.
// Devuelve también el desglose para poder mostrarlo en UI.
export function calcScore(a) {
    if (!a) return null;

    // P1.2 — Tasa mora corregida: solo sobre cuotas con resultado conocido
    // (pagadas + mora histórica + pagos tardíos + mora EP actual). Excluye pendientes futuras.
    const moraReal = (a.historialMoraTotal || 0) + (a.pagosTardios || 0);
    const cuotasConResultado = (a.historialPagoTotal || 0) + moraReal;
    const tasaMoraReal = cuotasConResultado > 0 ? (moraReal / cuotasConResultado) * 100 : 0;

    // ── Componente 1: Capacidad financiera (40 pts) ──────────────────────
    // 100% si está libre de deuda; 0% si la deuda iguala o supera el techo 3×.
    const techo3x = (a.ahorroTotal || 0) * FACTOR_MAX;
    const capacidadDisponible = techo3x - (a.totalDeudaPendiente || 0);
    let capacidadPts = 0;
    if (a.ahorroTotal > 0) {
        const ratio = Math.max(0, Math.min(1, capacidadDisponible / techo3x));
        capacidadPts = ratio * 40;
    }

    // ── Componente 2: Comportamiento crediticio (30 pts) ─────────────────
    // Penaliza la tasa mora real. Sin cuotas con resultado → puntaje completo (sin negativo).
    let comportamientoPts;
    if (cuotasConResultado === 0) {
        comportamientoPts = 30;
    } else if (tasaMoraReal >= 30) {
        comportamientoPts = 0;
    } else {
        comportamientoPts = 30 * (1 - tasaMoraReal / 30);
    }

    // ── Componente 3: Antigüedad + lealtad (20 pts) ──────────────────────
    // 12 pts por antigüedad (saturando a 24 meses) + 8 pts por préstamos liquidados (saturando a 3).
    const meses = a.mesesComoSocio || 0;
    const antiguedadPts = Math.min(meses / 24, 1) * 12;
    const liquidadosPts = Math.min((a.prestamosLiquidados || 0) / 3, 1) * 8;
    const antLealtadPts = antiguedadPts + liquidadosPts;

    // ── Componente 4: Compromiso actual (10 pts) ─────────────────────────
    // 0 si tiene mora EP activa; 10 si no.
    const compromisoPts = a.enMoraActual ? 0 : 10;

    const score = Math.round(capacidadPts + comportamientoPts + antLealtadPts + compromisoPts);

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
        { key: 'capacidad',     label: 'Capacidad financiera',  pts: Math.round(capacidadPts * 10) / 10, max: 40, hint: 'Margen entre tu deuda actual y el cupo máximo permitido.', detalle: explicarComponente('capacidad', a, scoreData) },
        { key: 'comportamiento',label: 'Comportamiento de pago',pts: Math.round(comportamientoPts * 10) / 10, max: 30, hint: 'Cumplimiento sobre cuotas con resultado conocido.', detalle: explicarComponente('comportamiento', a, scoreData) },
        { key: 'antiguedad',    label: 'Antigüedad + lealtad',  pts: Math.round(antLealtadPts * 10) / 10, max: 20, hint: 'Permanencia como socio y créditos saldados previamente.', detalle: explicarComponente('antiguedad', a, scoreData) },
        { key: 'compromiso',    label: 'Cartera al día',        pts: compromisoPts, max: 10, hint: 'Ausencia de mora EP vigente en este momento.', detalle: explicarComponente('compromiso', a, scoreData) },
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
