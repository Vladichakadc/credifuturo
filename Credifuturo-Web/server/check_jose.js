const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function checkSocio() {
  try {
    const cedula = '8740166'; // José Antonio
    const records = await sequelize.query(
      `SELECT externalId, status, amount, type, year FROM Savings WHERE clientCedula = '${cedula}' OR clientCustomerId = '${cedula}'`,
      { type: QueryTypes.SELECT }
    );

    console.log('--- Registros de José Antonio ---');
    records.forEach(r => {
      console.log(`ID: ${r.externalId}, Status: "${r.status}", Amount: ${r.amount}, Type: ${r.type}, Year: ${r.year}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkSocio();
