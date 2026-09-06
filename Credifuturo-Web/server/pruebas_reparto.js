/**
 * Banco de pruebas del reparto de utilidades — services/reparto.js
 *
 * Solo aritmética: no toca base de datos ni levanta servidor, así que corre en
 * milisegundos y se puede lanzar en cualquier momento.
 *
 *     node server/pruebas_reparto.js
 *
 * Los casos están escritos con las cifras del fondo (cuotas de cientos de miles,
 * capitales de millones) y comparan, cuando aplica, contra lo que daba el método
 * anterior, para que el efecto de cada corrección quede en un número y no en una
 * afirmación.
 */
const {
    diaUTC, fechaValorDe, pesoDeMes, construirPeriodo, ponderarSocio, resolverBase, repartir,
} = require('./services/reparto');

let ok = 0, fallos = 0;
const seccion = (t) => console.log(`\n\x1b[1m── ${t} ${'─'.repeat(Math.max(0, 66 - t.length))}\x1b[0m`);
const peso = (n) => `$${Math.round(n).toLocaleString('es-CO')}`;

function afirmar(nombre, real, esperado, tolerancia = 0) {
    const bien = typeof esperado === 'number'
        ? Math.abs(real - esperado) <= tolerancia
        : JSON.stringify(real) === JSON.stringify(esperado);
    if (bien) { ok++; console.log(`  \x1b[32m✓\x1b[0m ${nombre}`); }
    else {
        fallos++;
        console.log(`  \x1b[31m✗ ${nombre}\x1b[0m`);
        console.log(`      esperado: ${typeof esperado === 'number' ? peso(esperado) : JSON.stringify(esperado)}`);
        console.log(`      obtenido: ${typeof real === 'number' ? peso(real) : JSON.stringify(real)}`);
    }
}
const cierto = (nombre, cond) => afirmar(nombre, !!cond, true);

// El método que había antes de todo esto: ponderaba por el mes ACREDITADO, sin
// mirar nunca la fecha en que el socio consignó.
const metodoViejo = (movs) => movs.reduce((s, m) => s + m.valor * (Math.max(12 - m.mesAbonado + 1, 1) / 12), 0);

const P = construirPeriodo(2025, '2026-03-01');   // año cerrado
const CUOTA = 200000;
const docenaEn = (fechaPago) =>
    Array.from({ length: 12 }, (_, i) => ({ valor: CUOTA, date: fechaPago, mesAbonado: i + 1, anioAbonado: 2025 }));

// ─────────────────────────────────────────────────────────────────────────────
seccion('1. El peso de cada mes');

afirmar('enero pesa el año completo', pesoDeMes(1), 1);
afirmar('julio, la mitad exacta', pesoDeMes(7), 0.5);
afirmar('diciembre, un mes de doce', pesoDeMes(12), 1 / 12);
afirmar('lo que venía de antes del año pesa completo', pesoDeMes(0), 1);
afirmar('un mes fuera del año no pesa', pesoDeMes(13), 0);
// El mes de entrada cuenta: julio trabaja de julio a diciembre, seis meses.
afirmar('los pesos de los doce meses suman 6,5',
    Array.from({ length: 12 }, (_, i) => pesoDeMes(i + 1)).reduce((a, b) => a + b, 0), 6.5, 1e-9);

seccion('2. El período');

afirmar('el año se pondera siempre sobre doce meses', P.meses, 12);
cierto('un año pasado está cerrado', P.cerrado);
cierto('el año en curso no', !construirPeriodo(2026, '2026-09-06').cerrado);
afirmar('y se sabe por qué mes va', construirPeriodo(2026, '2026-09-06').mesActual, 9);
afirmar('el corte se informa para la pantalla', construirPeriodo(2026, '2026-09-06').corte, '2026-09-06');

seccion('3. Qué fecha se usa, y de dónde sale');

