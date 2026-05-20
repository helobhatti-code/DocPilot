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
  @ApiProperty() @IsString() emiratesIdNo!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() emiratesIdExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emiratesIdAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() visaNo?: string;

  @ApiProperty({ description: 'YYYY-MM-DD — mandatory; alarm fires at 30 days' })
  @IsDateString()
  visaExpiryDate!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() visaAttachmentId?: string;
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
