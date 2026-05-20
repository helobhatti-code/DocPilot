import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class EmployeeFiltersDto {
  @ApiPropertyOptional({ description: 'Free-text search on employee name' })
  @IsOptional() @IsString() q?: string;

  @ApiPropertyOptional({ description: 'Filter by companyId' })
  @IsOptional() @IsString() companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by designation (substring)' })
  @IsOptional() @IsString() designation?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional() @IsEnum(EmployeeStatus)
  @Transform(({ value }) => value || undefined)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ enum: ['valid', '30d', '14d', '7d', 'expired'] })
  @IsOptional() @IsString() expiryBand?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 25;
}
