# Auditoría de Sincronización y Coherencia — Base de Datos Credifuturo

**Fecha:** 21 de mayo de 2026  
**Versión:** 1.0  
**Estado:** Completada ✅  
**Ejecutada por:** Sistema de Auditoría Automatizada  

---

## 1. Resumen Ejecutivo

Se realizó una auditoría completa de sincronización entre los datos mostrados en el panel de control (dashboard) y la base de datos SQLite. Se verificaron **16 indicadores clave**, se encontraron **3 hallazgos**, se corrigieron **3 de 3** durante esta sesión.

| Categoría | Indicadores | Estado |
|-----------|-------------|--------|
| KPIs de Ahorros | 6 | ✅ Todos correctos |
| KPIs de Préstamos y Cartera | 7 | ✅ Todos correctos |
| KPIs de Saldos y Rendimientos | 3 | ✅ Todos correctos |
| Integridad referencial | 2 chequeos | ✅ Sin huérfanos |
| Hallazgos corregidos | 3 | ✅ Resueltos |

---

## 2. Verificación de KPIs del Dashboard

### 2.1 Panel Superior — Ahorros

| KPI | Valor Dashboard | Valor BD (SQL) | Resultado |
|-----|----------------|----------------|-----------|
| Total Socios Activos | 23 | `COUNT(*) WHERE estatus LIKE '%Activo%'` = **23** | ✅ |
| Capital Ahorrado | $29.158.313 | `SUM(amount WHERE type≠'Aporte Inicial', activos)` = **$29.158.313** | ✅ |
| Total Aportes Iniciales | $13.800.000 | `SUM(amount WHERE type='Aporte Inicial', activos)` = **$13.800.000** | ✅ |
| Total Ahorrado | $42.958.313 | $29.158.313 + $13.800.000 = **$42.958.313** | ✅ |
| Días de Penalización (2026) | 77 | `SUM(diasPenalizacion WHERE year=2026, activos)` = **77** | ✅ |
| Valor Penalizado (2026) | $77.000 | `SUM(valorAPenalizar WHERE year=2026, activos)` = **$77.000** | ✅ |

> **Nota:** 77 días × $1.000/día = $77.000. La tasa diaria de penalización está correctamente aplicada. Los 7 registros con `penalizacion='SI'` corresponden a socios con mora en ahorros confirmada.

### 2.2 Panel Medio — Préstamos y Cartera

| KPI | Valor Dashboard | Valor BD (SQL) | Resultado |
|-----|----------------|----------------|-----------|
| Total Valor Prestado | $36.600.000 / 12 préstamos | `SUM(valor_prestado WHERE anio IN [2026,2027])` = **$36.600.000, n=12** | ✅ |
| Cartera Activa | $22.846.183 / 50 cuotas | `SUM(valor_cuota_variable WHERE estado='Pendiente', rango 2026-2027)` = **$22.846.183, n=50** | ✅ |
| Cartera en Mora | $0 | Cuotas pendientes con fecha vencida hoy = **0** | ✅ |
| Total Préstamos + Intereses | $39.062.700 | $36.600.000 + $2.462.700 = **$39.062.700** | ✅ |
| Intereses Esperados | $2.462.700 | `SUM(valor_intereses_amortizados WHERE rango 2026-2027, no prepago)` = **$2.462.700** | ✅ |
| Intereses Recaudados | $1.074.850 | `SUM(valor_intereses_amortizados WHERE estado='Pago', rango 2026-2027)` = **$1.074.850** | ✅ |
| Intereses por Cobrar | $1.387.850 | $2.462.700 − $1.074.850 = **$1.387.850** | ✅ |

### 2.3 Panel Inferior — Saldos y Rendimientos

| KPI | Valor Dashboard | Verificación | Resultado |
|-----|----------------|--------------|-----------|
| Rentabilidad Caja NU | $453.490 | Valor actualizado manualmente el 21/05/2026 desde extracto Nubank | ✅ |
| Saldo en Banco | $28.374.996 | Ver análisis metodológico §4 | ✅ (diseño) |
| Saldo Banco + NU | $28.828.486 | $28.374.996 + $453.490 = **$28.828.486** | ✅ |

