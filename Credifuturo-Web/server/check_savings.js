const sequelize = require('./config/database');
const { Op, fn, col } = require('sequelize');
const Saving = require('./models/Saving');
const Client = require('./models/Client');

(async () => {
    await sequelize.authenticate();
    
    // 1. Totals by status
    const all = await Saving.findAll({
        attributes: ['status', [fn('SUM', col('amount')), 'tot'], [fn('COUNT', col('Saving.id')), 'cnt']],
        where: { year: { [Op.ne]: null } },
        include: [{ model: Client, where: { estatus: { [Op.like]: '%Activo%' } }, required: true, attributes: [] }],
        group: ['status'],
        raw: true
    });
    console.log('=== Totales por STATUS (socios activos) ===');
    let grandTotal = 0;
    all.forEach(r => {
        const v = Number(r.tot);
        grandTotal += v;
        console.log(`  ${r.status || '(null)'} : $${v.toLocaleString('es-CO')} (${r.cnt} registros)`);
    });
    console.log(`  TOTAL: $${grandTotal.toLocaleString('es-CO')}`);

    // 2. Only Abono, by year and type
    const abono = await Saving.findAll({
        attributes: ['year', 'type', [fn('SUM', col('amount')), 'tot']],
        where: { year: { [Op.ne]: null }, status: 'Abono' },
        include: [{ model: Client, where: { estatus: { [Op.like]: '%Activo%' } }, required: true, attributes: [] }],
        group: ['year', 'type'],
        raw: true
    });
    console.log('\n=== Solo Abono por AÑO y TIPO ===');
    let abonoTotal = 0;
    abono.forEach(r => {
        const v = Number(r.tot);
        abonoTotal += v;
        console.log(`  ${r.year} | ${r.type} : $${v.toLocaleString('es-CO')}`);
    });
    console.log(`  TOTAL ABONO: $${abonoTotal.toLocaleString('es-CO')}`);

    process.exit(0);
})();
