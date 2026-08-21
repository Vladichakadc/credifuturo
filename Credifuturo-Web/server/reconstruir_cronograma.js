#!/usr/bin/env node
/**
 * Reconstrucción del cronograma de un préstamo desde sus propias condiciones.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────
 *
 * El ajuste por abono extraordinario recalcula el saldo y los intereses de las
 * cuotas siguientes, pero solo si el cronograma guardado es aritméticamente
 * sano. Los créditos cargados por importación no lo son: sus filas repiten el
 * mismo saldo inicial, el interés no corresponde al saldo por la tasa y el
 * capital implícito no coincide con préstamo/cuotas. Sobre ellos el ajuste se
 * niega a actuar — con razón, porque recalcular con cifras que no cierran
 * inventaría números sobre deuda real de socios.
 *
 * Pero las CONDICIONES del crédito sí están bien guardadas, en DisbursedLoans:
 * valor prestado, número de cuotas y tasa mensual. Con eso se puede rehacer el
 * cronograma correcto desde cero, sin depender de las columnas corrompidas.
 *
 * ── CÓMO SE USA ──────────────────────────────────────────────────────
 *
 *   node reconstruir_cronograma.js                    → diagnostica TODOS
 *   node reconstruir_cronograma.js --prestamo VM_001  → uno solo, en detalle
 *   node reconstruir_cronograma.js --aplicar          → escribe los cambios
 *
 * Sin --aplicar NO modifica nada: solo muestra qué quedaría distinto. Esa es la
 * forma de usarlo la primera vez, y conviene revisar el resultado con la Junta
 * antes de escribir: se está corrigiendo la deuda registrada de socios reales.
 *
 * ── QUÉ RESPETA ──────────────────────────────────────────────────────
 *
 * Las cuotas ya pagadas conservan su estado y lo que el socio pagó. Solo se
 * corrigen las columnas de cálculo —saldo inicial, interés, cuota y saldo
 * final—, que son las que estaban mal.
 */

const path = require('path');
const fs = require('fs');

let sqlite3;
try {
    sqlite3 = require('sqlite3');
} catch {
    console.error('Falta sqlite3. Ejecuta este script desde Credifuturo-Web/server con las dependencias instaladas.');
    process.exit(1);
}

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const idxP = args.indexOf('--prestamo');
const soloPrestamo = idxP >= 0 ? args[idxP + 1] : null;
const rutaBD = args.find((a) => !a.startsWith('--') && a !== soloPrestamo)
    || process.env.DATABASE_PATH
    || path.join(__dirname, '..', 'database.sqlite');

if (!fs.existsSync(rutaBD)) {
    console.error(`No existe la base de datos: ${rutaBD}`);
    process.exit(1);
}

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => parseFloat(num(n).toFixed(2));

const db = new sqlite3.Database(rutaBD, APLICAR ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY);
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { return e ? rej(e) : res(this); }));

/**
 * Construye el cronograma correcto por sistema alemán: capital constante e
 * interés sobre el saldo vivo. Es la misma ley con la que la aplicación genera
 * los cronogramas nuevos.
 */
function cronogramaCorrecto(principal, cuotas, tasa) {
    const capital = principal / cuotas;
    const filas = [];
    let saldo = principal;
    for (let i = 1; i <= cuotas; i++) {
        const interes = r2(saldo * tasa);
        const cap = Math.min(capital, saldo);
        const saldoFin = r2(saldo - cap);
        filas.push({
            n: i,
            saldoInicial: r2(saldo),
            interes,
            capital: r2(cap),
            cuota: r2(cap + interes),
            saldoFinal: Math.max(0, saldoFin),
        });
        saldo = saldoFin;
    }
    return filas;
}

