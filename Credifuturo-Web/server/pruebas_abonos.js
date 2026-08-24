#!/usr/bin/env node
/**
 * Banco de pruebas del reajuste por abono extraordinario a capital.
 *
 * Corre sobre una base de datos temporal propia —nunca sobre la real— y
 * comprueba tanto los números concretos del caso que motivó el cambio como las
 * invariantes que deben cumplirse siempre: que el saldo encadene, que el
 * crédito se extinga en cero, que la suma de capital amortizado sea el capital
 * prestado y que la deuda del socio no crezca nunca por efecto del reajuste.
 *
 *   node pruebas_abonos.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const RUTA = path.join(os.tmpdir(), `credifuturo-pruebas-${process.pid}.sqlite`);
process.env.DATABASE_PATH = RUTA;

const sequelize = require('./config/database');
const { Client, DisbursedLoan, LoanPayment } = require('./models');
const AbonoAplicado = require('./models/AbonoAplicado');
const abonos = require('./services/abonoCapital');
const { analizarCronograma } = require('./services/amortizacion');

const ANIO = abonos.anioBogota();
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => num(n).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let ok = 0; let fallos = 0;
const cerca = (a, b, tol = 1) => Math.abs(num(a) - num(b)) <= tol;

function comprobar(descripcion, condicion, detalle = '') {
    if (condicion) { ok++; console.log(`   ✓ ${descripcion}`); }
    else { fallos++; console.log(`   ✗ ${descripcion}${detalle ? ` — ${detalle}` : ''}`); }
}

let secuencia = 0;

/** Genera un cronograma con la misma ley que usa PUT /loans en admin.js. */
async function sembrar({ principal, cuotas, tasa, pagos = {}, anio = ANIO, frances = false, corrupto = false, mora = [], tasaPorFila = null, cuotasDeclaradas = null }) {
    secuencia++;
    const idVm = `VM_T${secuencia}`;
    const socio = await Client.create({
        name: `Socio${secuencia}`, apellido1: 'Prueba', cedula: `9000${secuencia}`,
        customerId: `${9000 + secuencia}`, email: `s${secuencia}@t.local`, password: 'x',
        role: 'user', estatus: 'Activo',
    });
    await DisbursedLoan.create({
        idVm, clientId: socio.id, valorPrestado: principal, cuotas: cuotasDeclaradas || cuotas, interesMensual: tasa,
        estado: 'Activo', fechaPrestamo: `${anio}-01-10`, mesDesembolso: 'Enero', anioDesembolso: anio,
    });

    const capital = principal / cuotas;
    const filas = []; let saldo = principal;
    // Cuota fija (sistema francés), para comprobar que la guarda lo rechaza.
    const cuotaFrancesa = principal * tasa / (1 - Math.pow(1 + tasa, -cuotas));

    for (let i = 1; i <= cuotas; i++) {
        const tasaFila = tasaPorFila ? tasaPorFila(i) : tasa;
        const interes = parseFloat((saldo * tasaFila).toFixed(2));
        const cap = frances ? parseFloat((cuotaFrancesa - interes).toFixed(2)) : capital;
        const saldoFinal = Math.max(0, parseFloat((saldo - cap).toFixed(2)));
        filas.push({
            externalId: `${idVm}-C${i}`, clientId: socio.id, idVm,
            saldoInicial: corrupto ? principal : parseFloat(saldo.toFixed(2)),
            cuotasPrestamo: cuotas, interesMensual: tasaFila,
            valorInteresesAmortizados: corrupto ? 3620 : interes,
            fechaPagoMax: `${anio}-${String(Math.min(12, i)).padStart(2, '0')}-${String(10 + Math.floor((i - 1) / 12)).padStart(2, '0')}`,
            valorCuotaVariable: parseFloat((cap + interes).toFixed(2)),
            estado: 'Pendiente', valorCuotaPago: 0,
            saldoFinal: corrupto ? principal : saldoFinal,
            itemQuantity: i, estadoPrestamo: 'Activo',
        });
        saldo = saldoFinal;
    }
    for (const [n, monto] of Object.entries(pagos)) {
        const f = filas[Number(n) - 1];
        f.estado = 'Pago';
        f.valorCuotaPago = monto === 'exacto' ? f.valorCuotaVariable : monto;
    }
    for (const n of mora) filas[n - 1].estado = 'Mora';

    await LoanPayment.bulkCreate(filas);
    return { idVm, clientId: socio.id, principal, cuotas, tasa };
}

