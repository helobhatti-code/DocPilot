import { ApiPropertyOptional } from '@nestjs/swagger';
import { InsuranceType, MachineryStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateMachineryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() machineType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() make?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1900) @Max(2100) manufactureYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plateNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedOperator?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentLocation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() projectSite?: string;
  @ApiPropertyOptional({ enum: MachineryStatus }) @IsOptional() @IsEnum(MachineryStatus) status?: MachineryStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() operatorLicenseNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() operatorLicenseExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operatorLicenseAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inspectionCertificateNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() inspectionExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inspectionAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rtaRegistrationNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() rtaRegistrationExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rtaRegistrationAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() liftingTestCertificateNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() liftingTestExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() liftingTestAttachmentId?: string;
  @ApiPropertyOptional({ enum: InsuranceType }) @IsOptional() @IsEnum(InsuranceType) insuranceType?: InsuranceType;
  @ApiPropertyOptional() @IsOptional() @IsDateString() insuranceExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() insuranceAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() civilDefenseExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() civilDefenseAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}
