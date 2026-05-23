# Plan de Optimización: Columnas Duplicadas en `LoanPayments`

## Diagnóstico del Problema

La tabla `LoanPayments` tiene **38 columnas** cuando debería tener **22**. Esto ocurrió porque el modelo Sequelize fue migrado de camelCase nativo a snake_case con alias `field:`, pero las columnas originales camelCase nunca se eliminaron de la DB.

### Columnas actualmente en la tabla

| Estado | Columna DB (actual) | Campo Modelo | Función |
|--------|---------------------|--------------|---------|
| ✅ **ACTIVA** | `id_ep` | `externalId` | PK secundario |
| ✅ **ACTIVA** | `clientId` | `clientId` | FK (legacy sin snake_case) |
| ✅ **ACTIVA** | `mes_desembolso` | `mesDesembolso` | |
| ✅ **ACTIVA** | `saldo_inicial` | `saldoInicial` | |
| ✅ **ACTIVA** | `cuotas_prestamo` | `cuotasPrestamo` | |
| ✅ **ACTIVA** | `interes_mensual` | `interesMensual` | |
| ✅ **ACTIVA** | `valor_intereses_amortizados` | `valorInteresesAmortizados` | |
| ✅ **ACTIVA** | `fecha_pago_max` | `fechaPagoMax` | |
| ✅ **ACTIVA** | `mes_pago` | `mesPago` | |
| ✅ **ACTIVA** | `valor_cuota_variable` | `valorCuotaVariable` | |
| ✅ **ACTIVA** | `estado` | `estado` | |
| ✅ **ACTIVA** | `valor_cuota_pago` | `valorCuotaPago` | |
| ✅ **ACTIVA** | `saldo_final` | `saldoFinal` | |
| ✅ **ACTIVA** | `item_quantity` | `itemQuantity` | |
| ✅ **ACTIVA** | `banco` | `banco` | |
| ✅ **ACTIVA** | `numero_transaccion` | `numeroTransaccion` | |
| ✅ **ACTIVA** | `cuenta_ahorros` | `cuentaAhorros` | |
| ✅ **ACTIVA** | `observaciones` | `observaciones` | |
| ✅ **ACTIVA** | `id_vm` | `idVm` | |
| ✅ **ACTIVA** | `estado_prestamo` | `estadoPrestamo` | |
| ✅ **ACTIVA** | `loan_id` | `loanId` | |
| ✅ **ACTIVA** | `createdAt` | auto | |
| ✅ **ACTIVA** | `updatedAt` | auto | |
| ❌ **HUÉRFANA** | `mesDesembolso` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `saldoInicial` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `cuotasPrestamo` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `interesMensual` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `valorInteresesAmortizados` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `fechaPagoMax` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `mesPago` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `valorCuotaVariable` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `valorCuotaPago` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `saldoFinal` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `numeroTransaccion` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `cuentaAhorros` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `estadoPrestamo` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `loanId` | *(ninguno)* | Duplicado legacy |
| ❌ **HUÉRFANA** | `mes_pago` (duplicado import) | *(ninguno)* | Aparece 2 veces |

> [!IMPORTANT]
> **El modelo Sequelize ya usa snake_case correctamente.** Las columnas camelCase son completamente huérfanas — ningún código las lee ni las escribe. La migración es **puramente de base de datos**, sin cambios en backend ni frontend.

> [!CAUTION]
> SQLite **no soporta `DROP COLUMN`** directamente (versiones < 3.35). La estrategia es recrear la tabla con las columnas correctas y copiar los datos. Este proceso se hará dentro de una transacción para garantizar atomicidad.

---

## Verificación de Impacto

### ✅ Backend (`admin.js` + `LoanPayment.js`)
- El modelo ya tiene `field: 'snake_case'` para **todas** las columnas activas.
- Ninguna ruta usa `sequelize.literal()` con nombres de columna camelCase.
- Los filtros de la ruta `/payments/list` usan los nombres del modelo (camelCase), que Sequelize traduce a snake_case automáticamente.

### ✅ Frontend (`PaymentsPage.jsx`, `PaymentsListPage.jsx`, etc.)
- El frontend recibe JSON del backend normalizado en camelCase.
- **No accede directamente a la DB** — solo consume la API REST.
- Los campos `mesPago`, `estadoPrestamo`, etc. que usa el frontend son los **nombres del modelo**, no los nombres de columna DB.

### ⚠️ Columna especial: `clientId`
El campo `clientId` (FK) usa el nombre camelCase directamente en la DB (sin alias `field:`). Se **mantiene** tal como está.

---

## Open Questions

> [!IMPORTANT]
> **¿Hay datos diferentes entre las columnas duplicadas?**
> Es posible que en algún registro antiguo, la columna huérfana `mesDesembolso` tenga un valor distinto a `mes_desembolso`. El script de migración verificará esto automáticamente antes de proceder y **bloqueará la migración si encuentra inconsistencias de datos**, requiriendo revisión manual.

