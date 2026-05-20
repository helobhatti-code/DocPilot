import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InsuranceType, VehicleType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty({ enum: VehicleType })
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @ApiProperty() @IsString() ownerName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driverName?: string;
  @ApiProperty() @IsString() carMake!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() carModel?: string;
  @ApiProperty() @IsString() plateEmirate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plateCategory?: string;
  @ApiProperty() @IsString() plateNumber!: string;
  @ApiProperty() @IsString() carLicenseNo!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  carLicenseExpiryDate!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() carLicenseAttachmentId?: string;

  @ApiProperty({ enum: InsuranceType })
  @IsEnum(InsuranceType)
  insuranceType!: InsuranceType;

  @ApiPropertyOptional() @IsOptional() @IsString() insurancePolicyNo?: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  insuranceExpiryDate!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() insuranceAttachmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasResidentialMawaqif?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() residentialMawaqifExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasNormalMawaqif?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() normalMawaqifExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() formAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}
