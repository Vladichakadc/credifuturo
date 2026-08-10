// Catálogo ÚNICO de las secciones que el comité puede ocultar o volver a mostrar
// a los socios, desde el menú "Cambios" del panel de administración.
//
// Por qué existe: durante la puesta a punto del Panel Ejecutivo se fueron
// ocultando tarjetas, gráficos y menús a los socios — cada uno borrando código.
// Eso hacía irreversible cada decisión: para volver a mostrar algo había que
// tocar el código otra vez. Ahora cada sección ocultable vive aquí con un
// identificador estable, y el componente que la pinta consulta si está visible.
// Ocultar y volver a mostrar deja de ser un despliegue y pasa a ser un clic.
//
// Cómo agregar una sección nueva:
//   1. Añadir una entrada a SECCIONES (id estable, nunca reutilizar uno viejo).
//   2. En el componente, envolver el bloque en `{esVisible('mi.id') && (...)}`.
//   3. Listo — aparece sola en el menú "Cambios", sin tocar esa página.
//
// El estado real vive en AppSettings, clave `visibilidadSecciones`, como un JSON
// { [id]: boolean }. Solo se guardan las decisiones EXPLÍCITAS del comité; un id
// ausente usa el `visiblePorDefecto` de aquí. Así, si mañana se agrega una
// sección nueva, no queda oculta por accidente ni exige migrar el AppSetting.

export const CLAVE_VISIBILIDAD = 'visibilidadSecciones';

