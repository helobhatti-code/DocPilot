import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(TenantGuard, RolesGuard)
@Roles(
  UserRole.ADMIN,
  UserRole.PM,
  UserRole.HR,
  UserRole.SECRETARY,
  UserRole.VIEWER,
  UserRole.SUBCONTRACTOR,
)
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('kpis')
  kpis(@CurrentUser() user: AuthUser) {
    return this.svc.kpis(user);
  }

  @Get('expiry-timeline')
  expiryTimeline(@CurrentUser() user: AuthUser) {
    return this.svc.expiryTimeline(user);
  }

  @Get('zone-distribution')
  zoneDistribution(@CurrentUser() user: AuthUser) {
    return this.svc.zoneDistribution(user);
  }

  @Get('custody-breakdown')
  custodyBreakdown(@CurrentUser() user: AuthUser) {
    return this.svc.custodyBreakdown(user);
  }

  @Get('recent-activity')
  recentActivity(@CurrentUser() user: AuthUser) {
    return this.svc.recentActivity(user);
  }

  @Get('upcoming-deletions')
  upcomingDeletions(@CurrentUser() user: AuthUser) {
    return this.svc.upcomingDeletions(user);
  }

  @Get('subcontractor-compliance')
  subcontractorCompliance(@CurrentUser() user: AuthUser) {
    return this.svc.subcontractorCompliance(user);
  }
}
