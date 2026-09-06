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
    diaUTC, fechaValorDe, pesoDeFecha, pesoDeMes, construirPeriodo, ponderarSocio, resolverBase, repartir,
    calcularRetencion, calcularDescuento, calcularAporteSocio, esPorSocio,
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
seccion('1. El peso de cada día');

const pesoDe = (iso) => pesoDeFecha(diaUTC(iso), P);

// La rampa: 100% el 1 de enero, prácticamente 0% el 31 de diciembre.
afirmar('el 1 de enero pesa el año completo', pesoDe('2025-01-01'), 1, 1e-9);
afirmar('el 1 de julio, algo más de la mitad', pesoDe('2025-07-01'), 184 / 365, 1e-9);
afirmar('el 31 de diciembre, un solo día', pesoDe('2025-12-31'), 1 / 365, 1e-9);
afirmar('lo que venía de antes del año pesa completo', pesoDe('2024-11-30'), 1);
afirmar('lo posterior al año no pesa', pesoDe('2026-02-01'), 0);

// El defecto que motivó el cambio: con peso por MES estos dos daban idéntico.
// El fondo cobra rendimiento en NU por día, así que no lo son.
afirmar('el 1 de julio pesa más que el 30 del mismo mes', pesoDe('2025-07-01') > pesoDe('2025-07-30'), true);
afirmar('y la diferencia es de veintinueve días',
    pesoDe('2025-07-01') - pesoDe('2025-07-30'), 29 / 365, 1e-9);
// Sobre $500.000 esa diferencia son ~$39.700 de capital ponderado.
cierto('sobre medio millón, esa diferencia pasa de treinta mil pesos',
    500000 * (pesoDe('2025-07-01') - pesoDe('2025-07-30')) > 30000);

// El peso baja todos los días del año, sin escalones.
const todosLosDias = Array.from({ length: 365 }, (_, i) =>
    pesoDe(new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)));
cierto('el peso decrece día a día, nunca se estanca',
    todosLosDias.every((v, i) => i === 0 || v < todosLosDias[i - 1]));

// Un año bisiesto tiene 366 días y el denominador tiene que seguirlo: sobre 365
// el 1 de enero pesaría más de 1.
const B = construirPeriodo(2024, '2026-01-01');
afirmar('un año bisiesto dura 366 días', B.dias, 366);
afirmar('y su 1 de enero sigue pesando exactamente 100%',
    pesoDeFecha(diaUTC('2024-01-01'), B), 1, 1e-9);

// El peso de referencia de un mes, para rótulos, es el de su primer día.
afirmar('el peso de referencia de julio es el de su día 1', pesoDeMes(7, P), pesoDe('2025-07-01'), 1e-9);
afirmar('y el de lo anterior al año es 1', pesoDeMes(0, P), 1);

seccion('2. El período');

afirmar('un año normal tiene 365 días', P.dias, 365);
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
// Todas entraron el 15 de enero, así que todas pesan lo de ese día concreto —
// no "enero" como bloque.
afirmar('sus doce cuotas pesan los días que su dinero estuvo, desde el 15 de enero',
    aEnero.capitalPonderado, 12 * CUOTA * pesoDe('2025-01-15'), 1);
afirmar('el método anterior le reconocía mucho menos', metodoViejo(enEnero), 1300000, 1);
cierto('la corrección lo favorece en más de un millón', aEnero.capitalPonderado - metodoViejo(enEnero) > 1000000);
afirmar('todo su aporte cae en el renglón de enero', aEnero.porMes[1].ahorro, 12 * CUOTA);
afirmar('y el renglón de enero muestra el peso efectivo de ese día',
    aEnero.porMes[1].peso, pesoDe('2025-01-15'), 1e-9);

seccion('5. El socio que paga puntual, mes a mes');

const mesAMes = Array.from({ length: 12 }, (_, i) => ({
    valor: CUOTA, date: `2025-${String(i + 1).padStart(2, '0')}-05`, mesAbonado: i + 1, anioAbonado: 2025,
}));
const aMesAMes = ponderarSocio(mesAMes, P);
const sumaMesAMes = Array.from({ length: 12 }, (_, i) => pesoDe(`2025-${String(i + 1).padStart(2, '0')}-05`))
    .reduce((a, b) => a + b, 0);
