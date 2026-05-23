# Refinanciación Automática de Préstamos

**Fecha de implementación:** 16 de mayo de 2026  
**Última actualización:** 16 de mayo de 2026 — Corrección `estadoPrestamo` en cuotas ya pagadas  
**Módulo afectado:** Registrar Nuevo Desembolso  
**Estado:** ✅ Implementado y activo

---

## ¿Qué es la refinanciación?

Cuando un socio que ya tiene un préstamo **Vigente** solicita un nuevo préstamo, el sistema activa automáticamente el proceso de **refinanciación**: el préstamo anterior se cancela y sus cuotas pendientes se saldan sin cobrar los intereses restantes, ya que el socio está pagando por adelantado.

---

## Regla de negocio aplicada

| Condición | Resultado |
|-----------|-----------|
| Socio con préstamo Vigente solicita nuevo préstamo | Refinanciación automática |
| Cuotas pendientes del préstamo anterior | Se marcan como **PAGADO** con interés = $0 |
| Préstamo anterior | Cambia de **Vigente → Cancelado** |
| Interés condonado | **No se contabiliza** en ningún cálculo del fondo |
| Nuevo préstamo | Se crea normalmente con su tabla de cuotas |
| Fallo en cualquier paso | **Rollback total** — ningún cambio queda guardado |

---

## Flujo en el formulario "Registrar Nuevo Desembolso"

### 1. Selección del socio
Al seleccionar un socio en el formulario, el sistema consulta automáticamente si tiene un préstamo activo. Si existe, aparece de inmediato un **panel de alerta naranja** con el detalle:

- Identificador del préstamo vigente (ej: `SOL22`)
- Número de cuotas pendientes que serán saldadas
- Monto del interés que será condonado
- Confirmación de que el préstamo anterior pasará a `CANCELADO`

### 2. Confirmación antes de guardar
Al presionar **Guardar**, si hay una refinanciación pendiente, el sistema muestra un cuadro de confirmación explícita con el resumen de la operación. El administrador debe aceptar conscientemente antes de continuar.

### 3. Procesamiento
El sistema muestra una pantalla de progreso con los pasos:
- Cancelando préstamo anterior
- Saldando cuotas sin interés
- Registrando nuevo desembolso
- Generando nuevas cuotas

### 4. Resultado
Un mensaje de éxito confirma:
- El préstamo anterior cancelado
- Las cuotas saldadas
- El interés condonado (valor exacto en pesos)

---

## Cambios técnicos implementados

### Base de datos — Modelo `LoanPayment`
Se agregó la columna `es_prepago` (`BOOLEAN`, default `false`):

```
es_prepago = true  →  cuota cancelada por refinanciación (interés condonado)
es_prepago = false →  cuota normal (sin cambios)
```

La columna se agregó automáticamente via `sequelize.sync()` al reiniciar el servidor. No requirió migración manual.

### Backend — Nuevos endpoints y lógica

#### `GET /api/admin/clients/:id/active-loan`
Verifica si el socio tiene un préstamo Vigente. Retorna:
```json
{
  "tienePrestamoActivo": true,
  "prestamo": {
    "idVm": "SOL22",
    "cuotasPendientes": 2,
    "capitalPendiente": 650000,
    "interesCondonable": 18200
  }
}
```

#### `POST /api/admin/disbursed-loans` (modificado)
Ahora opera dentro de una **transacción atómica**. Si el socio tiene préstamo vigente, antes de crear el nuevo:

1. Busca todas las cuotas `Pendiente` del préstamo anterior (por `id_vm`)
2. **Actualiza en bloque** todas las cuotas ya pagadas o en mora (`estado ≠ 'Pendiente'`):
   - `estado_prestamo` → `'Cancelado'`
   *(Corrección: antes quedaban con `estadoPrestamo = 'Pendiente'` aunque el préstamo estuviera cancelado)*
3. Actualiza cada cuota con `estado = 'Pendiente'`:
   - `estado` → `'Pago'`
   - `estado_prestamo` → `'Cancelado'`
   - `valor_intereses_amortizados` → `0`
   - `valor_cuota_pago` → capital solamente (sin interés)
   - `es_prepago` → `true`
   - `observaciones` → referencia al nuevo préstamo
4. Cambia el préstamo anterior a `estado = 'Cancelado'`
5. Crea el nuevo préstamo y sus cuotas
6. Retorna en la respuesta el objeto `refinanciacion` con el resumen

La búsqueda de préstamos vigentes usa `LIKE '%Vigente%'` para manejar la inconsistencia de datos existentes (`"Vigente "` con espacio al final en 9 de 10 registros).

#### `GET /api/admin/dashboard-stats` (modificado)
Las dos consultas de interés ahora excluyen registros con `esPrepago = true`:

- `totalIntereses` — interés agendado en el año (pagado + pendiente)
- `totalInteresesPagados` — interés efectivamente cobrado

Esto garantiza que el interés condonado **no infle las métricas de rentabilidad** del fondo.

### Frontend — `LoansPage.jsx`

| Cambio | Descripción |
|--------|-------------|
| Ícono `AlertTriangle` importado | Para el panel de alerta |
| Estado `activeLoanWarning` | Almacena el préstamo activo detectado |
| `useEffect` en `clientId` | Llama al endpoint de verificación al seleccionar socio |
| Panel amber en el formulario | Visible solo en modo creación cuando hay préstamo activo |
| Confirmación en `handleSubmitDisbursed` | `window.confirm` con resumen antes de procesar |
| Toast de éxito mejorado | Muestra idVm cancelado, cuotas saldadas e interés condonado |

---

## Impacto en los cálculos del fondo

| Métrica | Comportamiento |
|---------|----------------|
| Intereses esperados 2026 | ✅ Excluye interés condonado |
| Intereses recaudados 2026 | ✅ Excluye interés condonado |
| Tabla comparativa 2025 vs 2026 | ✅ Correcta automáticamente |
| Saldo en banco (`saldoEnBanco`) | ✅ Sube: al cancelar el préstamo anterior baja `totalAllLoans` |
| Estimado al cierre del año | ✅ Correcto: usa los valores ya filtrados |

---

## Casos de borde considerados

| Caso | Comportamiento |
|------|----------------|
| Socio sin préstamo activo | Flujo normal, sin alerta, sin cambios |
| Préstamo con estado `"Vigente "` (espacio) | Manejado con `LIKE '%Vigente%'` |
| Todas las cuotas ya pagadas, préstamo sigue Vigente | Solo se actualiza el estado a Cancelado |
| Fallo de red o error del servidor | Rollback total de la transacción |
| Admin edita un préstamo existente | La lógica de refinanciación NO aplica |
| Socio sin cuotas pendientes visibles | `interesCondonable = 0`, operación transparente |
| Cuotas ya pagadas del préstamo anterior | `estadoPrestamo` actualizado a `Cancelado` en bloque |

---

## Identificación de cuotas prepago en la base de datos

Para consultar las cuotas canceladas por refinanciación directamente en la base de datos:

```sql
SELECT id_ep, clientId, id_vm, estado, valor_intereses_amortizados, observaciones
FROM LoanPayments
WHERE es_prepago = 1
ORDER BY updatedAt DESC;
```

---

*Documento generado automáticamente por el sistema Credifuturo v2.0*
