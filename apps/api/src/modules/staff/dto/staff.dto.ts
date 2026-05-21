import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PersonType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  designation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID()    subcontractorOrgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ enum: PersonType, default: PersonType.SUBCONTRACTOR })
  @IsOptional()
  @IsEnum(PersonType)
  personType?: PersonType;

  // Direct-employee documents (validated conditionally)
  @ApiPropertyOptional() @IsOptional() @IsString() emiratesIdNo?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' }) @IsOptional() @IsDateString() emiratesIdExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emiratesIdAttachmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() visaNo?: string;

  // visaExpiryDate is REQUIRED for DIRECT_EMPLOYEE.
  @ApiPropertyOptional({ description: 'YYYY-MM-DD; required when personType=DIRECT_EMPLOYEE' })
  @ValidateIf((o: CreateStaffDto) => o.personType === PersonType.DIRECT_EMPLOYEE)
  @IsDateString()
  visaExpiryDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() visaAttachmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() laborCardNo?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' }) @IsOptional() @IsDateString() laborCardExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() laborCardAttachmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() passportNo?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' }) @IsOptional() @IsDateString() passportExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passportAttachmentId?: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() designation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subcontractorOrgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  lastWorkingDay?: string;

  @ApiPropertyOptional({ enum: PersonType }) @IsOptional() @IsEnum(PersonType) personType?: PersonType;

  @ApiPropertyOptional() @IsOptional() @IsString() emiratesIdNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() emiratesIdExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emiratesIdAttachmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() visaNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() visaExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() visaAttachmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() laborCardNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() laborCardExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() laborCardAttachmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() passportNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() passportExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passportAttachmentId?: string;
}

export class ListStaffQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subcontractorOrgId?: string;

  @ApiPropertyOptional({ enum: PersonType }) @IsOptional() @IsEnum(PersonType) personType?: PersonType;

  @ApiPropertyOptional({ enum: ['expired', '7d', '14d', '30d'] })
  @IsOptional()
  @IsIn(['expired', '7d', '14d', '30d'])
  expiryBand?: 'expired' | '7d' | '14d' | '30d';
}