afirmar('cada cuota pesa según el día en que entró', aMesAMes.capitalPonderado, CUOTA * sumaMesAMes, 1);
// Este es el hallazgo que motivó el rediseño: el método anterior no miraba la
// fecha de pago, así que a estos dos socios —que movieron su dinero de forma
// completamente distinta— les daba exactamente el mismo peso.
afirmar('el método anterior le daba lo mismo que al que pagó todo en enero',
    metodoViejo(mesAMes), metodoViejo(enEnero), 1);
cierto('ahora el de enero pesa casi el doble', aEnero.capitalPonderado > aMesAMes.capitalPonderado * 1.8);
afirmar('la cuota del 5 de julio pesa algo menos de la mitad',
    aMesAMes.porMes[7].peso, pesoDe('2025-07-05'), 1e-9);
afirmar('y aporta su importe por ese peso', aMesAMes.porMes[7].ponderado, CUOTA * pesoDe('2025-07-05'), 1);

seccion('6. El socio que se atrasa');

const tarde = Array.from({ length: 12 }, (_, i) => ({ valor: CUOTA, date: '2025-12-20', mesAbonado: i + 1, anioAbonado: 2025 }));
const aTarde = ponderarSocio(tarde, P);
afirmar('paga lo mismo pero su dinero solo alcanza a trabajar doce días',
    aTarde.capitalPonderado, 12 * CUOTA * pesoDe('2025-12-20'), 1);
afirmar('el método anterior le reconocía lo mismo que al puntual', metodoViejo(tarde), metodoViejo(enEnero), 1);
cierto('ahora pesa una fracción del que pagó en enero', aTarde.capitalPonderado < aEnero.capitalPonderado * 0.1);

seccion('7. El aporte inicial cuenta como capital');

// El aporte de ingreso también está en el fondo prestándose. Se pondera igual
// que cualquier otro capital, por el mes en que entró.
const conAporteInicial = ponderarSocio([
    { valor: 1000000, date: '2025-01-05', mesAbonado: 1, anioAbonado: 2025, esAporteInicial: true },
    { valor: CUOTA, date: '2025-07-05', mesAbonado: 7, anioAbonado: 2025 },
], P);
afirmar('el aporte inicial pesa por su día, igual que cualquier otro capital',
    conAporteInicial.capitalPonderado,
    1000000 * pesoDe('2025-01-05') + CUOTA * pesoDe('2025-07-05'), 1);

seccion('8. Los ahorros de años anteriores');

const previo = { valor: 5000000, date: '2023-06-10', mesAbonado: 6, anioAbonado: 2023 };

const conservo = ponderarSocio([previo], P);
afirmar('quien no retiró conserva el capital completo con peso 100%', conservo.capitalPonderado, 5000000);
afirmar('y queda registrado como capital de apertura', conservo.capitalApertura, 5000000);
afirmar('todo ese capital es permanente', conservo.aperturaPermanente, 5000000);

// Retiro TOTAL en marzo: el dinero trabajó enero, febrero y marzo.
const retiroTotal = ponderarSocio([
    previo,
    { valor: -5000000, date: '2025-03-31', mesAbonado: 3, anioAbonado: 2025, status: 'Devolucion Total Intereses', esConcepto: true, esDevolucion: true },
], P);
afirmar('un retiro total el 31 de marzo descuenta con el peso de ESE día',
    retiroTotal.capitalPonderado, 5000000 - 5000000 * pesoDe('2025-03-31'), 1);
cierto('el retiro NO borra los meses en que ese dinero sí trabajó', retiroTotal.capitalPonderado > 0);
afirmar('y no queda nada permanente que premiar', retiroTotal.aperturaPermanente, 0);

// Retiro PARCIAL: la misma regla, sin un caso aparte.
const retiroParcial = ponderarSocio([
    previo,
    { valor: -2000000, date: '2025-03-31', mesAbonado: 3, anioAbonado: 2025, status: 'Devolucion Parcial', esConcepto: true, esDevolucion: true },
], P);
afirmar('un retiro parcial descuenta solo lo retirado, con el peso de su día',
    retiroParcial.capitalPonderado, 5000000 - 2000000 * pesoDe('2025-03-31'), 1);
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
    { valor: -3000000, date: '2023-09-01', esConcepto: true },
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
afirmar('y le contaron casi todo', aEnero.capitalPonderado, 12 * CUOTA * pesoDe('2025-01-15'), 1);
afirmar('su peso efectivo es el del 15 de enero', aEnero.pesoEfectivo, pesoDe('2025-01-15'), 1e-9);

