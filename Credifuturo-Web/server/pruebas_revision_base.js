#!/usr/bin/env node
/**
 * Banco de pruebas del botón "Revisar y actualizar la base" del panel.
 *
 * Corre sobre una base temporal propia y pasa por la ruta HTTP real
 * (`POST /api/admin/validate-db`). El botón llamaba a un endpoint que solo
 * contaba filas; lo que aquí se comprueba es que ahora SÍ deja al día los
 * cálculos guardados, y que no toca lo que no debe:
 *
 *   · aplica el abono a capital que nadie había propagado, y deja dicho quién;
 *   · cierra el préstamo que tiene todas sus cuotas pagas;
 *   · lleva a cada cuota el estado real de su préstamo;
 *   · refresca la foto del score del mes;
 *   · no reescribe un cronograma que el motor de abonos se niega a recalcular,
 *     y lo devuelve nombrado con su motivo;
 *   · una segunda pulsación no cambia nada;
 *   · un socio que no es admin recibe 403.
 *
 * La siembra se hace escribiendo directo en la base, no por el formulario: el
 * formulario aplicaría el abono él mismo y no quedaría nada que revisar.
 *
 *   node pruebas_revision_base.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const RUTA = path.join(os.tmpdir(), `credifuturo-revision-${process.pid}.sqlite`);
process.env.DATABASE_PATH = RUTA;
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.NODE_ENV = 'development';
process.env.PORT = '3047';

const bcrypt = require('bcryptjs');
const sequelize = require('./config/database');
const { Client, DisbursedLoan, LoanPayment } = require('./models');
const AbonoAplicado = require('./models/AbonoAplicado');
const Notification = require('./models/Notification');
const ScoreSnapshot = require('./models/ScoreSnapshot');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const cerca = (a, b, tol = 1) => Math.abs(num(a) - num(b)) <= tol;
const BASE = `http://127.0.0.1:${process.env.PORT}/api`;
const ANIO = new Date().getFullYear();

let ok = 0; let fallos = 0;
function comprobar(descripcion, condicion, detalle = '') {
    if (condicion) { ok++; console.log(`   ✓ ${descripcion}`); }
    else { fallos++; console.log(`   ✗ ${descripcion}${detalle ? ` — ${detalle}` : ''}`); }
}

let secuencia = 0;

/** Un préstamo con la misma ley que usa el desembolso real. */
async function sembrar({ principal = 6000000, cuotas = 6, tasa = 0.014, estado = 'Vigente', estadoEnCuotas = 'Vigente' } = {}) {
    secuencia++;
    const socio = await Client.create({
        name: `Socio${secuencia}`, apellido1: 'Prueba', cedula: `7700${secuencia}`,
        customerId: `${7700 + secuencia}`, email: `s${secuencia}@prueba.local`,
        password: bcrypt.hashSync('secreto123', 10), role: 'user', estatus: 'Activo', mustChangePassword: false,
    });
    const idVm = `SOLR${secuencia}`;
    await DisbursedLoan.create({
        idVm, clientId: socio.id, valorPrestado: principal, cuotas, interesMensual: tasa,
        estado, fechaPrestamo: `${ANIO}-01-05`, mesDesembolso: 'Enero', anioDesembolso: ANIO, monto: principal,
    });
    const capital = principal / cuotas;
    let saldo = principal;
    const filas = [];
    for (let i = 1; i <= cuotas; i++) {
        const interes = parseFloat((saldo * tasa).toFixed(2));
        filas.push({
            externalId: `PR${secuencia}_${i}`, clientId: socio.id, idVm, itemQuantity: i,
            saldoInicial: parseFloat(saldo.toFixed(2)),
            valorInteresesAmortizados: interes,
            valorCuotaVariable: parseFloat((capital + interes).toFixed(2)),
            valorCuotaPago: 0,
            saldoFinal: i === cuotas ? 0 : parseFloat((saldo - capital).toFixed(2)),
            estado: 'Pendiente', estadoPrestamo: estadoEnCuotas,
            cuotasPrestamo: cuotas, interesMensual: tasa,
            fechaPagoMax: `${ANIO}-${String(i + 1).padStart(2, '0')}-10`,
            mesDesembolso: 'Enero',
        });
        saldo -= capital;
    }
    await LoanPayment.bulkCreate(filas);
    return { idVm, principal, socio };
}

const leer = (idVm) => LoanPayment.findAll({ where: { idVm }, order: [['itemQuantity', 'ASC']] });
const foto = (filas) => JSON.stringify(filas.map((c) => [c.estado, c.estadoPrestamo, num(c.saldoInicial), num(c.saldoFinal), num(c.valorCuotaVariable), num(c.valorInteresesAmortizados), num(c.valorCuotaPago)]));
const paso = (informe, clave) => (informe.pasos || []).find((p) => p.clave === clave);

