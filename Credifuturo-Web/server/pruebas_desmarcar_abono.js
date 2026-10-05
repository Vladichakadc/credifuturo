#!/usr/bin/env node
/**
 * Banco de pruebas de DESMARCAR una cuota cuyo abono ya se aplicó a capital.
 *
 * Corre sobre una base temporal propia y pasa por la ruta HTTP real
 * (`PUT /api/admin/payments/:id`), mandando lo mismo que manda el formulario
 * "Modificar Registro Estado Préstamo": la cuota entera, con el saldo final que
 * el propio formulario recalcula y las observaciones que tenía al abrirse.
 *
 * Lo que tiene que cumplirse:
 *   · sin confirmación el servidor se niega y no toca nada;
 *   · con `revertirAbono` deshace el reajuste y guarda el cambio de una vez;
 *   · el formulario, abierto antes de revertir, no devuelve a la cuota ni el
 *     saldo rebajado ni la nota del abono;
 *   · volver a marcarla pagada aplica el abono otra vez;
 *   · con dos abonos en el préstamo, se deshacen del más reciente al más antiguo;
 *   · al socio se le avisa, una sola vez y con la cifra de ESE abono, y el
 *     informe que lo explicaba deja de aparecer en sus informes.
 *
 *   node pruebas_desmarcar_abono.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const RUTA = path.join(os.tmpdir(), `credifuturo-desmarcar-${process.pid}.sqlite`);
process.env.DATABASE_PATH = RUTA;
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.NODE_ENV = 'development';
process.env.PORT = '3043';

const bcrypt = require('bcryptjs');
const sequelize = require('./config/database');
const { Client, DisbursedLoan, LoanPayment } = require('./models');
const AbonoAplicado = require('./models/AbonoAplicado');
const Notification = require('./models/Notification');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

let ok = 0, fallos = 0;
const cerca = (a, b, tol = 1) => Math.abs(num(a) - num(b)) <= tol;

function comprobar(descripcion, condicion, detalle = '') {
    if (condicion) { ok++; console.log(`   ✓ ${descripcion}`); }
    else { fallos++; console.log(`   ✗ ${descripcion}${detalle ? ` — ${detalle}` : ''}`); }
}

let secuencia = 0;
let H = null;
const BASE = `http://127.0.0.1:${process.env.PORT}/api`;
const ANIO = new Date().getFullYear();

/** Un préstamo recién desembolsado, con la misma ley que usa el desembolso real. */
async function sembrar({ principal = 8000000, cuotas = 12, tasa = 0.014 } = {}) {
    secuencia++;
    const socio = await Client.create({
        name: `Socio${secuencia}`, apellido1: 'Prueba', cedula: `8800${secuencia}`,
        customerId: `${8800 + secuencia}`, email: `s${secuencia}@prueba.local`,
        password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo', mustChangePassword: false,
    });
    const idVm = `SOLD${secuencia}`;
    await DisbursedLoan.create({
        idVm, clientId: socio.id, valorPrestado: principal, cuotas, interesMensual: tasa,
        estado: 'Vigente', fechaPrestamo: `${ANIO}-01-05`, mesDesembolso: 'Enero', anioDesembolso: ANIO, monto: principal,
    });
    const capital = principal / cuotas;
    let saldo = principal;
    const filas = [];
    for (let i = 1; i <= cuotas; i++) {
        const interes = parseFloat((saldo * tasa).toFixed(2));
        filas.push({
            externalId: `PD${secuencia}_${i}`, clientId: socio.id, idVm, itemQuantity: i,
            saldoInicial: parseFloat(saldo.toFixed(2)),
            valorInteresesAmortizados: interes,
            valorCuotaVariable: parseFloat((capital + interes).toFixed(2)),
            valorCuotaPago: 0,
            saldoFinal: i === cuotas ? 0 : parseFloat((saldo - capital).toFixed(2)),
            estado: 'Pendiente', estadoPrestamo: 'Vigente',
            cuotasPrestamo: cuotas, interesMensual: tasa,
            fechaPagoMax: `${ANIO + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-10`,
            mesDesembolso: 'Enero',
        });
        saldo -= capital;
    }
    await LoanPayment.bulkCreate(filas);
    return { idVm, principal, socio };
}