---

## 3. Verificación de Integridad Referencial

```sql
-- Pagos huérfanos (LoanPayments sin DisbursedLoan válido)
SELECT COUNT(*) FROM LoanPayments lp
WHERE NOT EXISTS (SELECT 1 FROM DisbursedLoans dl WHERE dl.id_vm = lp.id_vm);
→ 0 huérfanos ✅

-- Ahorros huérfanos (Savings sin Client válido)
SELECT COUNT(*) FROM Savings s
WHERE NOT EXISTS (SELECT 1 FROM Clients c WHERE c.id = s.clientId);
→ 0 huérfanos ✅
```

---

## 4. Análisis del Saldo en Banco

### 4.1 Fórmula utilizada por el sistema

```
Saldo en Banco = (Capital Ahorrado Activos + Aportes Iniciales Activos
                  − Préstamos Vigentes) + Cuotas Cobradas 2026

               = ($29.158.313 + $13.800.000 − $30.800.000) + $16.216.683
               = $12.158.313 + $16.216.683
               = $28.374.996
```

Esta fórmula es una **métrica de gestión corriente** (año 2026), no un balance de caja histórico completo.

### 4.2 Balance de caja histórico real

```
Saldo Real = Total ahorros (todos los socios)
           + Total cuotas cobradas (histórico completo)
           − Total préstamos desembolsados (todos los años)

           = $44.058.313 + $47.173.597* − $66.350.000
           = $24.881.910

* Incluye el pago de SOL13 ($3.704.750) registrado en esta auditoría.
```

### 4.3 Distribución histórica de cuotas cobradas

| Año | Cuotas | Total cobrado | Préstamos |
|-----|--------|---------------|-----------|
| 2025 | 58 filas | $30.956.913 | SOL1–SOL14, SOL19, SOL22 (Cancelados) |
| 2026 | 38 filas | $16.216.683 | SOL15–SOL21, SOL23–SOL25 (Vigentes) |
| **Total** | **96 filas** | **$47.173.597** | — |

> El dashboard filtra por defecto a 2026-2027. Los préstamos Cancelados de 2025 ($35.55M desembolsados, $30.96M cobrados) no afectan los KPIs de rendimiento anual, pero sí el balance de caja real.

---

## 5. Hallazgos y Correcciones

### Hallazgo 1 — SOL13: Préstamo cancelado sin registros de pago
**Criticidad:** 🔴 Alta  
**Estado:** ✅ Corregido

**Situación encontrada:**
- Préstamo SOL13 ($3.650.000, Gimena Tascon, cédula REF-14) marcado como `Cancelado`
- **0 registros** en `LoanPayments` — brecha contable de $3.704.750
- Campo `clientId` en `DisbursedLoans` = `NULL` (FK rota; solo `client_id=81` tenía valor)

**Datos del pago según fuente original (Excel de importación):**

| Campo | Valor |
|-------|-------|
| id_ep | PS8 |
| Mes desembolso | Octubre |
| Saldo inicial | $3.650.000 |
| Cuotas | 1 |
| Interés mensual | 1,5% |
| Valor intereses | $54.750 |
| Fecha de pago | 11/11/2025 |
| Mes de pago | Noviembre |
| Valor cuota | $3.704.750 |
| Estado | Pago |
| Saldo final | $0 |
| N° transacción | 3059 |
| Observaciones | Ultima Cuota |

**Correcciones aplicadas:**
```sql
-- 1. Corregir FK nula en DisbursedLoans
UPDATE DisbursedLoans SET clientId = 81 WHERE id_vm = 'SOL13';

-- 2. Insertar registro de pago
INSERT INTO LoanPayments (id_ep, clientId, mes_desembolso, saldo_inicial,
  cuotas_prestamo, interes_mensual, valor_intereses_amortizados, fecha_pago_max,
  mes_pago, valor_cuota_variable, estado, valor_cuota_pago, saldo_final,
  item_quantity, numero_transaccion, observaciones, id_vm, estado_prestamo,
  es_prepago, createdAt, updatedAt)
VALUES ('PS8', 81, 'Octubre', 3650000, 1, 0.015, 54750, '2025-11-11',
  'Noviembre', 3704750, 'Pago', 3704750, 0, 1, '3059', 'Ultima Cuota',
  'SOL13', 'Cancelado', 0, datetime('now'), datetime('now'));
```

