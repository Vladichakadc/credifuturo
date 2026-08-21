#!/usr/bin/env node
/**
 * Diagnóstico: registros fechados un día por delante por el bug de UTC.
 *
 * Hasta el arreglo de fechas, los formularios proponían "hoy" con
 * `new Date().toISOString().split('T')[0]`, que devuelve la fecha en UTC.
 * Colombia va cinco horas por detrás, así que entre las 7:00 p.m. y la
 * medianoche hora local el UTC ya era el día siguiente, y todo lo registrado en
 * esa franja quedó fechado mañana.
 *
 * CÓMO SE RECONOCE UN REGISTRO AFECTADO
 *
 *   1. `createdAt` (que Sequelize guarda en UTC) cae entre las 00:00 y las
 *      04:59:59 UTC — es decir, entre las 7:00 p.m. y la medianoche en Colombia
 *      del día ANTERIOR.
 *   2. Y la fecha de negocio del registro coincide exactamente con la fecha UTC
 *      de `createdAt`.
 *
 * La segunda condición es la que evita los falsos positivos: si el admin
 * escribió la fecha a mano, no coincidirá con el valor por defecto y el registro
 * no se cuenta. Solo se marcan los que aceptaron el default equivocado.
 *
 * Un registro así se corrige restándole UN día a la fecha de negocio. Este
 * script NO modifica nada: solo informa. Cambiar fechas de movimientos ya
 * contabilizados es una decisión del comité, no algo que deba pasar de rebote.
 *
 * Uso:
 *   node diagnostico_fechas_utc.js [ruta/a/database.sqlite]
 *
 * Sin argumento usa DATABASE_PATH o la base local por defecto.
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

const rutaBD = process.argv[2]
    || process.env.DATABASE_PATH
    || path.join(__dirname, '..', 'database.sqlite');

if (!fs.existsSync(rutaBD)) {
    console.error(`No existe la base de datos: ${rutaBD}`);
    process.exit(1);
}

// Franja horaria del fallo, en UTC: [00:00, 05:00) UTC == [19:00, 24:00) Colombia.
const HORA_DESDE = '00:00:00';
const HORA_HASTA = '05:00:00';

// Tabla → columnas de fecha de negocio que tomaban el valor por defecto del
// formulario. Se excluyen a propósito las columnas calculadas por el sistema
// (vencimientos derivados del cronograma), que no salen de un <input type="date">.
const OBJETIVOS = [
    { tabla: 'Savings', etiqueta: 'Ahorros', columnas: ['date'] },
    { tabla: 'Loans', etiqueta: 'Solicitudes de préstamo', columnas: ['date'] },
    { tabla: 'DisbursedLoans', etiqueta: 'Préstamos desembolsados', columnas: ['fecha_prestamo', 'fecha_desembolso'] },
    { tabla: 'Clients', etiqueta: 'Socios', columnas: ['fechaIngreso', 'fechaBaja'] },
];

const db = new sqlite3.Database(rutaBD, sqlite3.OPEN_READONLY);
const all = (sql, params = []) => new Promise((res, rej) =>
    db.all(sql, params, (e, rows) => (e ? rej(e) : res(rows))));

const existeTabla = async (t) =>
    (await all("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [t])).length > 0;

const columnasDe = async (t) => (await all(`PRAGMA table_info("${t}")`)).map(r => r.name);

(async () => {
    console.log(`\nBase de datos: ${rutaBD}`);
    console.log(`Franja del fallo: ${HORA_DESDE}–${HORA_HASTA} UTC  (7:00 p.m. – medianoche en Colombia)\n`);

    let totalAfectados = 0;
    const detalle = [];

    for (const obj of OBJETIVOS) {
        if (!await existeTabla(obj.tabla)) continue;
        const cols = await columnasDe(obj.tabla);
        if (!cols.includes('createdAt')) continue;

        for (const col of obj.columnas) {
            if (!cols.includes(col)) continue;

            // `date(createdAt)` es la fecha UTC; comparar la columna de negocio
            // contra ella detecta que se guardó el default equivocado.
            const filas = await all(
                `SELECT id,
                        "${col}"  AS fechaNegocio,
                        createdAt AS creado,
                        date(createdAt) AS fechaUtc,
                        date(createdAt, '-1 day') AS fechaColombia
                   FROM "${obj.tabla}"
                  WHERE createdAt IS NOT NULL
                    AND "${col}" IS NOT NULL
                    AND time(createdAt) >= ? AND time(createdAt) < ?
                    AND date("${col}") = date(createdAt)
                  ORDER BY createdAt`,
                [HORA_DESDE, HORA_HASTA]
            );

            const total = (await all(`SELECT COUNT(*) AS n FROM "${obj.tabla}" WHERE "${col}" IS NOT NULL`))[0].n;
            const pct = total ? ((filas.length / total) * 100).toFixed(1) : '0.0';

            if (filas.length) {
                totalAfectados += filas.length;
                detalle.push({ obj, col, filas, total, pct });
                console.log(`❌ ${obj.etiqueta} · ${col}: ${filas.length} de ${total} registros (${pct}%)`);
                filas.slice(0, 5).forEach(f =>
                    console.log(`     id=${f.id}  guardado ${f.fechaNegocio}  →  debería ser ${f.fechaColombia}   (creado ${f.creado} UTC)`));
                if (filas.length > 5) console.log(`     … y ${filas.length - 5} más`);
            } else {
                console.log(`✅ ${obj.etiqueta} · ${col}: ninguno de ${total}`);
            }
        }
    }

    console.log(`\n──────────────────────────────────────────────`);
    if (totalAfectados === 0) {
        console.log('No hay registros con la fecha adelantada.');
    } else {
        console.log(`TOTAL: ${totalAfectados} registro(s) con la fecha un día por delante.`);
        console.log('Se corrigen restando un día a la fecha de negocio.');
        console.log('Este script NO modifica nada — la corrección es decisión del comité.');

        // El mes acreditado es lo que de verdad puede mover cuentas: si el
        // registro cayó en el último día del mes, el día de más lo empujó al mes
        // siguiente y el ahorro quedó contabilizado en el período equivocado.
        const cambianDeMes = detalle.flatMap(d =>
            d.filas.filter(f => String(f.fechaNegocio).slice(0, 7) !== String(f.fechaColombia).slice(0, 7))
        );
        console.log(`\nDe esos, ${cambianDeMes.length} cambian además de MES al corregirse` +
            (cambianDeMes.length ? ' — son los que pueden mover cuentas de un período a otro.' : '.'));
        cambianDeMes.slice(0, 10).forEach(f =>
            console.log(`   id=${f.id}  ${f.fechaNegocio} → ${f.fechaColombia}`));
    }
    console.log('');
    db.close();
})().catch(e => { console.error(e); process.exit(1); });
