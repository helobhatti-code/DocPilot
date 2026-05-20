import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  AirportCode,
  CustodyStatus,
  GatePassStatus,
  ZoneCode,
} from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export type ReportType =
  | 'pass-register'
  | 'expiry'
  | 'compliance'
  | 'custody'
  | 'pending-handover'
  | 'retention'
  | 'zone-access'
  | 'staff-history'
  | 'subcontractor'
  | 'audit-trail'
  | 'vehicles-expiry'
  | 'machinery-compliance'
  | 'employees-visa-status'
  | 'company-docs-compliance'
  | 'master-expiry';

export type ExportFormat = 'xlsx' | 'pdf';

export class ReportFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;

  @ApiPropertyOptional({ enum: GatePassStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  @IsArray()
  @IsEnum(GatePassStatus, { each: true })
  status?: GatePassStatus[];

  @ApiPropertyOptional({ enum: AirportCode })
  @IsOptional() @IsEnum(AirportCode) airport?: AirportCode;

  @ApiPropertyOptional({ enum: ZoneCode })
  @IsOptional() @IsEnum(ZoneCode) zone?: ZoneCode;

  @ApiPropertyOptional({ enum: CustodyStatus })
  @IsOptional() @IsEnum(CustodyStatus) custodyStatus?: CustodyStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() company?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() subcontractorOrgId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() staffId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number = 50;

  // ── New-report params ──────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Days ahead for vehicles-expiry window', default: 30 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) daysAhead?: number;

  @ApiPropertyOptional({ description: 'Comma-separated expiry bands: expired,7d,14d,30d,valid' })
  @IsOptional() @IsString() band?: string;

  @ApiPropertyOptional({ description: 'Filter by docType (company-docs-compliance)' })
  @IsOptional() @IsString() docType?: string;

  @ApiPropertyOptional({ description: 'Scope results to a specific company (cuid)' })
  @IsOptional() @IsString() companyId?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  width?: number;
  format?: 'date' | 'datetime' | 'number' | 'text' | 'pill';
}

export interface ReportResult {
  type: ReportType;
  title: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total: number;
  groups?: { key: string; label: string; rows: Record<string, unknown>[] }[];
  summary?: Record<string, number | string>;
  filters?: Record<string, unknown>;
  /** Multi-sheet xlsx: present only when the report needs one sheet per module. */
  sheets?: { name: string; columns: ReportColumn[]; rows: Record<string, unknown>[] }[];
}
