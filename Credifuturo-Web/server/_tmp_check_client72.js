const { Sequelize } = require('sequelize');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const sequelize = new Sequelize({ dialect: 'sqlite', storage: dbPath, logging: false });

(async () => {
  const [cols] = await sequelize.query("PRAGMA table_info(Clients)");
  console.log('Clients cols:', cols.map(c => c.name).join(', '));

  const [rows] = await sequelize.query("SELECT * FROM Clients WHERE id=72");
  console.log(JSON.stringify(rows, null, 2));

  await sequelize.close();
})();