afirmar('la fecha de pago manda', fechaValorDe({ date: '2025-01-15', mesAbonado: 7, anioAbonado: 2025 }).origen, 'pago');
afirmar('sin fecha de pago se cae al período acreditado',
    fechaValorDe({ date: null, mesAbonado: 7, anioAbonado: 2025 }).fecha.toISOString().slice(0, 10), '2025-07-15');
afirmar('y queda marcado como estimado', fechaValorDe({ date: null, mesAbonado: 7, anioAbonado: 2025 }).origen, 'periodo');
afirmar('sin nada utilizable, no se inventa una fecha', fechaValorDe({ date: null }).fecha, null);
afirmar('un 31 de febrero no se acepta en silencio', diaUTC('2025-02-31'), null);
// year/monthInt jamás se leen: el par es incoherente según quién creó la fila.
afirmar('year/monthInt se ignoran aunque vengan',
    fechaValorDe({ date: null, year: 2020, monthInt: 3, mesAbonado: 7, anioAbonado: 2025 }).fecha.toISOString().slice(0, 10),
    '2025-07-15');

// ─────────────────────────────────────────────────────────────────────────────
seccion('4. El socio que paga el año entero en enero');

const enEnero = docenaEn('2025-01-15');
const aEnero = ponderarSocio(enEnero, P);
afirmar('sus doce cuotas pesan el año completo, porque el dinero entró en enero',
    aEnero.capitalPonderado, 12 * CUOTA, 1);
afirmar('el método anterior le reconocía mucho menos', metodoViejo(enEnero), 1300000, 1);
cierto('la corrección lo favorece en más de un millón', aEnero.capitalPonderado - metodoViejo(enEnero) > 1000000);
afirmar('todo su aporte cae en el renglón de enero', aEnero.porMes[1].aportado, 12 * CUOTA);
afirmar('con peso 100%', aEnero.porMes[1].peso, 1);

seccion('5. El socio que paga puntual, mes a mes');

const mesAMes = Array.from({ length: 12 }, (_, i) => ({
    valor: CUOTA, date: `2025-${String(i + 1).padStart(2, '0')}-05`, mesAbonado: i + 1, anioAbonado: 2025,
}));
const aMesAMes = ponderarSocio(mesAMes, P);
afirmar('cada cuota pesa según su mes: la suma es 6,5 cuotas', aMesAMes.capitalPonderado, CUOTA * 6.5, 1);
// Este es el hallazgo que motivó el rediseño: el método anterior no miraba la
// fecha de pago, así que a estos dos socios —que movieron su dinero de forma
// completamente distinta— les daba exactamente el mismo peso.
afirmar('el método anterior le daba lo mismo que al que pagó todo en enero',
    metodoViejo(mesAMes), metodoViejo(enEnero), 1);
cierto('ahora el de enero pesa casi el doble', aEnero.capitalPonderado > aMesAMes.capitalPonderado * 1.8);
afirmar('la cuota de julio pesa exactamente la mitad', aMesAMes.porMes[7].peso, 0.5);
afirmar('y aporta la mitad de su valor', aMesAMes.porMes[7].ponderado, CUOTA / 2);

seccion('6. El socio que se atrasa');

const tarde = Array.from({ length: 12 }, (_, i) => ({ valor: CUOTA, date: '2025-12-20', mesAbonado: i + 1, anioAbonado: 2025 }));
const aTarde = ponderarSocio(tarde, P);
afirmar('paga lo mismo pero su dinero solo alcanza a trabajar diciembre',
    aTarde.capitalPonderado, 12 * CUOTA / 12, 1);
afirmar('el método anterior le reconocía lo mismo que al puntual', metodoViejo(tarde), metodoViejo(enEnero), 1);
cierto('ahora pesa una fracción del que pagó en enero', aTarde.capitalPonderado < aEnero.capitalPonderado * 0.1);

seccion('7. El aporte inicial cuenta como capital');

