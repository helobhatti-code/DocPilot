import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AirportCode, Prisma, UserRole, ZoneCode } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { PrismaService } from '@/common/prisma/prisma.service';

const ALL_AIRPORTS: AirportCode[] = ['AUH', 'AAN', 'SIR', 'AZI', 'ZDY', 'ALL'];
const ALL_ZONES: ZoneCode[] = [
  'AP', 'AR', 'CO', 'TT', 'AT', 'BS', 'TW', 'PX', 'CT', 'GW',
  'EYE', 'ALL_ZONES', 'BHS', 'CBP', 'BHS_CBP', 'PA', 'FF', 'TL',
];

class UpdateTenantProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() logoUrl?: string;
}

class UpdatePassConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([3, 6, 9, 12])
  passValidityMonths?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AirportCode, { each: true })
  enabledAirports?: AirportCode[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ZoneCode, { each: true })
  enabledZones?: ZoneCode[];
}

interface TenantSettingsShape {
  retention_period_days?: number | 'permanent';
  pass_validity_months?: number;
  enabled_airports?: AirportCode[];
  enabled_zones?: ZoneCode[];
  legal_name?: string;
  tax_id?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  default_airport?: AirportCode;
  expiry_warning_30_days?: boolean;
  expiry_warning_15_days?: boolean;
  expiry_warning_7_days?: boolean;
}

@ApiTags('tenant-profile')
@ApiBearerAuth()
@Controller('tenants/me')
@UseGuards(TenantGuard, RolesGuard)
export class TenantProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Read current tenant profile + settings' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER, UserRole.SUPER_ADMIN)
  async getMe(@CurrentUser() user: AuthUser) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true, logoUrl: true, isActive: true, settings: true, createdAt: true },
    });
    if (!t) return null;
    const s = (t.settings as TenantSettingsShape) ?? {};
    return {
      id: t.id,
      tenantId: t.id,
      name: t.name,
      logoUrl: t.logoUrl,
      isActive: t.isActive,
      legalName: s.legal_name ?? null,
      taxId: s.tax_id ?? null,
      contactEmail: s.contact_email ?? null,
      contactPhone: s.contact_phone ?? null,
      address: s.address ?? null,
      defaultAirport: s.default_airport ?? null,
      passValidityMonths: s.pass_validity_months ?? 6,
      enabledAirports: s.enabled_airports ?? ALL_AIRPORTS,
      enabledZones: s.enabled_zones ?? ALL_ZONES,
      expiryWarning30Days: s.expiry_warning_30_days ?? true,
      expiryWarning15Days: s.expiry_warning_15_days ?? true,
      expiryWarning7Days: s.expiry_warning_7_days ?? true,
      retentionMonths: typeof s.retention_period_days === 'number'
        ? Math.round(s.retention_period_days / 30)
        : 1,
      retentionPeriodDays: s.retention_period_days ?? 30,
      createdAt: t.createdAt,
    };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update display name / logo' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTenantProfileDto,
  ) {
    return this.prisma.runUnscoped(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: user.tenantId },
        data: {
          name: dto.name ?? undefined,
          logoUrl: dto.logoUrl ?? undefined,
        },
        select: { id: true, name: true, logoUrl: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'TENANT_PROFILE_UPDATED',
          entityType: 'Tenant',
          entityId: user.tenantId,
          details: dto as unknown as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return updated;
    });
  }

  @Patch('pass-config')
  @ApiOperation({ summary: 'Update pass validity / enabled airports & zones' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updatePassConfig(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePassConfigDto,
  ) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { settings: true },
    });
    const current = (t?.settings as TenantSettingsShape) ?? {};
    const next: TenantSettingsShape = {
      ...current,
      ...(dto.passValidityMonths !== undefined && { pass_validity_months: dto.passValidityMonths }),
      ...(dto.enabledAirports !== undefined && { enabled_airports: dto.enabledAirports }),
      ...(dto.enabledZones !== undefined && { enabled_zones: dto.enabledZones }),
    };

    return this.prisma.runUnscoped(async (tx) => {
      await tx.tenant.update({
        where: { id: user.tenantId },
        data: { settings: next as unknown as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'TENANT_PASS_CONFIG_UPDATED',
          entityType: 'Tenant',
          entityId: user.tenantId,
          details: dto as unknown as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return {
        passValidityMonths: next.pass_validity_months ?? 6,
        enabledAirports: next.enabled_airports ?? ALL_AIRPORTS,
        enabledZones: next.enabled_zones ?? ALL_ZONES,
      };
    });
  }
}
