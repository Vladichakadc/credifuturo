# Mejoras al Dashboard y Gráficas — Mayo 2026

**Fecha de implementación:** 16 de mayo de 2026  
**Módulos afectados:** `DashboardHome.jsx`, `UserSavingsListPage.jsx`, `admin.js`  
**Estado:** ✅ Implementado y activo

---

## Resumen ejecutivo

En esta sesión se corrigieron y mejoraron varios componentes del panel de administración:

1. Corrección del valor de **Rentabilidad Caja NU** (valor incorrecto por fórmula dinámica errónea)
2. Rediseño de las tarjetas **ComparativeChart** para mayor claridad y profesionalismo
3. Ampliación del tamaño de los gráficos comparativos
4. Adición de **línea de tendencia punteada** en cada gráfico
5. Reemplazo de la métrica confusa "¿Vamos a tiempo?" por **Proyección al cierre del año**
6. Sincronización de las proyecciones con los valores de la tabla "Estimado al cierre del año"
7. Corrección de errores JSX críticos en `UserSavingsListPage.jsx`

---

## 1. Corrección de Rentabilidad Caja NU

### Problema detectado

La tarjeta "Rentabilidad Caja NU" en el backend calculaba dinámicamente el rendimiento usando:

```javascript
// Código INCORRECTO (removido)
rentabilidadCajaNU: totalSavingsResult * 0.0925 * (dayOfYear / 365)
```

Esta fórmula producía **$890,624** en lugar del valor correcto de **$415,455**, debido a una inconsistencia entre datos:
- `totalSavingsResult` usaba el **acumulado histórico total** (todos los años)
- El resultado implicaba un saldo en Nubank de ~$25.86M COP, cifra que no corresponde a la realidad

### Solución aplicada

Se revirtió a un valor estático actualizado manualmente desde el extracto real de la cuenta Nubank:

```javascript
// server/routes/admin.js
// Rendimiento NU: valor actualizado manualmente desde el extracto de Nubank.
// Actualizar este valor cuando se consulte el extracto real de la cuenta.
rentabilidadCajaNU: 415455,
```

**Archivo modificado:** `Credifuturo-Web/server/routes/admin.js`

---

## 2. Tarjeta "Resultado" → Porcentaje legible

### Problema detectado

El círculo de "Resultado" en cada `ComparativeChart` mostraba valores como `1.24`, `0.96`, `1.22`, `0.88` — números en formato de razón que no comunican nada claro en un informe profesional.

### Solución aplicada

Se cambió el valor del círculo a **porcentaje** y se añadió la etiqueta "vs 2025":

```jsx
// ANTES
<span className="text-xs font-black font-mono">{ratio.toFixed(2)}</span>

// DESPUÉS
<span className="text-xs font-black font-mono leading-none">{Math.round(ratio * 100)}%</span>
<span className="text-[7px] text-gray-400 font-bold leading-none mt-0.5">vs 2025</span>
```

El título del bloque también cambió de "Resultado" a **"Logro vs año anterior"**, y el texto descriptivo se actualizó:

| Rango | Texto mostrado |
|-------|----------------|
| `ratio >= 1` | `Se superó el nivel 2025 en un X.X%` |
| `ratio >= 0.85` | `Se alcanzó el XX% del nivel 2025` |
| `ratio < 0.85` | `Por debajo del nivel 2025 (XX%)` |

**Archivo modificado:** `Credifuturo-Web/client/src/pages/admin/DashboardHome.jsx`

---

## 3. Ampliación del tamaño de los gráficos

### Cambios aplicados

| Elemento | Antes | Después |
|----------|-------|---------|
| Grid layout | `md:grid-cols-4` | `md:grid-cols-2` |
| Espacio entre tarjetas | `gap-4` | `gap-6` |
| Altura del gráfico | `h-44` | `h-64` |

```jsx
// ANTES
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
<div className="w-full h-44 px-2">

// DESPUÉS
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
<div className="w-full h-64 px-2">
```

Los gráficos ahora ocupan la mitad del ancho de pantalla en lugar de un cuarto, permitiendo mucha mayor legibilidad de las etiquetas y barras.

