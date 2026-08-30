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
- **`models/`** — Fifteen Sequelize models. `index.js` wires associations for `Client`, `Saving`, `Loan`, `DisbursedLoan`, `LoanPayment`, `Soporte`, `Propuesta`, `VotoPropuesta`. The rest — `PasswordResetRequest`, `AppSetting`, `LoanRequest`, `LoanBoardVote`, `Notification`, `ScoreSnapshot`, `AbonoAplicado` — are defined standalone and `require()`'d directly where used (route file or `server.js`), not wired through `index.js`
- **`routes/auth.js`** — Login (rate-limited), JWT issuance, `PUT /change-password`, and `POST /request-reset` (creates a `PasswordResetRequest` + emails a notification via `EmailService`)
- **`routes/admin.js`** — All CRUD operations (members, loans, savings, payments) plus the `/my/*` user-facing endpoints and the governance flows (loan-request approval, notifications, proposals, `settings/:key`). At ~5,500 lines / ~90 routes, this is the bulk of the API — see "Authorization gate in `admin.js`" below before adding a route.
- **`routes/user.js`** — Legacy minimal file; active user-dashboard pages call `/api/admin/my/*` instead
- **`middleware/authMiddleware.js`** — JWT verification (`verifyToken`); `requireRole(...roles)` accepts one or more roles (e.g. `requireRole('user', 'admin')`); `requireFreshPassword` blocks everything except password-change while `mustChangePassword` is true
- **`services/BackupService.js`** — Exports all tables to dated Excel files; triggered daily at 8 PM Colombia time (`America/Bogota` timezone) by node-cron and on-demand via admin UI. Output: `C:\Credifuturo\Backups\`
- **`services/DBClient.js`** — Higher-level DB operations service (upsert/transaction helpers); used by import scripts, not by routes directly
- **`services/DataImportService.js`** — Excel import logic (currently disabled via `ENABLE_EXCEL_SYNC=false` in `.env`)
- **`services/EmailService.js`** — nodemailer wrapper; sends password-reset-request and loan-approval/rejection notifications
- **`services/amortizacion.js`** — pure amortization math: `analizarCronograma` (is this schedule safe to recalculate?), `planificarReajuste` (rebuild the whole schedule from the real payments), `abonosSinAplicar` (which excess payments are still unapplied). No DB access
- **`services/abonoCapital.js`** — orchestration for extraordinary principal payments: `planificarPrestamo` (dry run), `aplicarPlan` (persist + audit), `revertir`, `barrer`, `barridoProgramado`. See "Extraordinary principal payments" below
- **`services/NotificationService.js`** — `createNotification` / `notifyAdmins` / `notifyMany`; writes `Notification` rows consumed by the `/my/notifications*` endpoints, the bell icon in both dashboards, and the loan-approval flow
- **`services/fileValidator.js`** — magic-byte verification (`verifyFileMagicBytes`) and filename sanitization for `Soporte` uploads, beyond multer's declared MIME type
- **`services/sessionActivity.js`** — tracks last-seen-at per user id (`touch()` called on every `verifyToken` pass); backs the admin "Registros de Acceso" (Access-Logs) page
- **`services/passwordPolicy.js` / `securityLogger.js`** — temp-password generation and security-event logging (used by the admin auto-seed and reset flow)
- **`lib/security-middleware.js`** (at `Credifuturo-Web/lib/`) — `setupSecurity(app)`, the helmet/CORS/logging middleware assembled in `server.js`; `Credifuturo-Web/Dockerfile` builds the single-service Railway container

> The `server/` directory also contains one-off utility/migration scripts from past data-fix operations (root of `server/` and `server/scratch/`). These are not part of the live application. No automated test suite exists (`server/tests/` holds a single manual repro script, not a runnable suite).

#### JWT Secret
Both `routes/auth.js` (token issuance) and `middleware/authMiddleware.js` (token verification) read the secret from `process.env.JWT_SECRET`. `routes/auth.js` throws at startup if `JWT_SECRET` is undefined. There is no hardcoded fallback secret, so `JWT_SECRET` must be set in `server/.env` (and in the Railway env vars for production) for login and auth to work.

### Frontend Structure (`client/src/`)
- **`App.jsx`** — React Router v6 routes; splits into `/admin` (DashboardLayout) and `/dashboard` (UserDashboardLayout) role trees; root `/` redirects by role
- **`pages/admin/`** — Active modular admin pages: dashboard, clients, loans, savings, aportes, payments, reports, account detail, plus `LoanApprovalsPage` (Junta voting), `PropuestasPage`, `ExecutivePanelPage`, `AccessLogsPage`, `InformesViewerPage`, `OrphanLoansPage`, `DevolucionesAhorrosPage`, `SavingsMatrixPage` and `LoansMatrixPage` (socio × month control grids — see below)
- **`pages/user/`** — Active member-facing pages: loans, savings, contributions, payments, account details (with PDF export components), plus `JuntaAprobacionesPage` (loan-vote UI for Junta members), `UserResolutionsPage` (Propuestas), `MiPanelPage`, `CapacidadBetaPage` / `UserLoanAnalyzerPage` (credit-score capacity), `MisCreditosPage`, `UserStatutesPage`
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
- **`utils/loanCapacity.js`** — **single source of the credit-score formula**: `calcScore()`, `calcVerdict()`, `kpiDescriptions`, `colorMap`. Server-side score snapshots recompute from this same logic — keep it authoritative
- **`utils/juntaAccess.js`** — `useJuntaAccess()` hook + `JUNTA_CEDULAS_NO_ADMIN` (the non-admin Junta members). Mirrors `JUNTA_CEDULAS` in `server/routes/admin.js` — change both together
- **`utils/betaAccess.js`** — `useBetaAccess()` hook + `BETA_USERS` name allow-list gating the Propuestas (BETA) feature; mirrors the nav's own list
- **`utils/fundProjection.js`** — single source for the year-end fund projection ({base, conservador, optimista}) shared by `ExecutivePanelPage` and `DashboardHome` so both panels show identical figures
- **`utils/sync.js`** — client-side sync helper

> Many `.jsx` files exist flat under `pages/` (e.g., `ClientsPage.jsx`, `DashboardHome.jsx`) — these are earlier versions. The active pages imported by `App.jsx` live in `pages/admin/` and `pages/user/`. `AdminDashboard.jsx` and `UserDashboard.jsx` at the root are accessible via `/admin/legacy` but are fully superseded.

### Data Model (15 Sequelize tables)

| Model | Table | Purpose |
|-------|-------|---------|
| `Client` | clients | Socios (members); holds `role` (admin/user), `customerId`, `cedula`, `estatus`, `cargo` (used to identify Junta members), and the `mustChangePassword` flag |
| `Saving` | savings | Monthly savings + initial contributions; `type` distinguishes "Mensual" vs "Aporte Inicial" |
| `Loan` | loans | Loan applications (supplementary to DisbursedLoan; created atomically alongside it) |
| `DisbursedLoan` | disbursed_loans | Actual disbursed loans; keyed by `idVm`; stores `valorPrestado`, `cuotas`, `interesMensual` |
| `LoanPayment` | loan_payments | Individual quota rows per loan; `estado` is "Pendiente", "Pago", or "Mora"; `clientId` is denormalized for query performance; linked to `DisbursedLoan` via `idVm` (not a DB FK) |
| `Soporte` | soportes | Payment proof files stored as **BLOBs in SQLite** (not on disk); accepted types: JPG, PNG, GIF, WEBP, PDF; 10 MB limit; validated by `services/fileValidator.js` beyond just mimetype |
| `PasswordResetRequest` | PasswordResetRequests | Member-initiated password-reset requests; `status` is "pending", "resolved", or "rejected"; an admin resolves them from the admin UI |
| `LoanRequest` | LoanRequests | Member loan applications pending Junta approval; stores the computed installment/interest projection, `scoreAtRequest`, `availableCapacityAtRequest`, `requiresVote`, and `status` ("pending"/"approved"/"rejected") |
| `LoanBoardVote` | LoanBoardVotes | One `approved`/`rejected` vote (+ optional `note`) per Junta member per `LoanRequest` |
| `AppSetting` | AppSettings | Generic key/value store for admin-configured globals (e.g. `utilidadesADistribuir`, the year's profit-to-distribute figure) |
| `Notification` | Notifications | In-app (bell) notifications per `clientId`; `type`, `title`, `message`, `link`, `isRead`/`readAt` |
| `ScoreSnapshot` | ScoreSnapshots | Monthly snapshot of each socio's credit-score **inputs** (not the score itself — the client recomputes via `calcScore()`) |
| `AbonoAplicado` | AbonosAplicados | One row per applied extraordinary-principal adjustment: `idVm`, `excedente`, `politica`, `origen`, and `estadoAnterior` (JSON with the pre-change values of every quota touched). It is the audit trail **and** the undo record — the only way to reverse a schedule rewrite in production |
| `Propuesta` | Propuestas | Member suggestion box (BETA): `titulo`, `descripcion`, `categoria` enum, `estado` ("pendiente"/"en_revision"/"aprobada"/"rechazada") |
| `VotoPropuesta` | VotosPropuesta | One vote per socio per `Propuesta`; unique-indexed on `(propuestaId, clientId)` to prevent double voting |

Relationships: `Client` 1→N `Saving`, `DisbursedLoan`, `LoanPayment`, `Propuesta`, `VotoPropuesta`. `DisbursedLoan` 1→N `LoanPayment` (via `idVm` string match, not a formal FK). `Propuesta` 1→N `VotoPropuesta`. Core associations are declared in `models/index.js`; `LoanRequest`/`LoanBoardVote`/`Notification`/`ScoreSnapshot`/`AppSetting` are used directly by `admin.js` without being wired into `index.js`.

`Propuesta`/`VotoPropuesta` self-sync their tables (`Propuesta.sync({ alter: false })`) on first `require()` in `admin.js`, independent of the main startup `sequelize.sync()` — this is a one-off pattern for that module, not the general convention.

### Governance & Workflows (cross-file subsystems)
These five flows span the backend, the data model, and the client — read here before touching them.

- **Refinancing (retanqueo).** A socio with a `Vigente` loan who takes a new one: `POST /disbursed-loans` cancels the old loan in the same transaction. `calcularInteresRetanqueo` charges interest only for the **days already elapsed** (`saldo × tasa × días/30`, capped at 30) and forgives the rest of the pending quotas' interest. Rules that are easy to break:
  - **The prorated interest is recorded on the OLD loan, never on the new one.** It lands on the first pending quota (`valorInteresesAmortizados = interesCausado`, `estado='Pago'`, `esPrepago=true`); quotas 2..n go to zero interest. The new loan's schedule is built from `valorPrestado` untouched. From there the figure flows into "Intereses de préstamos" and into the recaudo half of `saldoEnBanco`, so **the books already treat it as collected**.
  - **A retanqueo moves one net amount, not two.** `netoEntregado = valorPrestado − (capital pendiente + interés causado)`. The screen used to show only the round `saldoPendiente`, which invites subtracting the capital alone and handing over the interest the fund had just booked as income — $24.267 on the SOL33 case. Both the alert and the "Resumen del Desembolso" now show `totalACancelar` and the net, and the POST writes the whole liquidation into the new loan's `observaciones` (no schema change: `sync()` runs without `alter`, and nothing else records the amount that actually left — only bank, transfer number and account).
  - **A negative net is a real case, not an error.** When the new loan is smaller than what is cancelled, the socio owes the fund cash; the UI says so instead of printing a negative figure.
  - **Preview and charge must read the same calendar day.** `GET /clients/:id/active-loan` takes `?fecha=YYYY-MM-DD` (the form's date) and the client refetches when it changes. `diaCalendarioBogota()` anchors both ends of the subtraction to a Bogota calendar day, because `Math.ceil` over a timestamp that carried the time of day made the preview show one day more than was ever charged.
  - **Only the oldest pending quota gets prorated**; the rest is forgiven whole even if several months elapsed. Mostly unreachable — the mora EP check blocks disbursement first — but it is a known limitation, not an oversight.
  - `DELETE /disbursed-loans/:id` reverses a retanqueo by matching the `refinanciación <idVm> —` marker left in the cancelled quotas' `observaciones`; keep that string in sync if the wording changes.

- **Junta Administrativa loan approval.** The board = the admin (gerente) **plus two hardcoded cédulas** in `JUNTA_CEDULAS` (`79863805`, `52496873`) in `routes/admin.js`. `isJuntaMember` / `requireJuntaMember` gate the board routes via a `JUNTA_ROUTES` allow-list. A member submits a `LoanRequest` (`POST /my/loan-requests`); each Junta member votes at `PUT /loan-requests/:id/vote`. Approval is **unanimous** — `status` flips to `approved` only when every member's vote is `approved`, otherwise `rejected`. On the final decision, EmailService + NotificationService fire. `PUT /loan-requests/:id/mark-disbursed` then links the request to a `DisbursedLoan`. **Gotcha:** the roster is duplicated in `client/src/utils/juntaAccess.js` (`JUNTA_CEDULAS_NO_ADMIN`) — change both together.
- **Credit scoring.** `calcScore()` in `client/src/utils/loanCapacity.js` is the **single source of the formula**. `ScoreSnapshot` persists monthly *inputs* only; the client recomputes each score from them. `GET /my/score-history` returns the last 12 snapshots. Snapshots run via a second cron (`0 10 20 * * *`, `America/Bogota`) in `server.js`, plus a ~20s post-boot seed run.
- **In-app notifications.** `services/NotificationService.js` (`createNotification`/`notifyAdmins`/`notifyMany`) writes `Notification` rows consumed by the bell UI. Endpoints: `GET /my/notifications`, `/my/notifications/unread-count`, `PUT /my/notifications/:id/read`, `PUT /my/notifications/read-all`.
- **Extraordinary principal payments (abonos a capital).** When a socio pays more than the quota, the excess amortizes principal and cheapens every interest charge not yet accrued. Three pieces: `services/amortizacion.js` holds the math, `services/abonoCapital.js` the orchestration, and `AbonosAplicados` the audit/undo trail. Rules the code enforces that are easy to break by accident:
  - **The whole schedule is rebuilt from the real payments**, not just the tail. Re-chaining only the pending quotas from the abono's own `saldoInicial` gives back principal the socio already paid whenever a later quota was settled first — measured at $1.333.333 of invented debt on an $8.000.000 loan. Rebuilding also lowers the interest of quotas paid *after* the abono, and that difference is credited to the member as principal (`resumen.interesReintegrado`).
  - **Idempotency is read from the figures, never from `observaciones`.** `abonosSinAplicar` asks whether the paid quota's `saldoFinal` already discounts the excess **and** whether the next quota starts from that same balance. Both halves matter: the payments form computes `saldoFinal = saldoInicial + intereses − pagado` on its own while the admin types, so the paid quota shows the discounted balance even when nothing else was ever touched. Checking only the paid row marked the loan "already up to date" and the sweep skipped it forever (seen in production: quota 1 closing at $7.112.000 with quota 2 still opening at $7.333.333). `observaciones` is in `ALLOWED_LOAN_PAYMENT_FIELDS`, so an admin can edit it away — a regex over it would re-apply the abono.
  - **A chain break worth exactly that quota's excess is an unpropagated abono, not corruption.** `analizarCronograma` skips it instead of declaring the schedule a legacy import; otherwise the very loans that need fixing stay flagged "sin recalcular" for good. Breaks of any other size, or with no overpayment behind them, still invalidate the schedule.
  - **`analizarCronograma` accepts capital steps that follow an abono.** Demanding one constant capital across the schedule marked any loan that had already received an abono as non-recalculable, blocking a *second* one forever. A French schedule (capital rising with no abono behind it) is still rejected.
  - **The sweep is automatic but reversible.** It runs post-`listen()` and nightly, takes a lock in `AppSettings` (`barridoAbonos.lock`), copies the `.sqlite` file to `Backups/pre-abonos-*.sqlite` before the first write, and records every prior value in `AbonosAplicados` so `POST /payments/abonos/:id/revertir` can undo it. That reversibility is what makes writing to member debt without human confirmation defensible — the daily `.xlsx` backups are not restorable, and production has no `SETUP_KEY`, so nothing else could put the numbers back.

  - **`analizarCronograma` also demands one single rate across the rows.** Rows carrying different `interesMensual` values are a hand-edit, not a loan, and rebuilding would impose row 1's rate on all of them — measured at $367.200 the fund stopped charging in one direction, $331.552 overcharged to the member in the other.
  - **A quota marked `Pago` for less than its value is refused, not re-amortized.** Spreading that shortfall over the remaining quotas raises them (measured: $750.666 → $794.421) and produced a notification announcing a *negative* saving. An incomplete payment is a person's problem, not a nightly job's.
  - **The capital per quota comes from the schedule, never from `DisbursedLoan.cuotas`.** That field can disagree with the actual row count (migrated loans, half-closed retanqueos); dividing by it doubled the capital and cancelled five quotas the member still owed.
  - **A reversal outranks the sweep.** Once an admin reverts a reajuste, `planificarPrestamo` refuses to re-apply it automatically — otherwise the nightly run would undo their decision. Only `POST /payments/abonos/aplicar` with an explicit `idVm` overrides it (`respetarReversion: false`).
  - **The reduce-quota / reduce-term choice is the member's, so it is resolved per loan, not per run.** `resolverPolitica(idVm, pedida)` picks, in order: what this operation asked for → the preference stored in `AppSettings` under `abono.politica.<idVm>` → the policy of the last non-reverted `AbonoAplicado` on that loan → `reducir-cuota`. Applying with an explicit policy persists it, so the nightly sweep stops falling back to the fund's default for a member who already chose. `PUT /payments/abonos/politica` sets it and returns the recomputed plan, which is what the per-loan buttons in the payments screen call.
  - **Overpayment beyond the whole debt is reported, not swallowed.** `resumen.sobrante` carries the money the member is owed back; the balance is clamped at zero so a settled loan stops surfacing in every sweep.

  - **Paying several quotas at once is NOT an abono.** When a member pays three instalments together and the admin records the whole amount against one quota row, that row shows a huge excess and the other two stay `Pendiente` even though the money arrived (seen in production: $1.250.000 booked against a ~$410.000 quota, with the two following months in arrears). `planificarPagoAdelantado` redistributes the excess to the quotas it actually covers, settling each at face value — the cash total is unchanged, the schedule is untouched and no interest is recalculated, because the member did not abonar to owe less, he prepaid instalments that already existed. Only whole quotas are settled; whatever is left over stays on the original row and *is* an abono. `GET/POST /payments/abonos/reparto` drive it, and it refuses while an abono is already applied on that loan — repartir then would count the same money twice.

  Regression suite: `node server/pruebas_abonos.js` — 101 assertions over a throwaway DB, covering the real production case, the debt-inflation scenario, second abonos, idempotency, both policies, cancellation, reversal, leftover refunds, and every schedule the engine must refuse.

- **Member proposals (BETA).** `Propuesta` + `VotoPropuesta`, gated on the client by the `BETA_USERS` name allow-list in `client/src/utils/betaAccess.js` (mirrored in the nav) and on the server by the cédula-based `BETA_CEDULAS` set in `routes/admin.js` (see "Authorization gate in `admin.js`" above). Endpoints under `/propuestas*` (create, list, update, `/voto`, `/estado`, delete).

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
- `JUNTA_ROUTES` (loan-requests, junta/members, informes read, **both control matrices**) → gated by `requireJuntaMember`; Junta membership = all `role: 'admin'` clients **plus** the cédulas in `JUNTA_CEDULAS` (`getJuntaClientIds()`), not a separate role.
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
- **framer-motion** — animation/transitions in the newer client pages
- **jspdf-autotable** — tabular PDF export (extends jspdf) on member/report pages
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
`sync()` runs **without `alter`** (to avoid SQLite FK migration issues — schema changes must be applied manually). Then, in order: auto-seed admin if none exists → create performance indexes (`CREATE INDEX IF NOT EXISTS` on Savings, LoanPayments, DisbursedLoans, plus `CREATE UNIQUE INDEX ux_disbursed_id_vm` — see below) → `listen()` → register the daily 8 PM `America/Bogota` backup cron, the score-snapshot cron (`0 10 20 * * *`, `America/Bogota`, plus a ~20s post-boot seed run) **and** the abono sweep (`0 30 20 * * *`, plus a ~45s post-boot run). Adding a column requires a manual migration/SQL since `alter` is off.

Anything that writes to the DB at startup must go **after** `listen()` and carry its own `try/catch`: the startup block ends in a `.catch` that logs "Database connection failed", so an exception thrown before `listen()` leaves the server without an open port and with a misleading diagnosis.

**`ux_disbursed_id_vm` is not a performance index.** The `LoanPayment`→`DisbursedLoan` association emits a foreign key onto `DisbursedLoans(id_vm)`, and SQLite requires the referenced column to carry a unique index. Without it the FK is malformed and *every* `INSERT` into `LoanPayments` — and every `DELETE` from it — fails with `foreign key mismatch`. Existing databases predate the association and never got the FK, which is why this only bites a database created from a fresh `sync()`.

## Non-obvious Patterns & Gotchas

### Savings matrix (`SavingsMatrixPage` + `GET /savings/matriz`)
The control grid for "who has not paid this month". Three conventions it depends on, all easy to break:
- **Three cell states, not two.** Green where there is a deposit, red only where the month is *past due* without one, neutral for months that have not arrived. Painting December red in August floods the grid with false alarms and makes the real ones invisible — `mesLimite` from the endpoint is what separates the two.
- **`abonos` vs `neto` are never merged.** The mode toggle switches which one the cells, row totals and column totals use. `abonos` is the control figure; `neto` is the one that reconciles with the member's accumulated savings. A cell with `abonos === 0` but `n > 0` (fund movement, no deposit) gets its own amber state — green or red would both be lies.
- **The reconciliation banner is mode-aware.** Only `neto` + "todos los años" can assert an exact match against the all-time total; in `abonos` mode the gap *is* the concept movements, and the banner says so instead of reporting a false mismatch.

Figures render in `font-mono` with `tabular-nums`: in a twelve-column grid proportional digits break vertical alignment and the eye loses the column.

### Loans matrix (`LoansMatrixPage` + `GET /payments/matriz`)
The savings matrix translated to credit. It shares the layout, the mono tabular figures and the sticky first/total columns, but the domain forces two departures — both load-bearing:
- **The row is the loan, not the socio.** A member with two credits has two quotas in the same month; summing them into one cell erases the only thing the screen exists to show, which is whether each one is paid.
- **An empty cell is not a default.** In savings, a past month with no movement means the member did not pay. In loans it may just mean that credit had no quota that month — it started in July, or already ended. `estadoCelda` therefore asks `n === 0` *first*; asking "is it paid?" first would paint those cells red and accuse the member of missing a payment they never owed.
- **The month comes from `mesPago`, never from the date string alone.** Imported quotas store `fechaPagoMax` as `YYYY-DD-MM` — day and month swapped — which `displayFecha` in `PaymentsListPage` has long compensated for. Reading position 5-7 blindly did two things in production: a quota dated day 15 yielded "month 15", fell out of range and **vanished from the grid without a trace**; quotas dated day 9 all landed in September, stacking half a dozen into one cell (seen as a single $2.556.800 cell on a loan whose quotas are ~$430.000). `mesDe()` reads `mesPago` first (it holds either the month name or the number as text), then falls back to whichever date component is in 1..12. Anything still unreadable goes to `sinUbicar` and is reported on screen — an empty cell caused by a bad date is otherwise indistinguishable from a month in which the loan had no quota.
- **Coverage before payment.** A month can hold two quotas of the same loan (retanqueos, migrated schedules). Checking "is any quota paid?" painted the cell green and hid the unpaid one — the summary counted five quotas in arrears while the grid showed none. The cell compares `pagadas + prepago` against `n` and shows a partial state (`parcial`, amber, rendered as `2/3`) when they differ.

- **A pending cell shows what is owed, not what was collected.** An unpaid quota has no "amount paid"; rendering its zero says nothing and reads as if nothing were due. `contenidoCelda` shows `programado` for every uncovered state and only switches to `pagado` once the quota is covered — the Pagado/Programado toggle governs totals and settled quotas, never this. The nearest still-unpaid future quota carries a ring, since that is the one to collect now.

**Who sees them.** Both matrices are in `JUNTA_ROUTES`, so the board reads them from the *member* dashboard (`/dashboard/junta-matriz-ahorros`, `/dashboard/junta-matriz-cuotas`) using the same page components as the admin — no second copy to drift. The board sees **exactly** what the gerente sees: the three calls these pages make (`/savings/matriz`, `/payments/matriz`, `/savings/list` for the per-cell detail) are all open to it, and return byte-identical payloads. Half a feature — the grid but not the detail — confuses more than it helps, and the detail exposes nothing new: the same identity fields the grid already prints, and of a payment proof only its name.

Only the `GET`s are opened. Applying an abono, redistributing a payment or setting a policy still fall to the admin-only default gate. The detail modal keeps its 403 branch anyway: if permissions ever narrow, it must say so rather than render "sin movimientos" — claiming a member made no deposit when access was simply denied is the worst failure a control screen can have.

Reconciliation runs on "todos los años" + "Programado": the quotas must sum the capital lent plus the interest scheduled. A gap means schedules that do not match their loan's terms — the same condition the abono engine refuses to recalculate.

### One figure, one definition (Panel de Inteligencia Financiera)
Two long-standing discrepancies, both of the same shape — the same concept computed differently in two places on the same screen:
- **"Ahorro de los Socios"** (`ahorroPorAnio` in `/dashboard-stats`) summed gross `amount`, matched `status = 'Abono'` *exactly* against a free-text field from the Excel import, and grouped by `year` instead of the credited period — while claiming in a comment to filter active members, which it never did. It read $11.000.000 where the Matriz de Ahorros read $10.850.000 and the comparator's savings line read $10.500.000. It now uses the matrix's criteria (net `valorAhorrado`, `anioAbonado` with `year` as fallback, concept movements excluded by normalized match), so the three agree.
- **Interest in the year comparator** cut by quota *due date* up to today. `LoanPayment` stores no real payment date, so a quota paid in advance whose due date is later in the year fell out of the accumulated even though the cash is in — the same defect already fixed in the "lo que llevamos" table, left unfixed in the chart. `/year-comparison` now also returns `interesesCobrados: { total, fueraDeCorte }` per year, and the chart adds `fueraDeCorte` at the cut point **for the current year only**: in a closed year a quota due in November was collected in November, and moving it earlier would break the equal-period comparison the chart exists to make.

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
- `GET /savings/matriz?anio=YYYY|todos` — the savings control grid: one row per socio, twelve month cells, plus column totals and each member's all-time accumulated. Every cell carries **two figures** — `abonos` (only what the member deposited) and `neto` (everything, refunds and discounts included) — because they answer different questions and merging them hides gaps: a member who skipped March but got a refund that month would show a number and paint green. `mesLimite` marks how far the year has actually run, so the UI never flags a month that has not arrived yet as missing
- `GET /payments/list?clientId=` — all quota rows for a client (no pagination limit)
- `GET /disbursed-loans/list` — all disbursed loans (filter client-side by `clientId`)
- `GET /dashboard-stats` — aggregate KPIs for the admin dashboard
- `POST /my/loan-requests`, `GET /loan-requests`, `PUT /loan-requests/:id/vote`, `PUT /loan-requests/:id/mark-disbursed` — Junta loan-approval workflow: a socio submits a request, the 3 Junta members each vote, and only once all 3 have voted does the aggregate status resolve to approved/rejected (see the comment above `PUT /loan-requests/:id/vote`)
- `GET/POST/PUT/DELETE /propuestas`, `PUT /propuestas/:id/voto`, `PUT /propuestas/:id/estado` — Buzón de Propuestas (member proposal box + voting); beta-gated
- `GET /my/notifications`, `GET /my/notifications/unread-count`, `PUT /my/notifications/:id/read`, `PUT /my/notifications/read-all` — in-app notification inbox
- `GET /payments/matriz?anio=YYYY|todos` — the quota control grid: one row per **loan** (not per socio), twelve month cells, column totals, and each loan's outstanding balance. Each cell carries `n` (how many quotas fall in that month), `pagadas`, `mora`, `prepago`, `programado`, `pagado` and `excedente`
- `GET /payments/abonos`, `POST /payments/abonos/aplicar`, `POST /payments/abonos/:id/revertir`, `GET /payments/abonos/historial` — extraordinary-principal review, application and undo. The `GET` is a pure dry run: it computes exactly what would be written without writing it
- `GET/PUT /settings/:key` — `AppSetting` key/value store; writing `utilidadesADistribuir` fan-outs a `Notification` to admins + the Ranking-de-Ahorro beta cohort
- `GET /informes`, `GET /informes/:name`, `DELETE /informes/:name` — serves shared report files (`.md`/`.txt`/`.pdf`) from `Informes/` and `server/shared-informes/`; PDFs stream as `application/pdf` for the in-browser viewer, everything else as JSON; non-admins only see filenames listed in `JUNTA_INFORMES_VISIBLES`

## Documentation
- `Credifuturo-Web/README.md` — installation and startup guide (Spanish)
- `Informes/` — 50+ markdown files documenting architecture, past bug fixes, data migrations, and planning decisions; consult these before making structural changes
- `Informes/ARQUITECTURA_BASE_DATOS.md` — ER diagram and table-level documentation
- `RESUMEN_EJECUTIVO.md` — latest executive status summary
