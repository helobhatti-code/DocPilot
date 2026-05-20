# DocPilot — Document & Compliance Operations

Previously known as GPMS — Gate Pass Management System.

Multi-tenant SaaS for managing airport security gate passes (NestJS API + React/Vite web).
Built with strict tenant isolation (Postgres RLS + Prisma middleware), Bull/Redis
job queues, JWT auth, and an admin UI for the full pass lifecycle.

```
apps/
├── api/                    # NestJS 10 + Prisma + PostgreSQL + Bull
│   ├── prisma/             # schema, migrations (incl. RLS), seed
│   └── src/
│       ├── common/         # guards, decorators, filters, prisma service
│       ├── config/         # env config + types
│       └── modules/
│           ├── auth/                  login, refresh, invitation flows
│           ├── audit-logs/            search + xlsx export
│           ├── gate-passes/           CRUD, lifecycle, custody, retention,
│           │                          bulk-ops, bulk-import, handover-pdf
│           ├── jobs/                  expiry, retention, overdue cron
│           ├── notifications/         engine, templates, email queue
│           ├── reference/             airports, zones lookup
│           ├── reports/               JSON + xlsx exports
│           ├── role-permissions/      per-role feature toggles
│           ├── staff/                 directory, photos, offboarding
│           ├── subcontractor-orgs/    contractor companies
│           ├── tenants/               profile, pass-config (admin)
│           ├── uploads/               JPEG/PDF compress (sharp/pdf-lib)
│           └── users/                 invite, list, preferences
└── web/                    # React 18 + Vite + Tailwind + React Query
    └── src/
        ├── components/     reusable UI (DataTable, Skeleton, ErrorBoundary…)
        ├── lib/            api client, hooks, types, constants
        ├── pages/          dashboard, passes, staff, reports, system/*
        └── store/          Zustand auth + theme
```

---

## Quick start (Docker)

The fastest path to a fully running system — Postgres, Redis, API, and Web.

```bash
git clone <repo> gpms && cd gpms
cp .env.example .env

# Replace JWT secrets (REQUIRED for any non-trivial use)
sed -i "s/change-me-access/$(openssl rand -hex 64)/" .env
sed -i "s/change-me-refresh/$(openssl rand -hex 64)/" .env

docker compose up --build -d
docker compose exec api npx --prefix apps/api prisma migrate deploy
docker compose exec api npm run prisma:seed:prod --workspace=apps/api
```

| Service        | URL                                        |
| -------------- | ------------------------------------------ |
| Web (nginx)    | http://localhost:8080                      |
| API            | http://localhost:3000/api/v1               |
| Swagger UI     | http://localhost:3000/docs                 |
| Postgres       | localhost:5432 (db `gpms`, user `postgres`)|
| Redis          | localhost:6379                             |

Default login: `admin@gpms.com` / `123@gpms` (override via `SEED_*` env vars).

---

## Local development (non-Docker)

```bash
# 1. Database & Redis (or use docker for these only)
docker compose up -d postgres redis

# 2. Configure
cp .env.example .env             # edit DB url, JWT secrets

# 3. Install workspaces and apply migrations
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed

# 4. Run API and Web in two terminals
npm run dev                      # API on http://localhost:3000
npm run dev:web                  # Web on http://localhost:5173
```

---

## Multi-tenancy model

1. **JWT** carries `tenantId`. The `TenantGuard` extracts it into AsyncLocalStorage.
2. **Prisma middleware** in `PrismaService` auto-injects `tenant_id` on every
   write and AND-filters every read for tenant-scoped models.
3. **Postgres RLS** policies (see `apps/api/prisma/migrations/0001_init_rls`)
   enforce tenant isolation at the database level. The session GUC
   `app.tenant_id` is set per-request; system jobs / super-admin paths use
   `app.bypass_rls`.
4. SUPER_ADMIN can operate cross-tenant via the `x-tenant-id` header.

---

## API surface

