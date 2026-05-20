# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DocPilot (internal name: GPMS — Gate Pass Management System) is a multi-tenant SaaS platform for managing airport security gate passes. Built with NestJS (backend), React/Vite (frontend), PostgreSQL (Prisma ORM), and Redis (Bull job queue).

## Commands

### Root (monorepo)
```bash
npm run dev              # Start API in watch mode (port 3000)
npm run dev:web          # Start Vite dev server (port 5173)
npm run build            # Build both API and web
npm run lint             # Lint both workspaces
npm run prisma:generate  # Regenerate Prisma client after schema changes
npm run prisma:migrate   # Create and apply a DB migration
npm run prisma:seed      # Seed reference data
```

### API only (`apps/api`)
```bash
npm test                 # Run Jest tests
npm test -- --testPathPattern=gate-passes  # Run a single test file
npm run start:prod       # Run compiled API (after build)
```

### Web only (`apps/web`)
```bash
npm run preview          # Serve built dist/ locally
```

### Docker
```bash
docker compose up -d     # Start all services (Postgres, Redis, API, Web/Nginx on :8080)
docker compose down -v   # Stop and remove volumes
```

API Swagger docs available at `http://localhost:3000/docs` when running.

## Architecture

### Multi-Tenancy (Critical to understand)

Every tenant-scoped model (`User`, `Staff`, `GatePass`, etc.) carries `tenant_id`. Isolation is enforced at two layers:

1. **Prisma middleware** (`apps/api/src/common/prisma/prisma.service.ts`) — auto-injects `tenant_id` on `create` and filters all reads. It also converts `findUnique` → `findFirst` so `AND [tenant_id]` clauses can be appended safely.
2. **Postgres RLS** — migrations set up row-level security; the session GUC `app.tenant_id` is set per-request. Super-admin sets `app.bypass_rls = 'on'` for cross-tenant operations.

JWT payload carries `tenantId`; `TenantGuard` extracts it into `AsyncLocalStorage` (`apps/api/src/common/context/`). `TenantContextInterceptor` must be registered before all other interceptors in `app.module.ts` so Prisma middleware inherits the correct context.

### Request Lifecycle (API)

`GlobalExceptionFilter` → `ThrottlerGuard` (120 req/min, 10 req/min on `/auth/*`) → `JwtAuthGuard` → `TenantGuard` → `RolesGuard` / `PermissionsGuard` → `AuditInterceptor` (logs all POST/PATCH/DELETE) → controller → Prisma middleware (tenant injection + RLS GUC).

### Gate Pass Status Engine

The core domain. Passes move through a defined state machine:

- **Expiry path**: `VALID` → `EXPIRY_30` → `EXPIRY_15` → `EXPIRY_7` → `EXPIRED`
- **Renewal path**: `RENEWAL_REQUESTED` → `RENEWAL_APPROVED` / `RENEWAL_REJECTED` → `RENEWED`
- **Cancellation path**: `CANCELLATION_REQUESTED` → `CANCELLATION_APPROVED` → `CANCELLED`

Custody transitions: `WITH_COMPANY` → `WITH_PERSON` → `RETURNED` → `SURRENDERED`

Background jobs (`apps/api/src/modules/jobs/`, Bull/Redis, Asia/Dubai TZ):
- `expiry-sweep` at 01:00 — batch-transitions status, 500 rows/batch
- `retention-purge` at 03:00 — deletes passes per tenant retention policy (warns 7 days before)
- `overdue-sweep` at 03:30 — flags cancellations overdue for authority handover (>7 days)

If Redis is unavailable at boot, the API starts but jobs are disabled (graceful degradation).

### File Uploads

`apps/api/src/modules/uploads/` — validates MIME by magic-byte sniffing (not extension), compresses with Sharp (JPEG/PNG) or pdf-lib (PDF), enforces 2MB max. Stored in the `uploads/` volume. URLs constructed via `PUBLIC_BASE_URL` env var.

### Frontend State

- **Zustand** (`apps/web/src/store/auth.ts`) — tokens, user, impersonation session
- **React Query** — all server state; 30s stale time, exponential backoff
- **Axios** (`apps/web/src/lib/api.ts`) — JWT access/refresh interceptor handles 401 → token refresh → retry
- All pages are lazy-loaded via `React.lazy` in `App.tsx`

### Role & Permission System

Roles: `SUPER_ADMIN`, `ADMIN`, `PM`, `HR`, `SECRETARY`, `VIEWER`, `SUBCONTRACTOR`. Per-tenant, per-role feature toggles live in `RolePermission` table. Super-admin can impersonate any tenant session via `x-tenant-id` header.

## Key Files

| File | Purpose |
|---|---|
| `apps/api/prisma/schema.prisma` | Full data model and enums |
| `apps/api/src/common/prisma/prisma.service.ts` | Tenant injection + RLS middleware |
| `apps/api/src/common/context/` | AsyncLocalStorage tenant context |
| `apps/api/src/modules/gate-passes/` | Core domain: CRUD, lifecycle, custody, PDF, bulk import |
| `apps/api/src/modules/jobs/` | Bull queue definitions and scheduled jobs |
| `apps/api/src/config/configuration.ts` | All env vars typed as `AppConfig` |
| `apps/web/src/lib/api.ts` | Axios instance with JWT refresh logic |
| `apps/web/src/lib/types.ts` | Shared TypeScript interfaces |
| `apps/web/src/App.tsx` | All route definitions |

## Environment Variables

Required for local dev (copy `.env.example` → `.env`):
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate with `openssl rand -hex 64`
- `REDIS_URL` — Redis connection (optional; jobs disabled if absent)
- `CORS_ORIGIN` — comma-separated origins or `*`
- `PUBLIC_BASE_URL` — externally resolvable base URL for file serving

For production, also set `SMTP_*` for email notifications and `NODE_ENV=production`.

## Non-Obvious Patterns

- **Bulk import preview** — `POST /gate-passes/import/preview` validates a CSV/xlsx without writing; returns per-row conflict details before a commit step.
- **Custody handover PDF** — generated on-demand with QR code, pass photo, zone list, and full custody chain.
- **Retention policy** — per-tenant setting (days or "permanent"); the purge job warns 7 days before deletion via in-app notifications.
- **Audit redaction** — `AuditInterceptor` masks `password`, `token`, and related fields in logged payloads.
- **Prisma findUnique rewrite** — middleware rewrites `findUnique` → `findFirst` globally so tenant `AND` clauses can be injected; be aware when debugging unexpected query shapes.