const leer = (idVm) => LoanPayment.findAll({ where: { idVm }, order: [['itemQuantity', 'ASC']] });

async function tabla(idVm, titulo) {
    const f = await leer(idVm);
    console.log(`\n   ${titulo}`);
    console.log('    #  estado       saldoInicial        interés          cuota         pagado     saldoFinal');
    for (const c of f) {
        console.log('   ' + String(c.itemQuantity).padStart(2) + '  ' + String(c.estado).padEnd(10)
            + money(c.saldoInicial).padStart(14) + money(c.valorInteresesAmortizados).padStart(15)
            + money(c.valorCuotaVariable).padStart(15) + money(c.valorCuotaPago).padStart(15)
            + money(c.saldoFinal).padStart(15));
    }
}

/** Las reglas que un cronograma sano cumple siempre, sea cual sea el caso. */
async function invariantes(idVm, principal, etiqueta) {
    const f = (await leer(idVm)).filter((c) => !(c.esPrepago && num(c.valorCuotaVariable) === 0));
    let encadena = true;
    for (let i = 0; i < f.length - 1; i++) {
        if (!cerca(f[i].saldoFinal, f[i + 1].saldoInicial)) encadena = false;
    }
    comprobar(`${etiqueta}: el saldo encadena entre cuotas`, encadena);
    comprobar(`${etiqueta}: el crédito se extingue en cero`, cerca(f[f.length - 1].saldoFinal, 0),
        `última cuota deja ${money(f[f.length - 1].saldoFinal)}`);
    const capitalTotal = f.reduce((s, c) => s + (num(c.saldoInicial) - num(c.saldoFinal)), 0);
    comprobar(`${etiqueta}: el capital amortizado suma el capital prestado`, cerca(capitalTotal, principal),
        `suma ${money(capitalTotal)} frente a ${money(principal)}`);
    let interesesCoherentes = true;
    for (const c of f) {
        if (!cerca(num(c.saldoInicial) * num(c.interesMensual), c.valorInteresesAmortizados)) interesesCoherentes = false;
    }
    comprobar(`${etiqueta}: el interés de cada cuota corresponde a su saldo por la tasa`, interesesCoherentes);
}

