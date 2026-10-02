# Product screenshots

These are real browser captures of Open HRMS populated with fictional identities
and illustrative salaries in a disposable database. They contain no company data,
real credentials, or employee desktop captures. Names and amounts are examples.

Regenerate from the repository root after building the current Docker images:

```sh
npm ci
npm run setup
docker compose build
npx playwright install chromium
npm run docs:screenshots
```

The script provisions its own company, captures the login, overview, employee
directory, salary roster, and leave pages, then removes only its temporary Compose
project and database. It uses ports 3100/4100, so do not run alongside browser tests.
Review every image before committing. Dates reflect the capture time, and the
salary roster shows the previous month. The demo explicitly uses paid missing
attendance to illustrate a complete salary roster; choose your own policy.
