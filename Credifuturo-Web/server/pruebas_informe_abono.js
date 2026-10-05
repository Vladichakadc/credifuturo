#!/usr/bin/env node
/**
 * Banco de pruebas de lo que se le DICE al socio cuando abona a capital por
 * segunda vez en el mismo crédito.
 *
 * Nace de un caso de producción (SOL30, octubre de 2026): la socia pagó
 * $1.035.000 sobre una cuota de $746.113,45 —$288.887 de más— y el sistema le
 * informó un abono de $510.220, que es ese más el de su primera cuota. El
 * cronograma estaba bien calculado; lo equivocado era la cifra en el registro,
 * en la nota de la cuota, en el aviso y en su informe.
 *
 * Corre sobre una base temporal propia y pasa por la ruta HTTP real, mandando
 * lo que manda el formulario de pagos. Comprueba tres cosas:
 *
 *   1. que un segundo abono se anuncia con SU importe en todas partes;
 *   2. que la corrección de arranque arregla lo que ya quedó escrito con el
 *      acumulado, y que correrla otra vez no cambia nada;
 *   3. que un informe a nombre de la cédula equivocada vuelve a su dueña y se
 *      le avisa una sola vez.
 *
 *   node pruebas_informe_abono.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const RUTA = path.join(os.tmpdir(), `credifuturo-informe-${process.pid}.sqlite`);
process.env.DATABASE_PATH = RUTA;
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.NODE_ENV = 'development';
process.env.PORT = '3048';

const bcrypt = require('bcryptjs');
const sequelize = require('./config/database');
const { Client, DisbursedLoan, LoanPayment } = require('./models');
const AbonoAplicado = require('./models/AbonoAplicado');
const AppSetting = require('./models/AppSetting');
const Notification = require('./models/Notification');
const informes = require('./services/informeAbono');

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

/** El préstamo de SOL30: $8.000.000 a 12 cuotas al 1,4%, recién desembolsado. */
async function sembrar() {
    secuencia++;
    const socio = await Client.create({
        name: `Socia${secuencia}`, surname1: 'Prueba', cedula: `6600${secuencia}`,
        customerId: `${6600 + secuencia}`, email: `i${secuencia}@prueba.local`,
        password: bcrypt.hashSync('x', 10), role: 'user', estatus: 'Activo', mustChangePassword: false,
    });
    const idVm = `SOLI${secuencia}`;
    const principal = 8000000, cuotas = 12, tasa = 0.014;
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
            externalId: `PI${secuencia}_${i}`, clientId: socio.id, idVm, itemQuantity: i,
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
    return { idVm, socio };
}

const leer = (idVm) => LoanPayment.findAll({ where: { idVm }, order: [['itemQuantity', 'ASC']] });
const registrosDe = (idVm) => AbonoAplicado.findAll({ where: { idVm }, order: [['id', 'ASC']] });
const resumenDe = (r) => JSON.parse(r.resumen || '{}');
const avisosDe = (clientId) => Notification.findAll({ where: { clientId }, order: [['id', 'ASC']] });
const registroInformes = async () => JSON.parse((await AppSetting.findOne({ where: { key: informes.CLAVE_INFORMES_SOCIO } }))?.value || '{}');
const guardarRegistroInformes = (r) => AppSetting.upsert({ key: informes.CLAVE_INFORMES_SOCIO, value: JSON.stringify(r) });

