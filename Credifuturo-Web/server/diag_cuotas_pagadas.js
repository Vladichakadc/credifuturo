const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

(async () => {
    await sequelize.authenticate();

    // ¿Cuánto suman las cuotas con estado='Pago' de los préstamos activos (estadoPrestamo=Pendiente)?
    const r1 = await sequelize.query(`
        SELECT SUM(valor_cuota_variable) as total, COUNT(*) as cnt
        FROM LoanPayments
        WHERE LOWER(TRIM(estado)) = 'pago' AND LOWER(TRIM(estado_prestamo)) = 'pendiente'
    `, { type: QueryTypes.SELECT });
    console.log('Pago + EstadoPrestamo=Pendiente:', Math.round(r1[0].total).toLocaleString('es-CO'), 'Count:', r1[0].cnt);

    // ¿Qué suma la columna "Cuota Variable" para TODOS los registros de lista (sin filtro)?
    const r2 = await sequelize.query(`
        SELECT SUM(valor_cuota_variable) as total, COUNT(*) as cnt
        FROM LoanPayments
    `, { type: QueryTypes.SELECT });
    console.log('SUM cuota_variable TODOS:', Math.round(r2[0].total).toLocaleString('es-CO'), 'Count:', r2[0].cnt);

    // Solo préstamos activos (estadoPrestamo=Pendiente) - todas sus cuotas
    const r3 = await sequelize.query(`
        SELECT SUM(valor_cuota_variable) as total, COUNT(*) as cnt
        FROM LoanPayments
        WHERE LOWER(TRIM(estado_prestamo)) = 'pendiente'
    `, { type: QueryTypes.SELECT });
    console.log('SUM cuota_variable donde estadoPrestamo=Pendiente (TODAS cuotas):', Math.round(r3[0].total).toLocaleString('es-CO'), 'Count:', r3[0].cnt);

    // Cuotas aún NO pagadas de préstamos activos
    const r4 = await sequelize.query(`
        SELECT SUM(valor_cuota_variable) as total, COUNT(*) as cnt
        FROM LoanPayments
        WHERE LOWER(TRIM(estado)) = 'pendiente' AND LOWER(TRIM(estado_prestamo)) = 'pendiente'
    `, { type: QueryTypes.SELECT });
    console.log('SUM donde estado=Pendiente AND estadoPrestamo=Pendiente:', Math.round(r4[0].total).toLocaleString('es-CO'), 'Count:', r4[0].cnt);

    // Verificar qué da $11,779,617
    // Quizás el usuario ve la Lista Estado Préstamos filtrada por algún criterio
    // Vamos a buscar combinaciones que den ~11,779,617
    console.log('\nBuscando combinación que dé ~$11,779,617:');
    console.log('  r1 (Pago+Pendiente):', Math.round(r1[0].total).toLocaleString('es-CO'));
    // ¿Y si incluye también estadoPrestamo=null?
    const r5 = await sequelize.query(`
        SELECT SUM(valor_cuota_variable) as total, COUNT(*) as cnt
        FROM LoanPayments
        WHERE LOWER(TRIM(estado)) = 'pago' AND (estado_prestamo IS NULL OR TRIM(estado_prestamo) = '')
    `, { type: QueryTypes.SELECT });
    console.log('  Pago + estadoPrestamo=NULL/empty:', Math.round(r5[0].total || 0).toLocaleString('es-CO'), 'Count:', r5[0].cnt);
    
    const combinado = parseFloat(r1[0].total || 0) + parseFloat(r5[0].total || 0);
    console.log('  Pago+Pendiente + Pago+NULL:', Math.round(combinado).toLocaleString('es-CO'));

    // ¿Y préstamos activos con año actual?
    const currentYear = new Date().getFullYear();
    const r6 = await sequelize.query(`
        SELECT SUM(valor_cuota_variable) as total, COUNT(*) as cnt
        FROM LoanPayments
        WHERE LOWER(TRIM(estado)) = 'pago'
        AND SUBSTR(fecha_pago_max, 1, 4) = '${currentYear}'
    `, { type: QueryTypes.SELECT });
    console.log(`  Pago + año ${currentYear}:`, Math.round(r6[0].total || 0).toLocaleString('es-CO'), 'Count:', r6[0].cnt);

    // Todos distintos estados de estadoPrestamo
    const r7 = await sequelize.query(`
        SELECT TRIM(estado_prestamo) as ep, COUNT(*) as cnt, SUM(valor_cuota_variable) as total
        FROM LoanPayments
        GROUP BY TRIM(estado_prestamo)
    `, { type: QueryTypes.SELECT });
    console.log('\nDistribución completa por estadoPrestamo:');
    r7.forEach(r => console.log('  ', JSON.stringify(r.ep), '| Count:', r.cnt, '| Total:', Math.round(r.total).toLocaleString('es-CO')));

    await sequelize.close();
})().catch(e => { console.error(e.message); process.exit(1); });
