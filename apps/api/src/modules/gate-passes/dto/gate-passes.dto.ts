import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  AirportCode,
  CustodyStatus,
  GatePassStatus,
  ZoneCode,
} from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateGatePassDto {
  @ApiProperty({ description: '6-digit numeric pass number, unique per tenant' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'pass_number must be exactly 6 digits' })
  passNumber!: string;

  @ApiProperty()
  @IsUUID()
  staffId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ enum: AirportCode })
  @IsEnum(AirportCode)
  airport!: AirportCode;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  issueDate!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  expiryDate!: string;

  @ApiProperty({ enum: ZoneCode, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ZoneCode, { each: true })
  zoneCodes!: ZoneCode[];

  @ApiPropertyOptional() @IsOptional() @IsString() passScanFrontUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passScanBackUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptScanUrl?: string;
}

export class UpdateGatePassDto {
  @ApiPropertyOptional() @IsOptional() @IsString() organization?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional({ enum: AirportCode }) @IsOptional() @IsEnum(AirportCode) airport?: AirportCode;
  @ApiPropertyOptional() @IsOptional() @IsDateString() issueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string;
  @ApiPropertyOptional({ enum: GatePassStatus }) @IsOptional() @IsEnum(GatePassStatus) status?: GatePassStatus;
  @ApiPropertyOptional({ enum: CustodyStatus }) @IsOptional() @IsEnum(CustodyStatus) custodyStatus?: CustodyStatus;
  @ApiPropertyOptional({ enum: ZoneCode, isArray: true })
  @IsOptional() @IsArray() @IsEnum(ZoneCode, { each: true }) zoneCodes?: ZoneCode[];
  @ApiPropertyOptional() @IsOptional() @IsString() passScanFrontUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passScanBackUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptScanUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() handoverUnsignedUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() handoverSignedUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() authorityHandoverDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authorityOfficerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authorityReferenceNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class ListGatePassesQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search across pass number / staff name / company' })
  @IsOptional() @IsString() q?: string;

  @ApiPropertyOptional({ enum: GatePassStatus, isArray: true })
  @IsOptional() @IsArray() @IsEnum(GatePassStatus, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  status?: GatePassStatus[];

  @ApiPropertyOptional({ enum: ZoneCode })
  @IsOptional() @IsEnum(ZoneCode) zone?: ZoneCode;

  @ApiPropertyOptional({ enum: AirportCode })
  @IsOptional() @IsEnum(AirportCode) airport?: AirportCode;

  @ApiPropertyOptional() @IsOptional() @IsString() company?: string;

  @ApiPropertyOptional({ enum: CustodyStatus })
  @IsOptional() @IsEnum(CustodyStatus) custodyStatus?: CustodyStatus;

  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryTo?: string;

  @ApiPropertyOptional({ description: 'Filter passes pending authority handover' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  pendingHandover?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 25;
}
