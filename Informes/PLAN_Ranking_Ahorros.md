# Implementation Plan - Savings Ranking Feature

Add a new "Ranking" button to the Savings Summary module that opens a modal with a bar chart visualizing the total net savings of all active partners.

## User Review Required

> [!IMPORTANT]
> The ranking will only include partners with the status **'Activo'**.
> The value visualized is the **'Total Ahorro Neto'** (Sum of `valorAhorrado`).

## Proposed Changes

### Backend: Admin Routes

#### [MODIFY] [admin.js](file:///c:/Credifuturo/Credifuturo-Web/server/routes/admin.js)
- Create a new endpoint `GET /api/admin/savings/ranking`.
- Logic:
  1. Find all clients with `estatus: 'Activo'`.
  2. Perform an aggregation to sum `valorAhorrado` from the `Savings` table.
  3. Include partner name and surname.
  4. Sort by total savings in descending order.

### Frontend: Savings Summary Module

#### [MODIFY] [SavingsSummaryPage.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/SavingsSummaryPage.jsx)
- Add a new "Ranking" button in the top header.
- Implement a `RankingModal` component:
  - Responsive design.
  - State management for loading/data.
  - **BarChart (recharts)**:
    - X-Axis: Partner names.
    - Y-Axis: Total Net Savings.
    - Custom tooltips and premium styling (emerald/brand colors).
- Integrate the modal trigger.

## Verification Plan

### Automated Tests
- Test the new backend endpoint using a temporary script to ensure correct aggregation and sorting.
- Manual click-through in the browser to verify:
  - Ranking button visibility.
  - Modal opening/closing.
  - Chart accuracy and responsiveness.

### Manual Verification
- Verify that only 'Activo' partners are shown.
- Cross-reference a few partners' totals from the ranking against their individual summary pages.