afirmar('quien pagó lo mismo en diciembre puso exactamente igual', aTarde.capitalBase, 12 * CUOTA);
afirmar('pero solo le cuentan doce días', aTarde.pesoEfectivo, pesoDe('2025-12-20'), 1e-9);
cierto('los dos capitales son iguales y los pesos efectivos no',
    aEnero.capitalBase === aTarde.capitalBase && aEnero.pesoEfectivo !== aTarde.pesoEfectivo);

afirmar('el puntual mes a mes queda a mitad de camino', aMesAMes.pesoEfectivo, sumaMesAMes / 12, 1e-9);

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

seccion('14. Lo que ahorró el socio y lo que movió el fondo, separados');

// El defecto que reportó el fondo: un socio que ahorró $500.000 en julio
// aparecía con $1.000.000 en la columna, porque ese mes también hubo un
// movimiento del fondo y los dos se sumaban en una sola cifra. Es la misma
// mezcla que la Matriz de Ahorros lleva años evitando entre `abonos` y `neto`.
const julioMixto = ponderarSocio([
    { valor: 500000, date: '2025-07-10', mesAbonado: 7, anioAbonado: 2025 },
    { valor: 500000, date: '2025-07-20', mesAbonado: 7, anioAbonado: 2025, status: 'Distribucion Intereses', esConcepto: true },
], P);
afirmar('el ahorro del socio en julio es lo que él consignó', julioMixto.porMes[7].ahorro, 500000);
afirmar('el movimiento del fondo va aparte', julioMixto.porMes[7].fondo, 500000);
cierto('y nunca se suman en una sola cifra', julioMixto.porMes[7].ahorro !== julioMixto.capitalBase);
// Cada uno con el peso de SU día: el del 10 pesa más que el del 20.
afirmar('los dos pesan, cada uno por el día en que entró',
    julioMixto.porMes[7].ponderado,
    500000 * pesoDe('2025-07-10') + 500000 * pesoDe('2025-07-20'), 1);
afirmar('el ahorro del año no incluye lo que movió el fondo', julioMixto.ahorroPeriodo, 500000);
afirmar('que se reporta por su cuenta', julioMixto.fondoPeriodo, 500000);

// Un descuento por mora es del fondo y va en negativo: no puede restarle al
// ahorro declarado del socio, porque él sí consignó lo que consignó.
const conDescuento = ponderarSocio([
    { valor: 300000, date: '2025-03-05', mesAbonado: 3, anioAbonado: 2025 },
    { valor: -12000, date: '2025-03-31', mesAbonado: 3, anioAbonado: 2025, status: 'Descuento Total Anual Penalizacion', esConcepto: true },
], P);
afirmar('el socio ahorró lo que ahorró', conDescuento.porMes[3].ahorro, 300000);
afirmar('y el descuento no se lo resta a esa cifra', conDescuento.porMes[3].fondo, -12000);
afirmar('aunque sí al capital que pesa',
    conDescuento.porMes[3].ponderado,
    300000 * pesoDe('2025-03-05') - 12000 * pesoDe('2025-03-31'), 1);

seccion('15. La distribución solo cuenta si el socio no retiró');

// Decisión de la Junta del 6 de septiembre de 2026: las utilidades abonadas
// cuentan como capital del socio siempre y cuando no haya retirado —total ni
// parcialmente— sus ahorros. Retirar rompe la permanencia que justifica que lo
// repartido el año pasado siga trabajando a su favor este año.
const traido = { valor: 3000000, date: '2024-05-01' };
const ahorro = { valor: 500000, date: '2025-02-10', mesAbonado: 2, anioAbonado: 2025 };
const utilidad = { valor: 400000, date: '2025-03-01', mesAbonado: 3, anioAbonado: 2025, status: 'Distribucion Intereses', esConcepto: true, esDistribucion: true };
const devolver = (v, fecha, texto) => ({ valor: v, date: fecha, status: texto, esConcepto: true, esDevolucion: true });

