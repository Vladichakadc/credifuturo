# Menú Dinámico de Informes y Auditorías

Se implementará un nuevo menú lateral interactivo que detecta, lista y permite visualizar o eliminar cualquier informe, auditoría o plan guardado en la carpeta del proyecto.

## User Review Required

> [!IMPORTANT]
> **Aprobación de la Ubicación de Archivos**
> Para garantizar que el sistema encuentre automáticamente los archivos, propongo crear una carpeta dedicada llamada `C:\Credifuturo\Informes`. 
> A partir de ahora, todo informe, auditoría o plan que te genere lo guardaré automáticamente allí, y el menú se actualizará para mostrarlo. ¿Estás de acuerdo con usar esta carpeta?

> [!WARNING]
> **Instalación de Dependencias**
> Para cumplir con el requerimiento de "formato visual con colores" (negritas, tablas, títulos), instalaré la librería `react-markdown` en el frontend, lo cual es rápido y seguro.

## Proposed Changes

### Backend API (`server`)
Se agregará lógica para gestionar los archivos del sistema operativo.

#### [MODIFY] [admin.js](file:///c:/Credifuturo/Credifuturo-Web/server/routes/admin.js)
- Agregar endpoint `GET /admin/informes`: Escaneará la carpeta `C:\Credifuturo\Informes` y devolverá la lista de archivos disponibles con su fecha de creación.
- Agregar endpoint `GET /admin/informes/:filename`: Devolverá el contenido de texto exacto del archivo solicitado.
- Agregar endpoint `DELETE /admin/informes/:filename`: Eliminará el archivo físico del disco de forma segura.

### Frontend App (`client`)

#### [MODIFY] [DashboardLayout.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/layouts/DashboardLayout.jsx)
- Se añadirá una petición `api.get('/admin/informes')` que se ejecuta al cargar el Dashboard.
- Se agregará el bloque principal del menú llamado **"Informes"** debajo del menú "Backup".
- Los submenús se poblarán automáticamente (`children` dinámicos) con la lista de nombres de archivo que provengan de la base de datos, apuntando a una nueva ruta de visualización.

#### [MODIFY] [App.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/App.jsx)
- Se registrará la nueva ruta dinámica: `<Route path="informes/:filename" element={<InformesViewerPage />} />`.

#### [NEW] [InformesViewerPage.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/InformesViewerPage.jsx)
- Creación del componente que consumirá el endpoint `GET /admin/informes/:filename`.
- Uso de `react-markdown` para renderizar el texto con diseño atractivo (colores, listas, tablas).
- Botón rojo de **Eliminar** en la esquina superior derecha que llama a la API de eliminación y luego redirige al inicio del Dashboard.

## Verification Plan

### Automated Tests
1. Instalaré las dependencias `react-markdown`.
2. Crear la carpeta `C:\Credifuturo\Informes` y migrar el informe recién creado allí.
3. Iniciar el backend y verificar con un endpoint de prueba.

### Manual Verification
- Al recargar la aplicación web, revisarás que exista el menú "Informes" bajo "Backup".
- Al dar clic, se debe desplegar el menú con el `informe_penalizaciones_ahorro.md`.
- Dar clic en el informe debe abrir una página con formato de texto enriquecido.
- Dar clic en el botón Eliminar debe borrar el archivo y sacarlo del menú lateral.
