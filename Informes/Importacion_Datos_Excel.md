# Resumen - Corrección de Logo y Mejoras en Reportes

## Cambios Realizados

### Visibilidad del Logo
- Se movió `logo.jpg` a la carpeta `src/assets` para asegurar que el sistema de construcción lo procese correctamente.
- Se actualizaron `Navbar.jsx`, `Login.jsx`, `AdminDashboard.jsx` y `UserDashboard.jsx` para importar el logo directamente.

### Filtros en Reportes
- Se actualizó `AdminDashboard.jsx` para incluir un **Filtro por Año** en todos los tipos de reportes.
- Se implementó la generación dinámica de años (los últimos 2 años + el actual + los próximos 3 años).
- Se implementó la lógica de filtrado para el "Directorio de Socios" basado en la fecha de ingreso (`entryDate`).
- Se aseguró que el conteo total de registros refleje los datos filtrados.

## Resultados de Verificación

### Verificación Manual
1.  **Logo**:
    - El logo debe aparecer consistentemente en la página de Inicio de Sesión, la Barra de Navegación, el Panel de Administración y el Panel de Usuario.
2.  **Filtros de Reportes**:
    - En Panel de Administración -> Consultas:
        - Seleccione "Directorio de Socios".
        - El menú desplegable "Año" debe ser visible.
        - Cambiar el año debe filtrar la lista de socios por su año de ingreso.
        - El contador "Total registros" debe actualizarse acorde al filtro.
        - Los reportes "Historial de Ahorros" y "Cartera de Préstamos" también deben respetar el filtro de año.
