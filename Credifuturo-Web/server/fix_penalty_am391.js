const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function fixPenalty() {
  try {
    // Buscar el registro AM391 de Jose Antonio
    const [record] = await sequelize.query(
      `SELECT id, externalId, diasPenalizacion, valorAPenalizar 
       FROM Savings 
       WHERE externalId = 'AM391'`,
      { type: QueryTypes.SELECT }
    );

    if (record) {
      console.log(`Registro encontrado: ${record.externalId}`);
      console.log(`Penalización actual: ${record.diasPenalizacion} días, $${record.valorAPenalizar}`);
      
      // Limpiar penalización
      await sequelize.query(
        `UPDATE Savings 
         SET diasPenalizacion = 0, valorAPenalizar = 0 
         WHERE id = ${record.id}`,
        { type: QueryTypes.UPDATE }
      );
      
      console.log('¡Éxito! Penalización eliminada del registro AM391.');
    } else {
      console.log('No se encontró el registro AM391.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

fixPenalty();