> [!NOTE]
> Se propone mantener `clientId` (camelCase en DB) ya que el modelo no tiene `field:` para esa FK y funciona correctamente así.

---

## Proposed Changes

### Fase 0 — Backup Automático

#### [NEW] `server/migrate_cleanup_loanpayments.js`
Script de migración que:
1. **Crea backup automático** de `database.sqlite` → `database.sqlite.bak_YYYYMMDD_HHMMSS` antes de cualquier cambio
2. **Valida datos** — compara columnas duplicadas para detectar inconsistencias
3. **Ejecuta migración** dentro de una transacción SQLite
4. **Verifica resultado** — cuenta filas antes y después

---

### Fase 1 — Script de Migración SQLite (sin cambios al código)

El script ejecuta el siguiente proceso dentro de una transacción:

```sql
-- 1. Crear tabla temporal con SOLO las 23 columnas activas
CREATE TABLE LoanPayments_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  id_ep         VARCHAR(255),
  clientId      INTEGER NOT NULL REFERENCES Clients(id),
  mes_desembolso TEXT,
  saldo_inicial  DECIMAL(12,2) NOT NULL DEFAULT 0,
  cuotas_prestamo INTEGER NOT NULL DEFAULT 0,
  interes_mensual DECIMAL(5,4) NOT NULL DEFAULT 0,
  valor_intereses_amortizados DECIMAL(12,2),
  fecha_pago_max DATE NOT NULL,
  mes_pago      TEXT,
  valor_cuota_variable DECIMAL(12,2),
  estado        VARCHAR(255) NOT NULL DEFAULT 'Pendiente',
  valor_cuota_pago DECIMAL(12,2) NOT NULL DEFAULT 0,
  saldo_final   DECIMAL(12,2),
  item_quantity INTEGER NOT NULL DEFAULT 1,
  banco         VARCHAR(255),
  numero_transaccion TEXT,
  cuenta_ahorros TEXT,
  observaciones TEXT,
  id_vm         TEXT,
  estado_prestamo TEXT,
  loan_id       INTEGER,
  createdAt     DATETIME NOT NULL,
  updatedAt     DATETIME NOT NULL
);

-- 2. Copiar datos desde columnas snake_case activas
INSERT INTO LoanPayments_new SELECT
  id, id_ep, clientId, mes_desembolso, saldo_inicial,
  cuotas_prestamo, interes_mensual, valor_intereses_amortizados,
  fecha_pago_max, mes_pago, valor_cuota_variable, estado,
  valor_cuota_pago, saldo_final, item_quantity, banco,
  numero_transaccion, cuenta_ahorros, observaciones,
  id_vm, estado_prestamo, loan_id, createdAt, updatedAt
FROM LoanPayments;

-- 3. Renombrar
DROP TABLE LoanPayments;
ALTER TABLE LoanPayments_new RENAME TO LoanPayments;
```

> [!NOTE]
> **No se modifica ningún archivo de código** (backend ni frontend). El cambio es únicamente en la estructura física de la DB. Sequelize seguirá funcionando igual porque el modelo ya mapea correctamente con `field:`.

---

### Fase 2 — Verificación Automatizada

El script verifica post-migración:
- ✅ Número de filas idéntico (antes = después)
- ✅ La tabla tiene exactamente 24 columnas
- ✅ Sequelize puede hacer `SELECT`, `INSERT` y `UPDATE` de prueba
- ✅ El endpoint `/api/admin/payments/list` responde correctamente
- ✅ El endpoint `/api/admin/dashboard-stats` responde correctamente

---

### Fase 3 — Procedimiento de Rollback

Si algo falla, el rollback es inmediato:

```bash
# Detener servidor
# Copiar backup de vuelta
copy database.sqlite.bak_YYYYMMDD_HHMMSS database.sqlite
# Reiniciar servidor
```

El script de migración también implementa rollback automático si la transacción falla.

---

## Verification Plan

### Automatizados (script post-migración)
```bash
node migrate_cleanup_loanpayments.js
```
- Valida conteo de filas
- Valida estructura de columnas
- Ejecuta prueba de query real

### Endpoints API
```bash
curl http://localhost:5000/api/admin/payments/list
curl http://localhost:5000/api/admin/dashboard-stats
curl http://localhost:5000/api/admin/disbursed-loans
```
Todos deben responder `200 OK` con datos correctos.

### Verificación visual del frontend
- **Dashboard**: Métricas `Saldo en Banco`, `Cartera Activa`, `Cartera en Mora` correctas
- **Lista Estado Préstamos**: registros visibles con columnas `mesPago`, `estadoPrestamo`, valores intactos
- **Registro Estado Préstamos**: formulario de nuevo registro funcional
- **Modificar Registro**: actualización de cuotas funcional

### Resultado esperado
| Métrica | Antes | Después |
|---------|-------|---------|
| Columnas en LoanPayments | 38 | 24 |
| Registros en LoanPayments | 119 | 119 |
| Backend funcionando | ✅ | ✅ |
| Frontend funcionando | ✅ | ✅ |
