import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export type ExpiryBandFilter = 'valid' | '30d' | '14d' | '7d' | 'expired';

export class VehicleFiltersDto {
  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType)
  @Transform(({ value }) => value || undefined)
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ description: 'Substring match on plate number' })
  @IsOptional()
  @IsString()
  plateNumber?: string;

  @ApiPropertyOptional({ description: 'Substring match on car make' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['valid', '30d', '14d', '7d', 'expired'] })
  @IsOptional()
  @IsString()
  expiryBand?: ExpiryBandFilter;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 25;
}
