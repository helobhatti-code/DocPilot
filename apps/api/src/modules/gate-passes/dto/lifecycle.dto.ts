import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustodyStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class SubmitRenewalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class RejectRenewalDto {
  @ApiProperty({ description: 'Required reason shown to the requester' })
  @IsString() @MinLength(3) reason!: string;
}

export class CompleteRenewalDto {
  @ApiProperty({ description: '6-digit number on the new pass issued by authority' })
  @IsString() @Length(6, 6) @Matches(/^\d{6}$/) newPassNumber!: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD; defaults to today' })
  @IsOptional() @IsDateString() newIssueDate?: string;

  @ApiPropertyOptional({ description: 'Uploaded URL for the front of the new physical pass card' })
  @IsOptional() @IsString() passScanFrontUrl?: string;

  @ApiPropertyOptional({ description: 'Uploaded URL for the back of the new physical pass card' })
  @IsOptional() @IsString() passScanBackUrl?: string;
}

export class RequestCancellationDto {
  @ApiProperty({ description: 'Reason for cancellation' })
  @IsString() @MinLength(3) reason!: string;
}

export class BulkRenewalDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('4', { each: true })
  passIds!: string[];
}

export class BulkCancellationDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('4', { each: true })
  passIds!: string[];

  @ApiProperty()
  @IsString() @MinLength(3) reason!: string;
}

export class BulkCustodyDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('4', { each: true })
  passIds!: string[];

  @ApiProperty({ enum: CustodyStatus })
  @IsEnum(CustodyStatus) custodyStatus!: CustodyStatus;
}
