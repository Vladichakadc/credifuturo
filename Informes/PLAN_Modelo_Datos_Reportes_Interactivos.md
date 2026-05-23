# Plan de Modelo de Datos para Reportes Interactivos

## Objetivo
Actualizar el esquema de la base de datos para reflejar fielmente la estructura de los archivos Excel de origen (`Tabla_Clientes`, `Prestamos`, `Ahorros`), permitiendo la generación de reportes interactivos y detallados en la aplicación web.

## 1. Análisis de Brechas (Gap Analysis)

| Modelo Actual | Excel Fuente | Campos Faltantes Clave |
| :--- | :--- | :--- |
| **Client** | `Tabla_Clientes.xlsx` | `customerId` (si es distinto a cédula), `genero`, `ciudad`, `estatus`, `fecha_ingreso`, `cargo` |
| **Saving** | `...ahorro_mensual.xlsx` | `banco`, `numero_transaccion`, `penalizacion` |
| **DisbursedLoan** | `...prestamos_desembolsados.xlsx` | `plazo_cuotas`, `tasa_interes`, `fecha_vencimiento` |
| **(Nuevo)** | `...estado_prestamos.xlsx` | **Tabla Completa**: Historial de pagos y saldos |

## 2. Esquema de Base de Datos Propuesto

### A. [MODIFY] Client Model
Actualizar `server/models/Client.js`:
- `customerId` (String, unique) - *ID del Excel*
- `genero` (String)
- `ciudad` (String)
- `direccion` (String)
- `telefono` (String)
- `fechaIngreso` (Date)
- `estatus` (String: 'Activo', 'Inactivo')

### B. [MODIFY] Saving Model
Actualizar `server/models/Saving.js`:
- `banco` (String)
- `referencia` (String) - *# Transacción*
- `origen` (String) - *Desde cuenta de ahorros?*

### C. [MODIFY] DisbursedLoan Model
Actualizar `server/models/DisbursedLoan.js`:
- `cuotas` (Integer)
- `tasaInteres` (Decimal)
- `frecuenciaPago` (String)

### D. [NEW] LoanPayment Model (Balance/Estado)
Crear `server/models/LoanPayment.js` para `1-orders_table_estado_prestamos.xlsx`:
- `id`
- `loanId` (FK -> DisbursedLoan)
- `saldoInicial` (Decimal)
- `valorCuota` (Decimal)
- `pagoCapital` (Decimal)
- `pagoInteres` (Decimal)
- `saldoFinal` (Decimal)
- `fechaPago` (Date)
- `estado` (String)

## 3. Estrategia de Implementación

1.  **Corrección del Servidor**: Reinstalar dependencias (`npm install`) para asegurar que Sequelize funcione.
2.  **Actualización de Modelos**: Modificar los archivos en `server/models`.
3.  **Sincronización**: Configurar `sequelize.sync({ alter: true })` para actualizar las tablas sin borrar datos (o `force: true` si estamos en desarrollo temprano y podemos reiniciar).
4.  **Endpoint de Importación**: Crear script de carga masiva que lea los Excel y pueble estas tablas.

## 4. Verificación
- Verificar que el servidor inicia sin errores.
- Verificar que las tablas tienen las nuevas columnas.
- Cargar datos de prueba y visualizar en el Dashboard.
