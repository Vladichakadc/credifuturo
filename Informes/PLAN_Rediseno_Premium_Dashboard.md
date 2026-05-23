# Plan de Implementación - Rediseño Credifuturo

Este documento detalla la hoja de ruta técnica para transformar la aplicación actual en el nuevo diseño "Premium Dashboard".

## Fase 1: Fundamentos y Quick Wins (Días 1-2)
El objetivo es establecer las bases del Design System sin romper la funcionalidad actual.

### 1. Configuración del Design System
- [x] Actualizar `tailwind.config.js` con los nuevos tokens de color y tipografía definidos en la estrategia.
- [x] Instalar librerías de utilidad:
  ```bash
  npm install clsx tailwind-merge
  ```
- [x] Crear archivo base de estilos `src/styles/globals.css` (si no existe, mejorar `index.css`).

### 2. Creación de Componentes Base (UI Kit)
Crear carpeta `src/components/ui` y desarrollar componentes aislados:
- [x] `Button.jsx`: Implementar variantes (Primary, Secondary, Danger, Ghost).
- [x] `Input.jsx`: Wrapper con Label y ErrorMessage.
- [x] `Card.jsx`: Container con sombra y bordes redondeados estándar.
- [x] `Badge.jsx`: Para estados (Activo, Pendiente, Mora).

## Fase 2: Refactorización Estructural (Días 3-5)
Romper el "God Component" `AdminDashboard.jsx`.

### 1. Layout Shell
- [x] Crear `src/layouts/DashboardLayout.jsx`:
  - Contiene el `Sidebar` (nuevo componente) y el `Header`.
  - Maneja la estructura responsiva.
  - Renderiza `{children}` o `<Outlet />`.

### 2. Extracción de Rutas
- [x] Modificar `App.jsx` para usar rutas anidadas reales:
  ```jsx
  <Route path="/admin" element={<DashboardLayout />}>
    <Route index element={<DashboardHome />} />
    <Route path="clients" element={<ClientsPage />} />
    <Route path="loans" element={<LoansPage />} />
    <Route path="savings" element={<SavingsPage />} />
  </Route>
  ```

## Fase 3: Módulos de Alto Impacto (Días 6-8)

### 1. Tabla de Datos (Smart Table)
- [x] Crear `src/components/ui/DataTable.jsx`:
  - Props: `columns`, `data`, `onEdit`, `onDelete`, `pagination`.
  - Integrar estados de Loading (Skeleton) y Empty.

### 2. Migración de Clientes
- [x] Mover lógica de Clientes de `AdminDashboard` a `src/pages/admin/ClientsPage.jsx`.
- [x] Reemplazar tabla HTML por `<DataTable />`.
- [x] Reemplazar formulario de creación por nuevo diseño en `Drawer` o Modal.

### 3. Migración de Otros Módulos
- [x] Migrar Préstamos (`LoansPage.jsx`).
- [x] Migrar Ahorros (`SavingsPage.jsx`).
- [x] Migrar Pagos (`PaymentsPage.jsx`).
- [x] Migrar Reportes (`ReportsPage.jsx`).

## Fase 4: Experiencia y Pulido (Días 9-10)

### 1. Feedback al Usuario
- [x] Implementar un Contexto de UI (`UiContext`) para manejar Toasts globales.
- [x] Reemplazar todos los `alert()` por `toast.success()` o `toast.error()`.

### 2. Accesibilidad y Navegación
- [x] Auditar contraste final.
- [x] Verificar navegación por teclado (Tab index).
- [x] Asegurar que el Sidebar colapse correctamente en móviles.

## Checklist de Verificación
Antes de dar por finalizada una etapa, verificar:
- [x] **No Regression:** La funcionalidad de base de datos (guardar/leer) sigue funcionando.
- [x] **Responsive:** Se ve bien en Mobile (375px) y Desktop (1440px).
- [x] **Console Logs:** Limpieza de logs de desarrollo.
