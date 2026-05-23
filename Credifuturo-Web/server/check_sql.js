const { Saving, Soporte, sequelize } = require('./models');

async function checkSql() {
    try {
        console.log('--- SQL Check ---');
        await Saving.findAll({
            include: [{ model: Soporte, attributes: ['id', 'originalName'] }],
            limit: 1,
            logging: (sql) => console.log('Generated SQL:', sql)
        });
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkSql();
