import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CustodyStatus, GatePassStatus, NotificationType, Prisma } from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEngine } from '@/modules/notifications/notification-engine.service';
import { RequestCancellationDto } from './dto/lifecycle.dto';

/** Statuses from which a cancellation can be requested manually. */
const CANCELLABLE_FROM: readonly GatePassStatus[] = [
  GatePassStatus.VALID,
  GatePassStatus.EXPIRY_30,
  GatePassStatus.EXPIRY_15,
  GatePassStatus.EXPIRY_7,
  GatePassStatus.EXPIRED,
  GatePassStatus.SUSPENDED,
  GatePassStatus.RENEWAL_SUBMITTED,
  GatePassStatus.RENEWAL_APPROVED,
];

@Injectable()
export class CancellationService {
  private readonly logger = new Logger(CancellationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationEngine,
  ) {}

  async request(actor: AuthUser, passId: string, dto: RequestCancellationDto) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id: passId },
      select: { id: true, status: true, passNumber: true, cancellationRequestedAt: true },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status === GatePassStatus.CANCELLATION_REQUESTED) {
      throw new ConflictException('Cancellation already requested');
    }
    if (pass.status === GatePassStatus.CANCELLED) {
      throw new ConflictException('Pass already cancelled');
    }
    if (!CANCELLABLE_FROM.includes(pass.status)) {
      throw new ConflictException(`Cannot request cancellation from status ${pass.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gatePass.update({
        where: { id: passId },
        data: {
          status: GatePassStatus.CANCELLATION_REQUESTED,
          cancellationRequestedAt: new Date(),
          cancellationReason: dto.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'CANCELLATION_REQUESTED',
          entityType: 'GatePass',
          entityId: passId,
          details: { passNumber: pass.passNumber, reason: dto.reason } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return updated;
    });
  }

  /**
   * Mark cancellation complete. Only allowed when custody is
   * SURRENDERED_TO_AUTHORITY. Calculates dataDeletionScheduledAt from tenant
   * retention setting; null if "permanent".
   */
  async complete(actor: AuthUser, passId: string) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id: passId },
      select: {
        id: true,
        status: true,
        passNumber: true,
        custodyStatus: true,
      },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== GatePassStatus.CANCELLATION_REQUESTED) {
      throw new ConflictException(`Cancellation not requested (status: ${pass.status})`);
    }
    if (pass.custodyStatus !== CustodyStatus.SURRENDERED_TO_AUTHORITY) {
      throw new BadRequestException(
        'Cancellation can only be completed after the pass is surrendered to authority',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { settings: true },
    });
    const retention = readRetentionDays(tenant?.settings);
    const dataDeletionScheduledAt =
      retention === 'permanent' ? null : addDays(new Date(), retention);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.gatePass.update({
        where: { id: passId },
        data: {
          status: GatePassStatus.CANCELLED,
          cancellationCompletedAt: new Date(),
          dataDeletionScheduledAt,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'CANCELLATION_COMPLETED',
          entityType: 'GatePass',
          entityId: passId,
          details: {
            passNumber: pass.passNumber,
            dataDeletionScheduledAt: dataDeletionScheduledAt?.toISOString() ?? 'permanent',
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return u;
    });

    this.notifications
      .dispatch({
        tenantId: actor.tenantId,
        type: NotificationType.CANCELLATION_CONFIRMED,
        entityId: passId,
        entityType: 'GatePass',
        variables: {
          passNumber: pass.passNumber,
          deletionDate: dataDeletionScheduledAt?.toISOString().slice(0, 10) ?? 'permanent',
          actionUrl: `/passes/${passId}`,
        },
      })
      .catch((e) => this.logger.warn(`CANCELLATION_CONFIRMED dispatch failed: ${(e as Error).message}`));

    return updated;
  }

  /**
   * Auto-trigger when staff.lastWorkingDay is set: queue cancellation for all
   * non-cancelled, non-renewed gate passes belonging to that staff member.
   * Called from StaffService.update inside the same transaction.
   */
  async autoCancelForStaffOffboarding(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    staffId: string,
    lastWorkingDay: Date,
  ): Promise<{ cancelled: number; passIds: string[] }> {
    const passes = await tx.gatePass.findMany({
      where: {
        staffId,
        status: {
          notIn: [
            GatePassStatus.CANCELLED,
            GatePassStatus.CANCELLATION_REQUESTED,
            GatePassStatus.RENEWED,
          ],
        },
      },
      select: { id: true, passNumber: true },
    });
    if (passes.length === 0) return { cancelled: 0, passIds: [] };

    const ids = passes.map((p) => p.id);
    const reason = `Staff offboarded — last working day ${lastWorkingDay.toISOString().slice(0, 10)}`;
    await tx.gatePass.updateMany({
      where: { id: { in: ids } },
      data: {
        status: GatePassStatus.CANCELLATION_REQUESTED,
        cancellationRequestedAt: new Date(),
        cancellationReason: reason,
      },
    });
    await tx.auditLog.createMany({
      data: passes.map((p) => ({
        tenantId: actor.tenantId,
        userId: actor.id,
        action: 'CANCELLATION_REQUESTED_AUTO',
        entityType: 'GatePass',
        entityId: p.id,
        details: { passNumber: p.passNumber, reason, source: 'staff_offboarding' } as Prisma.InputJsonValue,
      })),
    });
    return { cancelled: ids.length, passIds: ids };
  }

}

// ---------- pure helpers ----------

export function readRetentionDays(settings: Prisma.JsonValue | null | undefined): number | 'permanent' {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 30;
  const v = (settings as Record<string, unknown>).retention_period_days;
  if (v === 'permanent') return 'permanent';
  if (typeof v === 'number' && v > 0) return v;
  return 30;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
