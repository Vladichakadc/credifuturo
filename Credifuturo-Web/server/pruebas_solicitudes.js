#!/usr/bin/env node
/**
 * Banco de pruebas de la corrección de solicitudes de préstamo.
 *
 * Base temporal propia y ruta HTTP real. Cubre lo que hace delicada esta pantalla:
 * que solo se pueda corregir mientras la solicitud esté pendiente, que cambiar las
 * condiciones económicas borre los votos ya emitidos, y que el cronograma que ve la
 * Junta sea el mismo que generará el desembolso.
 *
 *   node pruebas_solicitudes.js
 */
const fs = require('fs'), os = require('os'), path = require('path');
const RUTA = path.join(os.tmpdir(), `credifuturo-solicitudes-${process.pid}.sqlite`);
process.env.DATABASE_PATH = RUTA;
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.NODE_ENV = 'development';
process.env.PORT = '3061';
process.env.TZ = 'UTC';

const bcrypt = require('bcryptjs');
const sequelize = require('./config/database');
const { Client } = require('./models');
const LoanRequest = require('./models/LoanRequest');
const LoanBoardVote = require('./models/LoanBoardVote');
const { proyectarCronograma } = require('./services/amortizacion');

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const money = n => '$' + Math.round(num(n)).toLocaleString('es-CO');
let ok = 0, fallos = 0;
const cerca = (a, b, tol = 1) => Math.abs(num(a) - num(b)) <= tol;
function comprobar(d, cond, det = '') {
    if (cond) { ok++; console.log(`   ✓ ${d}`); }
    else { fallos++; console.log(`   ✗ ${d}${det ? ` — ${det}` : ''}`); }
}

const BASE = `http://127.0.0.1:${process.env.PORT}/api`;
let H = null, HJunta = null;

const entrar = async (cedula, clave) => {
    const r = await fetch(`${BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, password: clave }),
    }).then(r => r.json());
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${r.token}` };
};

