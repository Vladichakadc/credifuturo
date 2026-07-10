/**
 * Actualiza Clients.porcentajePrestamo según la regla de devoluciones:
 *  - Socios CON devolución de ahorros en el año anterior → 1,6% (0.016):
 *    retiraron sus ahorros, pierden el beneficio de tasa.
 *  - Socios SIN devolución en el año anterior → 1,4% (0.014):
 *    mantuvieron sus ahorros, conservan el beneficio.
 * Cubre role user y admin (el admin también es socio). Idempotente: se puede re-ejecutar.
 * Uso: node actualizar_tasas_por_devolucion.js [--dry-run]
 */
const { Sequelize, QueryTypes } = require('sequelize');
const path = require('path');

const storage = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite');
const db = new Sequelize({ dialect: 'sqlite', storage, logging: false });
const dryRun = process.argv.includes('--dry-run');

const TASA_CON_DEVOLUCION = 0.016;
const TASA_SIN_DEVOLUCION = 0.014;

(async () => {
    const anioAnterior = new Date().getFullYear() - 1;
    console.log(`BD: ${storage}\nAño de referencia (devoluciones): ${anioAnterior}${dryRun ? ' · DRY-RUN' : ''}\n`);

    // Devolución = MISMO criterio del menú admin "Devoluciones de Ahorros"
    // (DevolucionesAhorrosPage: STATUS_DEVOLUCION exacto). TRIM porque los
    // datos importados traen espacio final. NO incluye "Descuento Total Anual
    // Penalizacion" (eso es una multa, no un retiro de ahorros).
    const conDevolucion = await db.query(
        `SELECT DISTINCT c.id, c.name FROM Savings s
         JOIN Clients c ON c.id = s.clientId AND c.role IN ('user', 'admin')
         WHERE TRIM(s.status) = 'Devolucion Total Intereses Ahorros Mensuales'
           AND CAST(s.year AS INTEGER) = :anio`,
        { type: QueryTypes.SELECT, replacements: { anio: anioAnterior } }
    );
    const idsCon = conDevolucion.map(r => r.id);

    const todos = await db.query(
        `SELECT id, name, estatus, porcentajePrestamo FROM Clients WHERE role IN ('user', 'admin') ORDER BY id`,
        { type: QueryTypes.SELECT }
    );

    let cambios = 0;
    for (const c of todos) {
        const nueva = idsCon.includes(c.id) ? TASA_CON_DEVOLUCION : TASA_SIN_DEVOLUCION;
        const actual = c.porcentajePrestamo == null ? null : Number(c.porcentajePrestamo);
        const cambia = actual === null || Math.abs(actual - nueva) > 1e-9;
        console.log(
            `${String(c.id).padStart(3)} ${c.name.padEnd(16)} ${c.estatus.padEnd(12)}` +
            ` ${actual === null ? '  —  ' : (actual * 100).toFixed(2) + '%'} → ${(nueva * 100).toFixed(1)}%` +
            ` ${idsCon.includes(c.id) ? '(devolución ' + anioAnterior + ')' : '(sin devolución)'}` +
            (cambia ? '  *actualiza*' : '')
        );
        if (cambia && !dryRun) {
            await db.query(
                `UPDATE Clients SET porcentajePrestamo = :t WHERE id = :id`,
                { replacements: { t: nueva, id: c.id } }
            );
            cambios++;
        }
    }
    console.log(`\n${dryRun ? 'Se actualizarían' : 'Actualizados'}: ${cambios} de ${todos.length} socios` +
        ` · con devolución ${anioAnterior}: ${idsCon.length} → 1,6% · resto → 1,4%`);
    await db.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