**Verificación matemática:**
- $3.650.000 × 1,5% = **$54.750** de interés ✓
- $3.650.000 + $54.750 = **$3.704.750** cuota total ✓
- Saldo final = **$0** ✓

---

### Hallazgo 2 — Penalización incorrecta en socios nuevos de mayo 2026
**Criticidad:** 🟠 Media  
**Estado:** ✅ Corregido

**Situación encontrada:**  
María Olga Pascuas (id=93) y Luis Hernan Torres (id=94), registrados el 22/05/2026, aparecían en el modal "Detalle de Cartera en Mora" con 5 meses pendientes y $131.000 de penalización. Esto ocurría porque el algoritmo iniciaba la evaluación desde enero para todos los socios, sin importar su fecha de ingreso.

**Regla de negocio aplicable:** Los socios nuevos tienen hasta el mes siguiente a su registro para realizar su primer aporte sin penalidad.

**Corrección aplicada en `server/routes/admin.js`:**  
Se agregó `firstCheckMonth` para cada socio. Si el socio fue registrado en el año en curso, la evaluación de mora inicia desde `mes_de_registro + 1`. Para socios registrados en mayo: `firstCheckMonth = 6` (junio), por lo que el bucle no ejecuta para `currentMonth = 5`.

**Corrección adicional en base de datos:**  
Los registros de Aporte Inicial de ambos socios tenían `penalizacion='SI'` con $11.000 de penalización cada uno. Se corrigieron a `penalizacion='NO'`, `valorAhorrado=600.000`, `diasPenalizacion=0`, `valorAPenalizar=0`.

---

### Hallazgo 3 — Apellido con espacio al final: "Torres "
**Criticidad:** 🟡 Baja  
**Estado:** ✅ Corregido

**Situación encontrada:**  
El campo `apellido1` de Luis Hernan Torres (id=94) contenía un espacio al final (`"Torres "`), lo que podría afectar búsquedas por texto exacto y comparaciones de cadenas.

**Corrección aplicada:**
```sql
UPDATE Clients SET apellido1 = TRIM(apellido1) WHERE id = 94;
```

---

## 6. Estadísticas de la Base de Datos al Cierre de Auditoría

### Clientes
| Categoría | Cantidad |
|-----------|----------|
| Total en BD | 25 |
| Activos | 23 |
| Desactivados | 2 (Edward Rojas id=78, Beatriz Tascon id=86) |

### Ahorros de socios inactivos (permanecen en BD)
| Socio | Ahorros en BD |
|-------|---------------|
| Edward Rojas | $500.000 |
| Beatriz Tascon | $600.000 |

### Préstamos
| Estado | Cantidad | Capital |
|--------|----------|---------|
| Vigente | 9 | $30.800.000 |
| Cancelado | 16 | $35.550.000 |
| **Total** | **25** | **$66.350.000** |

### Cuotas (LoanPayments)
| Estado | Filas | Total |
|--------|-------|-------|
| Pago | 96 | $47.173.597 |
| Pendiente | 50 | $22.846.183 |

### Ahorros (Savings)
| Tipo penalización | Registros | Días | Valor |
|-------------------|-----------|------|-------|
| SI | 7 | 77 días | $77.000 |
| NO | 145 | — | — |
| Sin campo | 21 | — | — |

---

## 7. Conclusión

Todos los KPIs visibles en el panel de control son **matemáticamente correctos** respecto a la base de datos. Los 3 hallazgos identificados fueron corregidos durante esta auditoría. La base de datos no presenta registros huérfanos ni duplicados en las tablas críticas.

**Acción de seguimiento recomendada:** Verificar periódicamente la cuenta Nubank para actualizar el valor hardcoded de `rentabilidadCajaNU` en `server/routes/admin.js` (línea ~2782) con el extracto real.
