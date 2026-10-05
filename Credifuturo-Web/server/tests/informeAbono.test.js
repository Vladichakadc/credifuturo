/**
 * Pruebas del informe que recibe el socio cuando abona a capital.
 *
 *     npm test            (desde Credifuturo-Web/server)
 *
 * No tocan la base de datos: arman el plan con la misma aritmética que la
 * aplicación y leen el documento que saldría. Nacen de un informe real que
 * decía "$510.220 abonado a capital + $22.244 de intereses ahorrados = $311.131
 * menos por pagar": la primera cifra era el acumulado del crédito, y el
 * documento se contradecía solo.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { planificarReajuste, abonosSinAplicar, ordenarCuotas, REDUCIR_CUOTA } = require('../services/amortizacion');
const { construirMarkdown, resumenDelInforme, nombreArchivo, tituloDe } = require('../services/informeAbono');

const r2 = (n) => parseFloat(Number(n).toFixed(2));
const COLUMNAS = ['saldoInicial', 'valorInteresesAmortizados', 'valorCuotaVariable', 'saldoFinal'];

function cronograma({ principal, cuotas, tasa }) {
    const capital = principal / cuotas;
    const filas = [];
    let saldo = principal;
    for (let i = 1; i <= cuotas; i++) {
        const interes = r2(saldo * tasa);
        const saldoFinal = i === cuotas ? 0 : r2(saldo - capital);
        filas.push({
            id: i, externalId: `P2${String(i).padStart(2, '0')}`, itemQuantity: i, estado: 'Pendiente', esPrepago: false,
            fechaPagoMax: `2026-${String(Math.min(12, i + 7)).padStart(2, '0')}-10`, interesMensual: tasa,
            saldoInicial: r2(saldo), valorInteresesAmortizados: interes,
            valorCuotaVariable: r2(saldo - saldoFinal + interes), valorCuotaPago: 0, saldoFinal,
        });
        saldo = saldoFinal;
    }
    return filas;
}

/** Como lo deja el formulario de pagos: rebaja el saldo final de la cuota mientras se escribe el importe. */
function pagarPorFormulario(filas, numero, pagado) {
    const c = filas.find((f) => f.itemQuantity === numero);
    c.estado = 'Pago';
    c.valorCuotaPago = pagado;
    c.saldoFinal = Math.max(0, Math.round(c.saldoInicial + c.valorInteresesAmortizados - pagado));
}

/** El plan tal como lo arma `planificarPrestamo`, sin la base de datos. */
function planDe(filas) {
    const orden = ordenarCuotas(filas);
    const sinAplicar = abonosSinAplicar(orden);
    const plan = planificarReajuste({ cuotas: orden, politica: REDUCIR_CUOTA });
    assert.equal(plan.ok, true, plan.motivo);
    const previas = new Set();
    for (const f of orden) { if (f.id === sinAplicar[0].cuota.id) break; previas.add(f.id); }
    const cambios = plan.filas.filter((n) => !previas.has(n.id)).map((nueva) => {
        const original = orden.find((f) => f.id === nueva.id);
        const antes = {}; const despues = {};
        for (const col of COLUMNAS) { antes[col] = Number(original[col]); despues[col] = Number(nueva[col]); }
        return {
            id: nueva.id, cuota: original.externalId, itemQuantity: original.itemQuantity, estado: original.estado,
            antes, despues, difiere: COLUMNAS.some((c) => Math.abs(antes[c] - despues[c]) > 0.005),
            cancelar: Boolean(nueva.sobra),
        };
    }).filter((c) => c.difiere || c.cancelar);
    return {
        idVm: 'SOL30', politica: REDUCIR_CUOTA, resumen: plan.resumen, cambios, filasNuevas: plan.filas,
        abonos: sinAplicar.map((x) => ({
            id: x.cuota.id, cuota: x.cuota.externalId, numero: x.cuota.itemQuantity,
            pagado: x.cuota.valorCuotaPago, valorCuota: x.cuota.valorCuotaVariable, excedente: x.excedente,
        })),
    };
}

