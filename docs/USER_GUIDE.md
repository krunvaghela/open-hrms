# Open HRMS user guide

A self-hosted HR workspace for teams worldwide, designed for 1–500 employees.
Includes company setup, role-based access, employee management, attendance, leave,
monthly salary rosters, payslips, and an optional desktop activity tracker. The
Next.js portal is backed by NestJS and PostgreSQL. Currency, timezone, workweek,
holidays, and pay components are configurable. The interface follows the supplied reference: a soft blue frame,
rounded sidebar, white cards, and blue pill controls.

## Open the application

**Web portal: <http://127.0.0.1:3000>**

On first visit, create your company and its first Super Admin account. There is
no default login or seeded password. The owner also receives an employee profile.
The setup route closes permanently once the company is created.

Requirements: Docker with Compose v2+ and Node.js 24 for the setup utility.

```sh
npm run setup
docker compose up --build -d --wait
npm run test:smoke
```

The setup command generates database passwords and an encryption key in a
permission-restricted, git-ignored `.env`. On existing installations it preserves
credentials and adds any missing web infrastructure settings. Docker installs
locked dependencies and builds both applications; local `npm install` is not
required to start the stack.

## What works

- Two-step company setup and initial Super Admin creation.
- Login/logout with HttpOnly session cookies, hashed server-side session tokens,
  eight-hour expiry, and scrypt password hashing.
- Employee profiles: department, designation, phone, joining date, employment
  type/status, reporting manager, and generated employee ID.
- Employee creation, editing, search, department/status filters, and CSV export.
- Super Admin account-role management, disabling accounts, session revocation,
  and protection of the last active Super Admin.
- Temporary passwords that must be changed before accessing company data.
- Company settings and encrypted SMTP configuration with an explicit test-email
  action. Test messages go only to the signed-in Super Admin.
- Persistent audit records for employee, account, password, and settings changes.
- Responsive layout with keyboard-accessible dialogs and mobile navigation.

- Daily check-in/out, company-local attendance dates, and reviewed corrections.
- Paid/unpaid leave types, calendar-year allowances, pending balance reservations,
  approval/rejection/cancellation, and holiday-aware working-day counts.
- Effective-dated salary structures, named earnings/deductions, monthly adjustments,
  working-day/calendar-day proration, and salary-register CSV export.
- Payroll drafts with exception checks, stale-source detection, month-end finalization,
  immutable payslip snapshots, employee downloads, and browser Print / Save PDF.
- Desktop device pairing, revocation, sampled activity reports, authenticated
  screenshot viewing, configurable retention, and a separate Electron app.

Invitations and password-reset email flows are not implemented. Administrators
create accounts with a temporary password and share it privately. There is no
seeded employee, salary, or tracking data in the main installation.

## Attendance → leave → payroll

1. Open **HR policies** as a Super Admin or Admin. Select an ISO currency, workweek,
   full/half-day minute thresholds, payroll divisor, and treatment of missing
   attendance. Configure leave types, annual allowances, and company holidays.
   Company timezone is set during setup and editable under **Settings**.
2. Open **Salary roster → Salary structures**. For each employee, enter an effective
   month and earnings/deduction components in the selected currency. Mark whether
   each component is prorated. Set the last employment date for departing staff.
   Changing a currency requires entering new salary amounts; no FX conversion occurs.
3. Employees use **Attendance** for daily check-in/out, and submit corrections for
   completed shifts. One record is supported per employee per company-local date.
   Overnight shifts (up to 24 hours) belong entirely to their check-in date. Break
   deduction, split shifts, overtime, and shift rosters are not implemented.
4. Employees request whole-day leave under **Leave management**. HR/Admins review
   requests; only Super Admins can review their own requests, with an audit record.
   Leave uses one calendar year per request, excludes non-working days/holidays,
   and reserves allowance while pending. There is no accrual, carryover, or per-person
   allowance override in this release. Existing requests retain their saved working
   dates and paid/unpaid treatment when policy changes.
5. Select a month under **Salary roster** and generate a draft. Resolve missing
   salary structures, currency mismatches, open attendance, pending requests, or
   negative net pay. Add one-off bonuses/deductions with a reason as needed.
