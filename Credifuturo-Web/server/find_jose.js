const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function findJose() {
  try {
    const clients = await sequelize.query(
      `SELECT id, customerId, name, apellido1 FROM Clients WHERE name LIKE '%Jose Antonio%'`,
      { type: QueryTypes.SELECT }
    );

    console.log('--- Clientes Encontrados ---');
    clients.forEach(c => {
      console.log(`ID: ${c.id}, CustomerID: ${c.customerId}, Name: ${c.name} ${c.apellido1}`);
    });

    if (clients.length > 0) {
      const id = clients[0].id;
      const records = await sequelize.query(
        `SELECT externalId, type, valorAhorrado, mesAbonado, monthInt, date FROM Savings WHERE clientId = ${id}`,
        { type: QueryTypes.SELECT }
      );
      console.log(`--- Registros de Ahorro para ID ${id} ---`);
      records.forEach(r => {
        console.log(`ID: ${r.externalId}, Type: ${r.type}, ValAh: ${r.valorAhorrado}, MesAb: ${r.mesAbonado}, MonthInt: ${r.monthInt}, Date: ${r.date}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

findJose();
