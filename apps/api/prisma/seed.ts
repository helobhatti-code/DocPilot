import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { defaultPermissions } from '../src/seed-data/role-permissions';
import { DEFAULT_TEMPLATES } from '../src/seed-data/notification-templates';

const prisma = new PrismaClient();

async function main() {
  const tenantName = process.env.SEED_TENANT_NAME ?? 'UpTown Technical Service LLC';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@docpilot.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '123@gpms';

  // Bypass RLS during seeding (raw SQL session GUC).
  await prisma.$executeRawUnsafe(`SET app.bypass_rls = 'on'`);

  const tenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: tenantName,
      settings: { retention_period_days: 30, pass_validity_months: 6 },
    },
    update: { name: tenantName },
  });

  console.log(`Seeded tenant: ${tenant.name} (${tenant.id})`);

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    create: {
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash,
      name: 'DocPilot Administrator',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      canAccessAllCompanies: true,
    },
    update: { passwordHash, canAccessAllCompanies: true },
  });
  console.log(`Seeded admin: ${admin.email}`);

  // DocPilot branding — legacy admin@gpms.com kept for backward-compat when SEED_LEGACY_USER=true
  if (process.env.SEED_LEGACY_USER === 'true') {
    const legacyEmail = 'admin@gpms.com';
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: legacyEmail } },
      create: {
        tenantId: tenant.id,
        email: legacyEmail,
        passwordHash,
        name: 'DocPilot Administrator (legacy)',
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        canAccessAllCompanies: true,
      },
      update: { passwordHash },
    });
    console.log(`Seeded legacy admin: ${legacyEmail}`);
  }

  // Default (MAIN) company — every tenant needs at least one company.
  const mainCompany = await prisma.company.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN' } },
    create: {
      tenantId: tenant.id,
      name: tenantName,
      code: 'MAIN',
    },
    update: {},
  });
  console.log(`Seeded company: ${mainCompany.name} (${mainCompany.id})`);

  // Backfill company_id on existing rows that don't yet have one.
  // Uses raw UPDATE so Prisma middleware (which requires request context) is bypassed.
  const [gpCount, staffCount, subCount] = await Promise.all([
    prisma.$executeRaw`
      UPDATE gate_passes
      SET company_id = ${mainCompany.id}
      WHERE tenant_id = ${tenant.id} AND company_id IS NULL`,
    prisma.$executeRaw`
      UPDATE staff
      SET company_id = ${mainCompany.id}
      WHERE tenant_id = ${tenant.id} AND company_id IS NULL`,
    prisma.$executeRaw`
      UPDATE subcontractor_orgs
      SET company_id = ${mainCompany.id}
      WHERE tenant_id = ${tenant.id} AND company_id IS NULL`,
  ]);
  console.log(
    `Backfilled company_id: gate_passes=${gpCount}, staff=${staffCount}, subcontractor_orgs=${subCount}`,
  );

  // Default role permissions matrix
  const rows = defaultPermissions();
  for (const row of rows) {
    await prisma.rolePermission.upsert({
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
  console.log(`Seeded ${rows.length} role permissions`);

  for (const t of DEFAULT_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
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
  console.log(`Seeded ${DEFAULT_TEMPLATES.length} notification templates`);

  console.log('Reference enums (zones/airports) live in Postgres — no row seed required.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
