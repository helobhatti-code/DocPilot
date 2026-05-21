/**
 * Self-healing for Prisma's _prisma_migrations table.
 *
 * If a previous deploy hit an error mid-migration, Prisma marks the row as
 * "failed" (finished_at IS NULL AND rolled_back_at IS NULL) and refuses to
 * apply any further migrations until the failed row is resolved (error P3009).
 *
 * Because Render free-tier deploys can't be fixed via shell access, this
 * script runs before `prisma migrate deploy` on every boot and:
 *   - Finds any failed rows in _prisma_migrations.
 *   - Marks each as rolled-back so `migrate deploy` re-applies them.
 *   - Idempotent: no-op when no failures exist (the common path).
 *
 * The migrations themselves must be written idempotently (CREATE … IF NOT
 * EXISTS, DO $$ BEGIN … EXCEPTION WHEN duplicate_object …, etc.) so re-running
 * them is safe. This repo's 0009/0011 migrations already follow that pattern.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[heal-prisma-migrations] DATABASE_URL not set — skipping.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const failed = await prisma.$queryRawUnsafe(
      `SELECT id, migration_name
         FROM _prisma_migrations
        WHERE finished_at IS NULL
          AND rolled_back_at IS NULL`
    );

    if (!Array.isArray(failed) || failed.length === 0) {
      console.log('[heal-prisma-migrations] No failed migrations — nothing to do.');
      return;
    }

    for (const row of failed) {
      console.log(
        `[heal-prisma-migrations] Removing failed bookkeeping row for '${row.migration_name}' so prisma migrate deploy will re-apply it from scratch.`
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM _prisma_migrations WHERE id = $1`,
        row.id
      );
    }
    console.log(`[heal-prisma-migrations] Healed ${failed.length} failed migration(s). prisma migrate deploy will now retry them.`);
  } catch (err) {
    // _prisma_migrations may not exist on a brand-new database; that's fine —
    // prisma migrate deploy will create it. Don't fail the deploy here.
    const msg = err && err.message ? err.message : String(err);
    if (/_prisma_migrations.+does not exist/i.test(msg)) {
      console.log('[heal-prisma-migrations] _prisma_migrations table not present yet — nothing to heal.');
    } else {
      console.warn('[heal-prisma-migrations] Warning while healing migrations:', msg);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    // Never fail the deploy from this script — the subsequent `prisma migrate
    // deploy` will produce a clearer, authoritative error if something is
    // actually wrong.
    console.warn('[heal-prisma-migrations] Unexpected error (continuing):', e && e.message ? e.message : e);
    process.exit(0);
  });
