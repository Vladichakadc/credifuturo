const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function fixRecord() {
  try {
    console.log('--- Buscando registro AM391 ---');
    const records = await sequelize.query(
      "SELECT id, externalId, status, clientId FROM Savings WHERE externalId = 'AM391'",
      { type: QueryTypes.SELECT }
    );

    if (records.length === 0) {
      console.log('No se encontró ningún registro con externalId = "AM391".');
      return;
    }

    const record = records[0];
    console.log(`Registro encontrado: ID=${record.id}, Status actual=${record.status}`);

    await sequelize.query(
      "UPDATE Savings SET status = 'Activo' WHERE externalId = 'AM391'",
      { type: QueryTypes.UPDATE }
    );

    console.log('¡Éxito! El registro AM391 ahora tiene estado: Activo');
  } catch (error) {
    console.error('Error al actualizar el registro:', error);
  } finally {
    await sequelize.close();
  }
}

fixRecord();
