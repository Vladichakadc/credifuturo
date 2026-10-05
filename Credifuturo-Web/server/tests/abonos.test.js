/**
 * Pruebas de la aritmética del abono extraordinario a capital.
 *
 *     npm test            (desde Credifuturo-Web/server)
 *
 * No tocan la base de datos: `services/amortizacion.js` es cálculo puro. Cada
 * caso reproduce un defecto visto con datos reales del fondo en la auditoría de
 * octubre de 2026, y existe para que no vuelva.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    analizarCronograma, planificarReajuste, abonosSinAplicar, ordenarCuotas,
    REDUCIR_CUOTA, REDUCIR_PLAZO,
} = require('../services/amortizacion');

const r2 = (n) => parseFloat(Number(n).toFixed(2));

/** Cronograma alemán recién desembolsado: capital constante, interés sobre saldo. */
function cronograma({ principal, cuotas, tasa, primerMes = 1 }) {
    const capital = principal / cuotas;
    const filas = [];
    let saldo = principal;
    for (let i = 1; i <= cuotas; i++) {
        const interes = r2(saldo * tasa);
        const saldoFinal = i === cuotas ? 0 : r2(saldo - capital);
        const mes = primerMes + i - 1;
        filas.push({
            id: i, externalId: `P${i}`, itemQuantity: i, estado: 'Pendiente', esPrepago: false,
            fechaPagoMax: `${2026 + Math.floor((mes - 1) / 12)}-${String(((mes - 1) % 12) + 1).padStart(2, '0')}-10`,
            interesMensual: tasa, saldoInicial: r2(saldo), valorInteresesAmortizados: interes,
            valorCuotaVariable: r2(saldo - saldoFinal + interes), valorCuotaPago: 0, saldoFinal,
        });
        saldo = saldoFinal;
    }
    return filas;
}

/**
 * Registra un pago como lo deja el formulario "Registro Estado Préstamo": marca
 * la cuota pagada, cambia su fecha por la del día del pago y recalcula su
 * saldoFinal como saldoInicial + interés − lo pagado, redondeado a pesos.
 */
function pagarPorFormulario(filas, numero, pagado, fecha) {
    const c = filas.find((f) => f.itemQuantity === numero);
    c.estado = 'Pago';
    c.valorCuotaPago = pagado;
    if (fecha) c.fechaPagoMax = fecha;
    c.saldoFinal = Math.max(0, Math.round(c.saldoInicial + c.valorInteresesAmortizados - pagado));
    return c;
}

/** Vuelca en las filas el resultado de un plan, como hace `aplicarPlan`. */
function aplicar(filas, plan) {
    for (const nueva of plan.filas) {
        const f = filas.find((x) => x.id === nueva.id);
        Object.assign(f, {
            saldoInicial: nueva.saldoInicial, valorInteresesAmortizados: nueva.valorInteresesAmortizados,
            valorCuotaVariable: nueva.valorCuotaVariable, saldoFinal: nueva.saldoFinal,
        });
        if (nueva.sobra) Object.assign(f, { estado: 'Pago', valorCuotaPago: 0, esPrepago: true });
    }
}

const capitalTotal = (filas) => filas.reduce((s, f) => s + (f.saldoInicial - f.saldoFinal), 0);

test('un abono en una cuota intermedia es recalculable (antes: "no amortiza con capital constante")', () => {
    const filas = cronograma({ principal: 5000000, cuotas: 10, tasa: 0.016, primerMes: 7 });
    for (const n of [1, 2, 3]) pagarPorFormulario(filas, n, filas[n - 1].valorCuotaVariable);
    pagarPorFormulario(filas, 4, filas[3].valorCuotaVariable + 500000, '2026-10-04');

    const d = analizarCronograma(filas);
    assert.equal(d.capitalConstante, true);
    assert.equal(d.recalculable, true, d.motivo);
    assert.equal(abonosSinAplicar(filas).length, 1);

    const plan = planificarReajuste({ cuotas: filas, politica: REDUCIR_CUOTA });
    assert.equal(plan.ok, true, plan.motivo);
    assert.equal(plan.resumen.cuotasDespues, 6);
    assert.equal(plan.resumen.ahorroInteres, 28000); // 168.000 → 140.000
    aplicar(filas, plan);
    assert.ok(Math.abs(capitalTotal(filas) - 5000000) < 1);
    assert.equal(filas[9].saldoFinal, 0);
    assert.equal(abonosSinAplicar(filas).length, 0);
});

