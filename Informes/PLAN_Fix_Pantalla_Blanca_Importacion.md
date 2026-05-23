# Implementation Plan - Fix Blank Screen & Data Import Stability

## Goal Description
Investigate and permanently fix the "blank screen" issue occurring after authentication and data loading (specifically `1-orders_table_estado_prestamos.xlsx`). The solution must prevent the UI from ever crashing to white, ensure backend stability against corrupt data, and provide clear user feedback.

## User Review Required
> [!IMPORTANT]
> - **Data Import Rules**: Corrupt rows in Excel files will be **skipped** and logged, rather than crashing the entire import.
> - **UI Fallback**: A global Error Boundary will be added. If a critical error occurs, users will see a "Something went wrong" screen with a "Retry" button instead of a blank page.

## Proposed Changes

### Phase 1: Diagnosis & Localization
- **Action**: Run app in DEV mode with verbose logging.
- **Goal**: Capture exact stack trace of the crash.
- **Tools**: Browser Console, Network Tab, Server Logs.

### Phase 2: Frontend Resilience (React/Vite?)
#### [MODIFY] [Frontend Entry Point]
- Wrap the main App component in a Global `ErrorBoundary`.
- Ensure `GenericNotFound` or 404 route is active.

#### [MODIFY] [Data Fetching Components]
- Add `try/catch` blocks around `fetch` calls.
- implement `isLoading`, `error` states for tables (especially Loan Status table).

### Phase 3: Backend Stability (Node/Express)
#### [MODIFY] [DataImportService.js] (or relevant service)
- Implement schema validation for Excel rows (e.g., using `Joi` or manual checks).
- **Sanitization**: Convert strings to numbers safely, handle date formats.
- **Row-level Error Handling**: Try/catch inside the row iteration loop.
- **Response**: Always return JSON `{ ok: boolean, data: ..., errors: [] }`.

#### [MODIFY] [Admin Controller/Routes]
- Ensure API endpoints catch all unhandled exceptions and return 500 JSON, never timeout or crash process.

## Verification Plan
### Automated Tests
- Run backend import with:
    - Valid Excel file.
    - Corrupt Excel file (missing columns, bad data types).
    - ensure server does not crash and returns 200/400 with error details.

### Manual Verification
- **Login Flow**: Login as Admin -> Check for successful dashboard load.
- **Data Load**: Trigger data reload/import -> Check for blank screen.
- **Error Simulation**: Manually throw error in component -> Verify Error Boundary appears.
