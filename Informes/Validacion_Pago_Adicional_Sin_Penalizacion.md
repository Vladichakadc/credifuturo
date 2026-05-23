# Validación: Pago Adicional Sin Penalización

**Fecha:** 14 de Mayo de 2026  
**Módulo:** Gestión de Ahorros — Formulario "Registrar Nuevo Ahorro"  
**Estado:** ✅ Implementado

---

## Problema Identificado

Cuando un socio ya había pagado la cuota del mes actual y se registraba un **pago adicional** en el mismo mes, el sistema calculaba penalización si la fecha de pago era posterior al día 10. Esto era incorrecto, ya que el socio **ya cumplió con su obligación mensual**.

### Ejemplo del error

| Escenario | Resultado anterior | Resultado correcto |
|---|---|---|
| Socio paga cuota Mayo el 5/May | Sin penalización ✅ | Sin penalización ✅ |
| Mismo socio registra 2do pago Mayo el 15/May | ❌ Penalización = SI, 5 días | ✅ Penalización = NO |

---

## Regla de Negocio Implementada

> **Si el socio ya tiene un ahorro registrado para el mismo mes y año (columna `Mes Pago` = mes actual), cualquier pago adicional en ese mismo mes NO genera penalización, independientemente del día del mes en que se registre.**

### Condiciones de la validación:
1. Se busca un registro existente con el mismo `clientId`, `year`, `month`
2. Se excluyen registros de tipo "Aporte Inicial"
3. En modo edición, se excluye el registro que se está editando (para evitar auto-referencia)

---

## Cambios Realizados

### Frontend — `SavingsPage.jsx`

| Cambio | Descripción |
|---|---|
| Nuevo estado `pagoAdicionalInfo` | Almacena información del pago adicional detectado |
| Validación en `useEffect` de cálculos | Antes de calcular penalización, verifica si existe pago previo del mismo mes |
| Banner informativo verde | Muestra alerta visual al administrador cuando se detecta pago adicional |
| Skip de alerta dormant | No muestra alerta de "meses adeudados" si es pago adicional |

### Backend — `admin.js`

| Ruta | Cambio |
|---|---|
| `POST /savings` | Consulta DB antes de calcular penalización. Si existe pago previo del mismo mes/año → penalización = NO |
| `PUT /savings/:id` | Misma lógica, excluyendo el registro actual (`id != saving.id`) del chequeo |

---

## Flujo de Decisión

```
┌─────────────────────────────────┐
│   Registrar Nuevo Ahorro        │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ ¿Socio ya pagó este mes/año?    │
│ (buscar en BD por clientId,     │
│  month, year)                   │
└──────┬───────────┬──────────────┘
       │ SÍ        │ NO
       ▼           ▼
┌──────────┐  ┌─────────────────┐
│ Penaliz. │  │ ¿Fecha > día 10?│
│ = NO     │  └──┬──────────┬───┘
│ Días = 0 │     │ SÍ       │ NO
│ Valor = 0│     ▼           ▼
│          │  Penaliz=SI   Penaliz=NO
│ Banner   │  Días=fecha-10
│ verde ✅ │
└──────────┘
```

---

## Verificación

### Casos de prueba validados:

| # | Escenario | Resultado esperado | Estado |
|---|---|---|---|
| 1 | Primer pago del mes, día ≤ 10 | Sin penalización | ✅ |
| 2 | Primer pago del mes, día > 10 | Con penalización | ✅ |
| 3 | Segundo pago del mismo mes, día > 10 | **Sin penalización** (pago adicional) | ✅ |
| 4 | Pago atrasado (mes anterior) | Con penalización | ✅ |
| 5 | Pago adelantado (mes futuro) | Sin penalización | ✅ |
| 6 | Edición de registro existente | No se auto-detecta como adicional | ✅ |

---

## Archivos Modificados

- `client/src/pages/admin/SavingsPage.jsx` — Lógica frontend + banner informativo
- `server/routes/admin.js` — Rutas POST y PUT de ahorros
