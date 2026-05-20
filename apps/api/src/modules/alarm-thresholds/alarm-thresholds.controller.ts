import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { AlarmThresholdsService } from './alarm-thresholds.service';
import { UpsertAlarmThresholdDto } from './dto/upsert-alarm-threshold.dto';

@ApiTags('alarm-thresholds')
@ApiBearerAuth()
@Controller('tenants/me/alarm-thresholds')
@UseGuards(TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AlarmThresholdsController {
  constructor(private readonly svc: AlarmThresholdsService) {}

  @Get()
  @ApiOperation({ summary: 'List all docKind thresholds — overrides + defaults' })
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user.tenantId);
  }

  @Put(':docKind')
  @ApiOperation({ summary: 'Upsert threshold override for a specific docKind' })
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('docKind') docKind: string,
    @Body() dto: UpsertAlarmThresholdDto,
  ) {
    return this.svc.upsert(user.tenantId, docKind, dto, user.id);
  }

  @Delete(':docKind')
  @ApiOperation({ summary: 'Delete override — reverts docKind to default 30/14/7' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('docKind') docKind: string,
  ) {
    return this.svc.remove(user.tenantId, docKind);
  }
}
