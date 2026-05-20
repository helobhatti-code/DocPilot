import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Display name of the company' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Short unique code per tenant (e.g. "MAIN", "SUB1")' })
  @IsString()
  @Length(1, 20)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code must be uppercase alphanumeric (A-Z, 0-9, _, -)' })
  code!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() tradeLicenseNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tradeLicenseNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListCompaniesQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 25;
}

export class GrantCompanyAccessDto {
  @ApiProperty({ description: 'User ID to grant access to' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ default: 'MEMBER', description: 'Access level (MEMBER | ADMIN)' })
  @IsOptional()
  @IsString()
  accessLevel?: string = 'MEMBER';
}
