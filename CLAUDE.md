# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Credifuturo** is a financial management web application for a microfinance cooperative. It manages member (socio) savings, loan disbursements, and payment quota tracking. The UI and domain terminology are in Spanish.

## Commands

### Backend (`Credifuturo-Web/server/`) — requires Node.js >= 18
```bash
npm start       # Run server on port 3000
npm run dev     # Run with nodemon (auto-restart on file changes)
npm install     # Install dependencies
```

### Frontend (`Credifuturo-Web/client/`)
```bash
npm run dev     # Dev server on port 5173 (proxies /api to localhost:3000)
npm run build   # Production build (outputs to dist/)
npm run preview # Preview production build locally
```

### Quick Start
Double-click `Credifuturo-Web/iniciar_aplicacion.bat` to start both servers automatically (includes dependency checks). Use `Credifuturo-Web/reparar_instalacion.bat` to reinstall all dependencies if node_modules are corrupted.

No test framework or lint script is configured.

## Architecture

Three-tier architecture on a single Windows machine:

```
React + Vite + Tailwind CSS (port 5173)
    ↓ Axios HTTP/REST (src/config/api.js)
Express + Node.js (port 3000)
    ↓ Sequelize ORM
SQLite3 (Credifuturo-Web/database.sqlite, ~11 MB)
```

**Database location**: The active DB is `Credifuturo-Web/database.sqlite`. Two other SQLite files exist at the repo root (`database.sqlite`, `DB_Credifuturo.db`) — these are legacy/backup copies and are NOT used by the application.

### Backend Structure (`server/`)
- **`server.js`** — Express entry point; loads middleware, routes, and starts the cron job for daily backups
- **`config/database.js`** — Sequelize SQLite setup; DB path resolves to `Credifuturo-Web/database.sqlite` via `path.join(__dirname, '..', '..', 'database.sqlite')`; `sequelize.sync()` runs on startup
- **`models/`** — Six core Sequelize models plus `index.js` (defines associations between models)
- **`routes/auth.js`** — Login endpoint; issues JWT tokens
- **`routes/admin.js`** — All CRUD operations (members, loans, savings, payments) plus the `/my/*` user-facing endpoints. At ~3,250 lines, this is the bulk of the API.
- **`routes/user.js`** — Legacy minimal file; active user-dashboard pages call `/api/admin/my/*` instead
- **`middleware/authMiddleware.js`** — JWT verification; role-checking (admin vs. user)
- **`services/BackupService.js`** — Exports all tables to dated Excel files; triggered daily at 8 PM Colombia time (`America/Bogota` timezone) by node-cron and on-demand via admin UI. Output: `C:\Credifuturo\Backups\`
- **`services/DBClient.js`** — Higher-level DB operations service (upsert/transaction helpers); used by import scripts, not by routes directly
- **`services/DataImportService.js`** — Excel import logic (currently disabled via `ENABLE_EXCEL_SYNC=false` in `.env`)

> The `server/` directory also contains 70+ one-off utility/migration scripts from past data-fix operations. These are not part of the live application.

#### Critical: JWT Secret Mismatch
`authMiddleware.js` hardcodes the secret as `'credifuturo_secret_key_change_me'` and does **not** read `process.env.JWT_SECRET`. The `JWT_SECRET` value in `.env` only affects `routes/auth.js` (token issuance). Any change to JWT signing must be applied to both files.

### Frontend Structure (`client/src/`)
- **`App.jsx`** — React Router v6 routes; splits into `/admin` (DashboardLayout) and `/dashboard` (UserDashboardLayout) role trees; root `/` redirects by role
- **`pages/admin/`** — Active modular admin pages (dashboard, clients, loans, savings, aportes, payments, reports, account detail)
- **`pages/user/`** — Active member-facing read-only pages (loans, savings, contributions, payments, account details); includes PDF export components
- **`pages/Login.jsx`** — Authentication entry point
- **`pages/ChangePasswordPage.jsx`** — Password change page at `/change-password`
- **`components/ui/`** — Primitive UI components (Button, Card, Input, Badge, DataTable)
- **`components/admin/`** — Admin-specific composite components (LoanCapacityWidget, filter selects)
- **`layouts/`** — Page layout wrappers (DashboardLayout for admin, UserDashboardLayout for member)
- **`config/api.js`** — Centralized Axios instance; auto-attaches JWT Bearer token via interceptor; exports `apiWithRetry()` helper for retry with exponential backoff. **All API calls must go through this module.**
- **`context/UiContext.jsx`** — Global UI state provider; wraps the app in `main.jsx`
- **`utils/cn.js`** — `cn()` className helper (clsx + tailwind-merge)
- **`utils/excelUtils.js`** — `exportToExcel()` and `formatDate()` helpers for client-side Excel export
- **`utils/banks.js`** — Static list of Colombian banks used in loan/payment forms
- **`utils/useSortTable.js`** — Custom React hook for sortable table columns

> Many `.jsx` files exist flat under `pages/` (e.g., `ClientsPage.jsx`, `DashboardHome.jsx`) — these are earlier versions. The active pages imported by `App.jsx` live in `pages/admin/` and `pages/user/`. `AdminDashboard.jsx` and `UserDashboard.jsx` at the root are accessible via `/admin/legacy` but are fully superseded.

### Data Model (6 Sequelize tables)

| Model | Table | Purpose |
|-------|-------|---------|
| `Client` | clients | Socios (members); holds `role` (admin/user), `customerId`, `cedula`, `estatus` |
| `Saving` | savings | Monthly savings + initial contributions; `type` distinguishes "Mensual" vs "Aporte Inicial" |
| `Loan` | loans | Loan applications (supplementary to DisbursedLoan; created atomically alongside it) |
| `DisbursedLoan` | disbursed_loans | Actual disbursed loans; keyed by `idVm`; stores `valorPrestado`, `cuotas`, `interesMensual` |
| `LoanPayment` | loan_payments | Individual quota rows per loan; `estado` is "Pendiente", "Pago", or "Mora"; `clientId` is denormalized for query performance; linked to `DisbursedLoan` via `idVm` (not a DB FK) |
| `Soporte` | soportes | Payment proof files stored as **BLOBs in SQLite** (not on disk); accepted types: JPG, PNG, GIF, WEBP, PDF; 10 MB limit |

Relationships: `Client` 1→N `Saving`, `DisbursedLoan`, and `LoanPayment`. `DisbursedLoan` 1→N `LoanPayment` (via `idVm` string match, not a formal FK). Associations are declared in `models/index.js`.

### Authentication & Authorization
- Login returns a JWT stored in `localStorage`; all API requests send it as Bearer token via the `api.js` interceptor
- `authMiddleware.js` decodes the token and attaches `req.user` `{ id, role, name, customerId, email }`; role (`admin` / `user`) gates route access
- Default admin credentials: `admin@credifuturo.com` / `admin123` (created via `seed-admin.js`)
- Default member password is `'123'` (hashed) set during import
- Passwords hashed with bcryptjs

### Business Identifiers
Business keys follow a sequential naming convention: `VM_001` (loans/`idVm`), `SOL_001` (applications), `P_001` / `id_ep` (payment quotas). These differ from database auto-increment IDs.

### Environment Configuration
```
# server/.env
PORT=3000
JWT_SECRET=super_secret_key_credifuturo_2026   # only used in routes/auth.js
ENABLE_EXCEL_SYNC=false   # toggle for Excel import pipeline