// El aporte de ingreso también está en el fondo prestándose. Se pondera igual
// que cualquier otro capital, por el mes en que entró.
const conAporteInicial = ponderarSocio([
    { valor: 1000000, date: '2025-01-05', mesAbonado: 1, anioAbonado: 2025, esAporteInicial: true },
    { valor: CUOTA, date: '2025-07-05', mesAbonado: 7, anioAbonado: 2025 },
], P);
afirmar('el aporte inicial de enero pesa completo, y la cuota de julio la mitad',
    conAporteInicial.capitalPonderado, 1000000 + CUOTA * 0.5, 1);

seccion('8. Los ahorros de años anteriores');

const previo = { valor: 5000000, date: '2023-06-10', mesAbonado: 6, anioAbonado: 2023 };

const conservo = ponderarSocio([previo], P);
afirmar('quien no retiró conserva el capital completo con peso 100%', conservo.capitalPonderado, 5000000);
afirmar('y queda registrado como capital de apertura', conservo.capitalApertura, 5000000);
afirmar('todo ese capital es permanente', conservo.aperturaPermanente, 5000000);

// Retiro TOTAL en marzo: el dinero trabajó enero, febrero y marzo.
const retiroTotal = ponderarSocio([
    previo,
    { valor: -5000000, date: '2025-03-31', mesAbonado: 3, anioAbonado: 2025, status: 'Devolucion Total Intereses' },
], P);
afirmar('un retiro total en marzo descuenta con el peso de marzo (10/12)',
    retiroTotal.capitalPonderado, 5000000 - 5000000 * (10 / 12), 1);
cierto('el retiro NO borra los meses en que ese dinero sí trabajó', retiroTotal.capitalPonderado > 0);
afirmar('y no queda nada permanente que premiar', retiroTotal.aperturaPermanente, 0);

// Retiro PARCIAL: la misma regla, sin un caso aparte.
const retiroParcial = ponderarSocio([
    previo,
    { valor: -2000000, date: '2025-03-31', mesAbonado: 3, anioAbonado: 2025, status: 'Devolucion Parcial' },
], P);
afirmar('un retiro parcial descuenta solo lo retirado, con el peso de su mes',
    retiroParcial.capitalPonderado, 5000000 - 2000000 * (10 / 12), 1);
afirmar('y lo que quedó sigue contando como permanente', retiroParcial.aperturaPermanente, 3000000);
cierto('quien retiró parcialmente pesa más que quien retiró todo',
    retiroParcial.capitalPonderado > retiroTotal.capitalPonderado);
cierto('y menos que quien no retiró nada', retiroParcial.capitalPonderado < conservo.capitalPonderado);

seccion('9. Las cuotas adelantadas del año anterior');

// Paga en diciembre de 2024 las cuotas de enero y febrero de 2025. Ese dinero
// estaba en el fondo el 1 de enero: es capital de apertura, no un abono del año.
const adelantadas = [
    { valor: CUOTA, date: '2024-12-20', mesAbonado: 1, anioAbonado: 2025 },
    { valor: CUOTA, date: '2024-12-20', mesAbonado: 2, anioAbonado: 2025 },
];
const aAdelanto = ponderarSocio(adelantadas, P);
afirmar('cuentan como capital de apertura', aAdelanto.capitalApertura, 2 * CUOTA);
afirmar('y pesan el año completo', aAdelanto.capitalPonderado, 2 * CUOTA);
afirmar('el método anterior las ponderaba por el mes acreditado',
    metodoViejo(adelantadas), CUOTA * (12 / 12 + 11 / 12), 1);

seccion('10. El premio por permanencia (decisión de la Junta)');

afirmar('con factor 1 el reparto es puro capital ponderado', resolverBase(conservo, 1).base, conservo.capitalPonderado, 1);
afirmar('y no hay premio', resolverBase(conservo, 1).premioPermanencia, 0);
afirmar('con factor 1,25 quien conservó suma un 25% de su capital permanente',
    resolverBase(conservo, 1.25).base, 5000000 * 1.25, 1);