function aplicar(filas, plan) {
    for (const nueva of plan.filasNuevas) {
        const f = filas.find((x) => x.id === nueva.id);
        for (const col of COLUMNAS) f[col] = nueva[col];
    }
}

const aNumero = (texto) => Number(String(texto).replace(/[$.]/g, ''));

/** Toda igualdad "> $a … + $b … = $c …" del documento tiene que ser cierta. */
function igualdadesDe(md) {
    return md.split('\n').filter((l) => l.startsWith('> ')).map((linea) => {
        const [izquierda, derecha] = linea.slice(2).split(' = ');
        let suma = 0; let signo = 1;
        for (const parte of izquierda.split(/( [+−] )/)) {
            if (parte === ' + ') { signo = 1; continue; }
            if (parte === ' − ') { signo = -1; continue; }
            suma += signo * aNumero(parte.match(/\$[\d.]+/)[0]);
        }
        return { linea, suma, total: aNumero(derecha.match(/\$[\d.]+/)[0]) };
    });
}

const socia = { name: 'Gimena', surname1: 'Tascon', cedula: '1' };
// Las 21:20 del 4 de octubre en Colombia son las 02:20 del 5 en UTC, que es el
// reloj del contenedor de producción.
const NOCHE_DEL_4 = new Date('2026-10-05T02:20:16.731Z');

/** El caso de SOL30: primer abono ya aplicado, y la cuota 2 pagada con $1.035.000. */
function casoSOL30() {
    const filas = cronograma({ principal: 8000000, cuotas: 12, tasa: 0.014 });
    pagarPorFormulario(filas, 1, 1000000);
    const primero = planDe(filas);
    aplicar(filas, primero);
    pagarPorFormulario(filas, 2, 1035000);
    return { filas, primero, segundo: planDe(filas) };
}

test('el informe del segundo abono habla de ese pago: $288.887, no $510.220', () => {
    const { segundo } = casoSOL30();
    const md = construirMarkdown({ plan: segundo, socio: socia, idVm: 'SOL30', fecha: NOCHE_DEL_4 });

    assert.match(md, /pagaste \*\*\$1\.035\.000\*\* y la cuota era de \*\*\$746\.113\*\*/);
    assert.match(md, /son \*\*\$288\.887\*\* por encima/);
    assert.match(md, /\| Abonaste a capital con este pago \| \*\*\$288\.887\*\* \|/);
    assert.match(md, /\| Tu cuota bajó \| \*\*\$32\.933\*\* cada mes \|/);
    assert.match(md, /\| Te ahorraste en intereses \| \*\*\$22\.244\*\* \|/);

    // El acumulado aparece UNA vez, en su propia línea y llamado por su nombre.
    const conAcumulado = md.split('\n').filter((l) => l.includes('$510.220'));
    assert.equal(conAcumulado.length, 1, conAcumulado.join(' / '));
    assert.match(conAcumulado[0], /llevas abonado a capital en el crédito/);
});

test('la comprobación del informe cierra', () => {
    const { primero, segundo } = casoSOL30();
    for (const plan of [primero, segundo]) {
        const md = construirMarkdown({ plan, socio: socia, idVm: 'SOL30', fecha: NOCHE_DEL_4 });
        const igualdades = igualdadesDe(md);
        assert.equal(igualdades.length, 1, 'el informe lleva una igualdad');
        assert.equal(igualdades[0].suma, igualdades[0].total, igualdades[0].linea);
    }
    const md = construirMarkdown({ plan: segundo, socio: socia, idVm: 'SOL30', fecha: NOCHE_DEL_4 });
    assert.match(md, /> \$288\.887 abonado a capital \+ \$22\.244 de intereses ahorrados = \$311\.131 menos por pagar/);
});

