# Sincronización Total de Formularios

Actualizar el Panel de Administración para que todos los formularios estén vinculados dinámicamente a la base de datos de Credifuturo, incluyendo nuevas secciones, carga dinámica de datos, validación de duplicados y balances en tiempo real.

## Cambios Propuestos

---

### Backend (Node.js/Express)

#### [MODIFY] [admin.js](file:///c:/Credifuturo/Credifuturo-Web/server/routes/admin.js)
- Implementar validación de cédula duplicada en el endpoint `POST /clients`.
- Crear endpoint `GET /clients/:id/balance` para calcular el saldo actual de un cliente basándose en sus ahorros y préstamos/pagos.
- Asegurar que `GET /savings` y `GET /disbursed-loans` incluyan toda la información necesaria para las nuevas vistas.

---

### Frontend (React/Vite)

#### [MODIFY] [AdminDashboard.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/AdminDashboard.jsx)
- **Navegación**: Reemplazar las pestañas actuales con: 'Ingreso de Datos', 'Socios', 'Estado Préstamos', 'Préstamos Desembolsados' y 'Aportes Iniciales'.
- **Carga Dinámica**:
    - Al seleccionar un cliente en el formulario de "Registrar Ahorro", mostrar su saldo actual (llamando al nuevo endpoint del backend).
- **Lógica de Formularios**:
    - Manejar el error de cédula duplicada al guardar un nuevo cliente y mostrar una alerta amigable.
- **Secciones Nuevas**:
    - 'Socios': Lista completa de clientes (existente, pero sincronizada).
    - 'Estado Préstamos': Tabla con el registro de pagos (`LoanPayment`).
    - 'Préstamos Desembolsados': Tabla con `DisbursedLoan` (renombrar la actual).
    - 'Aportes Iniciales': Filtro de la tabla de ahorros para mostrar solo tipos 'Aporte Inicial'.

---

## Plan de Verificación

### Pruebas Automatizadas
- No se han encontrado frameworks de pruebas instalados (Jest/Mocha). Se recomienda realizar pruebas manuales y verificar los logs del servidor.

### Verificación Manual
1. **Validación de Cédula**: Intentar crear un cliente con una cédula que ya existe en la base de datos y verificar que el sistema detenga la operación y notifique al usuario.
2. **Carga de Dinámica**: En la pestaña "Ingreso de Datos", seleccionar un cliente en el formulario de ahorro y verificar que aparezca el "Saldo Actual" correctamente calculado.
3. **Nuevas Pestañas**: Navegar por todas las pestañas ('Socios', 'Estado Préstamos', etc.) y verificar que la información mostrada sea coherente con los datos de la base de datos.
4. **Carga de Excel**: Ejecutar "Cargar Excel" y verificar que los datos se reflejen instantáneamente en todas las secciones correspondientes sin duplicados.