test('reducir plazo en una cuota intermedia quita una cuota y ahorra más interés', () => {
    const filas = cronograma({ principal: 5000000, cuotas: 10, tasa: 0.016, primerMes: 7 });
    for (const n of [1, 2, 3]) pagarPorFormulario(filas, n, filas[n - 1].valorCuotaVariable);
    pagarPorFormulario(filas, 4, filas[3].valorCuotaVariable + 500000);

    const plan = planificarReajuste({ cuotas: filas, politica: REDUCIR_PLAZO });
    assert.equal(plan.ok, true, plan.motivo);
    assert.equal(plan.resumen.cuotasDespues, 5);
    assert.equal(plan.resumen.ahorroInteres, 48000); // 168.000 → 120.000
});

test('un abono en la primera cuota sigue siendo recalculable', () => {
    const filas = cronograma({ principal: 7000000, cuotas: 12, tasa: 0.016, primerMes: 10 });
    pagarPorFormulario(filas, 1, filas[0].valorCuotaVariable + 500000);
    assert.equal(analizarCronograma(filas).recalculable, true);
});

test('un segundo abono, después de aplicar el primero en una cuota intermedia, también pasa', () => {
    const filas = cronograma({ principal: 5000000, cuotas: 10, tasa: 0.016, primerMes: 7 });
    for (const n of [1, 2, 3]) pagarPorFormulario(filas, n, filas[n - 1].valorCuotaVariable);
    pagarPorFormulario(filas, 4, filas[3].valorCuotaVariable + 500000);
    aplicar(filas, planificarReajuste({ cuotas: filas, politica: REDUCIR_CUOTA }));

    // Una cuota normal en medio, y luego otro abono.
    pagarPorFormulario(filas, 5, filas[4].valorCuotaVariable);
    pagarPorFormulario(filas, 6, filas[5].valorCuotaVariable + 300000);

    const d = analizarCronograma(filas);
    assert.equal(d.recalculable, true, d.motivo);
    const plan = planificarReajuste({ cuotas: filas, politica: REDUCIR_CUOTA });
    assert.equal(plan.ok, true, plan.motivo);
    aplicar(filas, plan);
    assert.ok(Math.abs(capitalTotal(filas) - 5000000) < 1);
    assert.equal(abonosSinAplicar(filas).length, 0);
});

// ── Qué aplica cada reajuste ────────────────────────────────────────────────
//
// Caso real (SOL30, octubre de 2026): $8.000.000 a 12 cuotas al 1,4%. La socia
// pagó $1.000.000 en la cuota 1 ($221.333 de más) y, ya aplicado ese abono,
// $1.035.000 en la cuota 2, que valía $746.113,45 ($288.887 de más). El sistema
// le informó un abono de $510.220: la suma de los dos.

/** Lo que baja el total de las cuotas pendientes entre el cronograma guardado y el plan. */
function bajaPendiente(filas, plan) {
    return filas.reduce((s, f) => {
        if (f.estado !== 'Pendiente') return s;
        return s + (f.valorCuotaVariable - plan.filas.find((n) => n.id === f.id).valorCuotaVariable);
    }, 0);
}

test('el segundo abono informa SU excedente, no el acumulado del crédito', () => {
    const filas = cronograma({ principal: 8000000, cuotas: 12, tasa: 0.014, primerMes: 8 });
    pagarPorFormulario(filas, 1, 1000000);
    const primero = planificarReajuste({ cuotas: filas, politica: REDUCIR_CUOTA });
    assert.equal(primero.resumen.excedente, 221333.33);
    assert.equal(primero.resumen.excedenteAcumulado, 221333.33);
    aplicar(filas, primero);
    assert.equal(filas[1].valorCuotaVariable, 746113.45);

    pagarPorFormulario(filas, 2, 1035000);
    const segundo = planificarReajuste({ cuotas: filas, politica: REDUCIR_CUOTA });
    assert.equal(segundo.ok, true, segundo.motivo);
    assert.equal(segundo.resumen.excedente, 288886.55, 'lo que pagó de más en la cuota 2');
    assert.equal(segundo.resumen.excedenteAcumulado, 510219.88, 'lo que lleva abonado en el crédito');
    assert.equal(segundo.resumen.capitalAplicado, 288886.55);
    assert.equal(segundo.resumen.ahorroInteres, 22244.25);
    // La cuenta que el informe le enseña a la socia tiene que cerrar.
    const baja = bajaPendiente(filas, segundo);
    assert.ok(Math.abs(baja - (segundo.resumen.excedente + segundo.resumen.ahorroInteres)) < 0.05,
        `lo pendiente baja ${baja}`);
});

