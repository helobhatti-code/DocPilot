/**
 * seed-on-start.ts
 * Runs `prisma migrate deploy` then seeds the database when SEED_ON_START=true.
 * All seed writes share one transaction with SET LOCAL app.bypass_rls = 'on'
 * so PostgreSQL RLS never blocks the inserts.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { defaultPermissions } from './seed-data/role-permissions';
import { DEFAULT_TEMPLATES } from './seed-data/notification-templates';

const BCRYPT_ROUNDS = 12;

export async function seedOnStart(): Promise<void> {
  if (process.env.SEED_ON_START !== 'true') return;

  // ── 1. Run pending migrations ────────────────────────────────────────────
  try {
    // Schema lives two levels up from dist/src/
    const schema = path.resolve(__dirname, '../../prisma/schema.prisma');
    // Prisma binary: hoisted to workspace root node_modules or local
    const bin =
      path.resolve(__dirname, '../../../../node_modules/.bin/prisma');
    execSync(`"${bin}" migrate deploy --schema="${schema}"`, {
      stdio: 'inherit',
      env: process.env,
    });
    console.log('[migrate] Migrations applied');
  } catch (err) {
    console.error('[migrate] Migration step failed (continuing):', (err as Error).message);
  }

  // ── 2. Seed initial data ─────────────────────────────────────────────────
  const prisma = new PrismaClient();
  try {
    const tenantName   = process.env.SEED_TENANT_NAME   ?? 'UpTown Technical Service LLC';
    const adminEmail   = (process.env.SEED_ADMIN_EMAIL  ?? 'admin@docpilot.com').toLowerCase();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '123@gpms';
    const passwordHash  = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

    // Wrap everything in one transaction so SET LOCAL bypass_rls applies to
    // every query on the same connection — no RLS blocking.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.bypass_rls = 'on'`);

      const tenant = await tx.tenant.upsert({
        where: { id: '00000000-0000-0000-0000-000000000001' },
        create: {
          id: '00000000-0000-0000-0000-000000000001',
          name: tenantName,
          settings: { retention_period_days: 30, pass_validity_months: 6 },
        },
        update: { name: tenantName },
      });
      console.log(`[seed] Tenant: ${tenant.name} (${tenant.id})`);

      const admin = await tx.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
        create: {
          tenantId: tenant.id,
          email: adminEmail,
          passwordHash,
          name: 'DocPilot Administrator',
          role: UserRole.SUPER_ADMIN,
          isActive: true,
        },
        update: { passwordHash },
      });
      console.log(`[seed] Admin: ${admin.email}`);

      // DocPilot branding — legacy admin@gpms.com kept for backward-compat when SEED_LEGACY_USER=true
      if (process.env.SEED_LEGACY_USER === 'true') {
        const legacyEmail = 'admin@gpms.com';
        await tx.user.upsert({
          where: { tenantId_email: { tenantId: tenant.id, email: legacyEmail } },
          create: {
            tenantId: tenant.id,
            email: legacyEmail,
            passwordHash,
            name: 'DocPilot Administrator (legacy)',
            role: UserRole.SUPER_ADMIN,
            isActive: true,
          },
          update: { passwordHash },
        });
        console.log(`[seed] Legacy admin: ${legacyEmail}`);
      }

      const rows = defaultPermissions();
      for (const row of rows) {
        await tx.rolePermission.upsert({
          where: {
            tenantId_role_module_feature: {
              tenantId: tenant.id,
              role: row.role,
              module: row.module,
              feature: row.feature,
            },
          },
          create: {
            tenantId: tenant.id,
            role: row.role,
            module: row.module,
            feature: row.feature,
            isEnabled: row.isEnabled,
          },
          update: { isEnabled: row.isEnabled },
        });
      }
      console.log(`[seed] ${rows.length} role permissions seeded`);

      for (const t of DEFAULT_TEMPLATES) {
        await tx.notificationTemplate.upsert({
          where: { tenantId_type: { tenantId: tenant.id, type: t.type } },
          create: {
            tenantId: tenant.id,
            type: t.type,
            subjectTemplate: t.subjectTemplate,
            bodyTemplate: t.bodyTemplate,
          },
          update: {},
        });
      }
      console.log(`[seed] ${DEFAULT_TEMPLATES.length} notification templates seeded`);
    });

    console.log('[seed] Done.');
  } catch (err) {
    console.error('[seed] Seed failed — continuing startup anyway:', err);
  } finally {
    await prisma.$disconnect();
  }
}