| Domain              | Routes                                                                  |
| ------------------- | ----------------------------------------------------------------------- |
| Auth                | `/auth/login` (5/min), `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/setup-account` |
| Users               | `/users/invite`, `/users`, `/users/:id`, `/users/me/preferences`        |
| Tenants             | `/tenants` (super), `/tenants/me`, `/tenants/me/profile`, `/tenants/me/pass-config`, `/tenants/me/retention*` |
| Gate Passes         | `/gate-passes` (CRUD), `/gate-passes/import/{template,preview}`, `/gate-passes/import` |
| Lifecycle           | `/gate-passes/:id/{renewal,cancellation}`, `/gate-passes/bulk/{renew,cancel,custody}` |
| Custody             | `/gate-passes/:id/custody/{deliver,return,surrender}`                   |
| Subcontractor Orgs  | `/subcontractor-orgs`                                                   |
| Staff               | `/staff`                                                                |
| Uploads             | `/uploads` (JPEG/PDF, 2MB max, server-side compression)                 |
| Role Permissions    | `/role-permissions` (GET, PATCH bulk)                                   |
| Notifications       | `/notifications`, `/notifications/recent`, `/notification-templates`    |
| Audit Logs          | `/audit-logs`, `/audit-logs/export`                                     |
| Reports             | `/reports/{by-airport,by-status,...}` + `/reports/export`               |
| Reference           | `/reference/airports`, `/reference/zones`                               |

Full Swagger UI lives at `/docs`.

---

## Scheduled jobs (Bull/Redis)

| Cron        | Job              | Purpose                                                |
| ----------- | ---------------- | ------------------------------------------------------ |
| `0 1 * * *` | expiry-sweep     | Bumps pass status to EXPIRY_30/15/7/EXPIRED + notifies |
| `0 2 * * *` | retention-sweep  | Schedules data deletion per tenant retention policy    |
| `0 3 * * *` | overdue-sweep    | Flags passes overdue for authority handover            |

---

## Bulk Import format

`Bulk Import` (web → Passes → Bulk Import) accepts an .xlsx with headers:

`S/N · Company Name · Name · Gatepass No. · Org · Dep · <zone columns> · Issue Date · Exp Date · Pass Status · Pass Is With · Airport`

Zone columns are any subset of: `AP, AR, CO, TT, AT, BS, TW, PX, CT, GW, EYE,
BHS, CBP, BHS_CBP, PA, FF, TL`. Mark `Y`, `X`, `1`, `Yes`, or `✓` to enable a
zone for a row. Download the empty template from the page or `GET
/gate-passes/import/template`.

The `import/preview` endpoint validates without writing; `import` commits the
rows you flagged ok. Duplicate-pass-number conflicts (intra-file or vs.
existing rows) are reported per-row with row numbers.

---

## Security

- JWT access (15m) + refresh (7d) with rotation
- bcrypt 12-round password hashing
- Helmet (with cross-origin resource policy for uploads), throttler
  (default **120/min/IP**, **5/min on `/auth/*`**)
- CORS via `CORS_ORIGIN` env (comma-separated allow-list, or `*`)
- `class-validator` strict whitelist + `forbidNonWhitelisted` on all DTOs
- Magic-byte file sniffing on uploads (rejects spoofed MIME)
- Audit interceptor logs every mutating request with redacted payloads
- `pino` structured logging with secret redaction
- Postgres RLS as defense-in-depth

---

## Backups

```bash
# Manual
./scripts/backup.sh

# Daily at 02:30 (cron)
30 2 * * * /opt/gpms/scripts/backup.sh >> /var/log/gpms-backup.log 2>&1
```

Dumps Postgres + tar's the uploads dir into `BACKUP_DIR/<timestamp>/`. Old
backups beyond `BACKUP_RETENTION_DAYS` (default 30) are pruned.

---

## Production notes

- Always replace `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (`openssl rand -hex 64`).
- Set `CORS_ORIGIN` to your real domain(s).
- Behind a TLS terminator (CloudFront, ALB, nginx) — the `web` service listens on
  HTTP/80 and proxies `/api/` to the api service.
- Set `PUBLIC_BASE_URL` to the externally-resolvable URL so generated upload URLs
  point at the public hostname.
- Run `npx prisma migrate deploy` (not `migrate dev`) on every release.
- Volumes that must persist: `postgres_data`, `redis_data`, `api_uploads`.
- Health probes: API `/api/v1/reference/airports`, Web `/`.

---

## Tests

```bash
npm test --workspace=apps/api
```

Service-level Jest specs cover: gate-pass create/list, custody transitions,
renewal/cancellation eligibility, retention preview & purge, handover PDF
generation.

---

## License

Proprietary. © 2026 UpTown Technical Service LLC.
