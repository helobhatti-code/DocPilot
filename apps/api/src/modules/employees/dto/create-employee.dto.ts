import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() designation!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emiratesIdNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() emiratesIdExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emiratesIdAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() visaNo?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD — optional for new hires before residence visa is issued' })
  @IsOptional() @IsDateString()
  visaExpiryDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() visaAttachmentId?: string;

  // New-hire onboarding fields
  @ApiPropertyOptional({ description: 'Mark this employee as a new hire entering the onboarding pipeline' })
  @IsOptional() isNewEmployee?: boolean;

  @ApiPropertyOptional({ description: 'Initial onboarding stage (e.g. VISIT_VISA_PENDING)' })
  @IsOptional() @IsString() onboardingState?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() laborCardNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() laborCardExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() laborCardAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passportNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() passportExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passportAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() joinDate?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}