6. Export and review the salary sheet. After the month ends, a Super Admin/Admin
   can **Finalize payroll**. Source changes since generation require recalculation
   and review. Finalized periods lock attendance, leave, holidays, and pay changes.
   Finalization publishes payslips; it does not initiate a bank payment.
7. Employees open **My payslips** to download a self-contained HTML statement or
   use **Print / Save PDF**. Published values and company details remain unchanged
   by future policy/salary changes. Finalized payroll cannot be reopened in the UI.

Prorated component = monthly component × paid days ÷ full-month divisor, rounded
per component to the currency's minor unit. Working-day mode excludes weekends
and holidays from both numerator and divisor. Calendar-day mode pays non-working
calendar days within employment dates. Approved paid/unpaid leave takes precedence
over attendance; completed attendance earns one/half/zero days according to the
configured thresholds. Missing attendance follows the configured PAID/UNPAID rule.
Non-prorated components always apply in full, including partial/zero-paid months.
Employment status and login access are not payroll exclusions: use employment dates.

Local income tax, social insurance, statutory contributions, legal payslip fields,
and filings are **not automatically calculated or certified**. Enter applicable
amounts as named components or monthly adjustments. A company uses one currency,
timezone, and work calendar at a time; simultaneous country-specific calendars,
multiple legal entities, tax jurisdictions, and multi-currency payroll require
additional modules.

## Desktop activity tracking

See [desktop setup and packaging](../desktop/README.md). Enable tracking in **HR
policies**, then employees create a five-minute, single-use pairing code under
**Work activity**. Paired device credentials expire after seven days and can be
revoked at any time. Password and account-access changes revoke paired devices.

The desktop app requires a web attendance check-in and explicit employee consent
and Start action. Activity is sampled every 30 seconds. Screenshots use the selected
display at the configured 5–60 minute interval, only during active tracking with
recent interaction. Closing/pausing, screen locking, suspend, network errors, or
loss of authorization stops collection. There is no hidden/autostart tracking,
keystroke logging, application-title collection, or offline capture queue.

Active share is a sampled computer-interaction estimate, not work quality or
employee output. It never feeds payroll. Employees see only their own records;
HR and administrators see the team. Screenshots are stored in PostgreSQL (maximum
160 KB per capture); size disk/backups for your workforce. Tracking records have
1–30 day configurable retention, enforced on reads immediately and deleted hourly.
Turning screenshots off deletes stored images. Backups have their own retention.

## Access model

| Role        | Current permissions                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| Super Admin | All employee records; all account roles; company/email/HR settings; payroll finalization               |
| Admin       | Employee records; create HR/Employee accounts; HR policies; approvals; salary/payroll and finalization |
| HR          | Employee records; create Employee accounts; approvals; salary structures and payroll drafts            |
| Employee    | Own profile, attendance, leave, published payslips, devices and activity                               |

Roles and employment profiles are separate. Admins and HR users also have their
own employee profiles. Employment status does not disable login; use **Roles &
access → Manage access** to disable an account. Role/access changes revoke existing
sessions, including your own if you modify your account.

Permissions are enforced by the API, not just by hiding controls. Mutating API
requests require `X-HRMS-Request: 1`; browser origins must match `APP_ORIGIN`. The
API does not enable cross-origin access. Browser traffic uses same-origin `/api`
requests proxied by the web service.

## Services and configuration

| Service       | Container address | Host access                                       |
| ------------- | ----------------- | ------------------------------------------------- |
| Web           | `web:3000`        | `127.0.0.1:3000`, configurable through `WEB_PORT` |
| API           | `api:4000`        | `127.0.0.1:4000`, configurable through `API_PORT` |
| PostgreSQL 18 | `postgres:5432`   | Internal by default; optional localhost port 5434 |

Only bootstrap/infrastructure settings belong in `.env`: database credentials,
ports, `APP_ORIGIN`, and `APP_ENCRYPTION_KEY`. Company details and SMTP provider
settings live in PostgreSQL and are edited in the portal. Use the exact
`APP_ORIGIN` hostname when opening the portal (default `http://127.0.0.1:3000`).
If you change the web port or public URL, update `APP_ORIGIN` as well.