afirmar('quien retiró todo no recibe premio',
    resolverBase(retiroTotal, 1.25).base, resolverBase(retiroTotal, 1).base, 1);
afirmar('quien retiró parcialmente lo recibe solo sobre lo que dejó',
    resolverBase(retiroParcial, 1.25).premioPermanencia, 3000000 * 0.25, 1);
cierto('el premio nunca toca el ahorro nuevo del año',
    resolverBase(aEnero, 1.25).base === aEnero.capitalPonderado);
afirmar('un factor por debajo de 1 no castiga a nadie: se ignora', resolverBase(conservo, 0.5).factorAplicado, 1);

seccion('11. El reparto cuadra al peso');

const GANANCIA = 7_350_000;
const bases = [aEnero, aMesAMes, aTarde, conservo, retiroParcial].map(a => resolverBase(a, 1.25).base);
const cuotas = repartir(bases, GANANCIA);
afirmar('lo repartido suma exactamente la ganancia del fondo',
    cuotas.reduce((s, c) => s + c.utilidad, 0), GANANCIA);
afirmar('las participaciones suman 100%',
    Number(cuotas.reduce((s, c) => s + c.participacion, 0).toFixed(10)), 1);
cierto('nadie recibe un importe fraccionario', cuotas.every(c => Number.isInteger(c.utilidad)));

// El caso que rompe un reparto ingenuo: tres partes iguales de un monto que no
// divide en tres. Con Math.round por separado sobra o falta un peso.
const tercios = repartir([1, 1, 1], 100);
afirmar('tres partes iguales de 100 siguen sumando 100', tercios.reduce((s, c) => s + c.utilidad, 0), 100);
afirmar('y el peso sobrante va a uno solo', tercios.map(c => c.utilidad).sort().join(','), '33,33,34');

seccion('12. Los casos que no deben tumbar el cálculo');

afirmar('sin bases, no hay reparto', repartir([], 1000000), []);
afirmar('con todas las bases en cero no se reparte nada',
    repartir([0, 0], 1000000).reduce((s, c) => s + c.utilidad, 0), 0);
afirmar('sin ganancia que repartir tampoco',
    repartir([100, 200], 0).reduce((s, c) => s + c.utilidad, 0), 0);
afirmar('un socio sin movimientos pesa cero', ponderarSocio([], P).capitalPonderado, 0);

// Más devuelto que ahorrado antes del año: dato mal registrado.
const negativo = ponderarSocio([
    { valor: 1000000, date: '2023-05-01' },
    { valor: -3000000, date: '2023-09-01' },
], P);
afirmar('un capital de apertura negativo se protege en cero', negativo.capitalApertura, 0);
afirmar('no arrastra el capital ponderado a negativo', negativo.capitalPonderado, 0);
afirmar('pero el valor real queda registrado para poder revisarlo', negativo.capitalAperturaCrudo, -2000000);
afirmar('y la base nunca sale negativa', resolverBase(negativo, 1.25).base, 0);

const futuro = ponderarSocio([{ valor: CUOTA, date: '2026-05-01', mesAbonado: 5, anioAbonado: 2026 }], P);
afirmar('un abono posterior al año no pesa', futuro.capitalPonderado, 0);
cierto('pero aparece en el detalle, para que el socio vea que llegó', futuro.detalle.length === 1);

const sinFecha = ponderarSocio([{ valor: CUOTA, date: null, mesAbonado: null, anioAbonado: null }], P);
afirmar('un movimiento sin fecha utilizable no se pondera', sinFecha.capitalPonderado, 0);
afirmar('y se cuenta aparte para poder reportarlo', sinFecha.conteoOrigen.sin, 1);
afirmar('el conteo de orígenes cuadra con los movimientos', aEnero.conteoOrigen, { pago: 12, periodo: 0, sin: 0 });

seccion('13. El capital sin ponderar, para poder juzgar el ponderado');

