import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyDocType, DocStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export type ExpiryBandFilter = 'valid' | '30d' | '14d' | '7d' | 'expired';

export class CompanyDocumentFiltersDto {
  @ApiPropertyOptional({ enum: CompanyDocType })
  @IsOptional()
  @IsEnum(CompanyDocType)
  docType?: CompanyDocType;

  @ApiPropertyOptional({ enum: DocStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(DocStatus, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  status?: DocStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Filter by expiry band: valid | 30d | 14d | 7d | expired',
  })
  @IsOptional()
  @IsString()
  expiryBand?: ExpiryBandFilter;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 25;
}
