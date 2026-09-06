#!/usr/bin/env node
/**
 * Banco de pruebas del retanqueo (refinanciación).
 *
 * Corre sobre una base de datos temporal propia —nunca sobre la real— y ejercita
 * el endpoint REAL `POST /disbursed-loans` y su previsualización, porque el
 * cálculo del interés proporcional depende de cómo Sequelize entrega las fechas
 * (DATEONLY llega como texto, `safeParseDateAdmin` devuelve un Date con
 * componentes locales) y eso solo se ve de verdad pasando por la ruta completa.
 *
 * Fija el huso a UTC a propósito: es el del contenedor de producción, y es
 * precisamente donde se manifiestan los dos defectos que estas pruebas cubren.
 *
 *   node pruebas_retanqueo.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const RUTA = path.join(os.tmpdir(), `credifuturo-retanqueo-${process.pid}.sqlite`);
process.env.DATABASE_PATH = RUTA;
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.NODE_ENV = 'development';
process.env.PORT = '3041';
process.env.TZ = 'UTC'; // el huso del contenedor de Railway

const bcrypt = require('bcryptjs');
const sequelize = require('./config/database');
const { Client, DisbursedLoan, LoanPayment, Saving } = require('./models');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => '$' + Math.round(num(n)).toLocaleString('es-CO');

let ok = 0, fallos = 0;
const cerca = (a, b, tol = 1) => Math.abs(num(a) - num(b)) <= tol;

function comprobar(descripcion, condicion, detalle = '') {
    if (condicion) { ok++; console.log(`   ✓ ${descripcion}`); }
    else { fallos++; console.log(`   ✗ ${descripcion}${detalle ? ` — ${detalle}` : ''}`); }
}

let secuencia = 0;
let H = null;
const BASE = `http://127.0.0.1:${process.env.PORT}/api`;

/**
 * Siembra un socio con un préstamo vigente de `cuotas` cuotas, de las cuales las
 * `pagadas` primeras quedan saldadas. Devuelve el socio y el saldo pendiente.
 */
async function sembrar({ principal, cuotas, tasa, pagadas = 0, fechaPrestamo, vencimientos, ahorro = 50000000 }) {
    secuencia++;
    const socio = await Client.create({
        name: `Socio${secuencia}`, apellido1: 'Prueba', cedula: `7700${secuencia}`,
        customerId: `${7700 + secuencia}`, email: `s${secuencia}@prueba.local`,
        password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo',
    });
    await Saving.create({
        clientId: socio.id, amount: ahorro, valorAhorrado: ahorro, type: 'Mensual',
        status: 'Abono', monthInt: 1, year: 2026, mesAbonado: 1, anioAbonado: 2026, date: '2026-01-15',
    });

    const idVm = `SOLT${secuencia}`;
    await DisbursedLoan.create({
        idVm, clientId: socio.id, valorPrestado: principal, cuotas, interesMensual: tasa,
        estado: 'Vigente', fechaPrestamo, mesDesembolso: 'Enero', anioDesembolso: 2026, monto: principal,
    });

    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const capital = principal / cuotas;
    let saldo = principal;
    const filas = [];
    for (let i = 1; i <= cuotas; i++) {
        const interes = parseFloat((saldo * tasa).toFixed(2));
        const yaPagada = i <= pagadas;
        const vence = vencimientos[i - 1];
        filas.push({
            externalId: `PT${secuencia}_${i}`, clientId: socio.id, idVm, itemQuantity: i,
            saldoInicial: parseFloat(saldo.toFixed(2)),
            valorInteresesAmortizados: interes,
            valorCuotaVariable: parseFloat((capital + interes).toFixed(2)),
            valorCuotaPago: yaPagada ? parseFloat((capital + interes).toFixed(2)) : 0,
            saldoFinal: parseFloat((saldo - capital).toFixed(2)),
            estado: yaPagada ? 'Pago' : 'Pendiente',
            estadoPrestamo: yaPagada ? 'Pago' : 'Pendiente',
            cuotasPrestamo: cuotas, interesMensual: tasa,
            fechaPagoMax: vence,
            mesPago: MESES[parseInt(vence.slice(5, 7), 10) - 1],
            mesDesembolso: 'Enero',
        });
        saldo -= capital;
    }
    await LoanPayment.bulkCreate(filas);
    return { socio, idVm, saldoPendiente: num(filas[pagadas].saldoInicial) };
}

const previsualizar = (clientId, fecha) =>
    fetch(`${BASE}/admin/clients/${clientId}/active-loan?fecha=${fecha}`, { headers: H }).then(r => r.json());