export const SECCIONES = [
    {
        id: 'ejecutivo.heroKpis',
        titulo: 'Banda de 5 indicadores verdes',
        ubicacion: 'Panel Ejecutivo',
        detalle: 'Patrimonio de socios · Cartera pendiente · Recaudo del año · Disponible total · Apalancamiento del fondo, en la franja verde del encabezado.',
        motivo: 'Se ocultó porque tres de las cinco cifras (patrimonio, disponible y cartera) ya aparecen más abajo en "Detalle completo del fondo".',
        visiblePorDefecto: false,
        // Ruta real donde vive la sección, para la vista previa: navega ahí y
        // fuerza la sección a visible SOLO en la sesión del admin (ver
        // VisibilidadContext.activarVistaPrevia). `null` = no se previsualiza
        // navegando (ver CambiosPage para el caso especial de esa sección).
        ruta: '/admin/executive',
    },
    {
        id: 'ejecutivo.comparadorAnios',
        titulo: 'Comparar con años anteriores',
        ubicacion: 'Panel Ejecutivo',
        detalle: 'Gráfico interactivo mes a mes: permite elegir el indicador (intereses, ahorro, préstamos, mora) y qué años contrastar.',
        motivo: 'Se ocultó por decisión del comité para aligerar el panel.',
        visiblePorDefecto: false,
        ruta: '/admin/executive',
    },
    {
        id: 'ejecutivo.resultadosAnio',
        titulo: 'Resultados del año (6 tarjetas)',
        ubicacion: 'Panel Ejecutivo',
        detalle: 'Ahorro de los Socios · Préstamos Entregados · Patrimonio del Fondo · Ganancias por Intereses · Rendimiento Cuenta NU · Cobros por Pagos Tardíos, cada una con su avance frente al año anterior.',
        motivo: 'Se ocultó por decisión del comité para aligerar el panel.',
        visiblePorDefecto: false,
        ruta: '/admin/executive',
    },
    {
        id: 'miPosicion.parteEstimada',
        titulo: 'Tarjeta "Mi parte estimada"',
        ubicacion: 'Panel Ejecutivo · Mi posición en el fondo',
        detalle: 'Estimación de cuánto le correspondería a cada socio de la ganancia del año, según su ahorro mensual.',
        motivo: 'Es una estimación sobre resultados parciales, no una cifra aprobada ni distribuida — el comité decide cuándo mostrarla.',
        visiblePorDefecto: false,
        // Esta sección no aparece nunca en /admin/executive (el gerente no
        // consulta su propia posición ahí — ver ExecutivePanelPage), así que no
        // hay página a la que navegar para previsualizarla. CambiosPage la
        // previsualiza en línea, montando el componente real con los datos del
        // propio admin.
        ruta: null,
    },
    {
        id: 'menu.nuestroFondo',
        titulo: 'Menú "Nuestro Fondo" (Panel Principal)',
        ubicacion: 'Menú lateral del socio',
        detalle: 'Enlace al Panel Principal completo. El admin siempre lo ve, independientemente de este control.',
        motivo: 'Se ocultó porque el Panel Ejecutivo ya reemplaza su contenido para los socios.',
        visiblePorDefecto: false,
        // El admin siempre ve este enlace en su propio menú (bypass explícito en
        // UserDashboardLayout), así que no existe una página propia donde
        // comprobar el efecto real de ocultarlo. CambiosPage muestra una réplica
        // estática del enlace en su lugar.
        ruta: null,
    },
    {
        id: 'menu.evolucionAhorros',
        titulo: 'Menú "Evolución" (Ahorros)',
        ubicacion: 'Menú lateral del socio · submenú Ahorros',
        detalle: 'Enlace a Evolución de Ahorros (stock, flujo y composición del patrimonio). El admin siempre lo ve, independientemente de este control.',
        motivo: 'Se ocultó por decisión del comité; "Movimiento mensual" ya se puede ver desde Inteligencia Financiera.',
        visiblePorDefecto: false,
        ruta: null,
    },
    {
        id: 'evolucion.todoElFondo',
        titulo: 'Botón "Todo el fondo" en Evolución',
        ubicacion: 'Evolución de Ahorros (vista del socio)',
        detalle: 'Alterna la página entre "Mi evolución" y la evolución agregada de todo el fondo. Sin este botón, el socio solo puede ver la suya.',
        motivo: 'Se ocultó por decisión del comité para no exponer la evolución agregada del fondo a cualquier socio desde esta página.',
        visiblePorDefecto: false,
        // El botón vive dentro de la misma página que el menú que lo lleva ahí
        // (menu.evolucionAhorros) — previsualizarlo solo tiene sentido si esa
        // sección también está visible; CambiosPage lo previsualiza en línea con
        // una réplica del botón, igual que el enlace del menú.
        ruta: null,
    },
    {
        id: 'inteligencia.indicadoresRiesgo',
        titulo: 'Indicadores de Riesgo y Rendimiento',
        ubicacion: 'Inteligencia Financiera',
        detalle: 'Socios en Mora · Índice de Mora · Cobertura de Mora, las tres tarjetas de escala al inicio de la página.',
        // Primera entrada del catálogo que nace VISIBLE. Las demás documentan una
        // decisión ya tomada de ocultar; esta se registra por adelantado, porque
        // "Inteligencia Financiera" está en el menú de todos los socios y estas
        // tarjetas dicen a cuántos socios se les venció una cuota. Si algún día el
        // comité prefiere no publicarlo, que sea un clic y no un despliegue.
        motivo: 'Muestra a todos los socios cuántos están en mora. Al ocultarla, la página conserva el KPI "Mora Cartera" en la banda de indicadores, que da el porcentaje del fondo sin señalar a cuántos socios corresponde.',
        visiblePorDefecto: true,
        ruta: '/dashboard/inteligencia-financiera',
    },
];

/** Mapa id → definición, para consultas puntuales. */
export const SECCIONES_POR_ID = Object.fromEntries(SECCIONES.map(s => [s.id, s]));

/**
 * Resuelve si una sección debe mostrarse.
 *
 * @param {object|null} mapa  Overrides guardados por el comité ({ id: boolean }).
 *                            `null` significa "aún no cargó" — en ese caso se usa
 *                            el default, nunca se asume oculto: un fallo de red no
 *                            debe hacer desaparecer contenido que sí está aprobado.
 * @param {string} id         Identificador de la sección.
 */
export function esSeccionVisible(mapa, id) {
    const def = SECCIONES_POR_ID[id];
    // Un id desconocido se muestra: es preferible que una sección nueva aparezca
    // sin registrar a que desaparezca en silencio por un typo en el identificador.
    const porDefecto = def ? def.visiblePorDefecto : true;
    if (!mapa || typeof mapa[id] !== 'boolean') return porDefecto;
    return mapa[id];
}

/** Parsea el valor crudo del AppSetting, tolerando null/JSON inválido. */
export function parsearVisibilidad(valorCrudo) {
    if (!valorCrudo) return {};
    try {
        const parsed = JSON.parse(valorCrudo);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        // Un JSON corrupto no debe tumbar la app ni ocultar todo: se ignora y se
        // cae a los defaults del catálogo.
        return {};
    }
}