(async () => {
    console.log(`\nBase de datos: ${rutaBD}`);
    console.log(APLICAR ? 'MODO: APLICAR — se escribirán los cambios\n' : 'MODO: diagnóstico — no se modifica nada\n');

    const prestamos = await all(
        soloPrestamo
            ? 'SELECT * FROM DisbursedLoans WHERE id_vm = ?'
            : 'SELECT * FROM DisbursedLoans ORDER BY id_vm',
        soloPrestamo ? [soloPrestamo] : []
    );

    if (prestamos.length === 0) {
        console.log('No se encontraron préstamos.\n');
        db.close();
        return;
    }

    let sanos = 0, corregibles = 0, ambiguos = 0, sinCuotas = 0;
    const detalle = [];

    for (const p of prestamos) {
        const cuotas = await all(
            'SELECT * FROM LoanPayments WHERE id_vm = ? ORDER BY fecha_pago_max, item_quantity, id',
            [p.id_vm]
        );

        if (cuotas.length === 0) { sinCuotas++; continue; }

        const principal = num(p.valor_prestado);
        const nPactadas = parseInt(p.cuotas, 10) || 0;
        const tasa = num(p.interes_mensual);

        // Si el número de filas no coincide con las cuotas pactadas, no hay una
        // correspondencia clara entre una fila y su posición en el cronograma.
        // Adivinarla sería inventar: se reporta y se deja intacto.
        if (cuotas.length !== nPactadas) {
            ambiguos++;
            detalle.push({
                idVm: p.id_vm, estado: 'ambiguo',
                nota: `${cuotas.length} filas de pago frente a ${nPactadas} cuotas pactadas — no se puede emparejar cada fila con su posición.`,
            });
            continue;
        }
        if (!(principal > 0) || !(tasa > 0)) {
            ambiguos++;
            detalle.push({ idVm: p.id_vm, estado: 'ambiguo', nota: 'El préstamo no tiene valor prestado o tasa utilizable.' });
            continue;
        }

        const correcto = cronogramaCorrecto(principal, nPactadas, tasa);
        const difs = [];
        for (let i = 0; i < cuotas.length; i++) {
            const act = cuotas[i], esp = correcto[i];
            if (Math.abs(num(act.saldo_inicial) - esp.saldoInicial) > 1
                || Math.abs(num(act.valor_intereses_amortizados) - esp.interes) > 1
                || Math.abs(num(act.valor_cuota_variable) - esp.cuota) > 1
                || Math.abs(num(act.saldo_final) - esp.saldoFinal) > 1) {
                difs.push({ fila: act, esperado: esp });
            }
        }

        if (difs.length === 0) { sanos++; detalle.push({ idVm: p.id_vm, estado: 'sano' }); continue; }

        corregibles++;
        detalle.push({
            idVm: p.id_vm, estado: 'corregible', difs, principal, nPactadas, tasa,
            pagadas: cuotas.filter((c) => c.estado === 'Pago').length,
        });

        if (APLICAR) {
            for (const d of difs) {
                await run(
                    `UPDATE LoanPayments
                        SET saldo_inicial = ?, valor_intereses_amortizados = ?,
                            valor_cuota_variable = ?, saldo_final = ?, updatedAt = datetime('now')
                      WHERE id = ?`,
                    [d.esperado.saldoInicial, d.esperado.interes, d.esperado.cuota, d.esperado.saldoFinal, d.fila.id]
                );
            }
        }
    }

    // ── Detalle de un préstamo concreto ──
    if (soloPrestamo) {
        const d = detalle.find((x) => x.idVm === soloPrestamo);
        if (d && d.estado === 'corregible') {
            console.log(`Préstamo ${d.idVm}: ${fmt(d.principal)} · ${d.nPactadas} cuotas · ${(d.tasa * 100).toFixed(2)}% mensual`);
            console.log(`${d.pagadas} cuota(s) ya pagadas — su estado y lo pagado NO se tocan.\n`);
            console.log('  ' + 'Cuota'.padEnd(7) + 'Columna'.padEnd(16) + 'Registrado'.padStart(15) + 'Correcto'.padStart(15));
            console.log('  ' + '─'.repeat(53));
            for (const x of d.difs.slice(0, 12)) {
                const f = x.fila, e = x.esperado;
                const linea = (col, act, esp) => {
                    if (Math.abs(num(act) - esp) <= 1) return;
                    console.log('  ' + String(e.n).padEnd(7) + col.padEnd(16) + fmt(act).padStart(15) + fmt(esp).padStart(15));
                };
                linea('saldo inicial', f.saldo_inicial, e.saldoInicial);
                linea('interés', f.valor_intereses_amortizados, e.interes);
                linea('cuota', f.valor_cuota_variable, e.cuota);
                linea('saldo final', f.saldo_final, e.saldoFinal);
            }
            if (d.difs.length > 12) console.log(`  … y ${d.difs.length - 12} cuota(s) más con diferencias.`);
            console.log('');
        } else if (d) {
            console.log(`Préstamo ${d.idVm}: ${d.estado}${d.nota ? ' — ' + d.nota : ''}\n`);
        }
    } else {
        console.log('  ' + 'Préstamo'.padEnd(11) + 'Estado'.padEnd(14) + 'Detalle');
        console.log('  ' + '─'.repeat(78));
        for (const d of detalle) {
            const et = d.estado === 'sano' ? '✅ correcto'
                : d.estado === 'corregible' ? '⚠️  corregible' : '⛔ ambiguo';
            const nota = d.estado === 'corregible'
                ? `${d.difs.length} cuota(s) con cifras distintas a las que dictan sus condiciones`
                : (d.nota || '');
            console.log('  ' + String(d.idVm).padEnd(11) + et.padEnd(14) + nota);
        }
    }

    console.log('\n──────────────────────────────────────────────────────────────');
    console.log(`Préstamos revisados : ${prestamos.length}`);
    console.log(`  · ya correctos    : ${sanos}`);
    console.log(`  · corregibles     : ${corregibles}${APLICAR ? '  (CORREGIDOS)' : ''}`);
    console.log(`  · ambiguos        : ${ambiguos}  (requieren decisión manual)`);
    if (sinCuotas) console.log(`  · sin cuotas      : ${sinCuotas}`);

    if (!APLICAR && corregibles > 0) {
        console.log('\nPara aplicar las correcciones:  node reconstruir_cronograma.js --aplicar');
        console.log('Haga una copia de la base de datos antes de ejecutarlo.');
    }
    console.log('');
    db.close();
})().catch((e) => { console.error(e); process.exit(1); });
