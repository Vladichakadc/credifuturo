# Implementation Plan - Admin Dashboard Crash Fix

The current issue is that the Admin Dashboard crashes (white screen) after login, particularly related to the loading of "Estado Préstamos" data from `1-orders_table_estado_prestamos.xlsx`. The plan focuses on making the backend resilient to data inconsistencies and preventing frontend crashes with proper error boundaries and safe rendering.

## User Review Required
> [!IMPORTANT]
> This plan enforces strict validation on the Excel file. Rows missing critical identifiers (like `clientId` or `externalId`) will be logged and skipped, rather than crashing the import process. This may result in fewer records appearing if the source data is corrupt.

## Proposed Changes

### Backend (Data Normalization & Validation)

#### [MODIFY] [DataImportService.js](file:///C:/Credifuturo/Credifuturo-Web/server/services/DataImportService.js)
- **Objective**: Prevent crashing on malformed Excel rows and ensure consistent data types.
- **Changes**:
    - Add strict validation for `importPayments`.
    - Handle Excel serial dates correctly (converting to ISO string/Date object).
    - Ensure `clientId` and `externalId` are present before attempting insertion.
    - Log warnings for skipped rows instead of throwing unhandled exceptions.

#### [MODIFY] [admin.js](file:///C:/Credifuturo/Credifuturo-Web/server/routes/admin.js)
- **Objective**: Ensure API responses are always structured JSON.
- **Changes**:
    - Wrap `/import-data` and `/payments` endpoints in try-catch blocks that return JSON errors `{ ok: false, error: "..." }` instead of HTML/text stack traces or crashing.

### Frontend (Crash Prevention)

#### [MODIFY] [AdminDashboard.jsx](file:///C:/Credifuturo/Credifuturo-Web/client/src/pages/AdminDashboard.jsx)
- **Objective**: Stop the white screen of death.
- **Changes**:
    - **Global Error Boundary**: Ensure the main dashboard content is wrapped in an `ErrorBoundary`.
    - **Defensive Rendering**: Verify `payments` array exists and items are valid before mapping.
    - **Safe Data Access**: Use optional chaining `?.` for deep properties (`client?.name`).
    - **Loading States**: Show explicit loading indicators while fetching data to avoid rendering with partial state.
    - **Error Feedback**: Display user-friendly error messages if data fails to load, with a "Retry" button.

## Verification Plan

### Automated Tests
- Create a script (`server/test_resilience.js`) to attempt importing a corrupted Excel file and verify the server remains up and logs errors correctly.
- Verify API endpoints return valid JSON even on error.

### Manual Verification
- **Login Flow**: Log in as Admin and verify the dashboard loads successfully.
- **Data Display**: Check "Estado Préstamos" table for correct data.
- **Corrupt File**: Temporarily rename or corrupt `1-orders_table_estado_prestamos.xlsx` and verify the app shows a handled error message instead of a white screen.
