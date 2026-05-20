import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateEmployeeDto {
  @ApiPropertyOptional() @IsOptional() @IsString()      name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      designation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      emiratesIdNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString()  emiratesIdExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      emiratesIdAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      visaNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString()  visaExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      visaAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      laborCardNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString()  laborCardExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      laborCardAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      passportNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString()  passportExpiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      passportAttachmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()      phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail()       email?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString()  joinDate?: string;
  @ApiPropertyOptional({ enum: EmployeeStatus }) @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()     isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString()      remarks?: string;
}
