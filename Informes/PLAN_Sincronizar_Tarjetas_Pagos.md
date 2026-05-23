# Synchronize and Enhance Summary Cards in Payments List

The goal is to bring "Cartera Activa" and "Total Cuotas Pagadas" (monetary) metrics to the Payments List module, add a "Cuotas Pendientes" counter, and reorganize the UI to be more intuitive.

## Proposed Changes

### [Payments List Module]

#### [MODIFY] [PaymentsListPage.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/PaymentsListPage.jsx)

1.  **Update `stats` calculation:**
    *   Initialize `totalRecaudo` (monetary sum of payments).
    *   Initialize `carteraActiva` (monetary sum of pending quotas).
    *   Calculate `totalRecaudo` by summing `valorCuotaPago` for records with state "Pago".
    *   Calculate `carteraActiva` by summing `valorCuotaVariable` for records with state "Pendiente".
    *   Calculate `cuotasPendientes` as `totalCuotas - cuotasPagadas`.

2.  **Reorganize Rendering:**
    *   Group cards into two distinct rows for better readability.
    *   **Row 1 (Financial Indicators):**
        *   Total Valor Prestado (Emerald) - Icon: `DollarSign`
        *   Cartera Activa (Emerald-700) - Icon: `Activity`
        *   Total Recaudo (Blue-600) - Icon: `CheckCircle`
        *   Total Intereses (Amber-500) - Icon: `BarChart3`
        *   Cartera en Mora EP (Red-500) - Icon: `AlertTriangle`
    *   **Row 2 (Progress/Counts):**
        *   Cuotas Totales (Gray) - Icon: `PieChart`
        *   Cuotas Pagadas (Green) - Icon: `CheckCircle`
        *   Cuotas Pendientes (Amber) - Icon: `Clock`

### [General Styling]

#### All Currency-Type Cards
*   **Format:** `$00.000.000` (Dot as thousands separator, no decimals).
*   **Implementation:** Use `.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })`.
*   **Scope:** `PaymentsListPage.jsx`, `DashboardHome.jsx`, `LoansListPage.jsx`, `SavingsListPage.jsx`.

### [Default Filter Settings]

#### [MODIFY] [PaymentsListPage.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/PaymentsListPage.jsx)
*   **Default "Estado Pago" Filter:** Set the initial state of `filterEstado` to `'Pendiente'` to show only pending payments by default.

### [New Filters]

#### [MODIFY] [SavingsListPage.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/SavingsListPage.jsx)
*   **"Penalizacion" Filter:** Add a dropdown filter (SI/NO) to filter records based on whether `valorAPenalizar` is greater than 0.

### [Dashboard Synchronization]

#### [MODIFY] [admin.js (Backend)](file:///c:/Credifuturo/Credifuturo-Web/server/routes/admin.js)
*   **Calculate `moraCarteraEP`:** In `/dashboard-stats`, fetch all `LoanPayment` where `estado = 'Pendiente'`.
*   **Synchronization Logic:** Replicate the frontend logic: `fechaPagoMax < now` (local time).
*   **Detailed Breakdown:** Return `detalleMoraEP` containing `nombre`, `mes`, `valor`, `fecha`, and `idVm`.

#### [MODIFY] [DashboardHome.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/DashboardHome.jsx)
*   **New StatCard:** Add "Cartera en Mora EP" card targeting `stats.carteraMoraEP`.
*   **Modal Sync:** Mirror the `MoraDetailModal` from `PaymentsListPage` as a new `MoraEPModal` in the dashboard.

## Verification Plan

### Automated Tests
*   Manual check of card values against the table data.
*   Verify that filtering (by name or status) correctly updates all cards in both rows.
*   Verify click on "Cartera en Mora EP" still opens the detail modal.
