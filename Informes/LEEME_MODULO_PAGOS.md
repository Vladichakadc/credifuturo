# 💳 MÓDULO: REGISTRO ESTADO PRÉSTAMOS (Control de Pagos)

Este módulo permite gestionar el control detallado de pagos y abonos a préstamos, siguiendo la estructura exacta de 22 columnas requerida.

---

## 📋 Estructura de Datos (22 Campos)

El formulario y la base de datos manejan la siguiente estructura exacta:

| # | Campo | Tipo | Origen / Lógica |
|---|---|---|---|
| 1 | **Id_EP** | Auto (P##) | Generado automáticamente (consecutivo) |
| 2 | **Customer_id** | Select | Seleccionado de la lista de socios |
| 3 | **Nombre** | Auto | Del socio seleccionado |
| 4 | **Apellido** | Auto | Del socio seleccionado |
| 5 | **Mes Desembolso** | Texto | Del préstamo asociado |
| 6 | **Saldo Inicial** | Moneda | Manual o del préstamo asociado |
| 7 | **# Cuotas Prestamo** | Entero | Manual o del préstamo asociado |
| 8 | **Interés Mensual** | Decimal | Ej: 0.015 (Manual o del préstamo) |
| 9 | **Valor Int. Amortizados** | Auto | `Saldo Inicial * Interés Mensual` |
| 10 | **Fecha de Pago Max** | Fecha | Manual |
| 11 | **Mes de Pago** | Auto | Calculado de la Fecha de Pago Max |
| 12 | **Valor Cuota Variable** | Auto | `(Saldo Inicial / Cuotas) + Int. Amortizados` |
| 13 | **Estado** | Select | Pendiente, Pago, Mora, Abono |
| 14 | **Valor Cuota Pago** | Moneda | Lo que el cliente pagó realmente |
| 15 | **Saldo Final** | Auto | `Saldo Inicial - Valor Pago + Int. Amortizados` |
| 16 | **Item_Quantity** | Entero | Default: 1 |
| 17 | **Banco desembolsado** | Texto | Informativo |
| 18 | **# Transaccion** | Texto | Informativo |
| 19 | **Cuenta de Ahorros** | Texto | Informativo |
| 20 | **Observaciones** | Texto | Notas adicionales |
| 21 | **Id_VM** | Select | Préstamo asociado (SOL##) |
| 22 | **Estado Prestamo** | Select | Activo, Cancelado, Desembolsado |

---

## 🚀 Funcionalidades Clave

1.  **Auto-llenado Inteligente**:
    *   Al seleccionar un Socio, busca automáticamente sus préstamos activos.
    *   Si tiene préstamos, sugiere llenar los campos del último préstamo (Saldo, Cuotas, Interés, etc.).

2.  **Cálculos Automáticos**:
    *   El sistema calcula en tiempo real:
        *   Intereses Amortizados
        *   Valor Cuota Variable Aproximada
        *   Saldo Final Esperado
        *   Mes de Pago (basado en fecha)

3.  **Validaciones**:
    *   No permite guardar sin Saldo Inicial, Cuotas, Interés o Valor Pagado.
    *   Mantiene la integridad de datos con el Socio y el Préstamo original.

4.  **Exportación Excel**:
    *   Genera un reporte con las **22 columnas exactas** y en el orden correcto.

---

## 🔧 Detalles Técnicos

*   **Tabla DB**: `LoanPayments` (SQLite)
*   **Modelo Backend**: `server/models/LoanPayment.js`
*   **Endpoint**: `GET /api/admin/payments`
*   **Frontend**: `AdminDashboard.jsx` (Tab "Estado Préstamos")

---

### Scripts de Utilidad (Server)

*   `test_payments_module.js`: Prueba automatizada de creación, lectura, edición y eliminación de pagos.
*   `force_sync_payments.js`: (¡CUIDADO!) Borra y recrea la tabla `LoanPayments` si se necesita resetear la estructura.

---

**Desarrollado por:** Antigravity AI Agent  
**Fecha:** 2026-02-17
