# Contributing to Open HRMS

Bug fixes, accessibility improvements, documentation, and focused features are
welcome. Open an issue before a large change so the intended workflow can be
agreed on. Use [private security reporting](SECURITY.md) for vulnerabilities.

## Local setup

Use Node.js 24, Docker, and Docker Compose v2. From a fork or clone:

```sh
npm ci
npm run setup
docker compose up --build -d --wait
npm run test:smoke
npx playwright install chromium
```

Open http://127.0.0.1:3000 and create a development company. Never use production
credentials or employee records for development or examples. Start the separate
tracker using the [desktop instructions](desktop/README.md).

## Before submitting a pull request

```sh
npm run format:check
npm run typecheck
npm run test:payroll
npm run test:desktop
docker compose build
npm run test:e2e
npm audit --audit-level=high
npm --prefix desktop ci
npm --prefix desktop audit --audit-level=high
npm --prefix desktop run check
```

Use `npx prettier --write <changed-files>` to format changes. Browser tests use a
separate temporary database with fictional records, then delete that test stack.
Do not run `test:infra` against an installation used by a real company.

## Implementation expectations

- Enforce roles and employee ownership in the API; hidden UI is not authorization.
- Treat payroll values as integer minor units, preserve finalized snapshots, and
  test rounding, dates, timezone boundaries, and approval rules when affected.
- Add transactional migrations; do not modify migrations already shipped.
- Keep organization policies in admin settings and infrastructure secrets outside Git.
- Keep desktop tracking visible and voluntary to start; never collect while paused.
- Keep PRs focused. Explain behavior, checks, migrations, and deployment impact.
- Use fictional data for screenshots. `npm run docs:screenshots` regenerates the
  README images in an isolated installation; review them before committing.

CI checks types, formatting, domain logic, onboarding, Docker builds, browser
flows, and security findings. A maintainer reviews changes before merging. There
is no automatic merge of dependency or security updates.

## License and conduct

Contributions are licensed under [Apache-2.0](LICENSE). Only contribute code and
assets you are entitled to share. Follow the [code of conduct](CODE_OF_CONDUCT.md).