test('el primer abono no menciona un acumulado: es lo mismo que lo abonado', () => {
    const { primero } = casoSOL30();
    const md = construirMarkdown({ plan: primero, socio: socia, idVm: 'SOL30', fecha: NOCHE_DEL_4 });
    assert.match(md, /\| Abonaste a capital con este pago \| \*\*\$221\.333\*\* \|/);
    assert.doesNotMatch(md, /llevas abonado/);
});

test('la fecha es la de Colombia, en el encabezado y en el nombre del archivo', () => {
    const { segundo } = casoSOL30();
    const md = construirMarkdown({ plan: segundo, socio: socia, idVm: 'SOL30', fecha: NOCHE_DEL_4 });
    assert.match(md, /\*\*Gimena Tascon\*\* · 4 de octubre de 2026/);
    assert.equal(nombreArchivo('SOL30', NOCHE_DEL_4, 2), 'Abono_SOL30_cuota2_2026-10-04.md');
});

test('dos abonos del mismo crédito el mismo día no comparten archivo ni título', () => {
    const { primero, segundo } = casoSOL30();
    assert.notEqual(
        nombreArchivo('SOL30', NOCHE_DEL_4, primero.abonos[0].numero),
        nombreArchivo('SOL30', NOCHE_DEL_4, segundo.abonos[0].numero),
    );
    assert.equal(tituloDe('SOL30', primero), 'Tu abono a capital — crédito SOL30, cuota 1');
    assert.equal(tituloDe('SOL30', segundo), 'Tu abono a capital — crédito SOL30, cuota 2');
});

test('la tarjeta de la lista lleva lo de este abono, y el acumulado aparte', () => {
    const { segundo } = casoSOL30();
    assert.deepEqual(resumenDelInforme(segundo), { excedente: 288887, acumulado: 510220, ahorroInteres: 22244, bajaMensual: 32933 });
});

test('con cuotas pagadas después del abono, el interés reconocido entra en la cuenta', () => {
    // El abono no pasó por el formulario y se pagaron dos cuotas más por su
    // valor. La cuota abonada y esas dos entran en los cambios del plan —se les
    // corrige el saldo—, pero no en la tabla: su valor no se mueve.
    const filas = cronograma({ principal: 8000000, cuotas: 12, tasa: 0.014 });
    filas[0].estado = 'Pago'; filas[0].valorCuotaPago = 1000000;
    for (const n of [2, 3]) { filas[n - 1].estado = 'Pago'; filas[n - 1].valorCuotaPago = filas[n - 1].valorCuotaVariable; }
    const plan = planDe(filas);
    assert.ok(plan.resumen.interesReintegrado > 0);
    assert.ok(plan.cambios.some((c) => c.estado === 'Pago'), 'el plan toca cuotas ya pagadas');

    const md = construirMarkdown({ plan, socio: socia, idVm: 'SOL30', fecha: NOCHE_DEL_4 });
    assert.match(md, /Intereses ya pagados que se te reconocen como capital/);
    const igualdades = igualdadesDe(md);
    assert.equal(igualdades.length, 1);
    assert.ok(Math.abs(igualdades[0].suma - igualdades[0].total) <= 1, igualdades[0].linea);
    // Ninguna cuota ya pagada en la tabla, y la baja mensual no es cero.
    assert.doesNotMatch(md, /\| 1 \| P201 \|/);
    assert.doesNotMatch(md, /\| 3 \| P203 \|/);
    assert.match(md, /\| 4 \| P204 \|/);
    assert.ok(resumenDelInforme(plan).bajaMensual > 0);
});

test('si las cifras del plan no cierran, el informe no afirma la igualdad', () => {
    const { segundo } = casoSOL30();
    // Un plan con el acumulado donde va el abono: el defecto original.
    const roto = { ...segundo, abonos: [], resumen: { ...segundo.resumen, excedente: 510219.88 } };
    const original = console.warn;
    console.warn = () => { };
    let md;
    try { md = construirMarkdown({ plan: roto, socio: socia, idVm: 'SOL30', fecha: NOCHE_DEL_4 }); } finally { console.warn = original; }
    assert.equal(igualdadesDe(md).length, 0);
});