const fiel = ponderarSocio([traido, ahorro, utilidad], P);
afirmar('quien no retiró conserva su distribución en el capital',
    fiel.capitalPonderado,
    3000000 + 500000 * pesoDe('2025-02-10') + 400000 * pesoDe('2025-03-01'), 1);
afirmar('y no pierde nada', fiel.distribucionNoContada, 0);
cierto('ni se le marca retiro', fiel.huboRetiro === false);

const retiroParcialTrasUtilidad = ponderarSocio(
    [traido, ahorro, utilidad, devolver(-1000000, '2025-06-15', 'Devolucion Parcial')], P);
cierto('un retiro parcial cuenta como retiro', retiroParcialTrasUtilidad.huboRetiro);
afirmar('la distribución deja de contar entera', retiroParcialTrasUtilidad.distribucionNoContada, 400000);
afirmar('y desaparece del capital ponderado',
    retiroParcialTrasUtilidad.capitalPonderado,
    3000000 + 500000 * pesoDe('2025-02-10') - 1000000 * pesoDe('2025-06-15'), 1);

const retiroTotalDespues = ponderarSocio(
    [traido, ahorro, utilidad, devolver(-3500000, '2025-11-02', 'Devolucion Total Intereses')], P);
// El retiro es de noviembre y la distribución de marzo: la regla mira el
// comportamiento de todo el año, no el orden en que quedaron las filas.
cierto('un retiro POSTERIOR a la distribución también la anula', retiroTotalDespues.distribucionNoContada === 400000);

// El descuento anual por mora lo cobra el fondo, no lo pide el socio: no puede
// costarle además la distribución.
const conMora = ponderarSocio([traido, ahorro, utilidad,
    { valor: -15000, date: '2025-12-20', status: 'Descuento Total Anual Penalizacion', esConcepto: true }], P);
cierto('un descuento por mora NO es un retiro', conMora.huboRetiro === false);
afirmar('y no le quita la distribución', conMora.distribucionNoContada, 0);

// Una distribución anulada sigue en el detalle y en el renglón de su mes, para
// que el socio vea que llegó y por qué no le cuenta.
const filaMarzo = retiroParcialTrasUtilidad.porMes[3];
afirmar('la distribución anulada sigue apareciendo en su mes', filaMarzo.fondo, 400000);
afirmar('pero no aporta nada a ese mes', filaMarzo.ponderado, 0);
cierto('y queda marcada en el detalle',
    retiroParcialTrasUtilidad.detalle.some(d => d.noCuenta === true));

seccion('16. El desglose por mes que ve el socio');

const mixto = ponderarSocio([
    previo,
    { valor: 300000, date: '2025-02-10', mesAbonado: 2, anioAbonado: 2025 },
    { valor: 300000, date: '2025-07-10', mesAbonado: 7, anioAbonado: 2025 },
    { valor: -1000000, date: '2025-10-05', mesAbonado: 10, anioAbonado: 2025, status: 'Devolucion Parcial', esConcepto: true, esDevolucion: true },
], P);
afirmar('el capital de años anteriores va al renglón 0', mixto.porMes[0].ahorro, 5000000);
afirmar('el renglón de febrero pesa lo del 10 de febrero', mixto.porMes[2].peso, pesoDe('2025-02-10'), 1e-9);
afirmar('y aporta su importe por ese peso', mixto.porMes[2].ponderado, 300000 * pesoDe('2025-02-10'), 1);
afirmar('julio aporta lo suyo por el día 10', mixto.porMes[7].ponderado, 300000 * pesoDe('2025-07-10'), 1);
afirmar('el retiro de octubre entra como movimiento del fondo, no como ahorro', mixto.porMes[10].fondo, -1000000);
afirmar('y no ensucia el ahorro de ese mes', mixto.porMes[10].ahorro, 0);
afirmar('y descuenta con el peso del 5 de octubre', mixto.porMes[10].ponderado, -1000000 * pesoDe('2025-10-05'), 1);
afirmar('la suma de los renglones es el capital ponderado',
    mixto.porMes.reduce((s, f) => s + f.ponderado, 0), mixto.capitalPonderado, 1);

seccion('17. Lo que el fondo retiene antes de repartir');

