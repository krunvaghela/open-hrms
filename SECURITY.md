# Security policy

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/krunvaghela/open-hrms/security/advisories/new).
Include the affected commit, a minimal reproduction with fictional data, impact,
and any suggested fix. Never post credentials, employee data, payroll records,
pairing tokens, or desktop captures in a public issue. Do not test installations
that you do not own or have permission to assess.

The maintainer is [@krunvaghela](https://github.com/krunvaghela). This is a community
project without a guaranteed security-response SLA. Reports are triaged privately;
confirmed fixes and advisories will be published through GitHub Security Advisories.
If private reporting is unavailable, use the maintainer's public profile contact
information to request a private reporting channel without including exploit details.

## Supported code

Security fixes target the latest `main` branch. This project is pre-1.0; there is
no LTS branch or supported backport schedule yet. Pin a reviewed commit in your
installation, monitor advisories, and test updates before rollout. No independent
penetration test or production certification is claimed.

## Security controls and checks

- Server-side roles and employee ownership checks; hashed session and device tokens.
- Scrypt password hashing; forced changes for temporary passwords; session revocation.
- HttpOnly, SameSite cookies; Secure cookies when `APP_ORIGIN` uses HTTPS.
- Origin and request-header checks on mutations; request throttling and body limits.
- AES-256-GCM encryption for stored SMTP credentials; non-root application containers.
- Explicit employee-controlled tracking; scoped device pairing; protected screenshot access.
- CI authorization/payroll tests, CodeQL, dependency review, dependency audits,
  GitHub secret scanning/push protection, and OpenSSF Scorecard.

[OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/krunvaghela/open-hrms)
evaluates repository and software supply-chain practices. Its numeric score is
not a product penetration test or a guarantee of confidentiality, payroll accuracy,
or deployment security. A passing dependency audit only means the checked advisory
database reported no findings at that time. Review individual workflow findings.

## Deployment boundary

Read the [deployment guide](docs/DEPLOYMENT.md) before handling real company data.
One installation serves one company. PostgreSQL, database backups, and the server
administrator are inside the trust boundary. Database payroll and screenshots are
not application-level encrypted; use encrypted disks and encrypted backups.
Tracking permission notices do not replace your organization's employee policies.

Known gaps include MFA/SSO, self-service password recovery, managed key rotation,
and signed desktop releases. Rate limiting is in process, so multiple API replicas
would require shared rate-limit storage. Use one API replica for this release.
Do not expose an unconfigured installation: first-time setup creates its owner.
