#!/usr/bin/env node
/**
 * Validación de sobrepagos en las cuotas pagadas del año en curso.
 *
 * Busca las cuotas donde el socio pagó MÁS de lo que decía su cuota. Hasta el
 * ajuste, ese excedente no hacía nada: no bajaba el saldo, no reducía los
 * intereses siguientes y no aparecía en el recaudo del fondo.
 *
 * Para cada préstamo afectado dice, además, si su cronograma admite el
 * recálculo automático. No todos lo admiten: los créditos cargados por
 * importación tienen cifras que no cierran entre sí, y aplicarles el sistema
 * alemán inventaría números sobre deuda real de socios.
 *
 * Este script NO modifica nada. Solo informa, para que la Junta decida.
 *
 * Uso:
 *   node validar_sobrepagos.js [ruta/a/database.sqlite] [--anio 2026]
 */

const path = require('path');
const fs = require('fs');
const { analizarCronograma } = require('./services/amortizacion');

let sqlite3;
try {
    sqlite3 = require('sqlite3');
} catch {
    console.error('Falta sqlite3. Ejecuta este script desde Credifuturo-Web/server con las dependencias instaladas.');
    process.exit(1);
}

const args = process.argv.slice(2);
const idxAnio = args.indexOf('--anio');
const anioObjetivo = idxAnio >= 0 ? parseInt(args[idxAnio + 1], 10) : new Date().getFullYear();
const rutaBD = args.find((a) => !a.startsWith('--') && a !== String(anioObjetivo))
    || process.env.DATABASE_PATH
    || path.join(__dirname, '..', 'database.sqlite');

if (!fs.existsSync(rutaBD)) {
    console.error(`No existe la base de datos: ${rutaBD}`);
    process.exit(1);
}

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const db = new sqlite3.Database(rutaBD, sqlite3.OPEN_READONLY);
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));

// Las columnas de la tabla usan snake_case; el analizador espera los atributos
// del modelo, así que se traducen aquí.
const aModelo = (r) => ({
    id: r.id,
    itemQuantity: r.item_quantity,
    fechaPagoMax: r.fecha_pago_max,
    saldoInicial: r.saldo_inicial,
    saldoFinal: r.saldo_final,
    interesMensual: r.interes_mensual,
    valorInteresesAmortizados: r.valor_intereses_amortizados,
    valorCuotaVariable: r.valor_cuota_variable,
    estado: r.estado,
});

(async () => {
    console.log(`\nBase de datos: ${rutaBD}`);
    console.log(`Año validado: ${anioObjetivo} en adelante\n`);

    const sobrepagos = await all(
        `SELECT p.id, p.id_ep, p.id_vm, p.clientId, p.item_quantity, p.fecha_pago_max, p.mes_pago,
                p.valor_cuota_variable, p.valor_cuota_pago, p.estado,
                c.name AS nombre, c.apellido1 AS apellido, c.cedula
           FROM LoanPayments p
           LEFT JOIN clients c ON c.id = p.clientId
          WHERE p.estado = 'Pago'
            AND CAST(strftime('%Y', p.fecha_pago_max) AS INTEGER) >= ?
            AND COALESCE(p.valor_cuota_pago, 0) > COALESCE(p.valor_cuota_variable, 0) + 1
          ORDER BY p.fecha_pago_max, p.id_vm`,
        [anioObjetivo]
    );

    if (sobrepagos.length === 0) {
        console.log('No hay cuotas pagadas por encima de su valor en el período validado.');
        console.log('Nada que ajustar.\n');
        db.close();
        return;
    }

    console.log(`Se encontraron ${sobrepagos.length} cuota(s) pagadas por encima de su valor.\n`);
    console.log('  ' + 'Socio'.padEnd(22) + 'Préstamo'.padEnd(11) + 'Cuota'.padEnd(12) +
        'Debía'.padStart(12) + 'Pagó'.padStart(13) + 'Excedente'.padStart(13));
    console.log('  ' + '─'.repeat(83));

    const porPrestamo = new Map();
    let totalExcedente = 0;

    for (const s of sobrepagos) {
        const exc = (s.valor_cuota_pago || 0) - (s.valor_cuota_variable || 0);
        totalExcedente += exc;
        const quien = `${s.nombre || ''} ${s.apellido || ''}`.trim() || `cliente ${s.clientId}`;
        console.log('  ' + quien.slice(0, 21).padEnd(22) + String(s.id_vm || '—').padEnd(11) +
            String(s.id_ep || '—').padEnd(12) + fmt(s.valor_cuota_variable).padStart(12) +
            fmt(s.valor_cuota_pago).padStart(13) + fmt(exc).padStart(13));
        if (!porPrestamo.has(s.id_vm)) porPrestamo.set(s.id_vm, []);
        porPrestamo.get(s.id_vm).push({ ...s, excedente: exc });
    }

    console.log('  ' + '─'.repeat(83));
    console.log('  ' + 'TOTAL NO APLICADO A CAPITAL'.padEnd(58) + fmt(totalExcedente).padStart(25));

    console.log('\n\n¿Qué préstamos admiten el recálculo automático?\n');
    console.log('  ' + 'Préstamo'.padEnd(11) + 'Excedente'.padStart(13) + '   Diagnóstico');
    console.log('  ' + '─'.repeat(83));

    let ajustables = 0, ajustableMonto = 0, bloqueadoMonto = 0;

    for (const [idVm, filas] of porPrestamo) {
        const crudas = await all('SELECT * FROM LoanPayments WHERE id_vm = ?', [idVm]);
        const diag = analizarCronograma(crudas.map(aModelo));
        const monto = filas.reduce((s, f) => s + f.excedente, 0);

        if (diag.recalculable) {
            ajustables++;
            ajustableMonto += monto;
            console.log('  ' + String(idVm).padEnd(11) + fmt(monto).padStart(13) + '   ✅ recalculable — el ajuste se aplica solo');
        } else {
            bloqueadoMonto += monto;
            const causa = !diag.encadenado ? 'el saldo no encadena'
                : !diag.extingue ? 'el cronograma no cancela la deuda'
                    : !diag.capitalConstante ? 'no amortiza con capital constante'
                        : 'el interés no corresponde a la tasa';
            console.log('  ' + String(idVm).padEnd(11) + fmt(monto).padStart(13) + `   ⛔ ${causa}`);
        }
    }

    console.log('\n──────────────────────────────────────────────────────────────');
    console.log(`Préstamos con sobrepago      : ${porPrestamo.size}`);
    console.log(`  · ajustables automáticamente: ${ajustables}  (${fmt(ajustableMonto)})`);
    console.log(`  · requieren revisión manual : ${porPrestamo.size - ajustables}  (${fmt(bloqueadoMonto)})`);
    console.log('\nEste script no modifica nada. Para aplicar el ajuste en los préstamos');
    console.log('recalculables, vuelva a guardar la cuota desde Lista Estado Préstamos.\n');

    db.close();
})().catch((e) => { console.error(e); process.exit(1); });