const desembolsar = (cuerpo) =>
    fetch(`${BASE}/admin/disbursed-loans`, { method: 'POST', headers: H, body: JSON.stringify(cuerpo) })
        .then(async r => ({ status: r.status, body: await r.json() }));

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
    console.log('  BANCO DE PRUEBAS DEL RETANQUEO');
    console.log('══════════════════════════════════════════════');

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n1. Préstamo SIN cuotas pagadas: el periodo arranca en la fecha del préstamo');
    // El interés corre desde que se desembolsó. 13 días al 1,4% sobre 4.000.000.
    {
        const { socio } = await sembrar({
            principal: 4000000, cuotas: 6, tasa: 0.014, pagadas: 0,
            fechaPrestamo: '2026-08-17',
            vencimientos: ['2026-09-10','2026-10-10','2026-11-10','2026-12-10','2027-01-10','2027-02-10'],
        });
        const p = (await previsualizar(socio.id, '2026-08-30')).prestamo;
        comprobar('cuenta 13 días entre el 17 y el 30 de agosto', p.diasTranscurridos === 13, `dio ${p.diasTranscurridos}`);
        comprobar('cobra $24.267 de interés causado', cerca(p.interesCausado, 24266.67, 1), `dio ${money(p.interesCausado)}`);
        comprobar('condona el resto del interés pactado', cerca(p.interesCondonable, 196000 - 24266.67, 2), `dio ${money(p.interesCondonable)}`);
        comprobar('el total a cancelar suma capital + interés causado', cerca(p.totalACancelar, 4000000 + 24267, 2), `dio ${money(p.totalACancelar)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n2. Préstamo CON cuotas pagadas: el periodo arranca un mes antes del vencimiento');
    // REGRESIÓN CUBIERTA: safeParseDateAdmin devuelve un Date con componentes
    // locales; pasarlo por una conversión a America/Bogota le restaba un día en
    // un servidor UTC y le cobraba al socio una jornada de interés de más.
    {
        const { socio } = await sembrar({
            principal: 6000000, cuotas: 6, tasa: 0.014, pagadas: 2,
            fechaPrestamo: '2026-06-10',
            vencimientos: ['2026-08-10','2026-09-10','2026-10-10','2026-11-10','2026-12-10','2027-01-10'],
        });
        // Primera pendiente: la 3, vence 2026-10-10 -> su periodo arrancó el 2026-09-10.
        const p = (await previsualizar(socio.id, '2026-09-25')).prestamo;
        comprobar('cuenta 15 días, no 16 (sin desfase de huso)', p.diasTranscurridos === 15, `dio ${p.diasTranscurridos}`);
        comprobar('cobra $28.000 y no $29.867', cerca(p.interesCausado, 28000, 1), `dio ${money(p.interesCausado)}`);
        comprobar('el saldo pendiente es el de la primera cuota sin pagar', cerca(p.saldoPendiente, 4000000, 1), `dio ${money(p.saldoPendiente)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n3. Vencimiento en día 31: restar un mes no puede saltar de mes');
    // REGRESIÓN CUBIERTA: setUTCMonth(m-1) sobre el 31 de marzo daba el 3 de
    // MARZO (febrero no tiene 31), moviendo el arranque casi un mes entero.
    {
        const { socio } = await sembrar({
            principal: 6000000, cuotas: 6, tasa: 0.014, pagadas: 2,
            fechaPrestamo: '2026-01-31',
            vencimientos: ['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31','2026-06-30'],
        });
        // Primera pendiente: la 3, vence 2026-03-31 -> el periodo arrancó el 2026-02-28.
        const p = (await previsualizar(socio.id, '2026-03-15')).prestamo;
        const esperados = Math.ceil((Date.UTC(2026, 2, 15) - Date.UTC(2026, 1, 28)) / 86400000);
        comprobar(`el periodo arranca el 28 de febrero (${esperados} días)`, p.diasTranscurridos === esperados, `dio ${p.diasTranscurridos}`);
        comprobar('el interés causado no se desploma', p.interesCausado > 0, `dio ${money(p.interesCausado)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n4. El tope de 30 días se respeta');
    {
        const { socio } = await sembrar({
            principal: 4000000, cuotas: 6, tasa: 0.014, pagadas: 0,
            fechaPrestamo: '2026-01-10',
            vencimientos: ['2026-02-10','2026-03-10','2026-04-10','2026-05-10','2026-06-10','2026-07-10'],
        });
        const p = (await previsualizar(socio.id, '2026-06-01')).prestamo; // cinco meses después
        comprobar('nunca cobra más de 30 días', p.diasTranscurridos === 30, `dio ${p.diasTranscurridos}`);
        comprobar('el interés causado es el de un mes completo', cerca(p.interesCausado, 56000, 1), `dio ${money(p.interesCausado)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n5. Periodo aún no arrancado: no se cobra nada, y no sale negativo');
    {
        const { socio } = await sembrar({
            principal: 6000000, cuotas: 6, tasa: 0.014, pagadas: 4,
            fechaPrestamo: '2026-01-10',
            vencimientos: ['2026-02-10','2026-03-10','2026-04-10','2026-05-10','2026-11-10','2026-12-10'],
        });
        // Primera pendiente: la 5, vence 2026-11-10 -> periodo desde 2026-10-10, aún futuro.
        const p = (await previsualizar(socio.id, '2026-09-05')).prestamo;
        comprobar('cobra 0 días, nunca negativos', p.diasTranscurridos === 0, `dio ${p.diasTranscurridos}`);
        comprobar('el interés causado es exactamente 0', num(p.interesCausado) === 0, `dio ${money(p.interesCausado)}`);
        comprobar('el total a cancelar es solo capital', cerca(p.totalACancelar, p.saldoPendiente, 1), `dio ${money(p.totalACancelar)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n6. La previsualización coincide EXACTAMENTE con lo que se cobra');
    {
        const { socio, idVm } = await sembrar({
            principal: 6000000, cuotas: 6, tasa: 0.014, pagadas: 2,
            fechaPrestamo: '2026-06-10',
            vencimientos: ['2026-08-10','2026-09-10','2026-10-10','2026-11-10','2026-12-10','2027-01-10'],
        });
        const FECHA = '2026-09-25';
        const p = (await previsualizar(socio.id, FECHA)).prestamo;
        const { status, body } = await desembolsar({
            clientId: socio.id, fechaPrestamo: FECHA, mesDesembolso: 'Septiembre', anioDesembolso: 2026,
            valorPrestado: 9000000, cuotas: 6, interesMensual: 0.014, estado: 'Vigente',
        });
        comprobar('el desembolso se registra', status === 201, `HTTP ${status} ${JSON.stringify(body).slice(0, 160)}`);
        const ref = body.refinanciacion || {};
        comprobar('cancela el préstamo anterior', ref.idVmAnterior === idVm, `dio ${ref.idVmAnterior}`);
        comprobar('el interés cobrado es el previsualizado', ref.interesCausado === p.interesCausado,
            `previsto ${money(p.interesCausado)} vs cobrado ${money(ref.interesCausado)}`);
        comprobar('los días cobrados son los previsualizados', ref.diasTranscurridos === p.diasTranscurridos,
            `previstos ${p.diasTranscurridos} vs cobrados ${ref.diasTranscurridos}`);
        comprobar('el total a cancelar es el previsualizado', ref.totalCancelado === p.totalACancelar,
            `previsto ${money(p.totalACancelar)} vs cobrado ${money(ref.totalCancelado)}`);
        comprobar('el neto entregado es préstamo menos total cancelado',
            ref.netoEntregado === 9000000 - ref.totalCancelado, `dio ${money(ref.netoEntregado)}`);

        // El dinero tiene que cuadrar en las cuotas saldadas.
        const viejas = await LoanPayment.findAll({ where: { idVm } });
        const cobrado = viejas.reduce((s, c) => s + num(c.valorCuotaPago), 0);
        const capitalYaPagado = viejas.filter(c => num(c.valorCuotaPago) > 0 && !c.esPrepago).length;
        const soloRetanqueadas = viejas.filter(c => c.esPrepago);
        const cobradoRetanqueo = soloRetanqueadas.reduce((s, c) => s + num(c.valorCuotaPago), 0);
        comprobar('lo saldado en el retanqueo = capital pendiente + interés causado',
            cerca(cobradoRetanqueo, ref.capitalCancelado + ref.interesCausado, 2),
            `dio ${money(cobradoRetanqueo)} vs ${money(ref.capitalCancelado + ref.interesCausado)}`);
        comprobar('solo la cuota más antigua carga el interés causado',
            soloRetanqueadas.filter(c => num(c.valorInteresesAmortizados) > 0).length === 1);
        comprobar('todas las cuotas quedan saldadas', soloRetanqueadas.every(c => c.estado === 'Pago'));
        comprobar('el préstamo anterior queda cancelado',
            (await DisbursedLoan.findOne({ where: { idVm } })).estado === 'Cancelado');
        void cobrado; void capitalYaPagado;
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n7. Neto negativo: el préstamo nuevo no cubre lo que se cancela');
    {
        const { socio } = await sembrar({
            principal: 6000000, cuotas: 6, tasa: 0.014, pagadas: 0,
            fechaPrestamo: '2026-08-17',
            vencimientos: ['2026-09-10','2026-10-10','2026-11-10','2026-12-10','2027-01-10','2027-02-10'],
        });
        const { status, body } = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-08-30', mesDesembolso: 'Agosto', anioDesembolso: 2026,
            valorPrestado: 2000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        comprobar('se permite (el socio consigna la diferencia)', status === 201, `HTTP ${status}`);
        const ref = body.refinanciacion || {};
        comprobar('el neto sale negativo', ref.netoEntregado < 0, `dio ${money(ref.netoEntregado)}`);
        comprobar('el neto es exactamente préstamo menos cancelado',
            ref.netoEntregado === 2000000 - ref.totalCancelado, `dio ${money(ref.netoEntregado)}`);
        const nuevo = await DisbursedLoan.findByPk(body.loan.id);
        comprobar('queda constancia de que el socio debe consignar',
            /debe consignar/i.test(nuevo.observaciones || ''), `obs: ${nuevo.observaciones}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n8. Sin préstamo vigente no hay refinanciación');
    {
        const socio = await Client.create({
            name: 'Nuevo', apellido1: 'Socio', cedula: '7799001', customerId: '7799001',
            email: 'nuevo@prueba.local', password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo',
        });
        await Saving.create({
            clientId: socio.id, amount: 50000000, valorAhorrado: 50000000, type: 'Mensual',
            status: 'Abono', monthInt: 1, year: 2026, mesAbonado: 1, anioAbonado: 2026, date: '2026-01-15',
        });
        const previo = await previsualizar(socio.id, '2026-09-05');
        comprobar('la previsualización dice que no hay préstamo activo', previo.tienePrestamoActivo === false);
        const { status, body } = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-09-05', mesDesembolso: 'Septiembre', anioDesembolso: 2026,
            valorPrestado: 3000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        comprobar('el desembolso se registra', status === 201, `HTTP ${status}`);
        comprobar('no se reporta refinanciación', !body.refinanciacion);
        comprobar('no se ensucian las observaciones', !/Retanqueo/i.test(body.loan.observaciones || ''));
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n9. Editar un préstamo con cuotas pagadas no puede tocar su fecha de desembolso');
    // El 409 salía DESPUÉS del update, así que la fecha ya quedaba cambiada: el gerente
    // leía "no se puede regenerar" y daba por hecho que no había pasado nada. Como el
    // interés del retanqueo se cuenta desde esa fecha, el préstamo dejaba de cobrarlo.
    {
        const { socio, idVm } = await sembrar({
            principal: 6000000, cuotas: 6, tasa: 0.014, pagadas: 2,
            fechaPrestamo: '2026-06-10',
            vencimientos: ['2026-08-10','2026-09-10','2026-10-10','2026-11-10','2026-12-10','2027-01-10'],
        });
        const antes = await DisbursedLoan.findOne({ where: { idVm } });
        const r = await fetch(`${BASE}/admin/disbursed-loans/${antes.id}`, {
            method: 'PUT', headers: H,
            body: JSON.stringify({
                clientId: socio.id, fechaPrestamo: '2026-09-05', mesDesembolso: 'Septiembre',
                anioDesembolso: 2026, valorPrestado: 6000000, cuotas: 6, interesMensual: 0.014,
                numeroTransaccion: 'CORRECCION-123',
            }),
        });
        comprobar('el servidor se niega a regenerar', r.status === 409, `HTTP ${r.status}`);
        const despues = await DisbursedLoan.findOne({ where: { idVm } });
        comprobar('la fecha de desembolso NO cambió',
            String(despues.fechaPrestamo).slice(0, 10) === '2026-06-10',
            `quedó en ${despues.fechaPrestamo}`);
        comprobar('el mes de desembolso NO cambió', despues.mesDesembolso === 'Enero',
            `quedó en ${despues.mesDesembolso}`);

        // Y por tanto el retanqueo sigue cobrando lo que corresponde.
        const p = (await previsualizar(socio.id, '2026-09-25')).prestamo;
        comprobar('el retanqueo sigue cobrando interés causado', num(p.interesCausado) > 0,
            `dio ${money(p.interesCausado)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n10. Una guarda que rechaza el desembolso SIEMPRE responde, y no deja transacción abierta');
    // El catch revertía la transacción sin mirar si ya estaba confirmada. Si algo fallaba
    // después del commit, el rollback lanzaba, el throw escapaba del handler y Express se
    // quedaba mudo: petición colgada, cero rastro en los registros, y la operación hecha.
    {
        const socio = await Client.create({
            name: 'Sin', apellido1: 'Cupo', cedula: '7799002', customerId: '7799002',
            email: 'sincupo@prueba.local', password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo',
        });
        await Saving.create({
            clientId: socio.id, amount: 10000, valorAhorrado: 10000, type: 'Mensual',
            status: 'Abono', monthInt: 1, year: 2026, mesAbonado: 1, anioAbonado: 2026, date: '2026-01-15',
        });
        // Doce rechazos seguidos: cada uno tiene que responder, no colgarse.
        let respondieron = 0;
        for (let i = 0; i < 12; i++) {
            const r = await Promise.race([
                desembolsar({
                    clientId: socio.id, fechaPrestamo: '2026-09-05', mesDesembolso: 'Septiembre',
                    anioDesembolso: 2026, valorPrestado: 9000000, cuotas: 6, interesMensual: 0.014, estado: 'Vigente',
                }).then(r => r.status),
                new Promise(res => setTimeout(() => res('COLGADA'), 8000)),
            ]);
            if (r === 400) respondieron++;
        }
        comprobar('las 12 peticiones rechazadas responden 400', respondieron === 12, `respondieron ${respondieron}`);

        // Y el servidor sigue aceptando escrituras después de esos rechazos.
        const otro = await Client.create({
            name: 'Con', apellido1: 'Cupo', cedula: '7799003', customerId: '7799003',
            email: 'concupo@prueba.local', password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo',
        });
        await Saving.create({
            clientId: otro.id, amount: 50000000, valorAhorrado: 50000000, type: 'Mensual',
            status: 'Abono', monthInt: 1, year: 2026, mesAbonado: 1, anioAbonado: 2026, date: '2026-01-15',
        });
        const bueno = await Promise.race([
            desembolsar({
                clientId: otro.id, fechaPrestamo: '2026-09-05', mesDesembolso: 'Septiembre',
                anioDesembolso: 2026, valorPrestado: 3000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
            }).then(r => r.status),
            new Promise(res => setTimeout(() => res('COLGADA'), 8000)),
        ]);
        comprobar('un desembolso válido posterior sigue funcionando', bueno === 201, `dio ${bueno}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n11. Deshacer un retanqueo devuelve el préstamo al estado exacto que tenía');
    // La reversión reconstruye cada cuota en vez de restaurar lo que había. Si el
    // cronograma no responde al capital pactado —porque el socio hizo un abono a
    // capital, o porque viene migrado— la reconstrucción le devuelve una deuda que
    // ya había pagado.
    {
        const { socio, idVm } = await sembrar({
            principal: 6000000, cuotas: 6, tasa: 0.014, pagadas: 0,
            fechaPrestamo: '2026-08-17',
            vencimientos: ['2026-09-10','2026-10-10','2026-11-10','2026-12-10','2027-01-10','2027-02-10'],
        });

        // El socio abonó a capital: el cronograma real deja de responder a
        // valorPrestado/cuotas. Se rebaja el saldo de las cuotas 2 en adelante.
        const ABONO = 600000;
        const previas = await LoanPayment.findAll({ where: { idVm }, order: [['item_quantity', 'ASC']] });
        for (const c of previas) {
            if (c.itemQuantity === 1) continue;
            const saldoInicial = num(c.saldoInicial) - ABONO;
            const saldoFinal = Math.max(0, num(c.saldoFinal) - ABONO);
            const interes = parseFloat((saldoInicial * 0.014).toFixed(2));
            await c.update({
                saldoInicial, saldoFinal,
                valorInteresesAmortizados: interes,
                valorCuotaVariable: parseFloat(((saldoInicial - saldoFinal) + interes).toFixed(2)),
            });
        }
        // Foto del estado ANTES del retanqueo, que es a lo que hay que volver.
        const antes = (await LoanPayment.findAll({ where: { idVm }, order: [['item_quantity', 'ASC']] }))
            .map(c => ({
                n: c.itemQuantity, estado: c.estado,
                saldoInicial: num(c.saldoInicial), saldoFinal: num(c.saldoFinal),
                cuota: num(c.valorCuotaVariable), interes: num(c.valorInteresesAmortizados),
            }));

        const { status, body } = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-08-30', mesDesembolso: 'Agosto', anioDesembolso: 2026,
            valorPrestado: 9000000, cuotas: 6, interesMensual: 0.014, estado: 'Vigente',
        });
        comprobar('el retanqueo se registra', status === 201, `HTTP ${status}`);

        // Un comprobante adjunto a una cuota del préstamo NUEVO: al borrarlo hay que
        // poder eliminarlo también, o la clave foránea aborta la reversión entera.
        const Soporte = require('./models/Soporte');
        const cuotaNueva = await LoanPayment.findOne({ where: { idVm: body.loan.idVm }, order: [['item_quantity', 'ASC']] });
        await Soporte.create({
            paymentId: cuotaNueva.id, clientId: socio.id,
            nombreArchivo: 'comprobante.png', tipoArchivo: 'image/png',
            archivo: Buffer.from('prueba'),
        }).catch(() => { /* si el modelo exige otras columnas, la prueba de FK se omite sola */ });

        const rBorrado = await fetch(`${BASE}/admin/disbursed-loans/${body.loan.id}`, { method: 'DELETE', headers: H });
        const cuerpoBorrado = await rBorrado.json().catch(() => ({}));
        comprobar('el borrado responde correctamente', rBorrado.status === 200,
            `HTTP ${rBorrado.status} ${JSON.stringify(cuerpoBorrado).slice(0, 200)}`);

        const despues = (await LoanPayment.findAll({ where: { idVm }, order: [['item_quantity', 'ASC']] }))
            .map(c => ({
                n: c.itemQuantity, estado: c.estado,
                saldoInicial: num(c.saldoInicial), saldoFinal: num(c.saldoFinal),
                cuota: num(c.valorCuotaVariable), interes: num(c.valorInteresesAmortizados),
            }));

        comprobar('vuelven todas las cuotas', despues.length === antes.length,
            `antes ${antes.length}, después ${despues.length}`);

        // Compara campo a campo y dice CUÁL difiere, no solo que difiere.
        const diffs = [];
        for (const a of antes) {
            const d = despues.find(x => x.n === a.n);
            if (!d) { diffs.push(`cuota ${a.n}: desapareció`); continue; }
            for (const campo of ['saldoInicial', 'saldoFinal', 'cuota', 'interes']) {
                if (!cerca(a[campo], d[campo], 1)) {
                    diffs.push(`cuota ${a.n} ${campo}: ${money(a[campo])} -> ${money(d[campo])}`);
                }
            }
        }
        comprobar('el cronograma vuelve exactamente al estado anterior', diffs.length === 0,
            diffs.slice(0, 3).join(' · ') + (diffs.length > 3 ? ` (+${diffs.length - 3} más)` : ''));

        const vigentes = await DisbursedLoan.count({ where: { clientId: socio.id, estado: 'Vigente' } });
        comprobar('el socio queda con un solo préstamo vigente', vigentes === 1, `tiene ${vigentes}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n11b. Deshacer no puede repartir el capital según un número de cuotas que no existe');
    // `DisbursedLoan.cuotas` puede no coincidir con las filas reales del cronograma
    // (préstamos migrados, retanqueos a medio cerrar). La reversión divide el capital
    // por ese campo en vez de leerlo del cronograma, que es la regla que el motor de
    // abonos ya aprendió: dividir por ahí duplica el capital y cancela cuotas que el
    // socio sigue debiendo.
    {
        const { socio, idVm } = await sembrar({
            principal: 6000000, cuotas: 6, tasa: 0.014, pagadas: 0,
            fechaPrestamo: '2026-08-17',
            vencimientos: ['2026-09-10','2026-10-10','2026-11-10','2026-12-10','2027-01-10','2027-02-10'],
        });
        // El campo dice 8 cuotas; el cronograma real tiene 6.
        await DisbursedLoan.update({ cuotas: 8 }, { where: { idVm } });

        const capitalRealPorCuota = 6000000 / 6;   // 1.000.000, lo que dice el cronograma
        const capitalSegunCampo   = 6000000 / 8;   //   750.000, lo que usa la reversión

        const { body } = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-08-30', mesDesembolso: 'Agosto', anioDesembolso: 2026,
            valorPrestado: 9000000, cuotas: 6, interesMensual: 0.014, estado: 'Vigente',
        });
        await fetch(`${BASE}/admin/disbursed-loans/${body.loan.id}`, { method: 'DELETE', headers: H });

        const restauradas = await LoanPayment.findAll({ where: { idVm }, order: [['item_quantity', 'ASC']] });
        const capitalTras = num(restauradas[0].saldoInicial) - num(restauradas[0].saldoFinal);
        comprobar('el capital por cuota sale del cronograma, no del campo `cuotas`',
            cerca(capitalTras, capitalRealPorCuota, 2),
            `dio ${money(capitalTras)}; el cronograma dice ${money(capitalRealPorCuota)} y el campo ${money(capitalSegunCampo)}`);

        const capitalTotal = restauradas.reduce((s, c) => s + (num(c.saldoInicial) - num(c.saldoFinal)), 0);
        comprobar('el capital restaurado suma lo prestado', cerca(capitalTotal, 6000000, 5),
            `sumó ${money(capitalTotal)} de ${money(6000000)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n12. Deshacer un retanqueo encadenado no deja dos préstamos vigentes');
    // A retanqueado por B, y B por C. Borrar B resucita A mientras C sigue vigente.
    {
        const { socio, idVm: idA } = await sembrar({
            principal: 3000000, cuotas: 3, tasa: 0.014, pagadas: 0,
            fechaPrestamo: '2026-08-17',
            vencimientos: ['2026-10-10','2026-11-10','2026-12-10'],
        });
        const b = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-08-25', mesDesembolso: 'Agosto', anioDesembolso: 2026,
            valorPrestado: 5000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        const c = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-09-01', mesDesembolso: 'Septiembre', anioDesembolso: 2026,
            valorPrestado: 7000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        comprobar('los dos retanqueos encadenados se registran', b.status === 201 && c.status === 201,
            `B ${b.status}, C ${c.status}`);

        const rB = await fetch(`${BASE}/admin/disbursed-loans/${b.body.loan.id}`, { method: 'DELETE', headers: H });
        const cuerpoB = await rB.json().catch(() => ({}));
        comprobar('borrar el eslabón intermedio se rechaza', rB.status === 409, `HTTP ${rB.status}`);
        comprobar('y explica que hay que empezar por el último',
            /refinanciado por|Elimina primero/i.test(cuerpoB.error || ''), `dijo: ${cuerpoB.error}`);

        const vigentes = await DisbursedLoan.findAll({ where: { clientId: socio.id, estado: 'Vigente' } });
        comprobar('el socio NO queda con dos préstamos vigentes', vigentes.length === 1,
            `tiene ${vigentes.length}: ${vigentes.map(v => v.idVm).join(', ')}`);

        // Deshacer en orden (del último al primero) sí funciona.
        const rC = await fetch(`${BASE}/admin/disbursed-loans/${c.body.loan.id}`, { method: 'DELETE', headers: H });
        comprobar('deshacer desde el último sí se permite', rC.status === 200, `HTTP ${rC.status}`);
        const trasC = await DisbursedLoan.findAll({ where: { clientId: socio.id, estado: 'Vigente' } });
        comprobar('y deja un único vigente, el intermedio', trasC.length === 1 && trasC[0].idVm === b.body.loan.idVm,
            `quedaron ${trasC.map(v => v.idVm).join(', ')}`);
        void idA;
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n13. Con dos préstamos vigentes, el retanqueo se niega en vez de cancelar uno al azar');
    // La búsqueda del préstamo a cancelar toma el de id más alto. Con dos vigentes eso
    // dejaría el otro vivo sin que nadie lo decida, y fuera del alcance de cualquier
    // retanqueo posterior, que volvería a tomar el más nuevo.
    {
        const { socio, idVm: idPrimero } = await sembrar({
            principal: 3000000, cuotas: 3, tasa: 0.014, pagadas: 0,
            fechaPrestamo: '2026-08-17',
            vencimientos: ['2026-10-10','2026-11-10','2026-12-10'],
        });
        // Un segundo préstamo vigente del mismo socio, como el que dejaba la reversión rota.
        secuencia++;
        const idSegundo = `SOLT${secuencia}`;
        await DisbursedLoan.create({
            idVm: idSegundo, clientId: socio.id, valorPrestado: 2000000, cuotas: 2,
            interesMensual: 0.014, estado: 'Vigente', fechaPrestamo: '2026-08-20',
            mesDesembolso: 'Agosto', anioDesembolso: 2026, monto: 2000000,
        });
        await LoanPayment.bulkCreate([1, 2].map(i => ({
            externalId: `PD${secuencia}_${i}`, clientId: socio.id, idVm: idSegundo, itemQuantity: i,
            saldoInicial: i === 1 ? 2000000 : 1000000, valorInteresesAmortizados: i === 1 ? 28000 : 14000,
            valorCuotaVariable: i === 1 ? 1028000 : 1014000, valorCuotaPago: 0,
            saldoFinal: i === 1 ? 1000000 : 0, estado: 'Pendiente', estadoPrestamo: 'Pendiente',
            cuotasPrestamo: 2, interesMensual: 0.014,
            fechaPagoMax: i === 1 ? '2026-10-20' : '2026-11-20',
            mesPago: i === 1 ? 'Octubre' : 'Noviembre', mesDesembolso: 'Agosto',
        })));

        const { status, body } = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-09-05', mesDesembolso: 'Septiembre',
            anioDesembolso: 2026, valorPrestado: 8000000, cuotas: 6, interesMensual: 0.014, estado: 'Vigente',
        });
        comprobar('el desembolso se rechaza', status === 409, `HTTP ${status}`);
        comprobar('el mensaje nombra los dos préstamos',
            (body.error || '').includes(idPrimero) && (body.error || '').includes(idSegundo),
            `dijo: ${body.error}`);
        const sigueVigente = await DisbursedLoan.count({ where: { clientId: socio.id, estado: 'Vigente' } });
        comprobar('no se canceló ninguno de los dos', sigueVigente === 2, `quedan ${sigueVigente}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n14. El cronograma cierra el saldo en cero y suma exactamente lo prestado');
    // Repartir el capital en partes iguales deja céntimos sueltos cuando la división
    // no es exacta, y entonces el crédito no se extingue ni el cuadre da exacto.
    {
        const socio = await Client.create({
            name: 'Cierre', apellido1: 'Exacto', cedula: '7799010', customerId: '7799010',
            email: 'cierre@prueba.local', password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo',
        });
        await Saving.create({
            clientId: socio.id, amount: 50000000, valorAhorrado: 50000000, type: 'Mensual',
            status: 'Abono', monthInt: 1, year: 2026, mesAbonado: 1, anioAbonado: 2026, date: '2026-01-15',
        });
        // 1.000.000 entre 3 no es exacto: es donde aparecía el residuo.
        const { status, body } = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-09-05', mesDesembolso: 'Septiembre',
            anioDesembolso: 2026, valorPrestado: 1000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        comprobar('el desembolso se registra', status === 201, `HTTP ${status}`);
        const filas = await LoanPayment.findAll({ where: { idVm: body.loan.idVm }, order: [['item_quantity', 'ASC']] });
        comprobar('la última cuota deja el saldo en cero exacto', num(filas[filas.length - 1].saldoFinal) === 0,
            `dio ${num(filas[filas.length - 1].saldoFinal)}`);
        const capital = filas.reduce((s2, c) => s2 + (num(c.saldoInicial) - num(c.saldoFinal)), 0);
        comprobar('el capital de las cuotas suma lo prestado', cerca(capital, 1000000, 0.001),
            `sumó ${capital}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n15. El mes de desembolso no depende del huso del proceso');
    // `new Date('YYYY-MM-DD')` es medianoche UTC; leerlo con getMonth() en el huso de
    // Colombia devolvía el mes anterior para un desembolso del día 1.
    {
        const socio = await Client.create({
            name: 'Primero', apellido1: 'DeMes', cedula: '7799011', customerId: '7799011',
            email: 'primero@prueba.local', password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo',
        });
        await Saving.create({
            clientId: socio.id, amount: 50000000, valorAhorrado: 50000000, type: 'Mensual',
            status: 'Abono', monthInt: 1, year: 2026, mesAbonado: 1, anioAbonado: 2026, date: '2026-01-15',
        });
        const { body } = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-09-01', mesDesembolso: 'Septiembre',
            anioDesembolso: 2026, valorPrestado: 3000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        const guardado = await DisbursedLoan.findByPk(body.loan.id);
        comprobar('un desembolso del día 1 se registra en SU mes', guardado.mesDesembolso === 'Septiembre',
            `quedó en ${guardado.mesDesembolso}`);
        comprobar('y en su año', Number(guardado.anioDesembolso) === 2026, `quedó en ${guardado.anioDesembolso}`);
        const primera = await LoanPayment.findOne({ where: { idVm: body.loan.idVm }, order: [['item_quantity', 'ASC']] });
        comprobar('la primera cuota vence el mes siguiente', String(primera.fechaPagoMax).startsWith('2026-10'),
            `vence ${primera.fechaPagoMax}`);

        // Las comprobaciones de arriba pasan igual con el defecto, porque este proceso
        // corre en UTC. Esta fija la propiedad de verdad: con el huso de Colombia, leer
        // el mes en local devuelve AGOSTO para una fecha de septiembre; leerlo en UTC no.
        const husoPrevio = process.env.TZ;
        process.env.TZ = 'America/Bogota';
        const enLocal = new Date('2026-09-01').getMonth();
        const enUTC = new Date('2026-09-01').getUTCMonth();
        process.env.TZ = husoPrevio;
        comprobar('leer el mes en UTC resiste el cambio de huso', enUTC === 8,
            `en UTC dio ${enUTC + 1}`);
        comprobar('y leerlo en local NO lo resiste (por eso se cambió)', enLocal === 7,
            `en local dio ${enLocal + 1}; si coincide con UTC, la prueba dejó de medir nada`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n16. Días de gracia: el 10, o el día del desembolso si fue después');
    // Regla aprobada por la Junta el 6 de septiembre de 2026. Antes el vencimiento
    // estaba fijo en el día 10 para todos, y quien desembolsaba el 15 se quedaba con
    // cinco días de gracia en vez de diez.
    const nuevoSocio = async (cedula) => {
        const c = await Client.create({
            name: `Gracia${cedula}`, apellido1: 'Prueba', cedula: String(cedula), customerId: String(cedula),
            email: `g${cedula}@prueba.local`, password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo',
        });
        await Saving.create({
            clientId: c.id, amount: 50000000, valorAhorrado: 50000000, type: 'Mensual',
            status: 'Abono', monthInt: 1, year: 2026, mesAbonado: 1, anioAbonado: 2026, date: '2026-01-15',
        });
        return c;
    };
    {
        // Desembolso el día 3: la gracia son los diez primeros días -> vence el 10.
        const a = await nuevoSocio(7799020);
        const rA = await desembolsar({
            clientId: a.id, fechaPrestamo: '2026-09-03', mesDesembolso: 'Septiembre', anioDesembolso: 2026,
            valorPrestado: 3000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        const cuotasA = await LoanPayment.findAll({ where: { idVm: rA.body.loan.idVm }, order: [['item_quantity', 'ASC']] });
        comprobar('desembolso el día 3 -> vence el 10', cuotasA[0].fechaPagoMax === '2026-10-10',
            `venció ${cuotasA[0].fechaPagoMax}`);

        // Desembolso el día 15: conserva su margen -> vence el 15.
        const b = await nuevoSocio(7799021);
        const rB = await desembolsar({
            clientId: b.id, fechaPrestamo: '2026-09-15', mesDesembolso: 'Septiembre', anioDesembolso: 2026,
            valorPrestado: 3000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        const cuotasB = await LoanPayment.findAll({ where: { idVm: rB.body.loan.idVm }, order: [['item_quantity', 'ASC']] });
        comprobar('desembolso el día 15 -> vence el 15', cuotasB[0].fechaPagoMax === '2026-10-15',
            `venció ${cuotasB[0].fechaPagoMax}`);
        comprobar('y todas sus cuotas siguen el día 15',
            cuotasB.every(c => String(c.fechaPagoMax).endsWith('-15')),
            cuotasB.map(c => c.fechaPagoMax).join(', '));
        comprobar('el día aplicado queda guardado en el préstamo',
            Number((await DisbursedLoan.findByPk(rB.body.loan.id)).diasPagoMax) === 15,
            `guardó ${(await DisbursedLoan.findByPk(rB.body.loan.id)).diasPagoMax}`);

        // Desembolso el 31 de enero: febrero no tiene 31, hay que recortar al último día.
        const c = await nuevoSocio(7799022);
        const rC = await desembolsar({
            clientId: c.id, fechaPrestamo: '2026-01-31', mesDesembolso: 'Enero', anioDesembolso: 2026,
            valorPrestado: 3000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        const cuotasC = await LoanPayment.findAll({ where: { idVm: rC.body.loan.idVm }, order: [['item_quantity', 'ASC']] });
        comprobar('desembolso el 31 de enero -> la cuota de febrero vence el 28',
            cuotasC[0].fechaPagoMax === '2026-02-28', `venció ${cuotasC[0].fechaPagoMax}`);
        comprobar('y la de marzo vuelve al 31', cuotasC[1].fechaPagoMax === '2026-03-31',
            `venció ${cuotasC[1].fechaPagoMax}`);
        comprobar('ninguna fecha es inválida',
            cuotasC.every(x => !isNaN(new Date(x.fechaPagoMax + 'T00:00:00Z').getTime())),
            cuotasC.map(x => x.fechaPagoMax).join(', '));
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n17. Borrar un préstamo con cuotas ya cobradas');
    // El borrado destruye TODAS las cuotas del préstamo. Si alguna ya tenía pago
    // registrado, ese dinero desaparece de todos los agregados sin dejar rastro.
    {
        const c = await nuevoSocio(7799030);
        const r = await desembolsar({
            clientId: c.id, fechaPrestamo: '2026-09-05', mesDesembolso: 'Septiembre', anioDesembolso: 2026,
            valorPrestado: 3000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        // El socio paga su primera cuota.
        const cuota1 = await LoanPayment.findOne({ where: { idVm: r.body.loan.idVm }, order: [['item_quantity', 'ASC']] });
        await cuota1.update({ estado: 'Pago', valorCuotaPago: num(cuota1.valorCuotaVariable) });
        const cobrado = num(cuota1.valorCuotaVariable);

        const rDel = await fetch(`${BASE}/admin/disbursed-loans/${r.body.loan.id}`, { method: 'DELETE', headers: H });
        const cuerpo = await rDel.json().catch(() => ({}));
        comprobar('el borrado se niega si hay pagos registrados', rDel.status === 409,
            `HTTP ${rDel.status}`);
        comprobar('el mensaje dice cuánto se cobró',
            (cuerpo.error || '').includes('1') && /pago|cobrad/i.test(cuerpo.error || ''),
            `dijo: ${cuerpo.error}`);
        const siguenAhi = await LoanPayment.count({ where: { idVm: r.body.loan.idVm } });
        comprobar('las cuotas siguen ahí', siguenAhi === 3, `quedan ${siguenAhi}`);
        void cobrado;
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n18. Un pago parcial no se pierde al retanquear');
    // Una cuota Pendiente puede traer un pago parcial. El retanqueo sobrescribe
    // valorCuotaPago con capital + interés causado, así que ese dinero deja de figurar
    // como cobrado por separado.
    {
        const { socio, idVm } = await sembrar({
            principal: 3000000, cuotas: 3, tasa: 0.014, pagadas: 0,
            fechaPrestamo: '2026-08-17',
            vencimientos: ['2026-10-10','2026-11-10','2026-12-10'],
        });
        const PARCIAL = 250000;
        const primera = await LoanPayment.findOne({ where: { idVm }, order: [['item_quantity', 'ASC']] });
        await primera.update({ valorCuotaPago: PARCIAL });

        const r = await desembolsar({
            clientId: socio.id, fechaPrestamo: '2026-08-30', mesDesembolso: 'Agosto', anioDesembolso: 2026,
            valorPrestado: 5000000, cuotas: 3, interesMensual: 0.014, estado: 'Vigente',
        });
        comprobar('el retanqueo se registra', r.status === 201, `HTTP ${r.status}`);
        const ref = r.body.refinanciacion || {};
        comprobar('el parcial se reporta aparte', ref.yaAbonado === PARCIAL, `dio ${money(ref.yaAbonado)}`);
        comprobar('se descuenta del total a cancelar',
            ref.totalCancelado === ref.capitalCancelado + ref.interesCausado - PARCIAL,
            `total ${money(ref.totalCancelado)} vs ${money(ref.capitalCancelado + ref.interesCausado - PARCIAL)}`);
        comprobar('el socio recibe los $250.000 que ya había pagado',
            ref.netoEntregado === 5000000 - ref.totalCancelado && ref.netoEntregado > 2200000,
            `neto ${money(ref.netoEntregado)}`);
        comprobar('la constancia lo menciona',
            /ya abonados/i.test(String((await DisbursedLoan.findByPk(r.body.loan.id)).observaciones || '')),
            String((await DisbursedLoan.findByPk(r.body.loan.id)).observaciones || '').slice(0, 160));
    }

    console.log('\n──────────────────────────────────────────────');
    console.log(`${ok} comprobaciones correctas · ${fallos} fallidas`);
    console.log('──────────────────────────────────────────────\n');

    try { fs.unlinkSync(RUTA); } catch { /* la base temporal ya no importa */ }
    process.exit(fallos === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