// Una cifra ponderada sola no se puede leer: no dice si es mucho dinero que
// llegó tarde o poco que llegó temprano. Al lado del capital sin ponderar, sí.
afirmar('quien pagó todo en enero puso 2,4 millones', aEnero.capitalBase, 12 * CUOTA);
afirmar('y le contaron los 2,4 completos', aEnero.capitalPonderado, 12 * CUOTA, 1);
afirmar('su peso efectivo es del 100%', aEnero.pesoEfectivo, 1, 1e-9);

afirmar('quien pagó lo mismo en diciembre puso exactamente igual', aTarde.capitalBase, 12 * CUOTA);
afirmar('pero solo le cuenta la doceava parte', aTarde.pesoEfectivo, 1 / 12, 1e-9);
cierto('los dos capitales son iguales y los pesos efectivos no',
    aEnero.capitalBase === aTarde.capitalBase && aEnero.pesoEfectivo !== aTarde.pesoEfectivo);

afirmar('el puntual mes a mes queda en un 54%', aMesAMes.pesoEfectivo, 6.5 / 12, 1e-9);

// Un retiro baja el peso efectivo sin tocar el capital que el socio puso: es
// justo lo que hace falta ver para entender por qué le corresponde menos.
afirmar('quien conservó su capital tiene peso efectivo del 100%', conservo.pesoEfectivo, 1, 1e-9);
cierto('quien retiró en marzo baja de la mitad', retiroTotal.pesoEfectivo < 0.5);
cierto('y quien retiró parcialmente queda en medio',
    retiroParcial.pesoEfectivo > retiroTotal.pesoEfectivo && retiroParcial.pesoEfectivo < conservo.pesoEfectivo);
afirmar('el capital sin ponderar no cambia por retirar', retiroTotal.capitalBase, conservo.capitalBase);

afirmar('un socio sin movimientos no divide por cero', ponderarSocio([], P).pesoEfectivo, 0);
cierto('el peso efectivo nunca pasa del 100%',
    [aEnero, aMesAMes, aTarde, conservo, retiroTotal, retiroParcial, aAdelanto, conAporteInicial]
        .every(a => a.pesoEfectivo >= 0 && a.pesoEfectivo <= 1));

seccion('14. El desglose por mes que ve el socio');

const mixto = ponderarSocio([
    previo,
    { valor: 300000, date: '2025-02-10', mesAbonado: 2, anioAbonado: 2025 },
    { valor: 300000, date: '2025-07-10', mesAbonado: 7, anioAbonado: 2025 },
    { valor: -1000000, date: '2025-10-05', mesAbonado: 10, anioAbonado: 2025, status: 'Devolucion Parcial' },
], P);
afirmar('el capital de años anteriores va al renglón 0', mixto.porMes[0].aportado, 5000000);
afirmar('febrero pesa 11/12', mixto.porMes[2].peso, 11 / 12, 1e-9);
afirmar('y aporta su importe por ese peso', mixto.porMes[2].ponderado, 300000 * (11 / 12), 1);
afirmar('julio pesa la mitad', mixto.porMes[7].ponderado, 150000, 1);
afirmar('el retiro de octubre entra como retirado, no como aporte', mixto.porMes[10].retirado, -1000000);
afirmar('y descuenta con el peso de octubre (3/12)', mixto.porMes[10].ponderado, -1000000 * 0.25, 1);
afirmar('la suma de los renglones es el capital ponderado',
    mixto.porMes.reduce((s, f) => s + f.ponderado, 0), mixto.capitalPonderado, 1);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1m${'═'.repeat(70)}\x1b[0m`);
console.log(fallos === 0
    ? `\x1b[32m\x1b[1m  ${ok}/${ok} comprobaciones correctas.\x1b[0m`
    : `\x1b[31m\x1b[1m  ${fallos} fallo(s) de ${ok + fallos}.\x1b[0m`);
console.log(`\x1b[1m${'═'.repeat(70)}\x1b[0m\n`);
process.exit(fallos === 0 ? 0 : 1);
