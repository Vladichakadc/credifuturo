import RepartoUtilidadesPage from '../shared/RepartoUtilidadesPage';

/**
 * El reparto visto por el gerente: la herramienta de gobierno.
 *
 * Deliberadamente SIN "Tu parte" ni simulador, aunque quien mire sea también
 * socio —que es el caso en este fondo—. Mezclar en una pantalla lo que me toca a
 * mí con los parámetros con los que reparto a todos obliga a cambiar de sombrero
 * en mitad de la lectura. Lo personal está en /dashboard/ranking-ahorro, y la
 * cabecera enlaza a ella.
 *
 * Se conservan el archivo y la ruta —hay enlaces guardados y notificaciones ya
 * enviadas que apuntan aquí— aunque lo que sirve sea el Reparto de Utilidades.
 */
const RankingAhorroPage = () => <RepartoUtilidadesPage vista="admin" />;

export default RankingAhorroPage;