# client/.env
VITE_API_URL=http://localhost:3000/api   # used in production builds only
```

Note: during `npm run dev`, Vite proxies `/api` requests directly to `http://localhost:3000` (configured in `vite.config.js`), so `VITE_API_URL` is only effective in production builds.

### Key Libraries
- **Tailwind CSS v3** — utility-first styling throughout the frontend
- **Recharts** — financial charts on dashboards
- **xlsx** — Excel import/export (both server-side backups and client-side report downloads)
- **jspdf + html2canvas** — PDF generation in `UserAccountDetailsPage`, `UserSavingsListPage`, and `DashboardHome` (canvas-to-PDF approach)
- **`window.print()` + CSS `@media print`** — PDF/print export in `SavingsSummaryPage` specifically; the `@media print` block lives inline in the page's `<style>` tag
- **node-cron** — scheduled daily backup trigger
- **Multer** — file upload handling (memory storage → SQLite BLOB)
- **Lucide React** — icon set used throughout the UI

## Non-obvious Patterns & Gotchas

### Savings field semantics (Saving model)
Two amount fields with different meanings — mixing them causes reporting errors:
- `amount` — gross payment received (before any penalty deduction)
- `valorAhorrado` — net amount credited to the member (amount minus penalty)
- Dashboard KPI "Capital Ahorrado" intentionally uses `sum('amount')` (gross inflows); the Ranking uses `valorAhorrado` (net accumulation). The ~$77k difference between them is collected penalties — this is correct by design.

### Month/year fields in Saving records
Two sets of date fields with different semantics:
- `monthInt` / `year` — the calendar date the payment was *made* (transaction date)
- `mesAbonado` / `anioAbonado` — the month being *credited* (the period being covered)

Always use `mesAbonado`/`anioAbonado` for business logic (e.g., "did the member save in March?"). Members who prepay their full year in January have `monthInt=1` for all 12 records but `mesAbonado` values 1–12.

### `clientEstatus` in API responses
When Sequelize returns savings/payments with a joined `Client`, the flat response field is `clientEstatus` (not `client.estatus` or `Client.estatus`). Filtering on the wrong field silently removes all records.

### SavingsSummaryPage URL param
`?view=total` (parsed via `useLocation`) gates whether the Préstamos del Socio and Lista Estado Préstamos sections render. Without this param those sections are hidden even if the socio has loan data.

### Print clipping in DashboardLayout
`DashboardLayout`'s content div has `overflow-x-hidden`, which creates a scroll container that clips all descendant content in print mode (a known browser behavior). Any page that needs full print output must include `* { overflow: visible !important; max-height: none !important; }` in its `@media print` CSS block.

### Sequelize `include` for active-client filtering
When querying savings/payments and filtering to active clients only, pass the filter via `include: [{ model: Client, where: { estatus: 'Activo' }, required: true }]` rather than post-filtering in JS — the latter risks missing the flat `clientEstatus` field issue above.

### `admin.js` endpoint inventory (key routes)
- `GET /clients/:id/loan-capacity` — viability analysis for a second loan (3× savings rule)
- `GET /savings/ranking` — monthly savings per active socio with `mesAbonado`/`anioAbonado`
- `GET /payments/list?clientId=` — all quota rows for a client (no pagination limit)
- `GET /disbursed-loans/list` — all disbursed loans (filter client-side by `clientId`)
- `GET /dashboard-stats` — aggregate KPIs for the admin dashboard

## Documentation
- `Credifuturo-Web/README.md` — installation and startup guide (Spanish)
- `Informes/` — 50+ markdown files documenting architecture, past bug fixes, data migrations, and planning decisions; consult these before making structural changes
- `Informes/ARQUITECTURA_BASE_DATOS.md` — ER diagram and table-level documentation
- `RESUMEN_EJECUTIVO.md` — latest executive status summary
