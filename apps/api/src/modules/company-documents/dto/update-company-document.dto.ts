import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyDocType, DocStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Validate,
  ValidateIf,
} from 'class-validator';
import { MetadataShapeConstraint } from './create-company-document.dto';

export class UpdateCompanyDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ enum: DocStatus })
  @IsOptional()
  @IsEnum(DocStatus)
  status?: DocStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((o: UpdateCompanyDocumentDto) => o.metadata !== undefined)
  @Validate(MetadataShapeConstraint)
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Internal — not exposed in OpenAPI but used by renew endpoint
  docType?: CompanyDocType;
}
