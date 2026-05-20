import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class ProvisionTenantDto {
  // ── Tenant fields ──────────────────────────────────────────
  @ApiProperty({ description: 'Company / tenant display name' })
  @IsString()
  @MinLength(2)
  tenantName!: string;

  @ApiPropertyOptional({ description: 'Subscription tier label' })
  @IsOptional()
  @IsString()
  tier?: string;                     // e.g. 'STANDARD' | 'PROFESSIONAL' | 'ENTERPRISE'

  @ApiPropertyOptional({ description: 'Max staff members allowed' })
  @IsOptional()
  @IsInt()
  @Min(1)
  staffLimit?: number;

  @ApiPropertyOptional({ description: 'Trial period in days (0 = no trial)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ description: 'Pass validity months (default 6)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  passValidityMonths?: number;

  // ── Admin user ─────────────────────────────────────────────
  @ApiProperty({ description: 'Admin user full name' })
  @IsString()
  @MinLength(2)
  adminName!: string;

  @ApiProperty({ description: 'Admin login email' })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({ description: 'Admin initial password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  adminPassword!: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
