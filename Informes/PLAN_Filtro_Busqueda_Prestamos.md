# Enhance Search Filter (Socio, Cédula, ID Pago)

The user wants a more comprehensive search filter in the "Registro Estado Préstamos" page. We will update it to include full names (including second surnames), identification numbers, and payment IDs.

## Proposed Changes

### Backend: [admin.js](file:///c:/Credifuturo/Credifuturo-Web/server/routes/admin.js)

#### 1. Include Full Name in API Response
- Update the `/payments/list` normalization logic to include `surname2` in `clientName`.
- This ensures the frontend has the truly "complete" name for filtering.

### Frontend: [PaymentsListPage.jsx](file:///c:/Credifuturo/Credifuturo-Web/client/src/pages/admin\PaymentsListPage.jsx)

#### 1. Update `socioKey` Normalization
- Modify the `fetchPayments` logic to generate a broad `socioKey`:
  `const socioKey = `${fullName} - ${cedula} (${idPago})``.
- This allows the user to see and select by any of these identifiers in the same dropdown.

#### 2. Update UI Filter Label
- Change the label from "Buscar por Socio" to **"Buscar por Socio, Cédula o ID Pago"**.

## Verification Plan

### Manual Verification
- Verify that the dropdown now shows options like: *"JUAN PEREZ GOMEZ - 1234567 (P1)"*.
- Confirm that selecting an option correctly filters the table.
- Verify that the "Cartera en Mora EP" card and row highlighting still function correctly with the new name format.
