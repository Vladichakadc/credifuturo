#!/usr/bin/env node
/**
 * Banco de pruebas del reparto de utilidades sobre la ruta HTTP real.
 *
 * Base temporal propia y servidor de verdad. Complementa a pruebas_reparto.js
 * —que cubre la aritmética aislada— comprobando lo que solo se ve de extremo a
 * extremo: que el endpoint lea la fecha de pago correcta de la base, que el
 * detalle movimiento a movimiento solo llegue a quien puede verlo, y que los
 * parámetros de la Junta se validen antes de guardarse.
 *
 *   node pruebas_reparto_http.js
 *
 * Ninguna sección borra filas: la base desechable compite con las tareas de
 * arranque (semilla de scores, barrido de abonos) y un DELETE ahí se queda
 * colgado en SQLITE_BUSY.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const RUTA = path.join(os.tmpdir(), `credifuturo-reparto-${process.pid}.sqlite`);
process.env.DATABASE_PATH = RUTA;
process.env.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
process.env.NODE_ENV = 'development';
process.env.PORT = '3062';
process.env.TZ = 'UTC';

const bcrypt = require('bcryptjs');
const CLAVE = require('crypto').randomBytes(12).toString('hex');
const sequelize = require('./config/database');
const { Client, Saving } = require('./models');
const { construirPeriodo, pesoDeMes } = require('./services/reparto');

let ok = 0, fallos = 0;
const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const cerca = (a, b, tol = 1) => Math.abs(Number(a) - Number(b)) <= tol;
function comprobar(d, cond, det = '') {
    if (cond) { ok++; console.log(`   ✓ ${d}`); }
    else { fallos++; console.log(`   ✗ ${d}${det ? ` — ${det}` : ''}`); }
}

const BASE = `http://127.0.0.1:${process.env.PORT}/api`;
const entrar = async (cedula) => {
    const r = await fetch(`${BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, password: CLAVE }),
    }).then(r => r.json());
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${r.token}` };
};

// Se reparte sobre un año cerrado para que las cifras esperadas no dependan del
// día en que se corran las pruebas.
const ANIO = new Date().getUTCFullYear() - 1;
const P = construirPeriodo(ANIO, `${ANIO + 2}-01-01`);
const CUOTA = 200000;

(async () => {
    await sequelize.sync();

    const socios = {};
    const crear = async (nombre, cedula, id, extra = {}) => {
        socios[nombre] = await Client.create({
            name: nombre, apellido1: 'Prueba', cedula, customerId: String(id),
            email: `${nombre.toLowerCase()}@prueba.local`, password: bcrypt.hashSync(CLAVE, 10),
            role: extra.role || 'user', estatus: 'Activo', mustChangePassword: false,
        });
        return socios[nombre];
    };
    const gerente = await crear('Gerente', '14297227', 1, { role: 'admin' });
    // Leonardo Rojas: Junta que no es admin, y además está en el grupo beta.
    const junta = await crear('Leonardo', '79863805', 2);
    // Lady Torres: está en el grupo beta pero NO en la Junta — el único perfil
    // que puede abrir la pantalla sin poder ver el detalle de los demás.
    const enero = await crear('Enero', '36304875', 3);
    const tarde = await crear('Tarde', '52001002', 4);
    const conservo = await crear('Conservo', '52001003', 5);
    const retiro = await crear('Retiro', '52001004', 6);
    const parcial = await crear('Parcial', '52001005', 7);
    const mixto = await crear('Mixto', '52001006', 8);
    const utilRetiro = await crear('UtilRetiro', '52001007', 9);
    const utilFiel = await crear('UtilFiel', '52001008', 10);

    const abono = (cliente, fechaPago, mesAbonado, valor = CUOTA, extra = {}) => Saving.create({
        clientId: cliente.id, amount: valor, valorAhorrado: valor, date: fechaPago,
        mesAbonado, anioAbonado: ANIO, year: fechaPago ? Number(fechaPago.slice(0, 4)) : null, monthInt: mesAbonado,
        type: 'Mensual', status: 'Abono', ...extra,
    });

    // Enero paga las doce cuotas del año el 15 de enero; Tarde paga las mismas
    // doce el 20 de diciembre. Mismo dinero, mismos meses acreditados: el método
    // anterior les daba idéntico peso.
    for (let m = 1; m <= 12; m++) await abono(enero, `${ANIO}-01-15`, m);
    for (let m = 1; m <= 12; m++) await abono(tarde, `${ANIO}-12-20`, m);

    // Conservó y Retiró abren el año con el mismo saldo de años anteriores.
    await abono(conservo, `${ANIO - 2}-06-10`, 6, 5000000, { anioAbonado: ANIO - 2 });
    await abono(retiro, `${ANIO - 2}-06-10`, 6, 5000000, { anioAbonado: ANIO - 2 });
    await abono(retiro, `${ANIO}-03-31`, 3, -5000000, { status: 'Devolucion Total Intereses' });
    // Retiro PARCIAL: mismo capital de apertura, saca solo una parte.
    await abono(parcial, `${ANIO - 2}-06-10`, 6, 5000000, { anioAbonado: ANIO - 2 });
    await abono(parcial, `${ANIO}-03-31`, 3, -2000000, { status: 'Devolucion Parcial' });
    // El caso que reportó el fondo: ahorro del socio y movimiento del fondo en el
    // mismo mes. Sumados daban una cifra que no cuadraba con la Matriz de Ahorros.
    await abono(mixto, `${ANIO}-07-10`, 7, 500000);
    await abono(mixto, `${ANIO}-07-20`, 7, 500000, { status: 'Distribucion Intereses' });

    // La regla de la Junta: la distribución cuenta solo si el socio no retiró.
    // Dos socios idénticos salvo por el retiro.
    for (const s of [utilRetiro, utilFiel]) {
        await abono(s, `${ANIO - 1}-05-01`, 5, 3000000, { anioAbonado: ANIO - 1 });
        await abono(s, `${ANIO}-03-01`, 3, 400000, { status: 'Distribucion Intereses' });
    }
    await abono(utilRetiro, `${ANIO}-06-15`, 6, -1000000, { status: 'Devolucion Parcial' });

    // Un movimiento con la fecha de pago ilegible. El modelo declara `date` como
    // obligatoria, así que por la aplicación no puede entrar vacía — pero la
    // columna sí admite basura llegada por SQL directo, que es como se han hecho
    // las migraciones de este proyecto, y una cadena vacía no la detiene. Se
    // inserta igual, sin pasar por Sequelize, porque es exactamente la fila que
    // el respaldo tiene que saber tratar.
    await sequelize.query(
        `INSERT INTO Savings (clientId, amount, valorAhorrado, date, mesAbonado, anioAbonado, type, status, createdAt, updatedAt)
         VALUES (:cid, :v, :v, '', 7, :anio, 'Mensual', 'Abono', datetime('now'), datetime('now'))`,
        { replacements: { cid: junta.id, v: CUOTA, anio: ANIO } });
    // Un aporte inicial: no cuenta salvo que la Junta lo active.
    await abono(gerente, `${ANIO}-01-05`, 1, 1000000, { type: 'Aporte Inicial' });

    // El acceso beta a esta pantalla cuelga del ajuste `propuestas_enabled`
    // (ver requireAdminOrBetaTester): sin él, ni siquiera las cédulas del grupo
    // beta entran. En producción está puesto; aquí hay que ponerlo para poder
    // probar lo que ve un socio beta.
    // AppSetting no está cableado en models/index.js, así que el sync() de
    // arriba no crea su tabla: hay que pedírselo al propio modelo.
    const AppSetting = require('./models/AppSetting');
    await AppSetting.sync();
    await AppSetting.upsert({ key: 'propuestas_enabled', value: 'true' });

    require('./server.js');
    await new Promise(r => setTimeout(r, 4500));
    const H = await entrar('14297227');
    const HJunta = await entrar('79863805');
    const HSocio = await entrar('36304875');

    const pedir = async (headers, params = '') =>
        fetch(`${BASE}/admin/savings/ranking?anio=${ANIO}${params}`, { headers }).then(r => r.json());
    const de = (d, nombre) => d.socios.find(s => s.id === socios[nombre].id);

    console.log('\n══════════════════════════════════════════════');
    console.log('  REPARTO DE UTILIDADES — RUTA REAL');
    console.log('══════════════════════════════════════════════');

    // ───────────────────────────────────────────────────────────────
    console.log('\n1. El período y los parámetros llegan con el reparto');
    const d = await pedir(H);
    comprobar('responde correctamente', d.ok === true, JSON.stringify(d).slice(0, 160));
    comprobar('el período es el año pedido', d.periodo.anio === ANIO, `dio ${d.periodo.anio}`);
    comprobar('un año pasado va del 1 de enero al 31 de diciembre',
        d.periodo.inicio === `${ANIO}-01-01` && d.periodo.corte === `${ANIO}-12-31`);
    comprobar('y se marca como cerrado', d.periodo.cerrado === true);
    comprobar('los pesos se cuentan sobre doce meses', d.periodo.meses === 12);
    comprobar('el premio de permanencia arranca apagado', d.parametros.factorPermanencia === 1);

    // ───────────────────────────────────────────────────────────────
    console.log('\n2. Se pondera por la fecha de pago, no por el mes acreditado');
    {
        const e = de(d, 'Enero');
        const t = de(d, 'Tarde');
        comprobar('quien pagó todo en enero pesa el año completo (100%)',
            cerca(e.capitalPonderado, 12 * CUOTA, 2), `dio ${money(e.capitalPonderado)}`);
        comprobar('quien pagó lo mismo en diciembre pesa un mes de doce',
            cerca(t.capitalPonderado, 12 * CUOTA / 12, 2), `dio ${money(t.capitalPonderado)}`);
        // El hallazgo que motivó el rediseño: los dos acreditan los meses 1..12,
        // así que el método anterior —que ponderaba por mesAbonado— les daba
        // exactamente la misma cifra a pesar de mover el dinero de forma opuesta.
        comprobar('los dos ya NO pesan igual, que era el defecto',
            e.capitalPonderado > t.capitalPonderado * 10,
            `${money(e.capitalPonderado)} vs ${money(t.capitalPonderado)}`);
        comprobar('los dos ahorraron exactamente lo mismo',
            e.ahorroPeriodo === t.ahorroPeriodo && e.ahorroPeriodo === 12 * CUOTA);
        comprobar('el desglose por mes pone todo el aporte de Enero en enero',
            de(d, 'Enero').porMes[1].ahorro === 12 * CUOTA);
        comprobar('con peso 100%', de(d, 'Enero').porMes[1].peso === 1);

        // El capital sin ponderar viaja junto al ponderado: sin él, la cifra
        // ponderada no se puede juzgar en pantalla.
        comprobar('los dos ahorraron lo mismo sin ponderar',
            e.capitalBase === t.capitalBase && e.capitalBase === 12 * CUOTA);
        comprobar('pero su peso efectivo es opuesto',
            e.pesoEfectivo === 1 && cerca(t.pesoEfectivo, 1 / 12, 0.001),
            `${e.pesoEfectivo} vs ${t.pesoEfectivo}`);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n3. Quien no retiró el saldo del año anterior');
    {
        const c = de(d, 'Conservo');
        const r = de(d, 'Retiro');
        const pa = de(d, 'Parcial');
        comprobar('el capital previo entra como apertura y pesa el año completo',
            cerca(c.capitalPonderado, 5000000, 1), `dio ${money(c.capitalPonderado)}`);
        comprobar('un retiro TOTAL en marzo descuenta con el peso de marzo (10/12)',
            cerca(r.capitalPonderado, 5000000 - 5000000 * (10 / 12), 2), `dio ${money(r.capitalPonderado)}`);
        comprobar('un retiro PARCIAL descuenta solo lo retirado, con el peso de su mes',
            cerca(pa.capitalPonderado, 5000000 - 2000000 * (10 / 12), 2), `dio ${money(pa.capitalPonderado)}`);
        comprobar('quien retiró parcialmente pesa más que quien retiró todo',
            pa.capitalPonderado > r.capitalPonderado);
        comprobar('y menos que quien no retiró nada', pa.capitalPonderado < c.capitalPonderado);
        comprobar('el que conservó tiene capital permanente', c.aperturaPermanente === 5000000);
        comprobar('el que retiró todo no tiene nada que premiar', r.aperturaPermanente === 0);
        comprobar('el que retiró la mitad conserva la mitad como permanente', pa.aperturaPermanente === 3000000,
            `dio ${money(pa.aperturaPermanente)}`);
        comprobar('un retiro no borra los meses anteriores: su peso no es cero', r.capitalPonderado > 0);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n4. El aporte inicial cuenta como capital');
    {
        // Ese dinero también está en el fondo prestándose; dejarlo fuera
        // subestimaba a los socios más antiguos.
        const g = de(d, 'Gerente');
        comprobar('el aporte inicial de enero pesa el año completo',
            cerca(g.capitalPonderado, 1000000, 1), `dio ${money(g.capitalPonderado)}`);
        comprobar('y aparece en el renglón de su mes', g.porMes[1].ahorro === 1000000);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n4b. El ahorro del socio no se mezcla con lo que mueve el fondo');
    {
        const m = de(d, 'Mixto');
        comprobar('el ahorro de julio es lo que el socio consignó', m.porMes[7].ahorro === 500000,
            `dio ${money(m.porMes[7].ahorro)}`);
        comprobar('el movimiento del fondo va en su propia columna', m.porMes[7].fondo === 500000,
            `dio ${money(m.porMes[7].fondo)}`);
        comprobar('el ahorro del año no arrastra el movimiento del fondo', m.ahorroPeriodo === 500000,
            `dio ${money(m.ahorroPeriodo)}`);
        comprobar('que se informa aparte', m.fondoPeriodo === 500000, `dio ${money(m.fondoPeriodo)}`);
        // Los dos sí son capital dentro del fondo, así que los dos pesan.
        comprobar('los dos pesan para el reparto, con el peso de julio',
            cerca(m.porMes[7].ponderado, 1000000 * 0.5, 1), `dio ${money(m.porMes[7].ponderado)}`);
        comprobar('cada movimiento se puede rastrear en el detalle',
            (m.movimientos || []).filter(x => x.mes === 7).length === 2);
    }

    console.log('\n4c. La distribución de intereses solo cuenta si el socio no retiró');
    {
        const fiel = de(d, 'UtilFiel');
        const salio = de(d, 'UtilRetiro');
        comprobar('quien no retiró conserva su distribución', fiel.distribucionNoContada === 0);
        comprobar('y no se le marca retiro', fiel.huboRetiro === false);
        comprobar('quien retiró parcialmente pierde la distribución entera',
            salio.distribucionNoContada === 400000, `dio ${money(salio.distribucionNoContada)}`);
        comprobar('y se le marca el retiro', salio.huboRetiro === true);
        comprobar('el capital ponderado del fiel es mayor',
            fiel.capitalPonderado > salio.capitalPonderado);
        // La distribución anulada sigue visible: el socio tiene que ver que
        // llegó y por qué no le cuenta.
        const marzo = salio.movimientos.find(m => m.mes === 3 && m.esDistribucion);
        comprobar('la distribución anulada sigue en el detalle, marcada', marzo?.noCuenta === true);
        comprobar('con aporte cero', marzo?.ponderado === 0);
    }

    console.log('\n5. La calidad de las fechas se informa, no se esconde');
    {
        comprobar('se cuentan los movimientos con fecha de pago real', d.diagnostico.pago === 37,
            `dio ${d.diagnostico.pago}`);
        comprobar('y el que no la tiene se marca como estimado', d.diagnostico.periodo === 1,
            `dio ${d.diagnostico.periodo}`);
        const j = de(d, 'Leonardo').movimientos.find(m => m.origenFecha === 'periodo');
        comprobar('el movimiento estimado se fecha a mitad del mes acreditado',
            j?.fecha === `${ANIO}-07-15`, `dio ${j?.fecha}`);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n6. El detalle solo llega a quien puede verlo');
    {
        const dSocio = await pedir(HSocio);
        comprobar('el socio recibe su propio detalle', !!de(dSocio, 'Enero').movimientos?.length);
        comprobar('pero no el de los demás', de(dSocio, 'Conservo').movimientos === null);
        comprobar('y sí los agregados de todos, que es lo que pinta la pantalla',
            de(dSocio, 'Conservo').capitalPonderado > 0);
        comprobar('el socio no ve el panel de parámetros', dSocio.puedeVerTodo === false);

        const dJunta = await pedir(HJunta);
        comprobar('la Junta ve el detalle de todos', !!de(dJunta, 'Conservo').movimientos?.length);
        comprobar('y puede abrir el panel de parámetros', dJunta.puedeVerTodo === true);
        comprobar('el gerente también', d.puedeVerTodo === true);

        // La pantalla sigue restringida al grupo beta: muestra el reparto de
        // todos los socios, así que abrirla a cualquiera no es cosa de esconder
        // el enlace del menú.
        const HAjeno = await entrar('52001004');
        const r = await fetch(`${BASE}/admin/savings/ranking?anio=${ANIO}`, { headers: HAjeno });
        comprobar('un socio fuera del grupo beta recibe 403', r.status === 403, `HTTP ${r.status}`);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n7. Los parámetros del reparto se validan antes de guardarse');
    {
        const poner = (clave, value, headers = H) => fetch(`${BASE}/admin/settings/${clave}`, {
            method: 'PUT', headers, body: JSON.stringify({ value }),
        });
        comprobar('un factor de 50 se rechaza', (await poner('reparto.factorPermanencia', 50)).status === 400);
        comprobar('un factor por debajo de 1 también', (await poner('reparto.factorPermanencia', 0.5)).status === 400);
        comprobar('un factor no numérico también', (await poner('reparto.factorPermanencia', 'mucho')).status === 400);
        comprobar('1,25 se acepta', (await poner('reparto.factorPermanencia', 1.25)).status === 200);
        // Guardar sigue siendo del gerente: la Junta simula, no escribe.
        comprobar('la Junta no puede guardarlo',
            (await poner('reparto.factorPermanencia', 1.5, HJunta)).status === 403);

        const d2 = await pedir(H);
        comprobar('el reparto ya lee el parámetro guardado', d2.parametros.factorPermanencia === 1.25);
    }

    // ───────────────────────────────────────────────────────────────
    console.log('\n8. Un año sin movimientos no rompe nada');
    {
        const vacio = await fetch(`${BASE}/admin/savings/ranking?anio=2005`, { headers: H }).then(r => r.json());
        comprobar('responde correctamente', vacio.ok === true);
        comprobar('todos los socios pesan cero',
            vacio.socios.every(s => s.capitalPonderado === 0));
        comprobar('el período existe igual', vacio.periodo.meses === 12, `dio ${vacio.periodo.meses}`);

        // Un año imposible no puede tumbar la pantalla ni, peor, calcular un
        // reparto sobre un período inventado: se ignora y se usa el año en curso.
        const anioActual = new Date().getUTCFullYear();
        for (const malo of ['1999', '3000', 'ayer', '']) {
            const r = await fetch(`${BASE}/admin/savings/ranking?anio=${malo}`, { headers: H }).then(r => r.json());
            comprobar(`un año inválido ("${malo}") cae al año en curso`,
                r.ok === true && r.periodo.anio === anioActual, `dio ${r.periodo?.anio}`);
        }
    }

    console.log('\n──────────────────────────────────────────────');
    console.log(`${ok} comprobaciones correctas · ${fallos} fallidas`);
    console.log('──────────────────────────────────────────────\n');
    try { fs.unlinkSync(RUTA); } catch { /* base temporal */ }
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