const avisos = (clientId, titulo) => Notification.findAll({ where: { clientId, title: titulo }, order: [['id', 'ASC']] });
const REVERTIDO = 'Se revirtió un abono a capital de tu crédito';
const CORREGIDO = 'Se corrigió tu abono a capital';
const INFORME_NUEVO = 'Tienes un informe nuevo';

/** Entra como el socio y devuelve sus cabeceras. */
async function entrarComo(socio) {
    const r = await fetch(`${BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: socio.cedula, password: 'x' }),
    }).then(x => x.json());
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${r.token}` };
}
const informesDe = async (cabeceras, idVm) =>
    (await fetch(`${BASE}/admin/informes`, { headers: cabeceras }).then(r => r.json())).filter((i) => i.idVm === idVm);
const abrirInforme = (cabeceras, nombre) => fetch(`${BASE}/admin/informes/${encodeURIComponent(nombre)}`, { headers: cabeceras });

const leer = (idVm) => LoanPayment.findAll({ where: { idVm }, order: [['itemQuantity', 'ASC']] });
const foto = (filas) => filas.map((f) => [num(f.saldoInicial), num(f.valorInteresesAmortizados), num(f.valorCuotaVariable), num(f.saldoFinal)]);
const iguales = (a, b) => a.length === b.length && a.every((fila, i) => fila.every((v, j) => cerca(v, b[i][j], 0.01)));
const capitalTotal = (filas) => filas.reduce((s, f) => s + (num(f.saldoInicial) - num(f.saldoFinal)), 0);
const vigentes = (idVm) => AbonoAplicado.count({ where: { idVm, revertidoEn: null } });

/**
 * El cuerpo que arma el formulario al guardar: la cuota como está en la base,
 * con los cambios del administrador encima y el saldo final recalculado por el
 * propio formulario (saldoInicial + interés − lo pagado, en pesos enteros).
 */
function formulario(cuota, cambios = {}) {
    const f = { ...cuota.toJSON(), ...cambios };
    const saldoFinal = num(f.saldoInicial) + num(f.valorInteresesAmortizados) - num(f.valorCuotaPago);
    return {
        clientId: f.clientId, mesDesembolso: f.mesDesembolso, cuotasPrestamo: f.cuotasPrestamo,
        interesMensual: f.interesMensual, valorInteresesAmortizados: f.valorInteresesAmortizados,
        fechaPagoMax: f.fechaPagoMax, mesPago: f.mesPago, valorCuotaVariable: f.valorCuotaVariable,
        estado: f.estado, valorCuotaPago: f.valorCuotaPago || 0,
        saldoFinal: saldoFinal > 0 ? saldoFinal.toFixed(0) : '0',
        itemQuantity: f.itemQuantity, observaciones: f.observaciones, idVm: f.idVm,
        estadoPrestamo: f.estadoPrestamo,
        ...(num(f.valorCuotaPago) > num(f.valorCuotaVariable) ? { politicaAbono: 'reducir-cuota' } : {}),
        ...(cambios.revertirAbono ? { revertirAbono: true } : {}),
    };
}

async function guardar(cuota, cambios) {
    const r = await fetch(`${BASE}/admin/payments/${cuota.id}`, {
        method: 'PUT', headers: H, body: JSON.stringify(formulario(cuota, cambios)),
    });
    return { status: r.status, body: await r.json() };
}

/** Paga una cuota por el formulario con `extra` pesos por encima de su valor. */
async function pagar(idVm, numero, extra = 0) {
    const cuota = (await leer(idVm))[numero - 1];
    return guardar(cuota, { estado: 'Pago', valorCuotaPago: num(cuota.valorCuotaVariable) + extra });
}