const GANANCIA_ASAMBLEA = 543815;

afirmar('sin retención se reparte todo', calcularRetencion(GANANCIA_ASAMBLEA, null).aRepartir, GANANCIA_ASAMBLEA);
afirmar('un 10% retiene la décima parte', calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'porcentaje', valor: 10 }).retenido, 54382);
afirmar('y deja el resto para repartir', calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'porcentaje', valor: 10 }).aRepartir, GANANCIA_ASAMBLEA - 54382);
afirmar('un valor en pesos se retiene tal cual', calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'valor', valor: 200000 }).retenido, 200000);

// Los topes viven aquí y no en el formulario: un valor que llegue por API mueve
// dinero exactamente igual que uno tecleado.
afirmar('no se puede retener más de lo que hay', calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'valor', valor: 99999999 }).retenido, GANANCIA_ASAMBLEA);
afirmar('ni deja nada negativo para repartir', calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'valor', valor: 99999999 }).aRepartir, 0);
afirmar('un porcentaje por encima de 100 se topa en 100', calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'porcentaje', valor: 250 }).retenido, GANANCIA_ASAMBLEA);
afirmar('una retención negativa se ignora', calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'valor', valor: -50000 }).retenido, 0);
afirmar('y una no numérica también', calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'valor', valor: 'mucho' }).retenido, 0);
afirmar('sin ganancia no hay nada que retener', calcularRetencion(0, { tipo: 'porcentaje', valor: 50 }).retenido, 0);

seccion('18. El descuento sobre la parte de un socio');

const PARTE = 90887;
afirmar('sin descuento no se le quita nada', calcularDescuento(PARTE, null), 0);
afirmar('un 20% le quita la quinta parte', calcularDescuento(PARTE, { tipo: 'porcentaje', valor: 20 }), 18177);
afirmar('un valor en pesos se descuenta tal cual', calcularDescuento(PARTE, { tipo: 'valor', valor: 30000 }), 30000);

// Un descuento no puede dejar una utilidad negativa: eso ya no sería un
// descuento sino un cobro, y un cobro se registra donde se registran los cobros.
afirmar('nunca descuenta más que su propia parte', calcularDescuento(PARTE, { tipo: 'valor', valor: 999999 }), PARTE);
afirmar('un porcentaje por encima de 100 se topa en su parte', calcularDescuento(PARTE, { tipo: 'porcentaje', valor: 300 }), PARTE);
afirmar('un descuento negativo se ignora', calcularDescuento(PARTE, { tipo: 'valor', valor: -1000 }), 0);
afirmar('a quien no le toca nada no se le puede descuentar nada', calcularDescuento(0, { tipo: 'porcentaje', valor: 50 }), 0);

seccion('19. La identidad que tiene que cuadrar siempre');

// ganancia = repartido + retención general + descuentos por socio
// Es la única igualdad que un acta puede firmar: nada se pierde y nada aparece.
{
    const bases = [aEnero, aMesAMes, aTarde, conservo, retiroParcial].map(a => resolverBase(a, 1).base);
    const { retenido, aRepartir } = calcularRetencion(GANANCIA_ASAMBLEA, { tipo: 'porcentaje', valor: 15 });
    const brutas = repartir(bases, aRepartir).map(c => c.utilidad);

    // Un descuento del 30% al primero y $10.000 al tercero.
    const descuentos = [
        calcularDescuento(brutas[0], { tipo: 'porcentaje', valor: 30 }),
        0,
        calcularDescuento(brutas[2], { tipo: 'valor', valor: 10000 }),
        0, 0,
    ];
    const netas = brutas.map((b, i) => b - descuentos[i]);

    afirmar('lo repartido en bruto suma lo que quedó tras la retención',
        brutas.reduce((a, b) => a + b, 0), aRepartir);
    afirmar('repartido neto + retención + descuentos = ganancia',
        netas.reduce((a, b) => a + b, 0) + retenido + descuentos.reduce((a, b) => a + b, 0), GANANCIA_ASAMBLEA);
    cierto('ningún socio queda con utilidad negativa', netas.every(n => n >= 0));
    // Lo descontado a uno NO engorda la parte de los demás: sus cifras no se mueven.
    cierto('el descuento a un socio no cambia lo que reciben los otros',
        netas[1] === brutas[1] && netas[3] === brutas[3] && netas[4] === brutas[4]);
}