SMTP passwords are encrypted with AES-256-GCM. Keep the encryption key together
with secure database backups; changing it without migrating encrypted secrets
makes saved provider passwords unreadable. Use port 587 with STARTTLS or port 465
with implicit TLS as required by your provider. TLS certificate verification stays
enabled. Outbound mail runs only after a Super Admin explicitly requests a test.

The API uses `open_hrms_app`, a database role without superuser privileges.
PostgreSQL stores data in the named `postgres_data` volume mounted at
`/var/lib/postgresql`. Rebuilds and `docker compose down` preserve it.
**`docker compose down -v` deletes the installation's database.**

The initial role-provisioning script runs only on an empty volume. Editing a
password in `.env` does not rotate the corresponding PostgreSQL role password.
Application schema changes use versioned, transactional migrations in
`apps/api/src/migrations.ts`, applied under an advisory lock at API startup.
Add new migration entries rather than editing an applied migration.

The Compose defaults are local development settings. Complete first-time setup
before exposing the installation. Public deployments need a trusted HTTPS reverse
proxy, an HTTPS `APP_ORIGIN` (which enables secure cookies), protected secrets, and
verified backup restoration. Proxy `/api` without caching or enabling broad CORS.

## Daily commands

```sh
docker compose ps
docker compose logs -f web api postgres
docker compose up --build -d --wait
docker compose down
```

- API liveness: <http://localhost:4000/api/health/live>
- Database readiness: <http://localhost:4000/api/health/ready>

Readiness executes a PostgreSQL query and returns HTTP 503 during a database
outage. Each service starts after its dependencies pass health checks. Application
containers run as non-root users.

For an administrative SQL session:

```sh
docker compose exec postgres sh -c 'psql -U postgres -d "$POSTGRES_DB"'
```

For a local SQL client:

```sh
docker compose -f compose.yaml -f compose.database.yaml up -d --wait
```

Connect to `127.0.0.1:5434`, the database named by `POSTGRES_DB`, user
`open_hrms_app`, and password from `APP_DB_PASSWORD`. The optional port mapping is
localhost-only. The API always connects through `postgres:5432`.

## Development and verification

```sh
npm ci
npm run typecheck
npm run build
npm run test:smoke
npm run test:payroll
npx playwright install chromium
npm run test:e2e
```

Build the Docker images before running the browser tests. `test:e2e` starts a
separate, uniquely named Compose project on ports 3100/4100. It creates its own
company and employees, runs the browser/API checks, then removes only that test
project and its database volume. It never seeds the main workspace. Screenshots
and failure traces are written under the ignored `test-results/` directory.
Tests include role escalation attempts, protected routes, CSRF checks, required
password changes, last-Super-Admin protection, session revocation, persistence,
SMTP error handling, employee edits, CSV export, and responsive layouts.

`npm run test:infra` briefly stops and recreates the **main local** PostgreSQL
container to test persistence and reconnection. Run it only on a disposable
development installation, never during real company use.

## Backups

```sh
mkdir -p backups
docker compose exec -T postgres sh -c 'pg_dump -U postgres -d "$POSTGRES_DB" -Fc' > backups/open-hrms.dump
```

Store backups securely along with `APP_ENCRYPTION_KEY`. Test restoration into a
separate installation with matching database roles before relying on backups.

## Layout

```text
apps/web/                 Next.js portal, Tailwind styles, Radix dialog primitives
apps/api/                 NestJS API, role guards, database migrations
apps/web/src/components/ui/ Local reusable UI primitives; shadcn-compatible config
apps/api/src/migrations.ts Versioned database schema changes
docker/postgres/           Initial database-role provisioning
scripts/                  Setup, smoke/infrastructure tests, isolated E2E runner
tests/                    Browser workflows and API authorization checks
compose.yaml              Web + API + PostgreSQL
compose.database.yaml     Optional local database port
compose.test.yaml         Image overrides for isolated tests
desktop/                 Separate Electron tracker and packaging configuration
```

## License

Licensed under the [Apache License 2.0](../LICENSE). No proprietary UI kit assets
are included.
