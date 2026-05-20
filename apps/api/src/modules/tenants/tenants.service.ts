import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthService } from '@/modules/auth/auth.service';
import { DEFAULT_TEMPLATES } from '@/modules/notifications/default-templates';
import { seedDefaultPermissions } from '@/modules/role-permissions/role-permissions.module';
import {
  CreateTenantDto,
  ProvisionTenantDto,
  UpdateTenantDto,
} from './dto/tenants.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  // ── List all tenants (SUPER_ADMIN) ──────────────────────────────────
  list() {
    return this.prisma.runUnscoped((tx) =>
      tx.tenant.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  // ── Create bare tenant (no admin user) ──────────────────────────────
  async create(dto: CreateTenantDto) {
    const tenant = await this.prisma.runUnscoped((tx) =>
      tx.tenant.create({
        data: {
          name: dto.name,
          logoUrl: dto.logoUrl,
          settings: (dto.settings ?? {
            retention_period_days: 30,
            pass_validity_months: 6,
          }) as Prisma.InputJsonValue,
        },
      }),
    );
    await this.seedTenantDefaults(tenant.id);
    return tenant;
  }

  // ── Provision tenant + admin user in one step (SUPER_ADMIN) ─────────
  async provision(dto: ProvisionTenantDto) {
    const adminEmail = dto.adminEmail.toLowerCase().trim();

    // Check email not already in use
    const existing = await this.prisma.runUnscoped((tx) =>
      tx.user.findFirst({ where: { email: adminEmail }, select: { id: true } }),
    );
    if (existing) {
      throw new BadRequestException(`Email ${adminEmail} is already registered`);
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, BCRYPT_ROUNDS);

    const result = await this.prisma.runUnscoped(async (tx) => {
      // 1. Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          settings: {
            retention_period_days: 30,
            pass_validity_months: dto.passValidityMonths ?? 6,
            tier: dto.tier ?? 'STANDARD',
            staff_limit: dto.staffLimit ?? 50,
            trial_expires_at: dto.trialDays
              ? new Date(Date.now() + dto.trialDays * 86_400_000).toISOString()
              : null,
          } as Prisma.InputJsonValue,
        },
      });

      // 2. Create admin user
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: adminEmail,
          name: dto.adminName,
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
        },
      });

      return {
        tenant,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      };
    });

    // 3. Seed default role permissions + notification templates so the
    // newly-provisioned tenant's admin lands on a fully populated workspace.
    await this.seedTenantDefaults(result.tenant.id);

    return result;
  }

  // ── Seed the canonical defaults for a new (or existing) tenant ──────
  private async seedTenantDefaults(tenantId: string) {
    await seedDefaultPermissions(this.prisma, tenantId);
    await this.prisma.runUnscoped(async (tx) => {
      for (const t of DEFAULT_TEMPLATES) {
        await tx.notificationTemplate.upsert({
          where: { tenantId_type: { tenantId, type: t.type } },
          create: {
            tenantId,
            type: t.type,
            subjectTemplate: t.subjectTemplate,
            bodyTemplate: t.bodyTemplate,
          },
          update: {},
        });
      }
    });
  }

  // ── Update tenant ────────────────────────────────────────────────────
  async update(id: string, dto: UpdateTenantDto) {
    return this.prisma.runUnscoped(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id } });
      if (!t) throw new NotFoundException('Tenant not found');
      return tx.tenant.update({
        where: { id },
        data: {
          ...dto,
          settings: dto.settings ? (dto.settings as Prisma.InputJsonValue) : undefined,
        },
      });
    });
  }

  // ── Toggle tenant active/inactive ────────────────────────────────────
  async toggleStatus(id: string) {
    return this.prisma.runUnscoped(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id }, select: { id: true, isActive: true } });
      if (!t) throw new NotFoundException('Tenant not found');
      return tx.tenant.update({
        where: { id },
        data: { isActive: !t.isActive },
        select: { id: true, name: true, isActive: true },
      });
    });
  }

  // ── Per-tenant stats ─────────────────────────────────────────────────
  async stats(id: string) {
    return this.prisma.runUnscoped(async (tx) => {
      const [users, staff, gatePasses, active, expired] = await Promise.all([
        tx.user.count({ where: { tenantId: id } }),
        tx.staff.count({ where: { tenantId: id } }),
        tx.gatePass.count({ where: { tenantId: id } }),
        tx.gatePass.count({ where: { tenantId: id, status: 'VALID' } }),
        tx.gatePass.count({ where: { tenantId: id, status: 'EXPIRED' } }),
      ]);
      return { users, staff, gatePasses, active, expired };
    });
  }

  // ── Impersonate a tenant (SUPER_ADMIN → tenant admin session) ────────
  async impersonate(tenantId: string, actorId: string) {
    const tenant = await this.prisma.runUnscoped((tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, isActive: true } }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');

    // Find the first active ADMIN in this tenant
    const adminUser = await this.prisma.runUnscoped((tx) =>
      tx.user.findFirst({
        where: { tenantId, isActive: true, role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, tenantId: true, email: true, role: true, name: true },
      }),
    );
    if (!adminUser) throw new NotFoundException('No active admin found for this tenant');

    // Audit the impersonation
    await this.prisma.runUnscoped((tx) =>
      tx.auditLog.create({
        data: {
          tenantId,
          userId: actorId,
          action: 'IMPERSONATE',
          entityType: 'Tenant',
          entityId: tenantId,
          details: { impersonatedUserId: adminUser.id, impersonatedEmail: adminUser.email } as Prisma.InputJsonValue,
        },
      }),
    );

    // Issue short-lived tokens (1 hour access, 2 hour refresh)
    const tokens = await this.auth.issueTokens(
      adminUser.id,
      adminUser.tenantId,
      adminUser.role,
      adminUser.email,
    );

    return {
      ...tokens,
      user: {
        id: adminUser.id,
        tenantId: adminUser.tenantId,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
        themePreference: 'DARK',
        subcontractorOrgId: null,
      },
      impersonatedTenant: tenant.name,
    };
  }

  // ── Platform-wide stats (SUPER_ADMIN dashboard) ───────────────────────
  async platformStats() {
    return this.prisma.runUnscoped(async (tx) => {
      const [totalTenants, activeTenants, totalUsers, totalStaff, totalPasses] =
        await Promise.all([
          tx.tenant.count(),
          tx.tenant.count({ where: { isActive: true } }),
          tx.user.count(),
          tx.staff.count(),
          tx.gatePass.count(),
        ]);
      return { totalTenants, activeTenants, totalUsers, totalStaff, totalPasses };
    });
  }
}
