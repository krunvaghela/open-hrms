# Deploying Open HRMS

Open HRMS is a pre-1.0, single-company application. The repository includes
repeatable builds and security checks; those checks do not certify an installation
as production-ready. Validate your payroll policies, access model, recovery, and
capacity before using real data. Plan a controlled pilot before a wider rollout.

## 1. Prepare the host

Use a maintained Linux server with Docker and Compose v2. Start with a monitored
single-host deployment and one API replica; capacity depends strongly on screenshot
usage. The intended 1–500 employee range has not been established by a load test.
Use encrypted storage, restrict SSH, apply OS updates, and firewall all services
except HTTPS and the administrative access you require.

Clone the repository and check out the reviewed commit you want to deploy.
Run `npm run setup` with Node.js 24 to generate unique `.env` secrets. Restrict
access to `.env` and preserve `APP_ENCRYPTION_KEY` with encrypted backups. Do not
copy example passwords or rotate the encryption key without migrating encrypted
provider settings. Changing `.env` database passwords alone does not rotate
existing PostgreSQL roles.

## 2. Complete setup before public exposure

Initially keep the Docker default `APP_ORIGIN=http://127.0.0.1:3000` and its
loopback-only port bindings. Start the stack:

```sh
docker compose up --build -d --wait
```

Use an SSH tunnel from an administrator's computer to the private server:

```sh
ssh -L 3000:127.0.0.1:3000 your-user@your-server
```

Open http://127.0.0.1:3000, create the company and first Super Admin, and configure
company details, policies, and payroll components. Confirm `/api/auth/setup`
returns `{"configured":true}`. Close the tunnel when finished. Do not publish an
unconfigured setup page, because its first visitor can become the owner.

## 3. Put HTTPS in front of the portal

Point your domain at the server and run a trusted reverse proxy on the **host**.
The supplied [Caddy example](deployment/Caddyfile.example) proxies to the default
web port. Replace the example hostname with your domain. Install and operate Caddy
using its [official deployment guidance](https://caddyserver.com/docs/running).
If your proxy is in a container, `127.0.0.1` refers to that container, so use a
private Docker network and the web service address instead.

Set `APP_ORIGIN=https://hr.example.com` in `.env`, then recreate the services:

```sh
docker compose up -d --wait
```

Use that exact origin to sign in. HTTPS enables Secure session cookies. Route all
browser traffic, including `/api`, through the portal. Do not cache API responses,
strip security headers, enable wildcard CORS, or expose PostgreSQL/API ports publicly.
Configure HSTS at the HTTPS proxy after validating certificate renewal and routing.
Keep the database port override disabled on public servers.

Verify login, logout, forced password change, employee isolation, payroll review,
SMTP test delivery, and optional desktop pairing against the HTTPS URL. Use test
accounts and non-sensitive fixtures during acceptance testing, then remove or
disable those accounts before real use.

## 4. Operate and monitor

- Monitor host disk space, memory, service restarts, HTTPS certificates, HTTP errors,
  and backup success. Alert on readiness failures using `/api/health/ready` through
  the protected service network. Liveness alone does not verify the database.
- Use log rotation. Do not export session cookies, pairing tokens, SMTP credentials,
  request bodies, screenshots, or payroll records to third-party logs.
- Maintain a documented list of Super Admins and promptly disable departed users.
  Review access and audit records. Audit data currently requires administrative
  database access; a dedicated audit-log viewer/export is not implemented.
- Keep one API replica: rate limits and retention jobs currently run in process.
  There is no high-availability deployment or managed failover configuration.
- Keep screenshots off unless needed. Document notice, access, retention, and
  employee support procedures. Active-share estimates never determine salary.
- Screenshot storage is significant: an illustrative maximum of 500 people ×
  96 images/day × 160 KB is about 7.7 GB/day before database overhead and backups.
  Measure actual usage; inactive periods suppress capture. Retention deletion does
  not necessarily return PostgreSQL filesystem space immediately.

## 5. Back up and prove recovery

Use an encrypted backup destination with restricted access and retention. For a
consistent custom-format database dump (the command runs on the Docker host):

```sh
umask 077
mkdir -p backups
docker compose exec -T postgres sh -c 'pg_dump -U postgres -d "$POSTGRES_DB" -Fc' > backups/open-hrms.dump
```

Securely preserve `.env`, the encryption key, the deployed commit, and deployment
configuration separately. Dumps contain personal and payroll data and screenshot
bytes. Screenshot deletion in the application does not purge old backups.

Restore into a **separate, disposable** installation, never over the live database:

1. Use the matching application commit and PostgreSQL major version. Create a
   separate Compose project with its own `.env`, ports, and volume. Provision its
   PostgreSQL roles by starting only `postgres` on an empty volume.
2. Restore the dump into that empty database before starting API/web:

   ```sh
   docker compose -p open-hrms-restore --env-file .env.restore exec -T postgres sh -c 'pg_restore --exit-on-error -U postgres -d "$POSTGRES_DB"' < backups/open-hrms.dump
   ```

3. Preserve the original `APP_ENCRYPTION_KEY` in the restore environment so saved
   SMTP credentials can be decrypted. Keep the restore network private and block
   outbound SMTP while testing.
4. Start API/web in that same restore project; check login, employee counts,
   published payslip totals, and expected screenshot retention/access. Rotate
   temporary restore credentials and destroy the isolated restore after review.

Record restore duration and agree recovery objectives with your organization.
A successful backup command is not a tested recovery procedure.

## 6. Upgrade and roll back

Container base images are pinned to multi-platform digests. Review Dependabot
updates to keep those digests current; pinning alone does not provide security patches.
Read changes, migrations, security alerts, and release notes. Back up first. Build
and test the new commit against an isolated restored database before maintenance.
Deploy with `docker compose up --build -d --wait` and verify readiness and key flows.
Migrations run transactionally under an advisory lock at API startup.

Do not assume an old application can use a newly migrated schema. For incompatible
changes, rollback means restoring the pre-upgrade backup with its matching commit
and encryption key. That loses writes made since the backup; plan the maintenance
window and recovery process accordingly. Never use `docker compose down -v` on
an installation whose data you intend to keep.

## Remaining release gates

Before broad production rollout: independent security review; real workload/load
and recovery tests; organization-specific payroll validation; MFA/SSO and account
recovery planning; operational alerting; and signed/notarized desktop installers
with Windows/macOS/Linux permission testing. See [SECURITY.md](../SECURITY.md) and
[desktop limitations](../desktop/README.md). No statutory payroll certification,
automatic tax filing, multi-company isolation, or production support SLA is claimed.