/** Lo que manda el formulario: la cuota con el importe pagado y el saldo final que él mismo recalcula. */
async function pagar(idVm, numero, pagado) {
    const cuota = (await leer(idVm))[numero - 1];
    const f = cuota.toJSON();
    const saldoFinal = num(f.saldoInicial) + num(f.valorInteresesAmortizados) - pagado;
    const r = await fetch(`${BASE}/admin/payments/${cuota.id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({
            clientId: f.clientId, mesDesembolso: f.mesDesembolso, cuotasPrestamo: f.cuotasPrestamo,
            interesMensual: f.interesMensual, valorInteresesAmortizados: f.valorInteresesAmortizados,
            fechaPagoMax: f.fechaPagoMax, mesPago: f.mesPago, valorCuotaVariable: f.valorCuotaVariable,
            estado: 'Pago', valorCuotaPago: pagado, saldoFinal: saldoFinal > 0 ? saldoFinal.toFixed(0) : '0',
            itemQuantity: f.itemQuantity, observaciones: f.observaciones, idVm: f.idVm, estadoPrestamo: f.estadoPrestamo,
            politicaAbono: 'reducir-cuota',
        }),
    });
    return { status: r.status, body: await r.json() };
}

async function entrarComo(socio) {
    const r = await fetch(`${BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: socio.cedula, password: 'x' }),
    }).then((x) => x.json());
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${r.token}` };
}
const informesDe = async (cabeceras, idVm) =>
    (await fetch(`${BASE}/admin/informes`, { headers: cabeceras }).then((r) => r.json())).filter((i) => i.idVm === idVm);
const leerInforme = async (cabeceras, nombre) =>
    (await fetch(`${BASE}/admin/informes/${encodeURIComponent(nombre)}`, { headers: cabeceras }).then((r) => r.json())).content || '';

const aNumero = (texto) => Number(String(texto).replace(/[$.]/g, ''));
/** ¿Cierra la igualdad "> $a … + $b … = $c …" que el informe le enseña al socio? */
function igualdadCierra(md) {
    const linea = md.split('\n').find((l) => l.startsWith('> '));
    if (!linea) return false;
    const [izquierda, derecha] = linea.slice(2).split(' = ');
    const suma = (izquierda.match(/\$[\d.]+/g) || []).reduce((s, x) => s + aNumero(x), 0);
    return suma === aNumero(derecha.match(/\$[\d.]+/)[0]);
}

/** Los dos pagos de la socia: $1.000.000 en la cuota 1 y $1.035.000 en la cuota 2. */
async function dosAbonos() {
    const caso = await sembrar();
    caso.primero = await pagar(caso.idVm, 1, 1000000);
    caso.segundo = await pagar(caso.idVm, 2, 1035000);
    return caso;
}

async function main() {
    await sequelize.sync();
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_disbursed_id_vm ON DisbursedLoans(id_vm)');
    await Client.create({
        name: 'Gerente', surname1: 'Prueba', cedula: '14297227', customerId: '1',
        email: 'gerente@prueba.local', password: bcrypt.hashSync('secreto123', 10),
        role: 'admin', estatus: 'Activo', mustChangePassword: false,
    });

    require('./server.js');
    await new Promise((r) => setTimeout(r, 4500));
    const login = await fetch(`${BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: '14297227', password: 'secreto123' }),
    }).then((r) => r.json());
    if (!login.token) { console.error('LOGIN FALLÓ', login); process.exit(1); }
    H = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };

    console.log('\n══════════════════════════════════════════════');
    console.log('  LO QUE SE LE DICE AL SOCIO EN SU SEGUNDO ABONO');
    console.log('══════════════════════════════════════════════');

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n1. El segundo abono se anuncia con SU importe ($288.887), no con el acumulado ($510.220)');
    {
        const { idVm, socio, primero, segundo } = await dosAbonos();
        comprobar('el primer abono se aplica', primero.body.abonoExtraordinario?.aplicado === true);
        comprobar('la cuota 2 queda en $746.113,45, como en el caso real', cerca((await leer(idVm))[1].valorCuotaVariable, 746113.45, 0.01));

        const a = segundo.body.abonoExtraordinario || {};
        comprobar('el segundo abono se aplica', a.aplicado === true, JSON.stringify(a));
        comprobar('la respuesta trae lo pagado de más en esa cuota', cerca(a.excedente, 288886.55, 0.01), String(a.excedente));
        comprobar('y, aparte, lo acumulado en el crédito', cerca(a.excedenteAcumulado, 510219.88, 0.01), String(a.excedenteAcumulado));
        comprobar('el ahorro en intereses es el de ese abono', cerca(a.ahorroInteres, 22244.25, 0.01), String(a.ahorroInteres));

        const [r1, r2] = await registrosDe(idVm);
        comprobar('el registro del segundo reajuste guarda lo que ÉL aplicó', cerca(r2.excedente, 288886.55, 0.01), String(r2.excedente));
        comprobar('y el acumulado en su resumen', cerca(resumenDe(r2).excedenteAcumulado, 510219.88, 0.01));
        comprobar('el del primero no cambia', cerca(r1.excedente, 221333.33, 0.01));
        comprobar('el registro dice a qué cuota correspondía el excedente', Number(resumenDe(r2).abonos?.[0]?.numero) === 2, JSON.stringify(resumenDe(r2).abonos));

        const cuotas = await leer(idVm);
        comprobar('la nota de la cuota 2 lleva lo pagado de más en ella',
            /^Abono extraordinario de \$288\.887 a capital · reducción de cuota\./.test(cuotas[1].observaciones || ''), cuotas[1].observaciones);
        comprobar('la de la cuota 1, lo suyo', /^Abono extraordinario de \$221\.333 a capital/.test(cuotas[0].observaciones || ''), cuotas[0].observaciones);

        const avisos = await avisosDe(socio.id);
        const delPago = avisos.filter((n) => n.type === 'payment_registered').pop();
        comprobar('el aviso del pago dice $288.887', /Los \$288\.887 que pagaste de más/.test(delPago?.message || ''), delPago?.message);
        comprobar('ningún aviso presenta el acumulado como lo pagado', !avisos.some((n) => /510\.220/.test(n.message || '')));

        const HS = await entrarComo(socio);
        const lista = (await informesDe(HS, idVm)).sort((x, y) => String(x.titulo).localeCompare(String(y.titulo)));
        comprobar('la socia tiene un informe por cada abono', lista.length === 2, JSON.stringify(lista.map((i) => i.name)));
        comprobar('cada uno dice de qué cuota es', /cuota 1$/.test(lista[0]?.titulo || '') && /cuota 2$/.test(lista[1]?.titulo || ''), JSON.stringify(lista.map((i) => i.titulo)));
        comprobar('y vive en su propio archivo', lista[0]?.name !== lista[1]?.name && /_cuota2_/.test(lista[1]?.name || ''), JSON.stringify(lista.map((i) => i.name)));
        comprobar('la tarjeta del segundo lleva lo de ese abono', lista[1]?.resumen?.excedente === 288887 && lista[1]?.resumen?.acumulado === 510220, JSON.stringify(lista[1]?.resumen));

        const md = await leerInforme(HS, lista[1]?.name);
        comprobar('el informe cuenta lo que pagó y lo que valía la cuota', /pagaste \*\*\$1\.035\.000\*\* y la cuota era de \*\*\$746\.113\*\*/.test(md));
        comprobar('y que eso son $288.887 por encima', /son \*\*\$288\.887\*\* por encima/.test(md));
        comprobar('la igualdad que le enseña cierra', igualdadCierra(md), md.split('\n').find((l) => l.startsWith('> ')));
        comprobar('y es la del caso real', md.includes('> $288.887 abonado a capital + $22.244 de intereses ahorrados = $311.131 menos por pagar'));
        const conAcumulado = md.split('\n').filter((l) => l.includes('$510.220'));
        comprobar('el acumulado aparece una sola vez, con su nombre', conAcumulado.length === 1 && /llevas abonado a capital en el crédito/.test(conAcumulado[0]), conAcumulado.join(' / '));

        const delInforme = avisos.filter((n) => n.type === 'informe').pop();
        comprobar('el aviso del informe dice de qué cuota es', /^Tu abono a capital — crédito \S+, cuota 2\. Tu cuota bajó \$32\.933 cada mes/.test(delInforme?.message || ''), delInforme?.message);

        const historial = await fetch(`${BASE}/admin/payments/abonos/historial`, { headers: H }).then((r) => r.json());
        const suyos = (historial.data || []).filter((x) => x.idVm === idVm);
        const total = suyos.reduce((s, x) => s + num(x.excedente), 0);
        comprobar('el historial suma $510.220 para el crédito, no $731.553', cerca(total, 510219.88, 0.01), String(total));
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n2. La corrección arregla lo que ya quedó escrito con el acumulado');
    {
        const { corregirExcedentesAcumulados, bitacora } = require('./services/correccionAbonos');
        const { idVm, socio } = await dosAbonos();

        // Se deja todo como lo dejó el código anterior: el registro, la nota, el
        // aviso y el informe del segundo abono con $510.220, y los dos informes
        // con el mismo título y sin la cuota en el nombre.
        const [r1, r2] = await registrosDe(idVm);
        const viejo = (r, excedente) => {
            // eslint-disable-next-line no-unused-vars
            const { excedenteAcumulado, capitalAplicado, abonos, informe, ...resto } = resumenDe(r);
            return { excedente, resumen: JSON.stringify({ ...resto, excedente }) };
        };
        await r1.update(viejo(r1, 221333.33));
        await r2.update(viejo(r2, 510219.88));

        const cuotas = await leer(idVm);
        await cuotas[1].update({ observaciones: 'Abono extraordinario de $510.220 a capital · reducción de cuota. Consignación Bancolombia' });

        const dir = informes.INFORMES_SOCIO_DIR;
        const antiguo1 = `Abono_${idVm}_antiguo1.md`;
        const antiguo2 = `Abono_${idVm}_antiguo2.md`;
        const reg = await registroInformes();
        const [n1, n2] = Object.keys(reg).filter((k) => reg[k].idVm === idVm).sort((a, b) => String(reg[a].titulo).localeCompare(String(reg[b].titulo)));
        const tituloViejo = `Tu abono a capital — crédito ${idVm}`;
        reg[antiguo1] = { ...reg[n1], titulo: tituloViejo, resumen: { excedente: 221333, ahorroInteres: reg[n1].resumen.ahorroInteres, bajaMensual: reg[n1].resumen.bajaMensual } };
        reg[antiguo2] = { ...reg[n2], titulo: tituloViejo, resumen: { excedente: 510220, ahorroInteres: 22244, bajaMensual: 32933 } };
        delete reg[n1]; delete reg[n2];
        await guardarRegistroInformes(reg);
        fs.writeFileSync(path.join(dir, antiguo1), 'Pagaste **$221.333** por encima de tu cuota.', 'utf-8');
        fs.writeFileSync(path.join(dir, antiguo2), 'Pagaste **$510.220** por encima de tu cuota.\n\n> $510.220 abonado a capital + $22.244 de intereses ahorrados = $311.131 menos por pagar', 'utf-8');
        for (const [nuevo, antiguo] of [[n1, antiguo1], [n2, antiguo2]]) {
            fs.unlinkSync(path.join(dir, nuevo));
            const aviso = await Notification.findOne({ where: { clientId: socio.id, link: informes.enlaceDeInforme(nuevo) } });
            await aviso.update({ link: informes.enlaceDeInforme(antiguo), message: aviso.message.replace(/^[^.]*\./, `${tituloViejo}.`) });
        }
        const delPago = (await avisosDe(socio.id)).filter((n) => n.type === 'payment_registered').pop();
        await delPago.update({ message: delPago.message.replace('$288.887', '$510.220') });

        const HS = await entrarComo(socio);
        comprobar('antes: el informe se contradice', !igualdadCierra(await leerInforme(HS, antiguo2)));
        const cuantosAvisos = (await avisosDe(socio.id)).length;
        const cronogramaAntes = JSON.stringify((await leer(idVm)).map((c) => [c.saldoInicial, c.valorInteresesAmortizados, c.valorCuotaVariable, c.saldoFinal, c.valorCuotaPago, c.estado]));

        const resultado = await corregirExcedentesAcumulados();
        const delCaso = resultado.corregidos.filter((c) => c.idVm === idVm);
        comprobar('corrige un solo reajuste de este crédito: el segundo', delCaso.length === 1 && delCaso[0].id === r2.id, JSON.stringify(delCaso));
        comprobar('sin errores', resultado.errores.length === 0, JSON.stringify(resultado.errores));

        const [c1, c2] = await registrosDe(idVm);
        comprobar('el registro del segundo pasa a $288.887', cerca(c2.excedente, 288886.55, 0.01), String(c2.excedente));
        comprobar('y conserva el acumulado, con su nombre', cerca(resumenDe(c2).excedenteAcumulado, 510219.88, 0.01));
        comprobar('queda anotado qué informe es el suyo', resumenDe(c2).informe === antiguo2);
        comprobar('el del primero no cambia de importe', cerca(c1.excedente, 221333.33, 0.01) && cerca(resumenDe(c1).excedenteAcumulado, 221333.33, 0.01));

        const nota = (await leer(idVm))[1].observaciones;
        comprobar('la nota de la cuota se corrige y conserva lo que escribió el administrador',
            nota === 'Abono extraordinario de $288.887 a capital · reducción de cuota. Consignación Bancolombia', nota);

        const avisos = await avisosDe(socio.id);
        comprobar('el aviso del pago se corrige en su sitio', /Los \$288\.887 que pagaste de más/.test(avisos.filter((n) => n.type === 'payment_registered').pop()?.message || ''));
        comprobar('sin mandar avisos nuevos', avisos.length === cuantosAvisos, `${avisos.length} vs ${cuantosAvisos}`);
        comprobar('y sin tocar si estaban leídos o no', avisos.every((n) => n.isRead === false));

        const md = await leerInforme(HS, antiguo2);
        comprobar('el informe se reescribe con el mismo nombre', /son \*\*\$288\.887\*\* por encima/.test(md) && igualdadCierra(md), md.slice(0, 200));
        const lista = await informesDe(HS, idVm);
        const i2 = lista.find((i) => i.name === antiguo2);
        const i1 = lista.find((i) => i.name === antiguo1);
        comprobar('su tarjeta lleva lo de ese abono', i2?.resumen?.excedente === 288887 && i2?.resumen?.acumulado === 510220, JSON.stringify(i2?.resumen));
        comprobar('los dos títulos pasan a decir la cuota', /cuota 2$/.test(i2?.titulo || '') && /cuota 1$/.test(i1?.titulo || ''), JSON.stringify([i1?.titulo, i2?.titulo]));
        const deInformes = avisos.filter((n) => n.type === 'informe').map((n) => n.message);
        comprobar('y los avisos de esos informes también', deInformes.some((m) => /, cuota 1\./.test(m)) && deInformes.some((m) => /, cuota 2\./.test(m)), JSON.stringify(deInformes));

        const cronogramaDespues = JSON.stringify((await leer(idVm)).map((c) => [c.saldoInicial, c.valorInteresesAmortizados, c.valorCuotaVariable, c.saldoFinal, c.valorCuotaPago, c.estado]));
        comprobar('el cronograma no se toca: ni una cifra', cronogramaAntes === cronogramaDespues);
        comprobar('la bitácora nombra el crédito y las dos cifras', bitacora(resultado).some((l) => l.includes(idVm) && l.includes('$510.220') && l.includes('$288.887')), bitacora(resultado).join(' | '));

        const otraVez = await corregirExcedentesAcumulados();
        comprobar('correrla de nuevo no corrige nada', otraVez.corregidos.length === 0 && otraVez.titulos.length === 0 && otraVez.errores.length === 0, JSON.stringify(otraVez));
        comprobar('ni reescribe el informe', (await leerInforme(HS, antiguo2)) === md);
        comprobar('ni manda avisos', (await avisosDe(socio.id)).length === cuantosAvisos);

        // Revertir después de corregido sigue hablando de ESE abono y retira SU informe.
        const rev = await fetch(`${BASE}/admin/payments/abonos/${c2.id}/revertir`, { method: 'POST', headers: H }).then((r) => r.json());
        comprobar('al revertirlo se retira su informe y no el del primero', JSON.stringify(rev.informesRetirados) === JSON.stringify([antiguo2]), JSON.stringify(rev.informesRetirados));
        const aviso = (await avisosDe(socio.id)).pop();
        comprobar('y el aviso de reversión dice $288.887', /\$288\.887/.test(aviso?.message || '') && /anteriores siguen aplicados/.test(aviso?.message || ''), aviso?.message);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n3. Un informe a nombre de la cédula equivocada vuelve a su dueña');
    {
        const { idVm, socio, primero } = await sembrar().then(async (caso) => ({ ...caso, primero: await pagar(caso.idVm, 1, 1000000) }));
        comprobar('el abono publica el informe', primero.body.abonoExtraordinario?.aplicado === true);
        const HS = await entrarComo(socio);
        const [informe] = await informesDe(HS, idVm);

        // Como quedó el de producción: la cédula con el último dígito cambiado, y
        // por eso sin aviso (el aviso se busca por esa misma cédula).
        const reg = await registroInformes();
        reg[informe.name] = { ...reg[informe.name], cedula: `${socio.cedula}9` };
        await guardarRegistroInformes(reg);
        await Notification.destroy({ where: { clientId: socio.id, link: informes.enlaceDeInforme(informe.name) } });

        comprobar('así la socia no lo ve en su lista', (await informesDe(HS, idVm)).length === 0);
        comprobar('ni puede abrirlo', (await fetch(`${BASE}/admin/informes/${encodeURIComponent(informe.name)}`, { headers: HS })).status === 403);

        const corregidos = (await informes.repararDuenosDeInformes()).filter((c) => c.nombre === informe.name);
        comprobar('la reparación lo detecta', corregidos.length === 1 && corregidos[0].ahora === socio.cedula, JSON.stringify(corregidos));
        comprobar('y avisa a la socia', corregidos[0]?.avisado === true);
        comprobar('ahora sí lo ve', (await informesDe(HS, idVm)).length === 1);
        comprobar('y lo abre', (await fetch(`${BASE}/admin/informes/${encodeURIComponent(informe.name)}`, { headers: HS })).status === 200);
        const conEnlace = () => Notification.count({ where: { clientId: socio.id, link: informes.enlaceDeInforme(informe.name) } });
        comprobar('con un aviso que lleva al documento', await conEnlace() === 1);
        comprobar('el registro guarda la cédula que tenía, para poder auditarlo', (await registroInformes())[informe.name].cedulaAnterior === `${socio.cedula}9`);

        comprobar('repetirla no encuentra nada', (await informes.repararDuenosDeInformes()).length === 0);
        comprobar('ni vuelve a sonar la campana', await conEnlace() === 1);

        // La siembra del informe previo ya no inventa una dueña: sin el crédito, no publica.
        const siembra = await informes.sembrarInformeGimena();
        comprobar('sin el crédito SOL30 la siembra no publica nada', siembra.sinPrestamo === true && !(await registroInformes())['Abono_SOL30_Gimena_Tascon.pdf'], JSON.stringify(siembra));
    }

    console.log('\n──────────────────────────────────────────────');
    console.log(`${ok} comprobaciones correctas · ${fallos} fallidas`);
    console.log('──────────────────────────────────────────────\n');

    // Los informes de prueba no se quedan en la carpeta temporal.
    try {
        for (const f of fs.readdirSync(informes.INFORMES_SOCIO_DIR)) {
            if (f.startsWith('Abono_SOLI')) fs.unlinkSync(path.join(informes.INFORMES_SOCIO_DIR, f));
        }
    } catch { /* la carpeta puede no existir */ }
    try { fs.unlinkSync(RUTA); } catch { /* la base temporal ya no importa */ }
    process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
