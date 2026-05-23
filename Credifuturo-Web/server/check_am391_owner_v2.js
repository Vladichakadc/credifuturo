const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function checkOwner() {
  try {
    const records = await sequelize.query(
      `SELECT s.id, s.externalId, s.status, s.amount, c.name, c.apellido1 as surname1 
       FROM Savings s 
       JOIN Clients c ON s.clientId = c.id 
       WHERE s.externalId = 'AM391'`,
      { type: QueryTypes.SELECT }
    );

    if (records.length > 0) {
      const r = records[0];
      console.log(`Registro AM391 pertenece a: ${r.name} ${r.surname1}`);
      console.log(`Monto: ${r.amount}, Status: ${r.status}`);
    } else {
      console.log('No se encontró el registro AM391.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkOwner();