(async () => {
    await sequelize.sync();
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_disbursed_id_vm ON DisbursedLoans(id_vm)');

    await Client.create({ name:'Gerente', apellido1:'P', cedula:'14297227', customerId:'1',
        email:'g@prueba.local', password:bcrypt.hashSync('secreto123',10), role:'admin', estatus:'Activo', mustChangePassword:false });
    // Leonardo Rojas: miembro de la Junta que NO es admin.
    await Client.create({ name:'Leonardo', apellido1:'Rojas', cedula:'79863805', customerId:'2',
        email:'l@prueba.local', password:bcrypt.hashSync('secreto123',10), role:'user', estatus:'Activo', mustChangePassword:false });
    const socio = await Client.create({ name:'Ana', apellido1:'Gomez', cedula:'52001234', customerId:'3',
        email:'a@prueba.local', password:bcrypt.hashSync('x',10), role:'user', estatus:'Activo' });

    require('./server.js');
    await new Promise(r => setTimeout(r, 4500));
    H = await entrar('14297227', 'secreto123');
    HJunta = await entrar('79863805', 'secreto123');

    console.log('\n══════════════════════════════════════════════');
    console.log('  CORRECCIÓN DE SOLICITUDES DE PRÉSTAMO');
    console.log('══════════════════════════════════════════════');

    // Borra la solicitud y sus votos. Sin quitar antes los votos, la clave foránea
    // impide el DELETE — que es correcto, pero rompía la limpieza entre secciones.
    const borrarSolicitud = async (s) => {
        await LoanBoardVote.destroy({ where: { loanRequestId: s.id } });
    };

    const crearSolicitud = async (extra = {}) => LoanRequest.create({
        clientId: socio.id, amount: 3000000, installments: 3, monthlyRate: 1.4,
        firstInstallment: 1042000, lastInstallment: 1014000, totalInterest: 84000,
        totalToPay: 3084000, banco: 'Bancolombia', cuentaAhorros: '123',
        observaciones: 'para estudio', status: 'pending', ...extra,
    });

    // ───────────────────────────────────────────────────────────────
    console.log('\n1. El cronograma llega con la solicitud y es el que generará el desembolso');
    {
        const s = await crearSolicitud();
        const lista = await fetch(`${BASE}/admin/loan-requests?status=pending`, { headers: H }).then(r => r.json());
        const encontrada = (lista.data || []).find(x => x.id === s.id);
        comprobar('la solicitud trae su cronograma', !!encontrada?.cronograma?.filas?.length);
        const filas = encontrada.cronograma.filas;
        comprobar('tiene tantas cuotas como pidió el socio', filas.length === 3, `dio ${filas.length}`);
        comprobar('la primera cuota es capital + interés del saldo completo',
            cerca(filas[0].cuota, 1000000 + 3000000 * 0.014, 1), `dio ${money(filas[0].cuota)}`);
        comprobar('el saldo cierra en cero', filas[filas.length - 1].saldoFinal === 0,
            `dio ${filas[filas.length - 1].saldoFinal}`);
        comprobar('el capital de las cuotas suma lo pedido',
            cerca(filas.reduce((a, f) => a + f.capital, 0), 3000000, 0.01));
        // La tasa se guarda en % y el préstamo la usa en fracción: confundirlas
        // multiplicaría el interés por cien.
        comprobar('la tasa en porcentaje no se confunde con la fracción',
            cerca(encontrada.cronograma.totalInteres, proyectarCronograma({ capital:3000000, cuotas:3, tasaMensual:0.014 }).totalInteres, 1),
            `dio ${money(encontrada.cronograma.totalInteres)}`);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n2. La Junta que no es admin también puede corregir');
    {
        const s = await crearSolicitud();
        const r = await fetch(`${BASE}/admin/loan-requests/${s.id}`, {
            method: 'PUT', headers: HJunta, body: JSON.stringify({ amount: 2500000 }),
        });
        comprobar('Leonardo Rojas puede corregir', r.status === 200, `HTTP ${r.status}`);
        await s.reload();
        comprobar('el monto quedó corregido', num(s.amount) === 2500000, `dio ${money(s.amount)}`);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n3. Cambiar las condiciones borra los votos ya emitidos');
    {
        const s = await crearSolicitud();
        await LoanBoardVote.create({ loanRequestId: s.id, voterClientId: 1, decision: 'approved' });
        await LoanBoardVote.create({ loanRequestId: s.id, voterClientId: 2, decision: 'approved' });
        const r = await fetch(`${BASE}/admin/loan-requests/${s.id}`, {
            method: 'PUT', headers: H, body: JSON.stringify({ amount: 9000000 }),
        });
        const cuerpo = await r.json();
        comprobar('se acepta la corrección', r.status === 200, `HTTP ${r.status}`);
        comprobar('avisa que cambian las condiciones', cuerpo.condicionesCambian === true);
        comprobar('borra los dos votos', cuerpo.votosBorrados === 2, `borró ${cuerpo.votosBorrados}`);
        comprobar('no queda ningún voto', (await LoanBoardVote.count({ where: { loanRequestId: s.id } })) === 0);
        comprobar('la proyección se rehace con el monto nuevo',
            cerca(num((await s.reload()).firstInstallment), 9000000 / 3 + 9000000 * 0.014, 1),
            `dio ${money(s.firstInstallment)}`);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n4. Corregir solo el banco NO borra los votos');
    {
        const s = await crearSolicitud();
        await LoanBoardVote.create({ loanRequestId: s.id, voterClientId: 1, decision: 'approved' });
        const r = await fetch(`${BASE}/admin/loan-requests/${s.id}`, {
            method: 'PUT', headers: H, body: JSON.stringify({ banco: 'Davivienda', cuentaAhorros: '999' }),
        });
        const cuerpo = await r.json();
        comprobar('se acepta', r.status === 200, `HTTP ${r.status}`);
        comprobar('no considera que cambien las condiciones', cuerpo.condicionesCambian === false);
        comprobar('el voto sigue en pie', (await LoanBoardVote.count({ where: { loanRequestId: s.id } })) === 1);
        comprobar('el banco quedó corregido', (await s.reload()).banco === 'Davivienda');
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n5. Una solicitud ya decidida no se puede editar');
    {
        for (const estado of ['approved', 'rejected', 'disbursed']) {
            const s = await crearSolicitud({ status: estado });
            const r = await fetch(`${BASE}/admin/loan-requests/${s.id}`, {
                method: 'PUT', headers: H, body: JSON.stringify({ amount: 1 }),
            });
            comprobar(`se niega a editar una ${estado}`, r.status === 409, `HTTP ${r.status}`);
            await s.reload();
            comprobar(`y el monto de la ${estado} no cambió`, num(s.amount) === 3000000, `dio ${money(s.amount)}`);
        }
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n6. Los valores imposibles se rechazan');
    {
        const s = await crearSolicitud();
        for (const [campo, valor, texto] of [
            ['amount', 0, 'monto en cero'],
            ['amount', -5, 'monto negativo'],
            ['installments', 0, 'cero cuotas'],
            ['monthlyRate', 50, 'tasa del 50%'],
        ]) {
            const r = await fetch(`${BASE}/admin/loan-requests/${s.id}`, {
                method: 'PUT', headers: H, body: JSON.stringify({ [campo]: valor }),
            });
            comprobar(`rechaza ${texto}`, r.status === 400, `HTTP ${r.status}`);
        }
        comprobar('la solicitud sigue intacta', num((await s.reload()).amount) === 3000000);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n7. Un socio cualquiera NO puede corregir solicitudes');
    {
        const s = await crearSolicitud();
        const HSocio = await entrar('52001234', 'x');
        const r = await fetch(`${BASE}/admin/loan-requests/${s.id}`, {
            method: 'PUT', headers: HSocio, body: JSON.stringify({ amount: 99000000 }),
        });
        comprobar('el socio recibe 403', r.status === 403, `HTTP ${r.status}`);
        comprobar('su solicitud no cambió', num((await s.reload()).amount) === 3000000);
    }

    console.log('\n──────────────────────────────────────────────');
    console.log(`${ok} comprobaciones correctas · ${fallos} fallidas`);
    console.log('──────────────────────────────────────────────\n');
    try { fs.unlinkSync(RUTA); } catch { /* base temporal */ }
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