**Archivo modificado:** `Credifuturo-Web/client/src/pages/admin/DashboardHome.jsx`

---

## 4. Línea de tendencia punteada

### Descripción

Se añadió una línea punteada de tendencia que conecta las dos barras en cada gráfico, usando el componente `ComposedChart` de Recharts (reemplazando el `BarChart` simple).

### Cambios técnicos

**Importación actualizada:**
```javascript
import { ..., BarChart, Bar, ..., ComposedChart, Line } from 'recharts';
```

**Tipo de gráfico:**
```jsx
// ANTES
<BarChart data={chartData}>

// DESPUÉS
<ComposedChart data={chartData}>
```

**Línea de tendencia añadida:**
```jsx
<Line
    dataKey="value"
    type="linear"
    stroke={isPositive ? '#10b981' : '#ef4444'}
    strokeWidth={2}
    strokeDasharray="6 4"
    dot={{ r: 5, fill: isPositive ? '#10b981' : '#ef4444', strokeWidth: 2, stroke: '#fff' }}
    activeDot={false}
/>
```

- Color **verde** (`#10b981`) cuando 2026 supera 2025
- Color **rojo** (`#ef4444`) cuando 2026 es menor que 2025
- Puntos circulares en los extremos de la línea
- Trazo punteado `6 4` (6px dash, 4px gap)

**Archivo modificado:** `Credifuturo-Web/client/src/pages/admin/DashboardHome.jsx`

---

## 5. Reemplazo de "¿Vamos a tiempo?" por "Proyección al cierre"

### Problema detectado

La métrica "¿Vamos a tiempo?" mostraba "Adelantados 232% vs lo esperado" — un valor completamente engañoso. La fórmula utilizada era:

```javascript
// INCORRECTO: compara total 2026 vs una fracción del total 2025
const pacedTarget = historic * pctYearElapsed; // ej: $36.1M × 37% = $13.4M
// 2026 total de $16.5M vs esperado de $13.4M → "Adelantados 23%"... pero inflado por error conceptual
```

Para métricas de **stock acumulado** (como patrimonio total del fondo), comparar el total actual contra un porcentaje del total histórico es fundamentalmente incorrecto: el fondo no empieza en $0 cada enero.

### Solución aplicada

Se reemplazó la fórmula por una **proyección de cierre anualizada** basada en el crecimiento real del año:

```javascript
const incrementSoFar = current - historic;         // crecimiento real en 2026
const annualizedIncrement = incrementSoFar * (365 / dayOfYear); // extrapolado a 365 días
const projectedYearEnd = historic + annualizedIncrement;        // proyección base 2025 + crecimiento
const projectedPctVs2025 = ((annualizedIncrement / historic) * 100);
```

