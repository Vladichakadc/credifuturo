# Separation of Reports and Forms in Admin Dashboard

The user wants to separate data entry forms from the report views in the Admin Dashboard. Currently, these are mixed within the same tabs (side-by-side or stacked).

## Proposed Changes

### [Component] AdminDashboard.jsx
- Create a new tab named **"Ingreso de Datos"** (Data Entry).
- Move the following forms from their respective tabs to this new tab:
    - **Agregar Cliente** (Client Form)
    - **Registrar Ahorro** (Savings Form)
    - **Solicitar Préstamo** (Loan Form)
- Update the remaining tabs (**Clientes**, **Ahorros**, **Préstamos**, **💰 Desembolsados**) to show only the lists and tables (Reports).
- Improve the layout of the reports to use the full width of the container since the forms will be removed from these views.

#### [MODIFY] [AdminDashboard.jsx](file:///C:/Credifuturo/Credifuturo-Web/client/src/pages/AdminDashboard.jsx)
- Reorganize the `Tabs` and `Tab` components.
- Group state handlers related to forms in a logical way for the new tab.

## Verification Plan

### Manual Verification
- Access the Admin Dashboard as an administrator.
- Verify that the **Clientes**, **Ahorros**, and **Préstamos** tabs now show only tables/lists in a clean, full-width layout.
- Verify that a new **Ingreso de Datos** tab exists and contains all three forms.
- Test data entry in the new tab to ensure all forms still work correctly (Add client, register saving, request loan).
- Verify the **💰 Desembolsados** tab remains as a pure report.
