**AI Agent Instructions**

Short, actionable guidance to help AI coding agents work productively in this repository.

**Purpose**: Provide quick context, commands and important paths so an agent can run, test, and modify the project safely.

**Quick Commands**:

```bash
# Run API dev (watching)
npm run dev

# Run web dev (Vite)
npm run dev:web

# Build both services
npm run build

# Run tests (API)
npm run --workspace=apps/api test

# Prisma (from repo root)
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

**Important locations**:
- **Root package.json**: package.json — workspace scripts and Node engine requirement
- **API service**: apps/api — NestJS app, Prisma schema, seed scripts, tests
- **API package.json**: apps/api/package.json — service-level scripts (`dev`, `build`, `test`, `prisma:*`)
- **Prisma schema & seeds**: apps/api/prisma/schema.prisma and apps/api/prisma/seed.ts
- **Web app**: apps/web — React + Vite frontend; scripts in apps/web/package.json
- **Docker compose**: docker-compose.yml — quick full-stack local setup (Postgres + Redis + API + Web)

**Agent conventions & guidance**:
- **Run workspace scripts**: Use the root `package.json` workspace scripts when possible so tasks run with expected hoisting.
- **Node version**: Respect `node >=20.0.0` declared in root `package.json` engines.
- **DB & seeding**: Prisma migrations, deploy and seeds live under `apps/api/prisma`. Prefer `npm run prisma:migrate` and `npm run prisma:seed` to keep behaviour consistent.
- **Docker-first quickstart**: For full environment, prefer `docker compose up --build -d` then `docker compose exec api ...` for migrations/seeds (see README.md).
- **Multitenancy & RLS**: The project uses Postgres RLS and Prisma middleware; avoid ad-hoc schema edits without reviewing `apps/api/prisma/migrations` and `apps/api/src` prisma middleware.
- **Tests**: API tests live under `apps/api/test`; run `npm run test` from `apps/api` workspace or use workspace-scoped npm script.
- **Formatting & linting**: Use `eslint` scripts in each workspace (`apps/api` and `apps/web`).

**Where to edit**:
- Backend code: `apps/api/src` (modules, guards, services)
- Frontend code: `apps/web/src` (components, pages, lib)
- Seeds & migrations: `apps/api/prisma`

**Links**
- Project README: README.md — quickstart, architecture notes, and Docker instructions
- Root package.json: package.json
- API package.json: apps/api/package.json
- Web package.json: apps/web/package.json
- Prisma schema: apps/api/prisma/schema.prisma
- Docker Compose: docker-compose.yml

**Suggested next customizations**:
- Add `.github/copilot-instructions.md` for repo-scoped policy and PR preferences.
- Create `skills/` examples for common tasks (e.g., `seed-db`, `run-tests`, `upgrade-deps`).

If you'd like, I can create the `.github/copilot-instructions.md` now or add skill-specific prompts for the API and Web workspaces.