(async () => {
    if (fs.existsSync(RUTA)) fs.unlinkSync(RUTA);
    await sequelize.sync();
    await AbonoAplicado.sync();
    // La asociación LoanPayment→DisbursedLoan genera una FK hacia id_vm, que no
    // tiene índice único: SQLite la considera malformada y rechaza cualquier
    // INSERT en LoanPayments. El índice único la vuelve válida — es el mismo
    // arreglo que se propone para la base real.
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_disbursed_id_vm ON DisbursedLoans(id_vm)');
    console.log(`\nBase de pruebas: ${RUTA}\nAño evaluado: ${ANIO}\n`);

    // ── 1. El caso real que motivó el cambio ──────────────────────────
    console.log('1. Caso real: $8.000.000 · 12 cuotas · 1,4% · primera cuota pagada con $1.000.000');
    {
        const p = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        const plan = await abonos.planificarPrestamo({ idVm: p.idVm });
        comprobar('el diagnóstico detecta el abono', plan.aplicable, plan.motivo);
        comprobar('el excedente es $221.333,33', cerca(plan.resumen.excedente, 221333.33, 0.01),
            `calculó ${money(plan.resumen && plan.resumen.excedente)}`);
        await abonos.aplicarPlan(plan, { origen: 'prueba' });
        await tabla(p.idVm, 'Cronograma tras aplicar el abono');
        const f = await leer(p.idVm);
        comprobar('el saldo tras la cuota 1 baja a $7.112.000', cerca(f[0].saldoFinal, 7112000),
            `quedó en ${money(f[0].saldoFinal)}`);
        comprobar('la cuota 2 baja de $769.333,34 a $746.113,45', cerca(f[1].valorCuotaVariable, 746113.45),
            `quedó en ${money(f[1].valorCuotaVariable)}`);
        comprobar('el ahorro de intereses es positivo', plan.resumen.ahorroInteres > 0,
            `${money(plan.resumen.ahorroInteres)}`);
        await invariantes(p.idVm, p.principal, 'caso real');
    }

    // ── 2. El caso que inflaba la deuda ───────────────────────────────
    console.log('\n2. Exceso en la cuota 1 con las cuotas 2 y 3 ya pagadas al valor viejo');
    {
        const p = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000, 2: 'exacto', 3: 'exacto' } });
        const antes = await leer(p.idVm);
        const plan = await abonos.planificarPrestamo({ idVm: p.idVm });
        comprobar('el diagnóstico lo acepta', plan.aplicable, plan.motivo);
        await abonos.aplicarPlan(plan, { origen: 'prueba' });
        await tabla(p.idVm, 'Cronograma tras aplicar el abono');
        const f = await leer(p.idVm);
        const capitalYaAmortizado = 888000 + (8000000 / 12) * 2;
        const saldoEsperado = 8000000 - capitalYaAmortizado;
        comprobar('la cuota 4 NO arranca con deuda inflada', num(f[3].saldoInicial) <= num(antes[3].saldoInicial) + 1,
            `arranca en ${money(f[3].saldoInicial)} y antes era ${money(antes[3].saldoInicial)}`);
        // El saldo queda por DEBAJO del cálculo ingenuo: al recalcular, el
        // interés de las cuotas 2 y 3 se liquida sobre el saldo ya rebajado, así
        // que parte de lo que el socio pagó como interés pasa a amortizar capital.
        comprobar('el saldo tras la cuota 3 no supera el capital pendiente del cálculo simple',
            num(f[2].saldoFinal) <= saldoEsperado + 1,
            `quedó en ${money(f[2].saldoFinal)} frente a ${money(saldoEsperado)}`);
        comprobar('la diferencia es exactamente el interés reintegrado al socio',
            cerca(saldoEsperado - num(f[2].saldoFinal), plan.resumen.interesReintegrado, 1),
            `diferencia ${money(saldoEsperado - num(f[2].saldoFinal))} frente a ${money(plan.resumen.interesReintegrado)}`);
        comprobar('el ahorro de intereses es positivo, no negativo', plan.resumen.ahorroInteres > 0,
            `${money(plan.resumen.ahorroInteres)}`);
        comprobar('se le reintegra al socio el interés cobrado de más', plan.resumen.interesReintegrado > 0,
            `${money(plan.resumen.interesReintegrado)}`);
        await invariantes(p.idVm, p.principal, 'cuotas posteriores pagadas');
    }

    // ── 3. Un segundo abono sobre el mismo préstamo ───────────────────
    console.log('\n3. Segundo abono sobre un préstamo que ya recibió uno');
    {
        const p = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        await abonos.aplicarPlan(await abonos.planificarPrestamo({ idVm: p.idVm }), { origen: 'prueba' });
        const diag = analizarCronograma(await leer(p.idVm));
        comprobar('el cronograma sigue siendo recalculable tras el primer abono', diag.recalculable, diag.motivo);
        // La socia vuelve a pagar de más, ahora en la cuota 2.
        const f = await leer(p.idVm);
        await f[1].update({ estado: 'Pago', valorCuotaPago: num(f[1].valorCuotaVariable) + 300000 });
        const plan2 = await abonos.planificarPrestamo({ idVm: p.idVm });
        comprobar('el segundo abono se acepta', plan2.aplicable, plan2.motivo);
        if (plan2.aplicable) {
            await abonos.aplicarPlan(plan2, { origen: 'prueba' });
            await invariantes(p.idVm, p.principal, 'segundo abono');
        }
    }

    // ── 4. Idempotencia del barrido ───────────────────────────────────
    console.log('\n4. El barrido corrido dos veces no vuelve a aplicar nada');
    {
        const p = await sembrar({ principal: 5000000, cuotas: 10, tasa: 0.015, pagos: { 1: 800000 } });
        const primera = await abonos.barrer({ aplicar: true, origen: 'prueba' });
        const trasPrimera = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorCuotaVariable, c.saldoFinal]));
        const segunda = await abonos.barrer({ aplicar: true, origen: 'prueba' });
        const trasSegunda = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorCuotaVariable, c.saldoFinal]));
        comprobar('la primera pasada aplica al menos un préstamo', primera.aplicados.length >= 1);
        comprobar('la segunda pasada no aplica ninguno', segunda.aplicados.length === 0,
            `aplicó ${segunda.aplicados.length}`);
        comprobar('las cifras no cambian entre pasadas', trasPrimera === trasSegunda);
    }

    // ── 5. Cronogramas que no se deben tocar ──────────────────────────
    console.log('\n5. Cronogramas que el sistema debe negarse a recalcular');
    {
        const importado = await sembrar({ principal: 2000000, cuotas: 12, tasa: 0.015, pagos: { 1: 500000 }, corrupto: true });
        const p1 = await abonos.planificarPrestamo({ idVm: importado.idVm });
        comprobar('un cronograma importado incoherente se rechaza', !p1.aplicable, p1.motivo);

        const frances = await sembrar({ principal: 6000000, cuotas: 12, tasa: 0.015, pagos: { 1: 900000 }, frances: true });
        const p2 = await abonos.planificarPrestamo({ idVm: frances.idVm });
        comprobar('un cronograma de cuota fija (francés) se rechaza', !p2.aplicable, p2.motivo);

        const conMora = await sembrar({ principal: 4000000, cuotas: 10, tasa: 0.015, pagos: { 1: 700000 }, mora: [2] });
        const p3 = await abonos.planificarPrestamo({ idVm: conMora.idVm });
        comprobar('un préstamo con cuotas en mora se rechaza', !p3.aplicable, p3.motivo);

        const viejo = await sembrar({ principal: 3000000, cuotas: 10, tasa: 0.015, pagos: { 1: 600000 }, anio: ANIO - 2 });
        const p4 = await abonos.planificarPrestamo({ idVm: viejo.idVm });
        comprobar('un abono de un ejercicio cerrado se rechaza', !p4.aplicable && p4.fueraDePeriodo, p4.motivo);

        const justo = await sembrar({ principal: 3000000, cuotas: 10, tasa: 0.015, pagos: { 1: 'exacto' } });
        const p5 = await abonos.planificarPrestamo({ idVm: justo.idVm });
        comprobar('un pago exacto no dispara nada', !p5.aplicable, p5.motivo);
    }

    // ── 6. Reducir plazo ──────────────────────────────────────────────
    console.log('\n6. Política de reducir plazo');
    {
        const p = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        const plan = await abonos.planificarPrestamo({ idVm: p.idVm, politica: 'reducir-plazo' });
        comprobar('se acepta con reducción de plazo', plan.aplicable, plan.motivo);
        await abonos.aplicarPlan(plan, { origen: 'prueba' });
        const f = await leer(p.idVm);
        // Lo que define reducir plazo es que el capital por cuota NO cambia: el
        // crédito se acorta. Con un abono menor que una cuota de capital
        // ($221.333 frente a $666.667) el acortamiento no llega a una cuota
        // entera y se nota en que la última amortiza solo el residuo.
        const capitalPactado = 8000000 / 12;
        const intermedias = f.slice(1, -1);
        comprobar('el capital por cuota se mantiene en el pactado',
            intermedias.every((c) => cerca(num(c.saldoInicial) - num(c.saldoFinal), capitalPactado)));
        const capitalUltima = num(f[11].saldoInicial) - num(f[11].saldoFinal);
        comprobar('la última cuota amortiza solo el residuo', capitalUltima < capitalPactado - 1,
            `amortiza ${money(capitalUltima)} frente a ${money(capitalPactado)}`);
        comprobar('ahorra más intereses que reducir cuota', plan.resumen.ahorroInteres > 18592,
            `${money(plan.resumen.ahorroInteres)}`);
        await invariantes(p.idVm, p.principal, 'reducir plazo');

        // Con un abono mayor que una cuota de capital sí desaparecen cuotas.
        const g = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 2200000 } });
        const planG = await abonos.planificarPrestamo({ idVm: g.idVm, politica: 'reducir-plazo' });
        await abonos.aplicarPlan(planG, { origen: 'prueba' });
        const fg = await leer(g.idVm);
        const vivas = fg.filter((c) => num(c.valorCuotaVariable) > 0);
        comprobar('un abono de $1.421.333 elimina cuotas del final', vivas.length < 12, `quedaron ${vivas.length}`);
        comprobar('las cuotas eliminadas quedan marcadas como prepago',
            fg.filter((c) => num(c.valorCuotaVariable) === 0).every((c) => c.esPrepago));
        await invariantes(g.idVm, g.principal, 'abono grande con reducción de plazo');
    }

    // ── 7. Un abono que cancela el crédito ────────────────────────────
    console.log('\n7. Abono que cancela el crédito completo');
    {
        const p = await sembrar({ principal: 3000000, cuotas: 10, tasa: 0.015, pagos: { 1: 3100000 } });
        const plan = await abonos.planificarPrestamo({ idVm: p.idVm });
        comprobar('se acepta', plan.aplicable, plan.motivo);
        await abonos.aplicarPlan(plan, { origen: 'prueba' });
        const f = await leer(p.idVm);
        comprobar('el crédito queda cancelado', plan.cancelaElCredito);
        comprobar('las cuotas sobrantes quedan marcadas como prepago', f.slice(1).every((c) => c.esPrepago));
        comprobar('no queda saldo vivo', cerca(f[f.length - 1].saldoFinal, 0));
    }

    // ── 8. Reversión ──────────────────────────────────────────────────
    console.log('\n8. Reversión de un reajuste');
    {
        const p = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        const antes = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorInteresesAmortizados, c.valorCuotaVariable, c.saldoFinal]));
        const aplicado = await abonos.aplicarPlan(await abonos.planificarPrestamo({ idVm: p.idVm }), { origen: 'prueba' });
        const durante = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorInteresesAmortizados, c.valorCuotaVariable, c.saldoFinal]));
        comprobar('el reajuste cambió el cronograma', antes !== durante);
        const rev = await abonos.revertir(aplicado.registroId, { revertidoPor: 'prueba' });
        comprobar('la reversión se ejecuta', rev.ok, rev.motivo);
        const despues = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorInteresesAmortizados, c.valorCuotaVariable, c.saldoFinal]));
        comprobar('el cronograma vuelve exactamente a como estaba', antes === despues);
        const rev2 = await abonos.revertir(aplicado.registroId);
        comprobar('no se puede revertir dos veces', !rev2.ok);
    }

    // ── 9. El barrido en modo diagnóstico no escribe ──────────────────
    console.log('\n9. El barrido en modo diagnóstico no escribe nada');
    {
        const p = await sembrar({ principal: 7000000, cuotas: 12, tasa: 0.016, pagos: { 1: 1200000 } });
        const antes = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorCuotaVariable, c.saldoFinal]));
        const diag = await abonos.barrer({ aplicar: false });
        const despues = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorCuotaVariable, c.saldoFinal]));
        comprobar('el diagnóstico encuentra el préstamo', diag.pendientes.some((x) => x.idVm === p.idVm));
        comprobar('no modificó ninguna cifra', antes === despues);
    }


    // ── 10. Lo que encontraron los sondeos del auditor ────────────────
    console.log('\n10. Cronogramas que parecían sanos y no lo son');
    {
        // Una tasa distinta en una fila hacía que el reajuste impusiera a todo
        // el cronograma la tasa de la primera cuota. Medido: $367.200 que el
        // fondo dejaba de cobrar, o $331.552 de más al socio si se invertía.
        const mixta = await sembrar({
            principal: 8000000, cuotas: 12, tasa: 0.018,
            tasaPorFila: (i) => (i === 1 ? 0.010 : 0.018), pagos: { 1: 1000000 },
        });
        const p1 = await abonos.planificarPrestamo({ idVm: mixta.idVm });
        comprobar('un préstamo con tasas distintas entre filas se rechaza', !p1.aplicable, p1.motivo);

        // Una cuota marcada como pagada por debajo de su valor no es un abono:
        // es una deuda mayor que se repartía entre las cuotas siguientes,
        // subiéndolas, y con un aviso al socio que anunciaba ahorro NEGATIVO.
        const parcial = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000, 2: 200000 } });
        const p2 = await abonos.planificarPrestamo({ idVm: parcial.idVm });
        comprobar('una cuota pagada por debajo de su valor se rechaza', !p2.aplicable, p2.motivo);

        // DisbursedLoan.cuotas puede no coincidir con las filas reales. Dividir
        // por él daba el capital al doble y anulaba cuotas que el socio debía.
        const desfasado = await sembrar({
            principal: 6000000, cuotas: 12, tasa: 0.015, pagos: { 1: 700000 }, cuotasDeclaradas: 6,
        });
        const p3 = await abonos.planificarPrestamo({ idVm: desfasado.idVm, politica: 'reducir-plazo' });
        comprobar('el capital por cuota sale del cronograma, no de DisbursedLoan', p3.aplicable, p3.motivo);
        if (p3.aplicable) {
            await abonos.aplicarPlan(p3, { origen: 'prueba' });
            const f = await leer(desfasado.idVm);
            const vivas = f.filter((c) => num(c.valorCuotaVariable) > 0);
            comprobar('no se anulan cuotas que el socio sí debe', vivas.length >= 11, `quedaron ${vivas.length} de 12`);
            await invariantes(desfasado.idVm, desfasado.principal, 'cuotas declaradas desfasadas');
        }
    }

    console.log('\n11. Un reajuste revertido no se vuelve a aplicar solo');
    {
        const p = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        const hecho = await abonos.aplicarPlan(await abonos.planificarPrestamo({ idVm: p.idVm }), { origen: 'prueba' });
        const antes = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorCuotaVariable, c.saldoFinal]));
        await abonos.revertir(hecho.registroId, { revertidoPor: 'prueba' });
        const revertido = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorCuotaVariable, c.saldoFinal]));
        const barrido = await abonos.barrer({ aplicar: true, origen: 'prueba' });
        const tras = JSON.stringify((await leer(p.idVm)).map((c) => [c.saldoInicial, c.valorCuotaVariable, c.saldoFinal]));
        comprobar('el barrido automático respeta la reversión', revertido === tras && antes !== tras);
        comprobar('el barrido lo reporta como pendiente de decisión',
            barrido.bloqueados.some((b) => b.idVm === p.idVm));
        // Pero pedirlo a mano sí puede volver a aplicarlo.
        const manual = await abonos.planificarPrestamo({ idVm: p.idVm, respetarReversion: false });
        comprobar('pedido a mano, se puede volver a aplicar', manual.aplicable, manual.motivo);
    }

    console.log('\n12. Abono que deja sobrante a favor del socio');
    {
        const p = await sembrar({ principal: 3000000, cuotas: 10, tasa: 0.015, pagos: { 1: 3100000 } });
        const plan = await abonos.planificarPrestamo({ idVm: p.idVm });
        comprobar('el plan informa el sobrante a devolver', plan.resumen.sobrante > 0,
            `sobrante ${money(plan.resumen && plan.resumen.sobrante)}`);
        comprobar('el sobrante es lo pagado menos la deuda real',
            cerca(plan.resumen.sobrante, 3100000 - (3000000 + 45000), 1),
            `${money(plan.resumen.sobrante)}`);
        await abonos.aplicarPlan(plan, { origen: 'prueba' });
        const segunda = await abonos.barrer({ aplicar: false });
        comprobar('un crédito ya cancelado deja de reportarse cada noche',
            !segunda.pendientes.some((x) => x.idVm === p.idVm) && !segunda.bloqueados.some((x) => x.idVm === p.idVm));
    }


    console.log('\n13. La política se decide por préstamo, no por defecto ciego');
    {
        // Sin nada elegido, manda el defecto del fondo.
        const a = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        const p1 = await abonos.planificarPrestamo({ idVm: a.idVm });
        comprobar('sin preferencia se aplica reducir cuota', p1.politica === 'reducir-cuota' && p1.origenPolitica === 'defecto',
            `${p1.politica} · ${p1.origenPolitica}`);

        // Si el socio la fija, el barrido automático la respeta.
        const b = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        await abonos.guardarPolitica(b.idVm, 'reducir-plazo');
        const p2 = await abonos.planificarPrestamo({ idVm: b.idVm });
        comprobar('la preferencia guardada manda sobre el defecto',
            p2.politica === 'reducir-plazo' && p2.origenPolitica === 'preferencia', `${p2.politica} · ${p2.origenPolitica}`);
        const barrido = await abonos.barrer({ aplicar: true, origen: 'prueba' });
        const aplicadoB = barrido.aplicados.find((x) => x.idVm === b.idVm);
        comprobar('el barrido automático aplica la política del socio',
            aplicadoB && aplicadoB.politica === 'reducir-plazo', aplicadoB && aplicadoB.politica);

        // Elegirla al aplicar la deja registrada para los abonos siguientes.
        const c = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        await abonos.aplicarPlan(await abonos.planificarPrestamo({ idVm: c.idVm, politica: 'reducir-plazo' }), { origen: 'prueba' });
        const f = await leer(c.idVm);
        await f[1].update({ estado: 'Pago', valorCuotaPago: num(f[1].valorCuotaVariable) + 250000 });
        const p3 = await abonos.planificarPrestamo({ idVm: c.idVm });
        comprobar('un segundo abono hereda la política ya elegida',
            p3.politica === 'reducir-plazo' && p3.origenPolitica === 'preferencia', `${p3.politica} · ${p3.origenPolitica}`);
    }


    console.log('\n14. El caso real de producción: abono anotado en la cuota, no propagado');
    {
        // Cifras copiadas de la exportación de producción del préstamo SOL30.
        // El formulario de pagos calcula saldoFinal = saldoInicial + intereses −
        // pagado mientras el administrador escribe, así que la cuota 1 quedó en
        // $7.112.000 mientras la cuota 2 seguía arrancando en $7.333.333.
        const socio = await Client.create({ name: 'Prod', apellido1: 'Real', cedula: '65772720',
            customerId: '9999', email: 'prod@t.local', password: 'x', role: 'user', estatus: 'Activo' });
        await DisbursedLoan.create({ idVm: 'SOL30', clientId: socio.id, valorPrestado: 8000000, cuotas: 12,
            interesMensual: 0.014, estado: 'Vigente', fechaPrestamo: `${ANIO}-07-23`, mesDesembolso: 'Julio', anioDesembolso: ANIO });
        const crudas = [
            [8000000, 112000, 778666.67, 1000000, 7112000, 'Pago'],
            [7333333, 102667, 769333, 0, 6666667, 'Pendiente'],
            [6666667, 93333, 760000, 0, 6000000, 'Pendiente'],
            [6000000, 84000, 750667, 0, 5333333, 'Pendiente'],
            [5333333, 74667, 741333, 0, 4666667, 'Pendiente'],
            [4666667, 65333, 732000, 0, 4000000, 'Pendiente'],
            [4000000, 56000, 722667, 0, 3333333, 'Pendiente'],
            [3333333, 46667, 713333, 0, 2666667, 'Pendiente'],
            [2666667, 37333, 704000, 0, 2000000, 'Pendiente'],
            [2000000, 28000, 694667, 0, 1333333, 'Pendiente'],
            [1333333, 18667, 685333, 0, 666667, 'Pendiente'],
            [666667, 9333, 676000, 0, 0, 'Pendiente'],
        ];
        await LoanPayment.bulkCreate(crudas.map(([si, int, cv, vp, sf, est], i) => ({
            externalId: `P2${String(i + 1).padStart(2, '0')}`, clientId: socio.id, idVm: 'SOL30',
            saldoInicial: si, cuotasPrestamo: 12, interesMensual: 0.014, valorInteresesAmortizados: int,
            fechaPagoMax: `${ANIO}-${String(Math.min(12, i + 8)).padStart(2, '0')}-${String(10 + i).padStart(2, '0')}`,
            valorCuotaVariable: cv, estado: est, valorCuotaPago: vp, saldoFinal: sf,
            itemQuantity: i + 1, estadoPrestamo: 'Vigente',
        })));

        const plan = await abonos.planificarPrestamo({ idVm: 'SOL30' });
        comprobar('el abono se detecta pese a estar ya anotado en la cuota pagada', plan.aplicable, plan.motivo);
        comprobar('NO se da el préstamo por al día', !plan.yaAlDia);
        if (plan.aplicable) {
            await abonos.aplicarPlan(plan, { origen: 'prueba' });
            const f = await leer('SOL30');
            comprobar('la cuota 2 arranca en el saldo ya rebajado', cerca(f[1].saldoInicial, 7112000),
                `arranca en ${money(f[1].saldoInicial)}`);
            comprobar('la cuota 2 baja de $769.333 a $746.113,45', cerca(f[1].valorCuotaVariable, 746113.45),
                `quedó en ${money(f[1].valorCuotaVariable)}`);
            comprobar('el ahorro para la socia es $18.592', cerca(plan.resumen.ahorroInteres, 18592),
                money(plan.resumen.ahorroInteres));
            await invariantes('SOL30', 8000000, 'caso de producción');
        }
    }

    console.log('\n15. La tolerancia al corte no debilita la guarda');
    {
        // Un corte del mismo tamaño pero SIN excedente que lo justifique sigue
        // invalidando el cronograma: es una cifra que no cuadra, no un abono.
        const p = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        const f = await leer(p.idVm);
        await f[4].update({ saldoFinal: num(f[4].saldoFinal) - 221333 });
        const d = analizarCronograma(await leer(p.idVm));
        comprobar('un corte sin abono detrás sigue invalidando el cronograma', !d.encadenado);

        // Y un corte de tamaño distinto al excedente tampoco se admite.
        const q = await sembrar({ principal: 8000000, cuotas: 12, tasa: 0.014, pagos: { 1: 1000000 } });
        const g = await leer(q.idVm);
        await g[0].update({ saldoFinal: num(g[0].saldoFinal) - 500000 });
        const d2 = analizarCronograma(await leer(q.idVm));
        comprobar('un corte que no vale el excedente tampoco se admite', !d2.encadenado);
    }

    console.log(`\n──────────────────────────────────────────────\n${ok} comprobaciones correctas · ${fallos} fallidas\n`);
    await sequelize.close();
    try { fs.unlinkSync(RUTA); } catch { /* la base temporal ya no importa */ }
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
