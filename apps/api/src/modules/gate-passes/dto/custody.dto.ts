import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class DeliverToStaffDto {
  @ApiPropertyOptional({ description: 'Optional notes attached to the custody history entry' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkReturnedDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SurrenderToAuthorityDto {
  @ApiProperty({ description: 'YYYY-MM-DD — date the pass was physically handed to authority' })
  @IsDateString()
  handoverDate!: string;

  @ApiProperty({ description: 'Authority officer who received the pass' })
  @IsString()
  @MinLength(2)
  officerName!: string;

  @ApiProperty({ description: 'Authority-issued reference / receipt number' })
  @IsString()
  @MinLength(1)
  referenceNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
