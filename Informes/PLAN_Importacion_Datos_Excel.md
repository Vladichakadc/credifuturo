# Implementación de Importación de Datos desde Excel

## Objetivo
Permitir al administrador cargar datos masivamente desde archivos Excel ubicados en `C:\Credifuturo` directamente desde el Panel de Administración.

## Resumen de Cambios

### Back-End (Server)

1.  **Refactorizar lógica de importación**:
    *   Convertir `server/import_data.js` en un módulo reutilizable o integrar su lógica en un controlador.
    *   Ruta: `server/routes/admin.js`

2.  **Nueva Ruta API**:
    *   `POST /api/admin/import-data`
    *   Esta ruta ejecutará el proceso de lectura de Excel y actualización de la base de datos (SQLite).
    *   Devolverá un resumen de la operación (filas procesadas).

### Front-End (Client)

1.  **[MODIFICAR] [AdminDashboard.jsx](file:///C:/Credifuturo/Credifuturo-Web/client/src/pages/AdminDashboard.jsx)**:
    *   Agregar botón **"📥 Cargar Excel"** en el encabezado.
    *   Implementar función `handleImportData` que llame a la nueva API.
    *   Mostrar estado de "Cargando..." durante la importación (puede tardar varios segundos).
    *   Al finalizar, recargar automáticamente los datos (`fetchData`).

## Archivos Requeridos
Los archivos Excel deben existir en el servidor (local) en:
*   `C:/Credifuturo/Tabla_Clientes.xlsx`
*   `C:/Credifuturo/1-orders_table_ahorro_mensual.xlsx`
*   `C:/Credifuturo/1-orders_table_aportes_iniciales.xlsx`
*   `C:/Credifuturo/1-orders_table_prestamos_desembolsados.xlsx`
*   `C:/Credifuturo/1-orders_table_estado_prestamos.xlsx` (Para actualizar estados)

## Verificación
*   Clic en el botón inicia la importación.
*   Los datos nuevos/actualizados aparecen en las tablas.
*   Se manejan errores si los archivos no existen.
