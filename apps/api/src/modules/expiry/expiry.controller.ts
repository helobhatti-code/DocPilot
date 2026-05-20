import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { ExpiryService } from './expiry.service';

class ExpiryQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated bands: expired,7d,14d,30d,valid' })
  @IsOptional() @IsString() band?: string;

  @ApiPropertyOptional({ description: 'Source filter: gate_pass|vehicle|machinery|employee|company_document' })
  @IsOptional() @IsString() source?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() companyId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() docKind?: string;

  @ApiPropertyOptional({ description: 'Expiry date from (YYYY-MM-DD)' })
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional({ description: 'Expiry date to (YYYY-MM-DD)' })
  @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional({ description: 'Free-text search on display_name' })
  @IsOptional() @IsString() q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number = 50;
}

@ApiTags('expiry')
@ApiBearerAuth()
@Controller('expiry')
@UseGuards(TenantGuard, RolesGuard)
export class ExpiryController {
  constructor(private readonly svc: ExpiryService) {}

  @Get()
  @ApiOperation({ summary: 'Unified expiry list across all 5 modules, sorted by urgency' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  list(@CurrentUser() user: AuthUser, @Query() query: ExpiryQueryDto) {
    return this.svc.list(query, user.tenantId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'KPI counts grouped by band and source' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  summary(@CurrentUser() user: AuthUser) {
    return this.svc.summary(user.tenantId);
  }
}
