const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function checkSocio() {
  try {
    const clientId = 11; // José Antonio
    const records = await sequelize.query(
      `SELECT externalId, status, amount, valorAhorrado, type, mesAbonado, monthInt, date FROM Savings WHERE clientId = ${clientId}`,
      { type: QueryTypes.SELECT }
    );

    console.log('--- Registros de José Antonio ---');
    records.forEach(r => {
      console.log(`ID: ${r.externalId}, Type: ${r.type}, ValAh: ${r.valorAhorrado}, MesAb: ${r.mesAbonado}, MonthInt: ${r.monthInt}, Date: ${r.date}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkSocio();