test('con cuotas pagadas después del abono, el excedente sigue siendo lo pagado de más', () => {
    // El abono quedó sin aplicar (no pasó por el formulario) y la socia pagó
    // después dos cuotas por su valor. Al aplicarlo, el interés que se le cobró
    // de más en esas dos se le reconoce como capital: el saldo baja MÁS que el
    // excedente, y esa diferencia no puede presentarse como dinero que pagó.
    const filas = cronograma({ principal: 8000000, cuotas: 12, tasa: 0.014 });
    filas[0].estado = 'Pago';
    filas[0].valorCuotaPago = 1000000;
    for (const n of [2, 3]) { filas[n - 1].estado = 'Pago'; filas[n - 1].valorCuotaPago = filas[n - 1].valorCuotaVariable; }

    const plan = planificarReajuste({ cuotas: filas, politica: REDUCIR_CUOTA });
    assert.equal(plan.ok, true, plan.motivo);
    assert.ok(Math.abs(plan.resumen.excedente - 221333.33) < 0.05, `excedente ${plan.resumen.excedente}`);
    assert.ok(plan.resumen.interesReintegrado > 6000, `reintegrado ${plan.resumen.interesReintegrado}`);
    assert.ok(Math.abs(plan.resumen.capitalAplicado - (plan.resumen.excedente + plan.resumen.interesReintegrado)) < 0.05);
    const baja = bajaPendiente(filas, plan);
    assert.ok(Math.abs(baja - (plan.resumen.capitalAplicado + plan.resumen.ahorroInteres)) < 0.05, `lo pendiente baja ${baja}`);
});

test('un pago que supera toda la deuda: el excedente es lo pagado de más y el resto es sobrante', () => {
    const filas = cronograma({ principal: 1200000, cuotas: 12, tasa: 0.014 });
    pagarPorFormulario(filas, 1, filas[0].valorCuotaVariable + 1300000);
    const plan = planificarReajuste({ cuotas: filas, politica: REDUCIR_CUOTA });
    assert.equal(plan.ok, true, plan.motivo);
    assert.equal(plan.cancelaElCredito, true);
    assert.equal(plan.resumen.excedente, 1300000);
    assert.equal(plan.resumen.sobrante, 200000);
    assert.equal(plan.resumen.capitalAplicado, 1100000); // lo que quedaba de capital
});

test('un pago registrado tarde no desordena el cronograma', () => {
    const filas = cronograma({ principal: 7000000, cuotas: 12, tasa: 0.016, primerMes: 10 });
    // La cuota 1 vencía el 10 de octubre; se registra el 21 de noviembre, con
    // la cuota 2 (10 de noviembre) todavía pendiente.
    pagarPorFormulario(filas, 1, filas[0].valorCuotaVariable + 500000, '2026-11-21');

    assert.deepEqual(ordenarCuotas(filas).map((f) => f.itemQuantity), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const d = analizarCronograma(filas);
    assert.equal(d.encadenado, true);
    assert.equal(d.recalculable, true, d.motivo);
});

test('sin numeración fiable se sigue ordenando por fecha', () => {
    const filas = cronograma({ principal: 1000000, cuotas: 3, tasa: 0.016 });
    filas[0].itemQuantity = 2; // dos cuotas con el mismo número: importación defectuosa
    const orden = ordenarCuotas([filas[2], filas[0], filas[1]]).map((f) => f.id);
    assert.deepEqual(orden, [1, 2, 3]);
});

test('un cronograma francés (cuota fija) se sigue rechazando', () => {
    const tasa = 0.016; const n = 6; const principal = 3000000;
    const cuota = principal * tasa / (1 - Math.pow(1 + tasa, -n));
    const filas = []; let saldo = principal;
    for (let i = 1; i <= n; i++) {
        const interes = r2(saldo * tasa);
        const saldoFinal = i === n ? 0 : r2(saldo - (cuota - interes));
        filas.push({
            id: i, itemQuantity: i, estado: 'Pendiente', fechaPagoMax: `2026-${String(i).padStart(2, '0')}-10`,
            interesMensual: tasa, saldoInicial: r2(saldo), valorInteresesAmortizados: interes,
            valorCuotaVariable: r2(cuota), valorCuotaPago: 0, saldoFinal,
        });
        saldo = saldoFinal;
    }
    const d = analizarCronograma(filas);
    assert.equal(d.capitalConstante, false);
    assert.equal(d.recalculable, false);
});

test('un salto de capital que no corresponde al excedente se sigue rechazando', () => {
    const filas = cronograma({ principal: 5000000, cuotas: 10, tasa: 0.016 });
    for (const n of [1, 2, 3]) pagarPorFormulario(filas, n, filas[n - 1].valorCuotaVariable);
    // La cuota 4 se paga con $500.000 de más, pero su saldo final se rebaja en
    // $900.000: las cifras no cuentan la misma historia.
    const c = pagarPorFormulario(filas, 4, filas[3].valorCuotaVariable + 500000);
    c.saldoFinal -= 400000;
    assert.equal(analizarCronograma(filas).recalculable, false);
});

test('una cadena rota sin ningún sobrepago se sigue rechazando', () => {
    const filas = cronograma({ principal: 5000000, cuotas: 10, tasa: 0.016 });
    filas[4].saldoInicial += 50000;
    assert.equal(analizarCronograma(filas).encadenado, false);
});
