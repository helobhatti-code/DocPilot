import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyDocType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

// ─── Metadata shape validator ─────────────────────────────────────────────────

@ValidatorConstraint({ name: 'MetadataShape', async: false })
export class MetadataShapeConstraint implements ValidatorConstraintInterface {
  validate(metadata: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateCompanyDocumentDto;
    const { docType } = dto;

    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      // Required metadata types must have an object
      if (
        docType === CompanyDocType.POWER_OF_ATTORNEY ||
        docType === CompanyDocType.CIVIL_DEFENSE
      ) {
        return false;
      }
      return true; // optional for other types
    }

    const m = metadata as Record<string, unknown>;

    switch (docType) {
      case CompanyDocType.POWER_OF_ATTORNEY: {
        if (!m.attorneyType || !['LIMITED', 'UNLIMITED'].includes(m.attorneyType as string)) {
          return false;
        }
        if (!Array.isArray(m.parties) || (m.parties as unknown[]).length === 0) {
          return false;
        }
        return true;
      }
      case CompanyDocType.CIVIL_DEFENSE: {
        if (!m.hassantukCertificateNo || typeof m.hassantukCertificateNo !== 'string') {
          return false;
        }
        if (!m.hassantukExpiryDate || typeof m.hassantukExpiryDate !== 'string') {
          return false;
        }
        // Validate ISO date format
        const d = new Date(m.hassantukExpiryDate as string);
        if (Number.isNaN(d.getTime())) return false;
        return true;
      }
      default:
        return true;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateCompanyDocumentDto;
    switch (dto.docType) {
      case CompanyDocType.POWER_OF_ATTORNEY:
        return 'POWER_OF_ATTORNEY metadata must include attorneyType (LIMITED|UNLIMITED) and parties array with at least 1 entry';
      case CompanyDocType.CIVIL_DEFENSE:
        return 'CIVIL_DEFENSE metadata must include hassantukCertificateNo (string) and hassantukExpiryDate (ISO date)';
      default:
        return 'Invalid metadata shape for the given docType';
    }
  }
}

// ─── Create DTO ───────────────────────────────────────────────────────────────

export class CreateCompanyDocumentDto {
  @ApiProperty({ enum: CompanyDocType })
  @IsEnum(CompanyDocType)
  docType!: CompanyDocType;

  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty()
  @IsString()
  docName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docNumber?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  expiryDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentId?: string;

  @ApiPropertyOptional({ description: 'Shape varies by docType — validated server-side' })
  @IsOptional()
  @ValidateIf((o: CreateCompanyDocumentDto) =>
    o.docType === CompanyDocType.POWER_OF_ATTORNEY ||
    o.docType === CompanyDocType.CIVIL_DEFENSE ||
    o.metadata !== undefined,
  )
  @Validate(MetadataShapeConstraint)
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
