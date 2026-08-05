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

No test framework is configured. ESLint is installed in the client (no `lint` npm script) — run it with `npx eslint .` from `client/`.

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

**Production deployment (Railway)**: In production (`NODE_ENV=production`) the same Express service also serves the built React app from `client/dist` (static + `app.get('*')` catch-all), so it runs as a *single* service, not two. The SQLite file lives on a Railway volume via the `DATABASE_PATH` env var (e.g. `/data/database.sqlite`). `trust proxy` is enabled so rate-limiting sees the real client IP behind Railway's proxy. **Production is the source of truth** — the local DB is disposable; align local to prod, never the reverse without being asked.

### Backend Structure (`server/`)
- **`server.js`** — Express entry point; loads middleware, routes, and starts the cron job for daily backups
- **`config/database.js`** — Sequelize SQLite setup; DB path resolves to `Credifuturo-Web/database.sqlite` via `path.join(__dirname, '..', '..', 'database.sqlite')`; `sequelize.sync()` runs on startup
- **`models/`** — Fourteen Sequelize models. `index.js` wires associations for `Client`, `Saving`, `Loan`, `DisbursedLoan`, `LoanPayment`, `Soporte`, `Propuesta`, `VotoPropuesta`. The rest — `PasswordResetRequest`, `AppSetting`, `LoanRequest`, `LoanBoardVote`, `Notification`, `ScoreSnapshot` — are defined standalone and `require()`'d directly where used (route file or `server.js`), not wired through `index.js`
- **`routes/auth.js`** — Login (rate-limited), JWT issuance, `PUT /change-password`, and `POST /request-reset` (creates a `PasswordResetRequest` + emails a notification via `EmailService`)
- **`routes/admin.js`** — All CRUD operations (members, loans, savings, payments) plus the Junta/Propuestas/Notifications modules and the `/my/*` user-facing endpoints. At ~5,500 lines / ~90 routes, this is the bulk of the API — see "Authorization gate in `admin.js`" below before adding a route.
- **`routes/user.js`** — Legacy minimal file; active user-dashboard pages call `/api/admin/my/*` instead
- **`middleware/authMiddleware.js`** — JWT verification (`verifyToken`); `requireRole(...roles)` accepts one or more roles (e.g. `requireRole('user', 'admin')`); `requireFreshPassword` blocks everything except password-change while `mustChangePassword` is true
- **`services/BackupService.js`** — Exports all tables to dated Excel files; triggered daily at 8 PM Colombia time (`America/Bogota` timezone) by node-cron and on-demand via admin UI. Output: `C:\Credifuturo\Backups\`
- **`services/DBClient.js`** — Higher-level DB operations service (upsert/transaction helpers); used by import scripts, not by routes directly
- **`services/DataImportService.js`** — Excel import logic (currently disabled via `ENABLE_EXCEL_SYNC=false` in `.env`)
- **`services/EmailService.js`** — nodemailer wrapper; sends password-reset-request notifications
- **`services/NotificationService.js`** — `createNotification` / `notifyAdmins` / `notifyMany`; writes `Notification` rows consumed by the `/my/notifications*` endpoints and the bell icon in both dashboards
- **`services/fileValidator.js`** — magic-byte verification (`verifyFileMagicBytes`) and filename sanitization for `Soporte` uploads, beyond multer's mimetype check
- **`services/sessionActivity.js`** — tracks last-seen-at per user id (`touch()` called on every `verifyToken` pass); backs the admin "Registros de Acceso" page
- **`services/passwordPolicy.js` / `securityLogger.js`** — temp-password generation and security-event logging (used by the admin auto-seed and reset flow)

> The `server/` directory also contains one-off utility/migration scripts from past data-fix operations (root of `server/` and `server/scratch/`). These are not part of the live application. No automated test suite exists (`server/tests/` holds a single manual repro script, not a runnable suite).

#### JWT Secret
Both `routes/auth.js` (token issuance) and `middleware/authMiddleware.js` (token verification) read the secret from `process.env.JWT_SECRET`. `routes/auth.js` throws at startup if `JWT_SECRET` is undefined. There is no hardcoded fallback secret, so `JWT_SECRET` must be set in `server/.env` (and in the Railway env vars for production) for login and auth to work.

### Frontend Structure (`client/src/`)
- **`App.jsx`** — React Router v6 routes; splits into `/admin` (DashboardLayout) and `/dashboard` (UserDashboardLayout) role trees; root `/` redirects by role
- **`pages/admin/`** — Active modular admin pages: dashboard, clients, loans, savings, aportes, payments, reports, account detail, plus `LoanApprovalsPage`, `PropuestasPage`, `ExecutivePanelPage`, `AccessLogsPage`, `InformesViewerPage`, `OrphanLoansPage`, `DevolucionesAhorrosPage`
- **`pages/user/`** — Active member-facing pages: loans, savings, contributions, payments, account details (with PDF export components), plus `JuntaAprobacionesPage` (loan-vote UI for Junta members), `UserResolutionsPage` (Propuestas), `MiPanelPage`, `CapacidadBetaPage`
- **`utils/loanCapacity.js`** — Single source of truth for `calcScore()` (credit score formula) and `calcVerdict()` (loan-viability verdict); `ScoreSnapshot` rows store only the raw inputs, never the computed score, so the client always recomputes with whatever the current formula is
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

### Data Model (14 Sequelize tables)

| Model | Table | Purpose |
|-------|-------|---------|
| `Client` | clients | Socios (members); holds `role` (admin/user), `customerId`, `cedula`, `estatus`, `cargo` (used to identify Junta members), and the `mustChangePassword` flag |
| `Saving` | savings | Monthly savings + initial contributions; `type` distinguishes "Mensual" vs "Aporte Inicial" |
| `Loan` | loans | Loan applications (supplementary to DisbursedLoan; created atomically alongside it) |
| `DisbursedLoan` | disbursed_loans | Actual disbursed loans; keyed by `idVm`; stores `valorPrestado`, `cuotas`, `interesMensual` |
| `LoanPayment` | loan_payments | Individual quota rows per loan; `estado` is "Pendiente", "Pago", or "Mora"; `clientId` is denormalized for query performance; linked to `DisbursedLoan` via `idVm` (not a DB FK) |
| `Soporte` | soportes | Payment proof files stored as **BLOBs in SQLite** (not on disk); accepted types: JPG, PNG, GIF, WEBP, PDF; 10 MB limit; validated by `services/fileValidator.js` beyond just mimetype |
| `PasswordResetRequest` | PasswordResetRequests | Member-initiated password-reset requests; `status` is "pending", "resolved", or "rejected"; an admin resolves them from the admin UI |
| `LoanRequest` | (Sequelize default) | A socio's loan application awaiting Junta approval; stores what was requested (`amount`, `installments`, `monthlyRate`) plus a snapshot of the simulation shown to the socio (`firstInstallment`, `totalInterest`, etc.) |
| `LoanBoardVote` | (Sequelize default) | One Junta member's approve/reject decision on a `LoanRequest`; the request's aggregate status is only decided once all 3 Junta members have voted (see `PUT /loan-requests/:id/vote` in `admin.js`) |
| `AppSetting` | AppSettings | Generic key/value store for admin-configured globals (e.g. `utilidadesADistribuir`, the year's profit-to-distribute figure) |
| `Notification` | Notifications | In-app notifications per `clientId` (`type`, `title`, `message`, `link`, `isRead`); written via `services/NotificationService.js`, read via `/my/notifications*` |
| `ScoreSnapshot` | (Sequelize default) | Monthly snapshot of the **inputs** to a socio's credit score (`datos`, JSON) — never the computed score itself, so the score can always be recalculated with the current formula in `calcScore()` |
| `Propuesta` | (Sequelize default) | Member-submitted proposal (Buzón de Propuestas): `titulo`, `descripcion`, `categoria`, optional `clientId` (null if authored by admin) |
| `VotoPropuesta` | VotosPropuesta | One socio's vote on a `Propuesta`; unique-indexed on `(propuestaId, clientId)` to prevent double voting |

Relationships: `Client` 1→N `Saving`, `DisbursedLoan`, `LoanPayment`, `Propuesta`, `VotoPropuesta`. `DisbursedLoan` 1→N `LoanPayment` (via `idVm` string match, not a formal FK). `Propuesta` 1→N `VotoPropuesta`. Core associations are declared in `models/index.js`; `LoanRequest`/`LoanBoardVote`/`Notification`/`ScoreSnapshot`/`AppSetting` are used directly by `admin.js` without being wired into `index.js`.

`Propuesta`/`VotoPropuesta` self-sync their tables (`Propuesta.sync({ alter: false })`) on first `require()` in `admin.js`, independent of the main startup `sequelize.sync()` — this is a one-off pattern for that module, not the general convention.

### Authentication & Authorization
- **Credential is `cedula` + password** (not email). `routes/auth.js` `POST /login` reads `{ cedula, password }` and looks up `Client.findOne({ where: { cedula: cedula.trim() } })`. Email remains stored on the Client record but is no longer used to authenticate. The "Olvidé mi contraseña" flow (`POST /request-reset`) still accepts either cédula OR email — that's the recovery path, not the login path.
- Login returns a JWT stored in `localStorage`; all API requests send it as Bearer token via the `api.js` interceptor. JWT payload: `{ id, role, name, customerId, cedula, email, mustChangePassword }`.
- `authMiddleware.js` decodes the token and attaches the payload above to `req.user`; `requireFreshPassword` blocks everything except change-password when `mustChangePassword` is true. `admin.js` routes are gated centrally rather than per-route — see "Authorization gate in `admin.js`" below.
- **Brute-force detector** (`services/bruteForceDetector.js`) keys on `cedula` (5 fails / 10 min triggers an alert), in addition to the IP-based rate limiter (10 / 15 min).
- **Admin bootstrap**: on startup, if no admin exists, `server.js` auto-seeds an admin record with a **random** temp password printed once to the server console and `mustChangePassword=true`. The seed sets `email='admin@credifuturo.com'` but, since login is by cédula, an admin record with a real cédula must exist for production use (the current prod admin is `cedula=14297227`).
- Default member password is `'123'` (hashed) set during import; members are expected to change it.
- Passwords hashed with bcryptjs; `/login` and `/request-reset` are rate-limited (express-rate-limit) against brute force.

#### Authorization gate in `admin.js` (read before adding a route)
`admin.js` does **not** apply `verifyToken`/`requireRole` per-route. Instead a single `router.use(...)` near the top (after the route-table constants) inspects `req.method`/`req.path` and dispatches by matching it against route tables, deny-by-default to `requireRole('admin')`:
- `req.path.startsWith('/my/')` → skipped entirely; each `/my/*` handler declares its own `verifyToken`/`requireRole`/`requireFreshPassword` inline.
- `READ_ONLY_FOR_ALL` (`/dashboard-stats`, `/executive-stats`, `/savings-evolution`) and `READ_ONLY_PREFIXES` (`/settings/`) → any authenticated, password-fresh user, GET only.
- `BETA_ROUTES` → gated by `requireAdminOrBetaTester`, which checks `req.user.cedula` against the hardcoded `BETA_CEDULAS` set (cédula, not name, since only cédula is in the JWT). Currently backs the Ranking de Ahorro and Buzón de Propuestas beta rollout.
- `JUNTA_ROUTES` (loan-requests, junta/members, informes read) → gated by `requireJuntaMember`; Junta membership = all `role: 'admin'` clients **plus** the cédulas in `JUNTA_CEDULAS` (`getJuntaClientIds()`), not a separate role.
- Everything else → `requireRole('admin')`.

**Consequence**: a new admin-only route needs no extra wiring, but a new route meant for regular socios, beta testers, or Junta members must be added to the matching table (or given its own `/my/*`-style path) — otherwise it 403s for everyone but admins.

### Business Identifiers
Business keys follow a sequential naming convention: `VM_001` (loans/`idVm`), `SOL_001` (applications), `P_001` / `id_ep` (payment quotas). These differ from database auto-increment IDs.

### Environment Configuration
```
# server/.env
PORT=3000
JWT_SECRET=...                 # REQUIRED — used by both auth.js and authMiddleware.js; server throws if missing
ENABLE_EXCEL_SYNC=false        # toggle for Excel import pipeline
NODE_ENV=production            # flips on static React serving, helmet CSP, strict CORS, trust proxy, hidden 5xx errors
ALLOWED_ORIGINS=https://...    # comma-separated cross-origin allow-list (prod only; same-origin is always allowed)
DATABASE_PATH=/data/database.sqlite   # overrides the SQLite location (Railway volume)
SETUP_KEY=...                  # >=32 chars; enables /api/setup/* maintenance endpoints
ALLOW_SETUP_IN_PRODUCTION=true # additionally required to enable /api/setup/* when NODE_ENV=production

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
- **helmet + express-rate-limit** — security headers and brute-force rate limiting on the backend
- **nodemailer** — outbound email for password-reset notifications (`EmailService.js`)
- **react-markdown + remark-gfm** — render the chart analysis text in the dashboard expand modals

## Security & Operations

The backend has had a deliberate OWASP-oriented hardening pass (code comments reference A02/A04/A05/A07/A09). Keep these intact when editing:
- **`server.js` middleware stack**: helmet (CSP on in prod), a custom CORS delegate (auto-allows same-origin, otherwise only `ALLOWED_ORIGINS` in prod / a dev allow-list — never reflects arbitrary origins), a 1 MB JSON body limit, and a request logger that **redacts** sensitive body keys (`password`, `tempPassword`, `token`, …) before logging.
- **Global error handler**: 5xx error messages/stacks are hidden in production (only generic text returned); 4xx messages pass through. Don't leak internals in new 5xx paths.
- **Maintenance endpoints** (`/api/setup/restore-db`, `/download-db`, `/reset-password`): gated by a `SETUP_KEY` (≥32 chars) sent in the `x-setup-key` header, and additionally require `ALLOW_SETUP_IN_PRODUCTION=true` to mount in production. These are the operational path for syncing/restoring the Railway SQLite DB.
- **Crash logging**: `POST /api/log-crash` (rate-limited, no auth) appends client-side React crash reports to `server/crash_log.txt`.

### Startup sequence (`server.js` after `sequelize.sync()`)
`sync()` runs **without `alter`** (to avoid SQLite FK migration issues — schema changes must be applied manually). Then, in order: auto-seed admin if none exists → create performance indexes (`CREATE INDEX IF NOT EXISTS` on Savings, LoanPayments, DisbursedLoans) → `listen()` → register the daily 8 PM `America/Bogota` backup cron. Adding a column requires a manual migration/SQL since `alter` is off.

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
- `GET /clients/:id/loan-capacity` — viability analysis for a second loan (3× savings rule); a request over this cap requires Junta approval instead of direct disbursement (see `PUT /loans` and the "aprobadoDirectoPorGerente" override path)
- `GET /savings/ranking` — monthly savings per active socio with `mesAbonado`/`anioAbonado`
- `GET /payments/list?clientId=` — all quota rows for a client (no pagination limit)
- `GET /disbursed-loans/list` — all disbursed loans (filter client-side by `clientId`)
- `GET /dashboard-stats` — aggregate KPIs for the admin dashboard
- `POST /my/loan-requests`, `GET /loan-requests`, `PUT /loan-requests/:id/vote`, `PUT /loan-requests/:id/mark-disbursed` — Junta loan-approval workflow: a socio submits a request, the 3 Junta members each vote, and only once all 3 have voted does the aggregate status resolve to approved/rejected (see the comment above `PUT /loan-requests/:id/vote`)
- `GET/POST/PUT/DELETE /propuestas`, `PUT /propuestas/:id/voto`, `PUT /propuestas/:id/estado` — Buzón de Propuestas (member proposal box + voting); beta-gated
- `GET /my/notifications`, `GET /my/notifications/unread-count`, `PUT /my/notifications/:id/read`, `PUT /my/notifications/read-all` — in-app notification inbox
- `GET/PUT /settings/:key` — `AppSetting` key/value store; writing `utilidadesADistribuir` fan-outs a `Notification` to admins + the Ranking-de-Ahorro beta cohort
- `GET /informes`, `GET /informes/:name`, `DELETE /informes/:name` — serves shared report files (`.md`/`.txt`/`.pdf`) from `Informes/` and `server/shared-informes/`; PDFs stream as `application/pdf` for the in-browser viewer, everything else as JSON; non-admins only see filenames listed in `JUNTA_INFORMES_VISIBLES`

## Documentation
- `Credifuturo-Web/README.md` — installation and startup guide (Spanish)
- `Informes/` — 50+ markdown files documenting architecture, past bug fixes, data migrations, and planning decisions; consult these before making structural changes
- `Informes/ARQUITECTURA_BASE_DATOS.md` — ER diagram and table-level documentation
- `RESUMEN_EJECUTIVO.md` — latest executive status summary
