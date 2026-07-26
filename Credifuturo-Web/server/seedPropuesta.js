const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false
});

const Propuesta = sequelize.define('Propuesta', {
    titulo: { type: DataTypes.STRING },
    descripcion: { type: DataTypes.TEXT },
    categoria: { type: DataTypes.STRING },
    autorNombre: { type: DataTypes.STRING },
    estado: { type: DataTypes.STRING },
    votos: { type: DataTypes.INTEGER },
    anonima: { type: DataTypes.BOOLEAN },
    clientId: { type: DataTypes.INTEGER }
}, { tableName: 'Propuestas', timestamps: true });

async function run() {
    try {
        await Propuesta.create({
            titulo: 'Nueva forma de repartir las ganancias: Método más justo (Saldo Promedio)',
            descripcion: 'Hola a todos. Como comité, queremos asegurar que el fondo funcione con las reglas más justas y transparentes posibles.\n\nHemos implementado un nuevo método para repartir las utilidades llamado "Saldo Promedio Ponderado", que es el mismo estándar que usan los Fondos de Inversión en Colombia (avalado por la SFC).\n\n¿De qué se trata y por qué es más justo?\nHasta ahora, podíamos llegar a mirar solo "cuánto ahorraste en total" al final del año. Imagina este caso:\n- Socio A: Ahorra $1 millón en enero. Su dinero pasa 12 meses "trabajando" en el fondo y ganando intereses al ser prestado.\n- Socio B: Ahorra $1 millón en diciembre. Su dinero apenas estuvo unos días.\n\nEn un fondo real, no es justo que ganen lo mismo. Con este nuevo método, las ganancias se reparten considerando dos cosas fundamentales:\n1. El monto: Cuánto dinero aportaste.\n2. El tiempo: Cuántos meses estuvo ese dinero disponible trabajando en el fondo.\n\n¿Qué significa esto para ti?\nSignifica que LA CONSTANCIA PREMIA. Los ahorros que hiciste a principio de año pesarán mucho más en el cálculo que los aportes de última hora. Cada peso que pones a trabajar temprano en el año, te genera más ganancias a final de año.\n\nEn la sección de Ranking de Ahorro ya pueden ver un mensaje personalizado que les muestra cómo este nuevo método reconoce su esfuerzo. ¡Voten si están de acuerdo con esta mejora que nos hace más profesionales y justos con todos!',
            categoria: 'Ahorro',
            autorNombre: 'Comité Administrativo',
            estado: 'aprobada',
            votos: 1,
            anonima: false,
            clientId: null
        });
        console.log('✅ Propuesta insertada correctamente.');
    } catch(e) {
        console.error('Error:', e.message);
    }
}
run();