// ═════════════════════════════════════════════════════════════════════════════
seccion('El alcance: de la bolsa común, o a cada socio');
// ═════════════════════════════════════════════════════════════════════════════
{
    const G = 1000000;

    // Lo ya guardado no lleva `alcance`. Tiene que seguir repartiendo igual que
    // antes de que la opción existiera, o la primera carga tras el despliegue
    // cambiaría un reparto que nadie tocó.
    afirmar('sin alcance escrito se comporta como general',
        calcularRetencion(G, { tipo: 'porcentaje', valor: 10 }).retenido, 100000);
    cierto('y no se considera por socio', esPorSocio({ tipo: 'porcentaje', valor: 10 }) === false);
    cierto('un alcance desconocido tampoco', esPorSocio({ alcance: 'otro' }) === false);

    // Por socio NO aparta nada de la bolsa: se reparte todo y se cobra después.
    const porSocio = { tipo: 'valor', valor: 50000, alcance: 'porSocio' };
    afirmar('por socio no retiene de la bolsa', calcularRetencion(G, porSocio).retenido, 0);
    afirmar('y deja la ganancia entera para repartir', calcularRetencion(G, porSocio).aRepartir, G);

    // El aporte por cabeza se topa en la parte del socio: a quien le tocan
    // $12.000 no se le pueden cobrar $50.000.
    afirmar('el aporte por socio se cobra sobre su parte', calcularAporteSocio(400000, porSocio), 50000);
    afirmar('y se topa cuando la parte no alcanza', calcularAporteSocio(12000, porSocio), 12000);
    afirmar('un socio sin parte no aporta nada', calcularAporteSocio(0, porSocio), 0);
    afirmar('con alcance general no hay aporte por socio',
        calcularAporteSocio(400000, { tipo: 'valor', valor: 50000, alcance: 'general' }), 0);

    // La equivalencia que no es evidente y que la pantalla declara: un
    // porcentaje da lo mismo por los dos caminos.
    const pctGeneral = calcularRetencion(G, { tipo: 'porcentaje', valor: 10 }).retenido;
    const partes = [500000, 300000, 200000];
    const pctPorSocio = partes.reduce((a, p) =>
        a + calcularAporteSocio(p, { tipo: 'porcentaje', valor: 10, alcance: 'porSocio' }), 0);
    afirmar('un % por socio recauda lo mismo que el mismo % general', pctPorSocio, pctGeneral);

    // Y la que sí cambia: un valor fijo por cabeza no es una tajada del total.
    const fijoPorSocio = partes.reduce((a, p) => a + calcularAporteSocio(p, porSocio), 0);
    cierto('un valor fijo por socio NO equivale al mismo valor general',
        fijoPorSocio === 150000 && calcularRetencion(G, { tipo: 'valor', valor: 50000 }).retenido === 50000);

    // Una cuota plana pesa distinto según el tamaño del socio: es el hecho que
    // la pantalla advierte antes de guardar.
    cierto('la cuota plana pesa más sobre el socio pequeño',
        (calcularAporteSocio(60000, porSocio) / 60000) > (calcularAporteSocio(2000000, porSocio) / 2000000));

    // Los dos caminos se suman, y la suma se topa en la parte del socio.
    const parte = 70000;
    const aporte = calcularAporteSocio(parte, porSocio);            // 50.000
    const propio = calcularDescuento(parte, { tipo: 'valor', valor: 40000 }); // 40.000
    afirmar('aporte y descuento propio se suman', Math.min(parte, aporte + propio), 70000);
    cierto('y la suma nunca deja al socio debiendo', Math.min(parte, aporte + propio) <= parte);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1m${'═'.repeat(70)}\x1b[0m`);
console.log(fallos === 0
    ? `\x1b[32m\x1b[1m  ${ok}/${ok} comprobaciones correctas.\x1b[0m`
    : `\x1b[31m\x1b[1m  ${fallos} fallo(s) de ${ok + fallos}.\x1b[0m`);
console.log(`\x1b[1m${'═'.repeat(70)}\x1b[0m\n`);
process.exit(fallos === 0 ? 0 : 1);
