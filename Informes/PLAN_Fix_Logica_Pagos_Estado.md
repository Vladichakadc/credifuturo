# Fix Payments Save Logic and Status Duplication

Address the issues where the "Registrar" button fails to update records and the "Estado" dropdown shows duplicated "Pago" options.

## Proposed Changes

### [Frontend] [PaymentsPage.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/PaymentsPage.jsx)

#### 1. Fix Status Duplication (Field 13 & Filter)
- Replace the dynamic `availableEstados` and `availableEstadoPrestamo` logic with fixed, clean arrays:
    - `STATES_PAGO = ['Pendiente', 'Pago', 'Mora', 'Abono', 'Parcial']`
    - `STATES_PRESTAMO = ['Activo', 'Cancelado', 'Pendiente', 'Mora']`
- This ensures consistency and prevents issues with trailing spaces or casing in the database.

#### 2. Robust Save/Edit Logic
- **Modal Reset**: Update `handleSubmit` to call `handleCloseModal()` instead of just `setIsModalOpen(false)`. This ensures `isEditing`, `editingId`, and the form state are fully cleared.
- **Form Loading**: Ensure that when a payment is found, the form is successfully populated and `isEditing` is set.
- **Payload Sanitization**: In `handleSubmit`, strip unnecessary fields (like `nombre`, `apellido`, `clientName`, etc.) from the payload before sending it to the API to avoid backend validation/Sequelize errors.

### [Backend] [admin.js](file:///c:/Credifuturo/Credifuturo-Web/server/routes/admin.js)
- *Optional*: If needed, explicitly exclude `id` from `req.body` in the `PUT /payments/:id` route to prevent potential PK conflicts.

## Verification Plan

### Manual Verification
1. Open the "Registro Estado" form.
2. Select a customer and an installment.
3. Verify the "13. Estado" dropdown only shows "Pago" once.
4. Fill the form and save.
5. Edit the same payment. Verify the button says "Guardar Cambios".
6. Change the amount and save. Verify the update is reflected in the list.
7. Verify that searching by Cedula still works correctly.
