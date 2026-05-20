import { ApiPropertyOptional } from '@nestjs/swagger';
import { InsuranceType, VehicleType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateVehicleDto {
  @ApiPropertyOptional({ enum: VehicleType }) @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driverName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() carMake?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() carModel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plateEmirate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plateCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plateNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() carLicenseNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() carLicenseExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() carLicenseAttachmentId?: string;
  @ApiPropertyOptional({ enum: InsuranceType }) @IsOptional() @IsEnum(InsuranceType) insuranceType?: InsuranceType;
  @ApiPropertyOptional() @IsOptional() @IsString() insurancePolicyNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() insuranceExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() insuranceAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasResidentialMawaqif?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() residentialMawaqifExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasNormalMawaqif?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() normalMawaqifExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() formAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}
