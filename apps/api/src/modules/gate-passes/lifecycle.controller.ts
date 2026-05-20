import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GatePassStatus, UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  BulkCancellationDto,
  BulkCustodyDto,
  BulkRenewalDto,
  CompleteRenewalDto,
  RejectRenewalDto,
  RequestCancellationDto,
  SubmitRenewalDto,
} from './dto/lifecycle.dto';
import { BulkOperationsService } from './bulk.service';
import { CancellationService } from './cancellation.service';
import { RenewalService } from './renewal.service';

@ApiTags('gate-passes-lifecycle')
@ApiBearerAuth()
@Controller('gate-passes')
@UseGuards(TenantGuard, RolesGuard)
export class LifecycleController {
  constructor(
    private readonly renewals: RenewalService,
    private readonly cancellations: CancellationService,
    private readonly bulk: BulkOperationsService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- BULK (must come before /:id paths) ----------

  @Post('bulk/renewal')
  @ApiOperation({ summary: 'Submit renewal for multiple passes' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  bulkRenewal(@CurrentUser() user: AuthUser, @Body() dto: BulkRenewalDto) {
    return this.bulk.bulkRenewal(user, dto);
  }

  @Post('bulk/cancellation')
  @ApiOperation({ summary: 'Request cancellation for multiple passes' })
  @Roles(UserRole.ADMIN, UserRole.PM)
  bulkCancellation(@CurrentUser() user: AuthUser, @Body() dto: BulkCancellationDto) {
    return this.bulk.bulkCancellation(user, dto);
  }

  @Post('bulk/custody')
  @ApiOperation({ summary: 'Update custody status for multiple passes' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.SECRETARY)
  bulkCustody(@CurrentUser() user: AuthUser, @Body() dto: BulkCustodyDto) {
    return this.bulk.bulkCustody(user, dto);
  }

  // ---------- QUEUES (lists for UI pages) ----------

  @Get('queues/renewals')
  @ApiOperation({ summary: 'Renewal queue (RENEWAL_SUBMITTED + RENEWAL_APPROVED)' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  renewalsQueue() {
    return this.prisma.gatePass.findMany({
      where: { status: { in: [GatePassStatus.RENEWAL_SUBMITTED, GatePassStatus.RENEWAL_APPROVED] } },
      orderBy: { renewalSubmittedAt: 'asc' },
      include: {
        staff: { select: { id: true, name: true, companyName: true, photoUrl: true } },
        zones: { select: { zoneCode: true } },
      },
    });
  }

  @Get('queues/cancellations')
  @ApiOperation({ summary: 'Cancellation queue with overdue flag (>7 days since request)' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  async cancellationsQueue(@Query('overdueOnly') overdueOnly?: string) {
    const rows = await this.prisma.gatePass.findMany({
      where: { status: GatePassStatus.CANCELLATION_REQUESTED },
      orderBy: { cancellationRequestedAt: 'asc' },
      include: {
        staff: { select: { id: true, name: true, companyName: true, photoUrl: true } },
        zones: { select: { zoneCode: true } },
      },
    });
    const now = Date.now();
    const annotated = rows.map((r) => {
      const requestedAt = r.cancellationRequestedAt?.getTime() ?? now;
      const daysSince = Math.floor((now - requestedAt) / (24 * 3600 * 1000));
      return { ...r, daysSinceCancellationRequested: daysSince, isOverdue: daysSince > 7 };
    });
    return overdueOnly === 'true' ? annotated.filter((r) => r.isOverdue) : annotated;
  }

  // ---------- RENEWAL (single pass) ----------

  @Post(':id/renewal')
  @ApiOperation({ summary: 'Submit renewal' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.SUBCONTRACTOR)
  submitRenewal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitRenewalDto,
  ) {
    return this.renewals.submit(user, id, dto);
  }

  @Post(':id/renewal/approve')
  @ApiOperation({ summary: 'Approve renewal' })
  @Roles(UserRole.ADMIN, UserRole.PM)
  approveRenewal(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.renewals.approve(user, id);
  }

  @Post(':id/renewal/reject')
  @ApiOperation({ summary: 'Reject renewal' })
  @Roles(UserRole.ADMIN, UserRole.PM)
  rejectRenewal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRenewalDto,
  ) {
    return this.renewals.reject(user, id, dto);
  }

  @Post(':id/renewal/complete')
  @ApiOperation({ summary: 'Complete renewal — issue new pass, archive old' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.SECRETARY)
  completeRenewal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteRenewalDto,
  ) {
    return this.renewals.complete(user, id, dto);
  }

  // ---------- CANCELLATION (single pass) ----------

  @Post(':id/cancellation')
  @ApiOperation({ summary: 'Request cancellation' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR)
  requestCancellation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestCancellationDto,
  ) {
    return this.cancellations.request(user, id, dto);
  }

  @Post(':id/cancellation/complete')
  @ApiOperation({ summary: 'Complete cancellation (custody must be SURRENDERED_TO_AUTHORITY)' })
  @Roles(UserRole.ADMIN, UserRole.PM)
  completeCancellation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cancellations.complete(user, id);
  }
}
