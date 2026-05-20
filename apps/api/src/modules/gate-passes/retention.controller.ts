import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Prisma, UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RetentionService } from './retention.service';

class ExtendRetentionDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  @Type(() => Number)
  days!: number;
}

class UpdateTenantRetentionDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 14, 30, 60, 90, 180, 365])
  retentionPeriodDays?: number;

  @IsOptional()
  @IsIn(['permanent'])
  retentionPeriod?: 'permanent';
}

class PreviewRetentionQuery {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 14, 30, 60, 90, 180, 365])
  days?: number;

  @IsOptional()
  @IsIn(['permanent'])
  permanent?: 'permanent';
}

@ApiTags('retention')
@ApiBearerAuth()
@Controller()
@UseGuards(TenantGuard, RolesGuard)
export class RetentionController {
  constructor(
    private readonly retention: RetentionService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- per-pass admin operations ---------------------------------------

  @Post('gate-passes/:id/retention/extend')
  @ApiOperation({ summary: 'Extend retention by N days for a CANCELLED pass' })
  @Roles(UserRole.ADMIN)
  extend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendRetentionDto,
  ) {
    return this.retention.extend(user, id, dto.days);
  }

  @Post('gate-passes/:id/retention/permanent')
  @ApiOperation({ summary: 'Mark a CANCELLED pass as permanently retained' })
  @Roles(UserRole.ADMIN)
  permanent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.retention.makePermanent(user, id);
  }

  @Post('gate-passes/:id/retention/purge')
  @ApiOperation({ summary: 'Purge a CANCELLED pass immediately' })
  @Roles(UserRole.ADMIN)
  purge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.retention.purgeNow(user, id);
  }

  // ---- tenant-wide settings --------------------------------------------

  @Get('tenants/me/retention')
  @ApiOperation({ summary: 'Read the tenant retention setting' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  async getRetention(@CurrentUser() user: AuthUser) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { settings: true },
    });
    return {
      retention: RetentionService.parseRetentionSetting(t?.settings),
      options: RetentionService.RETENTION_OPTIONS,
    };
  }

  @Patch('tenants/me/retention')
  @ApiOperation({ summary: 'Update the tenant retention setting' })
  @Roles(UserRole.ADMIN)
  async updateRetention(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTenantRetentionDto,
  ) {
    const value: number | 'permanent' =
      dto.retentionPeriod === 'permanent' ? 'permanent' : (dto.retentionPeriodDays as number);

    if (value === undefined) {
      throw new Error('Either retentionPeriodDays or retentionPeriod must be provided');
    }

    const t = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { settings: true },
    });
    const current = (t?.settings ?? {}) as Record<string, unknown>;
    const next = { ...current, retention_period_days: value };

    return this.prisma.runUnscoped(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: user.tenantId },
        data: { settings: next as Prisma.InputJsonValue },
        select: { id: true, settings: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'TENANT_RETENTION_UPDATED',
          entityType: 'Tenant',
          entityId: user.tenantId,
          details: {
            previous: current.retention_period_days ?? null,
            current: value,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return {
        retention: RetentionService.parseRetentionSetting(updated.settings),
      };
    });
  }

  @Get('tenants/me/retention/preview')
  @ApiOperation({ summary: 'Preview affected records for a candidate retention setting' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  preview(@CurrentUser() user: AuthUser, @Query() q: PreviewRetentionQuery) {
    const target: number | 'permanent' = q.permanent === 'permanent' ? 'permanent' : (q.days as number);
    return this.retention.previewRetentionChange(user.tenantId, target);
  }
}
