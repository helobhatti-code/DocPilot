import { Body, Controller, Get, Injectable, Logger, Module, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsString, ValidateNested } from 'class-validator';
import { NotificationType, Prisma, UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEngine } from '@/modules/notifications/notification-engine.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { defaultPermissions } from '@/seed-data/role-permissions';

class PermissionUpdate {
  @ApiProperty({ enum: UserRole }) @IsEnum(UserRole) role!: UserRole;
  @ApiProperty() @IsString() module!: string;
  @ApiProperty() @IsString() feature!: string;
  @ApiProperty() @IsBoolean() isEnabled!: boolean;
}

class BulkUpdatePermissionsDto {
  @ApiProperty({ type: [PermissionUpdate] })
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PermissionUpdate)
  updates!: PermissionUpdate[];
}

@Injectable()
class RolePermissionsService {
  private readonly logger = new Logger(RolePermissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationEngine,
  ) {}

  async list(actor: AuthUser) {
    // Self-heal: tenants provisioned before the seeding fix have no
    // RolePermission rows. Seed defaults on demand so the toggle UI is
    // never blank, then return the freshly seeded rows.
    const existing = await this.prisma.rolePermission.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ role: 'asc' }, { module: 'asc' }, { feature: 'asc' }],
    });
    if (existing.length > 0) return existing;

    this.logger.warn(`Tenant ${actor.tenantId} has no RolePermission rows — seeding defaults`);
    await seedDefaultPermissions(this.prisma, actor.tenantId);
    return this.prisma.rolePermission.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ role: 'asc' }, { module: 'asc' }, { feature: 'asc' }],
    });
  }

  async bulkUpdate(actor: AuthUser, dto: BulkUpdatePermissionsDto) {
    const result = await this.prisma.$transaction(
      dto.updates.map((u) =>
        this.prisma.rolePermission.upsert({
          where: {
            tenantId_role_module_feature: {
              tenantId: actor.tenantId,
              role: u.role,
              module: u.module,
              feature: u.feature,
            },
          },
          // tenantId injected by PrismaService middleware
          create: {
            role: u.role,
            module: u.module,
            feature: u.feature,
            isEnabled: u.isEnabled,
            updatedById: actor.id,
          } as unknown as Prisma.RolePermissionUncheckedCreateInput,
          update: { isEnabled: u.isEnabled, updatedById: actor.id },
        }),
      ),
    );

    // Notify every active user whose role's permissions just changed.
    const affectedRoles = Array.from(new Set(dto.updates.map((u) => u.role)));
    const affectedUsers = await this.prisma.user.findMany({
      where: { tenantId: actor.tenantId, isActive: true, role: { in: affectedRoles } },
      select: { id: true },
    });
    const actorRow = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    if (affectedUsers.length > 0) {
      this.notifications
        .dispatch({
          tenantId: actor.tenantId,
          type: NotificationType.PERMISSION_CHANGE,
          userIds: affectedUsers.map((u) => u.id),
          variables: { actor: actorRow?.name ?? 'system' },
        })
        .catch(() => undefined);
    }

    return result;
  }
}

@ApiTags('role-permissions')
@ApiBearerAuth()
@Controller('role-permissions')
@UseGuards(TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
class RolePermissionsController {
  constructor(private readonly svc: RolePermissionsService) {}

  @Get() list(@CurrentUser() actor: AuthUser) { return this.svc.list(actor); }

  @Patch()
  bulkUpdate(@CurrentUser() actor: AuthUser, @Body() dto: BulkUpdatePermissionsDto) {
    return this.svc.bulkUpdate(actor, dto);
  }
}

/**
 * Seed the canonical default permission matrix for a tenant. Idempotent —
 * uses upsert so callers can re-run safely. Exported so tenants.service can
 * call it during provisioning, and list() can call it for self-heal.
 */
export async function seedDefaultPermissions(prisma: PrismaService, tenantId: string) {
  const rows = defaultPermissions();
  // runUnscoped so this works even when called from a SUPER_ADMIN request
  // whose AsyncLocalStorage tenant context doesn't match the target tenant.
  await prisma.runUnscoped(async (tx) => {
    for (const row of rows) {
      await tx.rolePermission.upsert({
        where: {
          tenantId_role_module_feature: {
            tenantId,
            role: row.role,
            module: row.module,
            feature: row.feature,
          },
        },
        create: {
          tenantId,
          role: row.role,
          module: row.module,
          feature: row.feature,
          isEnabled: row.isEnabled,
        },
        update: { isEnabled: row.isEnabled },
      });
    }
  });
}

@Module({
  imports: [NotificationsModule],
  controllers: [RolePermissionsController],
  providers: [RolePermissionsService],
  exports: [RolePermissionsService],
})
export class RolePermissionsModule {}