**Tile rediseñado:**
```jsx
<div className={`rounded-xl p-3 border ${isPacePositive ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Proyección al cierre</p>
    <div className="flex items-baseline gap-1 mb-0.5">
        <span className="text-sm font-black font-mono leading-none">
            ${(projectedYearEnd / 1000000).toFixed(1)}M
        </span>
    </div>
    <p className="text-[9px] mt-0.5 leading-tight font-mono">
        {isPacePositive ? '+' : ''}{projectedPctVs2025.toFixed(1)}% vs 2025
    </p>
</div>
```

- Fondo **azul** si la proyección es positiva (crecimiento esperado)
- Fondo **ámbar** si la proyección es negativa (decrecimiento esperado)
- Valor en millones: `$37.2M` (fácil de leer)
- Porcentaje de variación vs 2025 al lado

**Archivo modificado:** `Credifuturo-Web/client/src/pages/admin/DashboardHome.jsx`

---

## 6. Sincronización de proyecciones con "Estimado al cierre del año"

### Problema detectado

Los gráficos `ComparativeChart` calculaban su propia proyección lineal independiente de la tabla "Estimado al cierre del año", generando inconsistencias visibles en el mismo dashboard.

### Solución aplicada

Se añadió la prop `projection` al componente `ComparativeChart` para permitir inyectar valores externos:

```javascript
const ComparativeChart = ({ title, historic, current, color, labelHistoric, labelCurrent, detail, projection }) => {
    // Si se pasa projection externo, lo usa; si no, usa extrapolación lineal
    const linearProjectedYearEnd = historic + (dayOfYear > 0 ? incrementSoFar * (365 / dayOfYear) : 0);
    const projectedYearEnd = projection !== undefined ? projection : linearProjectedYearEnd;
    ...
};
```

**Variables de proyección definidas** (compartidas con la tabla "Estimado al cierre"):

```javascript
const proyeccionIntereses = (stats.totalIntereses || 0) * 0.95;
const dailyNURate = (stats.rentabilidadCajaNU || 0) / currentDayOfYear;
const proyeccionCajaNU = (stats.rentabilidadCajaNU || 0) + dailyNURate * remainingDays;
const proyeccionPenalidad = ((stats.totalPenaltyValue || 0) / currentDayOfYear) * 365;
const proyeccionTotal = proyeccionIntereses + proyeccionCajaNU + proyeccionPenalidad;
```

**Instancias de ComparativeChart actualizadas:**

```jsx
<ComparativeChart
    title="Patrimonio del Fondo"
    historic={36126201}
    current={total}
    color="#f59e0b"
    projection={36126201 + proyeccionTotal}   // ← sincronizado
/>
<ComparativeChart
    title="Ganancias por Intereses"
    historic={1206913}
    current={stats.totalInteresesPagados || 0}
    color="#8b5cf6"
    projection={proyeccionIntereses}           // ← sincronizado
/>
```

Ahora los valores en "Proyección al cierre" dentro de cada gráfico son **idénticos** a los de la tabla de estimados.

**Archivo modificado:** `Credifuturo-Web/client/src/pages/admin/DashboardHome.jsx`

---

## 7. Correcciones de errores JSX en UserSavingsListPage.jsx

### Errores encontrados y corregidos

#### Error 1: Estructura JSX completamente corrupta
El JSX del componente tenía múltiples errores acumulados:
- Texto suelto `er` dentro del contenedor flex
- Tag `<input>` completamente ausente (solo flotaban sus atributos)
- Tag `</div>Content>` mezclado en la línea 171
- Tags de cierre huérfanos al final del JSX

**Solución:** Reescritura completa del bloque `return` con la estructura correcta.

#### Error 2: `<tr>` anidados (error Vite)
```jsx
// INCORRECTO — <tr> dentro de <tr>
{paginatedSavings.map((saving, idx) => (
    <tr key={saving.id}>  {/* ← duplicado externo */}
        <tr key={saving.id} className="transition-colors duration-150 ...">
```

**Solución:** Eliminado el `<tr>` exterior duplicado.

#### Error 3: Texto suelto después del export (error Vite "Missing semicolon")
```javascript
// INCORRECTO — texto suelto en línea 261
export default UserSavingsListPage;
que los 4 gbraficos    // ← texto suelto causaba error de parseo
```

**Solución:** Eliminado el texto suelto.

**Archivo corregido:** `Credifuturo-Web/client/src/pages/user/UserSavingsListPage.jsx`

---

## Impacto visual de los cambios

| Elemento | Antes | Después |
|----------|-------|---------|
| Círculo "Resultado" | `1.24` (ratio) | `124% vs 2025` |
| Tamaño tarjetas | 4 columnas, h-44 | 2 columnas, h-64 |
| Tendencia visual | Solo barras | Barras + línea punteada verde/roja |
| Métrica de ritmo | "¿Vamos a tiempo? Sí ✓ Adelantados 232%" | "Proyección al cierre: $37.2M +3.2% vs 2025" |
| Consistencia proyecciones | Independiente de tabla | Sincronizada con "Estimado al cierre" |
| Rentabilidad Caja NU | $890,624 (incorrecto) | $415,455 (extracto real) |

---

## Archivos modificados

| Archivo | Tipo de cambio |
|---------|----------------|
| `client/src/pages/admin/DashboardHome.jsx` | Múltiples mejoras de UI y lógica |
| `client/src/pages/user/UserSavingsListPage.jsx` | Corrección de errores JSX críticos |
| `server/routes/admin.js` | Revert `rentabilidadCajaNU` a valor estático |

---

*Documento generado automáticamente por el sistema Credifuturo v2.0*