async function main() {
    if (fs.existsSync(RUTA)) fs.unlinkSync(RUTA);
    await sequelize.sync();
    await AbonoAplicado.sync();
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_disbursed_id_vm ON DisbursedLoans(id_vm)');
    await Client.create({
        name: 'Gerente', apellido1: 'Prueba', cedula: '14297227', customerId: '1',
        email: 'gerente@prueba.local', password: bcrypt.hashSync('secreto123', 10),
        role: 'admin', estatus: 'Activo', mustChangePassword: false,
    });

    // ── Siembra: lo que el botón tiene que encontrar ─────────────────────────
    // A. Estado con espacio sobrante y cuotas que dicen «Pendiente».
    const a = await sembrar({ estado: 'Vigente ', estadoEnCuotas: 'Pendiente' });
    // B. Todas las cuotas pagas, y el préstamo sigue Vigente.
    const b = await sembrar();
    for (const c of await leer(b.idVm)) await c.update({ estado: 'Pago', valorCuotaPago: c.valorCuotaVariable });
    // C. Cuota 1 pagada con $500.000 de más y nada propagado al resto.
    const c = await sembrar();
    const c1 = (await leer(c.idVm))[0];
    await c1.update({ estado: 'Pago', valorCuotaPago: num(c1.valorCuotaVariable) + 500000 });
    // D. Sano: no se le debe mover un peso.
    const d = await sembrar();
    const d1 = (await leer(d.idVm))[0];
    await d1.update({ estado: 'Pago', valorCuotaPago: d1.valorCuotaVariable });
    // E. Sobrepago sobre un cronograma que no encadena: el motor se niega.
    const e = await sembrar();
    const filasE = await leer(e.idVm);
    await filasE[0].update({ estado: 'Pago', valorCuotaPago: num(filasE[0].valorCuotaVariable) + 300000 });
    await filasE[2].update({ saldoInicial: 1234567 });

    const antes = {
        c: (await leer(c.idVm)).map((f) => f.toJSON()),
        d: foto(await leer(d.idVm)),
        e: foto(await leer(e.idVm)),
    };

    require('./server.js');
    await new Promise((r) => setTimeout(r, 4500));
    const entrar = async (cedula) => {
        const r = await fetch(`${BASE}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cedula, password: 'secreto123' }),
        }).then((x) => x.json());
        if (!r.token) { console.error('LOGIN FALLÓ', r); process.exit(1); }
        return { 'Content-Type': 'application/json', Authorization: `Bearer ${r.token}` };
    };
    const H = await entrar('14297227');
    const pulsar = async (cabeceras = H) => {
        // Con el mismo cuerpo que manda el botón: un `null` serializado lo rechaza
        // el parser JSON con un 400 antes de llegar a la ruta.
        const r = await fetch(`${BASE}/admin/validate-db`, { method: 'POST', headers: cabeceras, body: '{}' });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    };

    console.log('\n══════════════════════════════════════════════');
    console.log('  REVISAR Y ACTUALIZAR LA BASE');
    console.log('══════════════════════════════════════════════');

    console.log('\n1. Solo el gerente puede lanzarla');
    {
        const comoSocio = await pulsar(await entrar(d.socio.cedula));
        comprobar('un socio recibe 403', comoSocio.status === 403, `HTTP ${comoSocio.status}`);
        comprobar('y no se aplicó nada', await AbonoAplicado.count() === 0);
    }

    const primera = await pulsar();
    const inf = primera.body;

    console.log('\n2. La respuesta');
    comprobar('responde 200', primera.status === 200, `HTTP ${primera.status} ${JSON.stringify(inf).slice(0, 200)}`);
    comprobar('sin errores', inf.ok === true, JSON.stringify((inf.pasos || []).filter((p) => p.estado === 'error')));
    comprobar('trae los cuatro conteos de siempre', (inf.summary || []).length === 4 && inf.totals?.totalLoans === 5);
    comprobar('cuenta dos correcciones (abonos y estados)', inf.correcciones === 2, `correcciones=${inf.correcciones}`);
    comprobar('y una decisión pendiente', inf.pendientes === 1, `pendientes=${inf.pendientes}`);

    console.log('\n3. El abono que nadie había propagado');
    {
        const filas = await leer(c.idVm);
        const p = paso(inf, 'abonos');
        comprobar('el paso de abonos dice que actualizó', p?.estado === 'actualizado', JSON.stringify(p));
        comprobar('y nombra el préstamo', (p?.detalle || []).some((l) => l.startsWith(c.idVm)), JSON.stringify(p?.detalle));
        comprobar('la cuota 1 cierra con el excedente descontado', cerca(filas[0].saldoFinal, num(antes.c[0].saldoFinal) - 500000), String(filas[0].saldoFinal));
        comprobar('la cuota 2 arranca de ese mismo saldo', cerca(filas[1].saldoInicial, filas[0].saldoFinal), `${filas[1].saldoInicial} vs ${filas[0].saldoFinal}`);
        comprobar('y su interés baja', num(filas[1].valorInteresesAmortizados) < num(antes.c[1].valorInteresesAmortizados) - 1);
        comprobar('el crédito sigue extinguiéndose en cero', cerca(filas[filas.length - 1].saldoFinal, 0));
        const registro = await AbonoAplicado.findOne({ where: { idVm: c.idVm } });
        comprobar('queda el registro para poder revertirlo', Boolean(registro));
        comprobar('con origen manual', registro?.origen === 'manual', String(registro?.origen));
        comprobar('y la cédula de quien pulsó', registro?.aplicadoPor === '14297227', String(registro?.aplicadoPor));
        comprobar('al socio se le avisa', await Notification.count({ where: { clientId: c.socio.id, type: 'abono_capital' } }) === 1);
    }

    console.log('\n4. El préstamo con todo pago');
    {
        const prestamo = await DisbursedLoan.findOne({ where: { idVm: b.idVm } });
        comprobar('queda Cancelado', prestamo.estado === 'Cancelado', prestamo.estado);
        comprobar('y sus cuotas lo dicen', (await leer(b.idVm)).every((f) => f.estadoPrestamo === 'Cancelado'));
        comprobar('el paso lo nombra', (paso(inf, 'estados')?.detalle || []).some((l) => l.startsWith(b.idVm) && /Cancelado/.test(l)));
    }

    console.log('\n5. El estado copiado en las cuotas');
    {
        const prestamo = await DisbursedLoan.findOne({ where: { idVm: a.idVm } });
        comprobar('se quitó el espacio sobrante', prestamo.estado === 'Vigente', `[${prestamo.estado}]`);
        comprobar('las cuotas pasan de «Pendiente» a Vigente', (await leer(a.idVm)).every((f) => f.estadoPrestamo === 'Vigente'));
        comprobar('sin tocar el estado de pago de ninguna', (await leer(a.idVm)).every((f) => f.estado === 'Pendiente'));
        const detalle = paso(inf, 'estados')?.detalle || [];
        comprobar('el paso cuenta cuántas eran y qué decían', detalle.some((l) => l.startsWith(a.idVm) && /6 cuota\(s\) decían «Pendiente»/.test(l)), JSON.stringify(detalle));
    }

    console.log('\n6. Lo que no se toca');
    {
        comprobar('el préstamo sano queda idéntico', foto(await leer(d.idVm)) === antes.d);
        comprobar('el cronograma que no encadena queda idéntico', foto(await leer(e.idVm)) === antes.e);
        const p = paso(inf, 'abonos-bloqueados');
        comprobar('y se devuelve como decisión pendiente', p?.estado === 'pendiente', JSON.stringify(p));
        comprobar('nombrado, con su excedente y su motivo', (p?.detalle || []).some((l) => l.startsWith(e.idVm) && /\$300\.000/.test(l) && l.length > 40), JSON.stringify(p?.detalle));
        comprobar('sin registro de abono para él', await AbonoAplicado.count({ where: { idVm: e.idVm } }) === 0);
    }

    console.log('\n7. La foto del score');
    {
        const p = paso(inf, 'score');
        comprobar('el paso dice que actualizó', p?.estado === 'actualizado', JSON.stringify(p));
        comprobar('hay una foto por socio activo', await ScoreSnapshot.count() === 5, String(await ScoreSnapshot.count()));
    }

    console.log('\n8. Pulsar otra vez no cambia nada');
    {
        const fotoTodo = async () => JSON.stringify([
            foto(await LoanPayment.findAll({ order: [['id', 'ASC']] })),
            (await DisbursedLoan.findAll({ order: [['id', 'ASC']] })).map((p) => p.estado),
            await AbonoAplicado.count(), await Notification.count(),
        ]);
        const previo = await fotoTodo();
        const segunda = await pulsar();
        comprobar('responde 200', segunda.status === 200);
        comprobar('cero correcciones', segunda.body.correcciones === 0, `correcciones=${segunda.body.correcciones}`);
        comprobar('los abonos quedan al día', paso(segunda.body, 'abonos')?.estado === 'al-dia', JSON.stringify(paso(segunda.body, 'abonos')));
        comprobar('los estados quedan al día', paso(segunda.body, 'estados')?.estado === 'al-dia');
        comprobar('la decisión pendiente sigue ahí', segunda.body.pendientes === 1);
        comprobar('ni una cuota, estado, registro o aviso de más', await fotoTodo() === previo);
    }

    console.log('\n══════════════════════════════════════════════');
    console.log(`  ${ok} comprobaciones correctas, ${fallos} fallidas`);
    console.log('══════════════════════════════════════════════\n');

    try { fs.unlinkSync(RUTA); } catch { /* la base temporal ya no importa */ }
    process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
