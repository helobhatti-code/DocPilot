import { ApiPropertyOptional } from '@nestjs/swagger';
import { MachineryStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class MachineryFiltersDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ enum: MachineryStatus })
  @IsOptional() @IsEnum(MachineryStatus) @Transform(({ value }) => value || undefined)
  status?: MachineryStatus;
  @ApiPropertyOptional({ enum: ['valid', '30d', '14d', '7d', 'expired'] })
  @IsOptional() @IsString() expiryBand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyId?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 25;
}
