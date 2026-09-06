/**
 * Banco de pruebas del reparto de utilidades — services/reparto.js
 *
 * Solo aritmética: no toca base de datos ni levanta servidor, así que corre en
 * milisegundos y se puede lanzar en cualquier momento.
 *
 *     node server/pruebas_reparto.js
 *
 * Los casos están escritos con las cifras del fondo (cuotas de cientos de miles,
 * saldos de millones) y comparan, cuando aplica, contra lo que daba el método
 * anterior, para que el efecto de cada corrección quede en un número y no en
 * una afirmación.
 */
const {
    diaUTC, fechaValorDe, construirPeriodo, ponderarSocio, resolverBase, repartir,
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

// El método anterior, tal como estaba en calcSaldoPromedio: pondera por el mes
// ACREDITADO, con granularidad de mes y sin mirar nunca la fecha de pago.
const metodoAnterior = (movs) => movs.reduce((s, m) => s + m.valor * (Math.max(12 - m.mesAbonado + 1, 1) / 12), 0);

const P2025 = construirPeriodo(2025, '2026-03-01');   // año cerrado
const CUOTA = 200000;
const mensualidades = (fechaPago, anio = 2025) =>
    Array.from({ length: 12 }, (_, i) => ({ valor: CUOTA, date: fechaPago, mesAbonado: i + 1, anioAbonado: anio }));

// ─────────────────────────────────────────────────────────────────────────────
seccion('1. El período');

afirmar('un año cerrado dura 365 días', P2025.dias, 365);
cierto('y se marca como cerrado', P2025.cerrado);
afirmar('2024 fue bisiesto: 366 días', construirPeriodo(2024, '2026-01-01').dias, 366);
afirmar('el año en curso corta HOY, no el 31 de diciembre',
    construirPeriodo(2026, '2026-03-01').dias, 31 + 28 + 1);
cierto('y no se marca como cerrado', !construirPeriodo(2026, '2026-03-01').cerrado);
afirmar('el primer día del año ya es un período de un día, no de cero',
    construirPeriodo(2026, '2026-01-01').dias, 1);

// ─────────────────────────────────────────────────────────────────────────────
seccion('2. Qué fecha se usa, y de dónde sale');

afirmar('la fecha de pago manda', fechaValorDe({ date: '2025-01-15', mesAbonado: 7, anioAbonado: 2025 }).origen, 'pago');
afirmar('sin fecha de pago se cae al período acreditado, a mitad de mes',
    fechaValorDe({ date: null, mesAbonado: 7, anioAbonado: 2025 }).fecha.toISOString().slice(0, 10), '2025-07-15');
afirmar('y queda marcado como estimado', fechaValorDe({ date: null, mesAbonado: 7, anioAbonado: 2025 }).origen, 'periodo');
afirmar('sin nada utilizable, no se inventa una fecha', fechaValorDe({ date: null }).fecha, null);
afirmar('un 31 de febrero no se acepta en silencio', diaUTC('2025-02-31'), null);
afirmar('ni una fecha con mes 13', diaUTC('2025-13-01'), null);
// year/monthInt jamás se leen: el par es incoherente según quién creó la fila
// (POST /savings guarda monthInt = mes ACREDITADO; la importación, el mes de pago).
afirmar('year/monthInt se ignoran aunque vengan',
    fechaValorDe({ date: null, year: 2020, monthInt: 3, mesAbonado: 7, anioAbonado: 2025 }).fecha.toISOString().slice(0, 10),
    '2025-07-15');

// ─────────────────────────────────────────────────────────────────────────────
seccion('3. El socio que paga el año entero en enero');

const enEnero = mensualidades('2025-01-15');
const aEnero = ponderarSocio(enEnero, P2025);
// 15 de enero → 31 de diciembre, ambos inclusive = 351 días de 365.
afirmar('sus 12 cuotas pesan los 351 días que el dinero estuvo, no los meses que acreditan',
    aEnero.saldoPromedio, 12 * CUOTA * (351 / 365), 1);
afirmar('el método anterior le reconocía muchísimo menos', metodoAnterior(enEnero), 1300000, 1);
cierto('la corrección lo favorece en más de un millón',
    aEnero.saldoPromedio - metodoAnterior(enEnero) > 1000000);

seccion('4. El socio que paga puntual, mes a mes');

const mesAMes = Array.from({ length: 12 }, (_, i) => ({
    valor: CUOTA,
    date: `2025-${String(i + 1).padStart(2, '0')}-05`,
    mesAbonado: i + 1, anioAbonado: 2025,
}));
const aMesAMes = ponderarSocio(mesAMes, P2025);

// Este es el hallazgo que motiva todo: el método anterior no miraba la fecha de
// pago, así que a estos dos socios —que movieron su dinero de forma
// completamente distinta— les daba EXACTAMENTE el mismo peso.
afirmar('el método anterior le daba lo mismo que al que pagó todo en enero',
    metodoAnterior(mesAMes), metodoAnterior(enEnero), 1);
cierto('ahora el de enero pesa más que el que fue pagando mes a mes',
    aEnero.saldoPromedio > aMesAMes.saldoPromedio);
cierto('pero el puntual mes a mes conserva más de la mitad del peso máximo',
    aMesAMes.saldoPromedio > 12 * CUOTA * 0.5);

seccion('5. El socio que se atrasa');

const tarde = Array.from({ length: 12 }, (_, i) => ({
    valor: CUOTA,
    date: `2025-12-20`,              // paga el año entero en diciembre
    mesAbonado: i + 1, anioAbonado: 2025,
}));
const aTarde = ponderarSocio(tarde, P2025);
afirmar('paga lo mismo pero su dinero solo trabajó 12 días',
    aTarde.saldoPromedio, 12 * CUOTA * (12 / 365), 1);
afirmar('el método anterior le reconocía lo mismo que al puntual', metodoAnterior(tarde), metodoAnterior(enEnero), 1);
cierto('ahora pesa una fracción del que pagó en enero', aTarde.saldoPromedio < aEnero.saldoPromedio * 0.05);

seccion('6. Las cuotas adelantadas del año anterior');

// Paga en diciembre de 2024 las cuotas de enero y febrero de 2025. Ese dinero
// estaba en el fondo el 1 de enero: es saldo de apertura, no un abono del año.
const adelantadas = [
    { valor: CUOTA, date: '2024-12-20', mesAbonado: 1, anioAbonado: 2025 },
    { valor: CUOTA, date: '2024-12-20', mesAbonado: 2, anioAbonado: 2025 },
];
const aAdelanto = ponderarSocio(adelantadas, P2025);
afirmar('cuentan como saldo de apertura', aAdelanto.saldoApertura, 2 * CUOTA);
afirmar('y pesan el período completo', aAdelanto.saldoPromedio, 2 * CUOTA);
// Antes caían dentro del año por anioAbonado y se ponderaban 12/12 y 11/12.
afirmar('el método anterior las ponderaba por el mes acreditado', metodoAnterior(adelantadas), CUOTA * (12 / 12 + 11 / 12), 1);

seccion('7. Quien retiró sus ahorros del año anterior, y quien no');

const previo = { valor: 5000000, date: '2023-06-10', mesAbonado: 6, anioAbonado: 2023 };
const conservo = ponderarSocio([previo], P2025);
const retiro = ponderarSocio([
    previo,
    { valor: -5000000, date: '2025-03-31', mesAbonado: 3, anioAbonado: 2025, status: 'Devolucion Total Intereses' },
], P2025);

afirmar('quien conservó su saldo pesa el capital completo', conservo.saldoPromedio, 5000000);
afirmar('y todo ese saldo es permanente', conservo.aperturaPermanente, 5000000);
// 31 de marzo → 31 de diciembre, ambos inclusive = 276 días.
afirmar('quien retiró en marzo conserva solo lo que su dinero trabajó hasta marzo',
    retiro.saldoPromedio, 5000000 - 5000000 * (276 / 365), 1);
afirmar('su saldo permanente es cero: no queda nada que premiar', retiro.aperturaPermanente, 0);
cierto('el retiro NO se limita a restar el monto: hasta marzo ese dinero sí trabajó',
    retiro.saldoPromedio > 0);

seccion('8. El factor de permanencia (decisión de la Junta)');

const baseConservo1 = resolverBase(conservo, 1);
const baseRetiro1 = resolverBase(retiro, 1);
afirmar('con factor 1 el reparto es puro hecho aritmético', baseConservo1.base, conservo.saldoPromedio, 1);
afirmar('y no hay premio', baseConservo1.premioPermanencia, 0);

const baseConservo125 = resolverBase(conservo, 1.25);
const baseRetiro125 = resolverBase(retiro, 1.25);
afirmar('con factor 1,25 quien conservó suma un 25% de su saldo permanente',
    baseConservo125.base, 5000000 * 1.25, 1);
afirmar('quien retiró no recibe nada de premio', baseRetiro125.base, baseRetiro1.base, 1);
cierto('el premio solo toca el saldo de apertura, nunca el ahorro nuevo del año',
    resolverBase(aEnero, 1.25).base === aEnero.saldoPromedio);
afirmar('un factor por debajo de 1 no castiga a nadie: se ignora', resolverBase(conservo, 0.5).factorAplicado, 1);
afirmar('un factor no numérico se ignora', resolverBase(conservo, 'x').factorAplicado, 1);

seccion('9. El reparto cuadra al peso');

const UTILIDAD = 7_350_000;
const bases = [aEnero, aMesAMes, aTarde, conservo, retiro].map(a => resolverBase(a, 1.25).base);
const cuotasReparto = repartir(bases, UTILIDAD);
afirmar('lo repartido suma exactamente lo aprobado',
    cuotasReparto.reduce((s, c) => s + c.utilidad, 0), UTILIDAD);
afirmar('las participaciones suman 100%',
    Number(cuotasReparto.reduce((s, c) => s + c.participacion, 0).toFixed(10)), 1);
cierto('nadie recibe un importe fraccionario', cuotasReparto.every(c => Number.isInteger(c.utilidad)));

// El caso que rompe un reparto ingenuo: tres partes iguales de un monto que no
// divide en tres. Con Math.round por separado sobra o falta un peso.
const tercios = repartir([1, 1, 1], 100);
afirmar('tres partes iguales de 100 siguen sumando 100', tercios.reduce((s, c) => s + c.utilidad, 0), 100);
afirmar('y el peso sobrante va a uno solo', tercios.map(c => c.utilidad).sort().join(','), '33,33,34');

seccion('10. Los casos que no deben tumbar el cálculo');

afirmar('sin bases, no hay reparto', repartir([], 1000000), []);
afirmar('con todas las bases en cero no se reparte nada',
    repartir([0, 0], 1000000).reduce((s, c) => s + c.utilidad, 0), 0);
afirmar('sin monto a distribuir tampoco',
    repartir([100, 200], 0).reduce((s, c) => s + c.utilidad, 0), 0);
afirmar('un socio sin movimientos pesa cero', ponderarSocio([], P2025).saldoPromedio, 0);

// Más devuelto que ahorrado en años anteriores: dato mal registrado. El saldo de
// apertura se protege en cero, pero el crudo se conserva para poder reportarlo.
const negativo = ponderarSocio([
    { valor: 1000000, date: '2023-05-01' },
    { valor: -3000000, date: '2023-09-01' },
], P2025);
afirmar('un saldo de apertura negativo se protege en cero', negativo.saldoApertura, 0);
afirmar('pero el valor real queda registrado para poder revisarlo', negativo.saldoAperturaCrudo, -2000000);
afirmar('y la base nunca sale negativa', resolverBase(negativo, 1.25).base, 0);

const futuro = ponderarSocio([{ valor: CUOTA, date: '2026-05-01', mesAbonado: 5, anioAbonado: 2026 }], P2025);
afirmar('un abono posterior al corte no pesa todavía', futuro.saldoPromedio, 0);
cierto('pero aparece en el detalle, para que el socio vea que llegó', futuro.detalle.length === 1);

const sinFecha = ponderarSocio([{ valor: CUOTA, date: null, mesAbonado: null, anioAbonado: null }], P2025);
afirmar('un movimiento sin fecha utilizable no se pondera', sinFecha.saldoPromedio, 0);
afirmar('y se cuenta aparte para poder reportarlo', sinFecha.conteoOrigen.sin, 1);

afirmar('el conteo de orígenes cuadra con los movimientos', aEnero.conteoOrigen, { pago: 12, periodo: 0, sin: 0 });

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1m${'═'.repeat(70)}\x1b[0m`);
console.log(fallos === 0
    ? `\x1b[32m\x1b[1m  ${ok}/${ok} comprobaciones correctas.\x1b[0m`
    : `\x1b[31m\x1b[1m  ${fallos} fallo(s) de ${ok + fallos}.\x1b[0m`);
console.log(`\x1b[1m${'═'.repeat(70)}\x1b[0m\n`);
process.exit(fallos === 0 ? 0 : 1);