async function main() {
    await sequelize.sync();
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_disbursed_id_vm ON DisbursedLoans(id_vm)');
    await Client.create({
        name: 'Gerente', apellido1: 'Prueba', cedula: '14297227', customerId: '1',
        email: 'gerente@prueba.local', password: bcrypt.hashSync('secreto123', 10),
        role: 'admin', estatus: 'Activo', mustChangePassword: false,
    });

    require('./server.js');
    await new Promise(r => setTimeout(r, 4500));
    const login = await fetch(`${BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: '14297227', password: 'secreto123' }),
    }).then(r => r.json());
    if (!login.token) { console.error('LOGIN FALLÓ', login); process.exit(1); }
    H = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };

    console.log('\n══════════════════════════════════════════════');
    console.log('  DESMARCAR UNA CUOTA CON ABONO APLICADO');
    console.log('══════════════════════════════════════════════');

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n1. Pasar a Pendiente la cuota abonada (el caso de SOL30: $8.000.000, cuota 1 pagada con $1.000.000)');
    {
        const { idVm, principal } = await sembrar();
        const original = foto(await leer(idVm));

        const pago = await pagar(idVm, 1, 221333.33);
        comprobar('el abono se aplica al registrar el pago', pago.body.abonoExtraordinario?.aplicado === true, JSON.stringify(pago.body.abonoExtraordinario));
        const reajustado = await leer(idVm);
        comprobar('la cuota 2 baja', num(reajustado[1].valorCuotaVariable) < original[1][2] - 1);
        comprobar('la cuota abonada lleva la nota', /^Abono extraordinario/.test(reajustado[0].observaciones || ''));

        const sinConfirmar = await guardar(reajustado[0], { estado: 'Pendiente' });
        comprobar('sin confirmación responde 409', sinConfirmar.status === 409, `HTTP ${sinConfirmar.status}`);
        comprobar('y avisa de que se puede revertir', sinConfirmar.body.requiereRevertir === true);
        comprobar('informa el excedente de la cuota', cerca(sinConfirmar.body.excedenteCuota, 221333.33));
        comprobar('no tocó ninguna cuota', iguales(foto(await leer(idVm)), foto(reajustado)));
        comprobar('ni el estado', (await leer(idVm))[0].estado === 'Pago');
        comprobar('el reajuste sigue vigente', await vigentes(idVm) === 1);

        // El formulario se abrió con el cronograma reajustado: manda el saldo
        // rebajado y la nota del abono tal como los leyó.
        const confirmado = await guardar(reajustado[0], { estado: 'Pendiente', revertirAbono: true });
        comprobar('con confirmación guarda', confirmado.status === 200, `HTTP ${confirmado.status} ${JSON.stringify(confirmado.body).slice(0, 160)}`);
        comprobar('la respuesta dice que revirtió', confirmado.body.abonoRevertido?.reajustes === 1);
        const despues = await leer(idVm);
        comprobar('la cuota queda Pendiente', despues[0].estado === 'Pendiente');
        comprobar('lo que el socio pagó no se pierde', cerca(despues[0].valorCuotaPago, num(reajustado[0].valorCuotaPago)));
        comprobar('las cuotas 2 a 12 vuelven a su valor original', iguales(foto(despues).slice(1), original.slice(1)));
        comprobar('la nota del abono no vuelve con el formulario', !/Abono extraordinario/.test(despues[0].observaciones || ''), String(despues[0].observaciones));
        comprobar('no queda ningún reajuste vigente', await vigentes(idVm) === 0);

        const otraVez = await guardar(despues[0], { estado: 'Pago' });
        comprobar('volver a marcarla pagada aplica el abono de nuevo', otraVez.body.abonoExtraordinario?.aplicado === true, JSON.stringify(otraVez.body.abonoExtraordinario));
        const final = await leer(idVm);
        comprobar('el cronograma queda igual que tras el primer abono', iguales(foto(final), foto(reajustado)));
        comprobar('el capital suma lo prestado', cerca(capitalTotal(final), principal), String(capitalTotal(final)));
        comprobar('el crédito se extingue en cero', cerca(final[final.length - 1].saldoFinal, 0));
        comprobar('hay un solo reajuste vigente', await vigentes(idVm) === 1);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n2. El interruptor de la lista manda la fila entera, sin recalcular nada');
    {
        const { idVm } = await sembrar();
        const original = foto(await leer(idVm));
        await pagar(idVm, 1, 500000);
        const fila = (await leer(idVm))[0];
        const cuerpo = { ...fila.toJSON(), estado: 'Pendiente' };

        const no = await fetch(`${BASE}/admin/payments/${fila.id}`, { method: 'PUT', headers: H, body: JSON.stringify(cuerpo) });
        comprobar('sin confirmación, 409', no.status === 409);
        const si = await fetch(`${BASE}/admin/payments/${fila.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ ...cuerpo, revertirAbono: true }) });
        comprobar('con confirmación, guarda', si.status === 200, `HTTP ${si.status}`);
        const despues = await leer(idVm);
        comprobar('la cuota queda Pendiente', despues[0].estado === 'Pendiente');
        comprobar('las demás vuelven a su valor original', iguales(foto(despues).slice(1), original.slice(1)));
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n3. Dos abonos en el préstamo: se deshacen del más reciente al más antiguo');
    {
        const { idVm, principal } = await sembrar();
        const original = foto(await leer(idVm));
        await pagar(idVm, 1, 221333.33);
        const trasPrimero = foto(await leer(idVm));
        const segundo = await pagar(idVm, 2, 288886.55);
        comprobar('el segundo abono se aplica', segundo.body.abonoExtraordinario?.aplicado === true, JSON.stringify(segundo.body.abonoExtraordinario));
        comprobar('hay dos reajustes vigentes', await vigentes(idVm) === 2);

        const cuotas = await leer(idVm);
        const primera = await guardar(cuotas[0], { estado: 'Pendiente', revertirAbono: true });
        comprobar('la cuota 1 no se desmarca mientras la 2 tenga su abono', primera.status === 409, `HTTP ${primera.status}`);
        comprobar('el mensaje nombra la cuota que hay que revertir primero', String(primera.body.error).includes(cuotas[1].externalId), primera.body.error);
        comprobar('y no se ofrece como confirmable', !primera.body.requiereRevertir);
        comprobar('nada cambió', await vigentes(idVm) === 2 && (await leer(idVm))[0].estado === 'Pago');

        const segunda = await guardar(cuotas[1], { estado: 'Pendiente', revertirAbono: true });
        comprobar('la cuota 2 sí se desmarca', segunda.status === 200, `HTTP ${segunda.status} ${JSON.stringify(segunda.body).slice(0, 160)}`);
        const trasDesmarcar = await leer(idVm);
        comprobar('las cuotas 3 a 12 vuelven a como las dejó el primer abono', iguales(foto(trasDesmarcar).slice(2), trasPrimero.slice(2)));
        comprobar('el primer abono sigue vigente', await vigentes(idVm) === 1);

        const ahoraSi = await guardar(trasDesmarcar[0], { estado: 'Pendiente', revertirAbono: true });
        comprobar('y entonces la cuota 1 también', ahoraSi.status === 200, `HTTP ${ahoraSi.status}`);
        const limpio = await leer(idVm);
        comprobar('las cuotas 3 a 12 quedan como el cronograma original', iguales(foto(limpio).slice(2), original.slice(2)));
        comprobar('no queda ningún reajuste vigente', await vigentes(idVm) === 0);

        // Se rehace el camino: pagar de nuevo las dos, en orden.
        await guardar(limpio[0], { estado: 'Pago' });
        const rehecho = await guardar((await leer(idVm))[1], { estado: 'Pago' });
        comprobar('al volver a pagarlas el abono se aplica', rehecho.body.abonoExtraordinario?.aplicado === true, JSON.stringify(rehecho.body.abonoExtraordinario));
        const final = await leer(idVm);
        comprobar('el capital suma lo prestado', cerca(capitalTotal(final), principal), String(capitalTotal(final)));
        comprobar('el crédito se extingue en cero', cerca(final[final.length - 1].saldoFinal, 0));
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n4. Bajar el valor de un pago abonado, sin desmarcarlo');
    {
        const { idVm, principal } = await sembrar();
        const original = foto(await leer(idVm));
        await pagar(idVm, 1, 221333.33);
        const reajustado = await leer(idVm);
        const cuota = num(reajustado[0].valorCuotaVariable);

        const no = await guardar(reajustado[0], { valorCuotaPago: cuota + 100000 });
        comprobar('sin confirmación, 409', no.status === 409 && no.body.requiereRevertir === true, `HTTP ${no.status}`);

        const menos = await guardar(reajustado[0], { valorCuotaPago: cuota + 100000, revertirAbono: true });
        comprobar('con confirmación guarda', menos.status === 200, `HTTP ${menos.status} ${JSON.stringify(menos.body).slice(0, 160)}`);
        comprobar('y vuelve a aplicar el abono con el valor nuevo', menos.body.abonoExtraordinario?.aplicado === true
            && cerca(menos.body.abonoExtraordinario.excedente, 100000), JSON.stringify(menos.body.abonoExtraordinario));
        let filas = await leer(idVm);
        comprobar('la cuota 2 arranca en el saldo con $100.000 abonados', cerca(filas[1].saldoInicial, original[0][3] - 100000), String(filas[1].saldoInicial));
        comprobar('el capital suma lo prestado', cerca(capitalTotal(filas), principal), String(capitalTotal(filas)));
        comprobar('un solo reajuste vigente', await vigentes(idVm) === 1);

        const exacto = await guardar(filas[0], { valorCuotaPago: cuota, revertirAbono: true });
        comprobar('bajarlo al valor exacto de la cuota guarda', exacto.status === 200, `HTTP ${exacto.status}`);
        comprobar('y ya no hay abono que aplicar', !exacto.body.abonoExtraordinario?.aplicado);
        filas = await leer(idVm);
        // La cuota 1 queda a menos de un peso: el formulario redondea su saldo final a
        // pesos enteros en cualquier pago, y eso no lo cambia este flujo.
        comprobar('las cuotas 2 a 12 quedan como el cronograma original', iguales(foto(filas).slice(1), original.slice(1)));
        comprobar('y la cuota 1 cierra en el saldo original', cerca(filas[0].saldoFinal, original[0][3]), String(filas[0].saldoFinal));
        comprobar('la cuota sigue pagada', filas[0].estado === 'Pago');
        comprobar('ningún reajuste vigente', await vigentes(idVm) === 0);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n5. Lo que NO cambia');
    {
        // Una reversión pedida desde el historial es una decisión: pagar después
        // otra cuota por su valor exacto no la deshace.
        const { idVm } = await sembrar();
        const original = foto(await leer(idVm));
        const pago = await pagar(idVm, 1, 300000);
        const rev = await fetch(`${BASE}/admin/payments/abonos/${pago.body.abonoExtraordinario.registroId}/revertir`, { method: 'POST', headers: H });
        comprobar('revertir desde el historial sigue funcionando', rev.status === 200, `HTTP ${rev.status}`);
        const siguiente = await pagar(idVm, 2, 0);
        comprobar('pagar la cuota siguiente por su valor no reaplica lo revertido', siguiente.body.abonoExtraordinario?.aplicado !== true, JSON.stringify(siguiente.body.abonoExtraordinario));
        comprobar('las cuotas 3 a 12 siguen como el original', iguales(foto(await leer(idVm)).slice(2), original.slice(2)));

        // Una cuota sin abono se desmarca como siempre, sin preguntas.
        const b = await sembrar();
        await pagar(b.idVm, 1, 0);
        const normal = await guardar((await leer(b.idVm))[0], { estado: 'Pendiente' });
        comprobar('una cuota sin abono se desmarca sin confirmación', normal.status === 200 && !normal.body.abonoRevertido, `HTTP ${normal.status}`);

        // Eliminar la cuota abonada sigue pidiendo revertir antes.
        const c = await sembrar();
        await pagar(c.idVm, 1, 300000);
        const borrar = await fetch(`${BASE}/admin/payments/${(await leer(c.idVm))[0].id}`, { method: 'DELETE', headers: H });
        comprobar('eliminar una cuota abonada sigue bloqueado', borrar.status === 409, `HTTP ${borrar.status}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n6. Al socio se le avisa y su informe se retira');
    {
        // Revertir desde el historial.
        const { idVm, socio } = await sembrar();
        const pago = await pagar(idVm, 1, 300000);
        const HS = await entrarComo(socio);
        const antes = await informesDe(HS, idVm);
        comprobar('el abono le publicó un informe al socio', antes.length === 1, JSON.stringify(antes));
        comprobar('y se lo avisó', (await avisos(socio.id, INFORME_NUEVO)).length === 1);
        const nombre = antes[0]?.name;
        comprobar('el socio lo puede abrir', (await abrirInforme(HS, nombre)).status === 200);

        const rev = await fetch(`${BASE}/admin/payments/abonos/${pago.body.abonoExtraordinario.registroId}/revertir`, { method: 'POST', headers: H }).then(r => r.json());
        comprobar('revertir responde que avisó', rev.avisado === true, JSON.stringify(rev));
        comprobar('y que retiró el informe', (rev.informesRetirados || []).includes(nombre), JSON.stringify(rev.informesRetirados));
        const aviso = await avisos(socio.id, REVERTIDO);
        comprobar('el socio recibe un aviso de la reversión', aviso.length === 1);
        comprobar('con el importe del abono', /\$300\.000/.test(aviso[0]?.message || ''), aviso[0]?.message);
        comprobar('que dice que su pago sigue registrado', /sigue registrado/.test(aviso[0]?.message || ''));
        comprobar('y que el informe se retiró', /se retiró de tus informes/.test(aviso[0]?.message || ''));
        comprobar('el informe ya no sale en la lista del socio', (await informesDe(HS, idVm)).length === 0);
        const yaNo = await abrirInforme(HS, nombre);
        comprobar('y al abrirlo se le explica que fue retirado', yaNo.status === 410 && /revertido/.test((await yaNo.json()).error || ''), `HTTP ${yaNo.status}`);
        const paraElGerente = await informesDe(H, idVm);
        comprobar('el gerente lo conserva, marcado como retirado', paraElGerente.length === 1 && paraElGerente[0].retirado === true, JSON.stringify(paraElGerente));
        comprobar('y lo puede seguir abriendo', (await abrirInforme(H, nombre)).status === 200);
    }
    {
        // Desmarcar desde el formulario: un solo aviso, el de la reversión.
        const { idVm, socio } = await sembrar();
        await pagar(idVm, 1, 300000);
        const HS = await entrarComo(socio);
        const r = await guardar((await leer(idVm))[0], { estado: 'Pendiente', revertirAbono: true });
        comprobar('al desmarcar, la respuesta trae el informe retirado', (r.body.abonoRevertido?.informesRetirados || []).length === 1, JSON.stringify(r.body.abonoRevertido));
        comprobar('el socio recibe un solo aviso de reversión', (await avisos(socio.id, REVERTIDO)).length === 1);
        comprobar('y ninguno de corrección', (await avisos(socio.id, CORREGIDO)).length === 0);
        comprobar('su informe deja de aparecer', (await informesDe(HS, idVm)).length === 0);
    }
    {
        // Bajar el valor: el abono se vuelve a aplicar, así que el aviso es de
        // corrección y el informe nuevo ocupa el lugar del retirado.
        const { idVm, socio } = await sembrar();
        await pagar(idVm, 1, 300000);
        const HS = await entrarComo(socio);
        const fila = (await leer(idVm))[0];
        const r = await guardar(fila, { valorCuotaPago: num(fila.valorCuotaVariable) + 100000, revertirAbono: true });
        comprobar('al corregir el valor el abono se reaplica', r.body.abonoExtraordinario?.aplicado === true);
        const corregido = await avisos(socio.id, CORREGIDO);
        comprobar('el socio recibe un aviso de corrección', corregido.length === 1);
        comprobar('con el importe que quedó abonado', /\$100\.000/.test(corregido[0]?.message || ''), corregido[0]?.message);
        comprobar('y ninguno de reversión', (await avisos(socio.id, REVERTIDO)).length === 0);
        const lista = await informesDe(HS, idVm);
        comprobar('el socio vuelve a tener un informe vigente', lista.length === 1 && !lista[0].retirado, JSON.stringify(lista));
        comprobar('con las cifras corregidas', lista[0]?.resumen?.excedente === 100000, JSON.stringify(lista[0]?.resumen));
        comprobar('y se le avisa del informe nuevo', (await avisos(socio.id, INFORME_NUEVO)).length === 2);
    }
    {
        // Segundo abono de un crédito: el aviso habla de ESE abono, no del acumulado.
        const { idVm, socio } = await sembrar();
        await pagar(idVm, 1, 221333.33);
        await pagar(idVm, 2, 288886.55);
        const HS = await entrarComo(socio);
        // Dos abonos el mismo día son dos informes: el segundo no pisa al primero.
        const dos = await informesDe(HS, idVm);
        comprobar('antes de revertir tiene un informe por cada abono', dos.length === 2, JSON.stringify(dos.map((i) => i.name)));
        await guardar((await leer(idVm))[1], { estado: 'Pendiente', revertirAbono: true });
        const aviso = await avisos(socio.id, REVERTIDO);
        comprobar('el aviso da el importe del segundo abono', /\$288\.887/.test(aviso[0]?.message || ''), aviso[0]?.message);
        comprobar('y aclara que los anteriores siguen aplicados', /anteriores siguen aplicados/.test(aviso[0]?.message || ''));
        const queda = await informesDe(HS, idVm);
        comprobar('solo se retira el informe del abono revertido', queda.length === 1 && /cuota 1$/.test(queda[0].titulo || ''), JSON.stringify(queda.map((i) => i.titulo)));
    }

    console.log('\n──────────────────────────────────────────────');
    console.log(`${ok} comprobaciones correctas · ${fallos} fallidas`);
    console.log('──────────────────────────────────────────────\n');

    try { fs.unlinkSync(RUTA); } catch { /* la base temporal ya no importa */ }
    process.exit(fallos === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
