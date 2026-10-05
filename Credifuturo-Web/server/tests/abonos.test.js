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
