# Fix Dashboard "Saldo en Banco" Negative Calculation

The "Saldo en Banco" card on the dashboard currently shows a negative value. This is because the calculation only sums payments associated with "Pendiente" (active) loans, while it subtracts the disbursements of ALL loans (including completed/canceled ones).

## Proposed Changes

### Backend: `server/routes/admin.js`

#### [MODIFY] [admin.js](file:///c:/Credifuturo/Credifuturo-Web/server/routes/admin.js)
- Remove the `estadoPrestamo: 'Pendiente'` filter from the `rawPagoRows` query in the `dashboard-stats` route.
- This ensures that all historical payments received (status='Pago') are counted as cash inflow, regardless of whether the loan is still active or has been completed.

## Verification Plan

### Automated Verification
- Run the previously created `check_negative_balance.js` diagnostic script to confirm the expected positive value.
- Restart the server and verify the `/admin/dashboard-stats` endpoint returns a positive `saldoEnBanco`.

### Manual Verification
- Refresh the dashboard UI and confirm the "Saldo en Banco" and "Saldo en Banco con Rentabilidad" cards show correct, positive values.
