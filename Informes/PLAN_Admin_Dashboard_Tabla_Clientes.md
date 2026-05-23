# Admin Dashboard - Full Client Table Implementation

## Goal
Replace the simple client list in `AdminDashboard.jsx` with a comprehensive data table that displays all available client fields (as requested by the user).

## Proposed Changes

### `client/src/pages/AdminDashboard.jsx`

-   **Modify "Socios" Tab Content:**
    -   Remove the current `<ul>` list view.
    -   Implement a scrollable `<table>` view (similar to Savings/Loans tabs).
    -   Add columns for all client fields:
        -   Name (Nombre) + Surnames (Apellidos)
        -   Cedula
        -   Email
        -   Status (Estado)
        -   Gender (Género)
        -   Country (País) / City (Ciudad)
        -   Type (Tipo)
        -   Founder (Fundador)
        -   Job (Cargo)
## UI/UX Enhancements (Refactor)

### Goal
Separate data entry (Forms) from data viewing (Reports), implement dropdown navigation for reports, add corporate branding, and fix data redundancy.

### Proposed Changes

#### `client/public/`
-   [x] Add `logo.jpg` (from `C:/Credifuturo`).

#### `client/src/pages/AdminDashboard.jsx`
-   **Layout Structure:**
    -   Add Header with `logo.jpg` and title.
    -   Implement Top Navigation: [📝 Nuevo Registro] | [📊 Consultas/Reportes].
-   **"Nuevo Registro" View:**
    -   Show Tabs for Forms: [Socio] | [Ahorro] | [Préstamo].
    -   Display *only* the input forms.
-   **"Consultas" View:**
    -   Add **Dropdown Menu**: "Seleccione Reporte..." -> [Socios], [Ahorros], [Préstamos].
    -   Display the corresponding Full Table based on selection.
    -   Remove "Concatenar" redundancy in Client Name column (show only `name` or `name + surname`).

#### `client/src/pages/Login.jsx` & `UserDashboard.jsx`
-   Add Header with `logo.jpg`.

## Verification
-   Verify Logo appears on all 3 pages.
-   Verify Admin Dashboard has clear separation between forms and reports.
-   Verify Dropdown correctly switches between tables.
-   Verify Client Name in table is not duplicated.
        -   Entry/Exit Dates (Fechas)
        -   Referred By (Referido)

## Verification
-   Start the app.
-   Login as Admin.
-   Check "Socios" tab.
-   Verify scrollable table displays all columns with correct data.
