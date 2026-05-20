import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CustodyStatus, GatePassStatus, Prisma } from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { BulkCancellationDto, BulkCustodyDto, BulkRenewalDto } from './dto/lifecycle.dto';

const RENEWAL_WINDOW_DAYS = 7;

const RENEWAL_ELIGIBLE: readonly GatePassStatus[] = [
  GatePassStatus.VALID,
  GatePassStatus.EXPIRY_30,
  GatePassStatus.EXPIRY_15,
  GatePassStatus.EXPIRY_7,
];

const CANCELLATION_BLOCKED: readonly GatePassStatus[] = [
  GatePassStatus.CANCELLED,
  GatePassStatus.CANCELLATION_REQUESTED,
  GatePassStatus.RENEWED,
];

export interface BulkRenewalResult {
  submitted: string[];
  blocked: { passId: string; reason: string }[];
}

export interface BulkCancellationResult {
  cancelled: string[];
  blocked: { passId: string; reason: string }[];
}

export interface BulkCustodyResult {
  updated: string[];
  blocked: { passId: string; reason: string }[];
}

@Injectable()
export class BulkOperationsService {
  private readonly logger = new Logger(BulkOperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async bulkRenewal(actor: AuthUser, dto: BulkRenewalDto): Promise<BulkRenewalResult> {
    const passes = await this.fetchOwnedPasses(dto.passIds);
    const submitted: string[] = [];
    const blocked: { passId: string; reason: string }[] = [];
    const today = startOfDay(new Date());

    for (const id of dto.passIds) {
      const p = passes.get(id);
      if (!p) {
        blocked.push({ passId: id, reason: 'not_found' });
        continue;
      }
      if (!RENEWAL_ELIGIBLE.includes(p.status)) {
        blocked.push({ passId: id, reason: `invalid_status:${p.status}` });
        continue;
      }
      const days = daysBetween(today, p.expiryDate);
      if (days >= RENEWAL_WINDOW_DAYS) {
        blocked.push({ passId: id, reason: `renewal_window_not_open:${days}d_remaining` });
        continue;
      }
      submitted.push(id);
    }

    if (submitted.length > 0) {
      await this.prisma.$transaction([
        this.prisma.gatePass.updateMany({
          where: { id: { in: submitted } },
          data: { status: GatePassStatus.RENEWAL_SUBMITTED, renewalSubmittedAt: new Date() },
        }),
        this.prisma.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.id,
            action: 'BULK_RENEWAL',
            entityType: 'GatePass',
            details: {
              submittedCount: submitted.length,
              blockedCount: blocked.length,
              passIds: submitted,
              blockedDetails: blocked,
            } as Prisma.InputJsonValue,
          } as unknown as Prisma.AuditLogUncheckedCreateInput,
        }),
      ]);
    } else {
      // Still log the no-op attempt so admins can trace.
      await this.prisma.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'BULK_RENEWAL_BLOCKED',
          entityType: 'GatePass',
          details: { blockedCount: blocked.length, blockedDetails: blocked } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
    }

    return { submitted, blocked };
  }

  async bulkCancellation(actor: AuthUser, dto: BulkCancellationDto): Promise<BulkCancellationResult> {
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('reason is required for bulk cancellation');
    }
    const passes = await this.fetchOwnedPasses(dto.passIds);
    const cancelled: string[] = [];
    const blocked: { passId: string; reason: string }[] = [];

    for (const id of dto.passIds) {
      const p = passes.get(id);
      if (!p) { blocked.push({ passId: id, reason: 'not_found' }); continue; }
      if (CANCELLATION_BLOCKED.includes(p.status)) {
        blocked.push({ passId: id, reason: `invalid_status:${p.status}` });
        continue;
      }
      cancelled.push(id);
    }

    if (cancelled.length > 0) {
      await this.prisma.$transaction([
        this.prisma.gatePass.updateMany({
          where: { id: { in: cancelled } },
          data: {
            status: GatePassStatus.CANCELLATION_REQUESTED,
            cancellationRequestedAt: new Date(),
            cancellationReason: dto.reason,
          },
        }),
        this.prisma.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.id,
            action: 'BULK_CANCELLATION',
            entityType: 'GatePass',
            details: {
              cancelledCount: cancelled.length,
              blockedCount: blocked.length,
              reason: dto.reason,
              passIds: cancelled,
              blockedDetails: blocked,
            } as Prisma.InputJsonValue,
          } as unknown as Prisma.AuditLogUncheckedCreateInput,
        }),
      ]);
    }

    return { cancelled, blocked };
  }

  async bulkCustody(actor: AuthUser, dto: BulkCustodyDto): Promise<BulkCustodyResult> {
    const passes = await this.fetchOwnedPasses(dto.passIds);
    const updated: string[] = [];
    const blocked: { passId: string; reason: string }[] = [];

    for (const id of dto.passIds) {
      const p = passes.get(id);
      if (!p) { blocked.push({ passId: id, reason: 'not_found' }); continue; }
      if (p.custodyStatus === dto.custodyStatus) {
        blocked.push({ passId: id, reason: 'already_in_target_custody' });
        continue;
      }
      // Authority handover not allowed via bulk — requires officer/reference fields.
      if (dto.custodyStatus === CustodyStatus.SURRENDERED_TO_AUTHORITY) {
        blocked.push({ passId: id, reason: 'authority_handover_requires_individual_record' });
        continue;
      }
      updated.push(id);
    }

    if (updated.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.gatePass.updateMany({
          where: { id: { in: updated } },
          data: { custodyStatus: dto.custodyStatus },
        });
        // Custody history rows for traceability.
        const targetPasses = updated.map((id) => passes.get(id)!);
        await tx.custodyHistory.createMany({
          data: targetPasses.map((p) => ({
            tenantId: actor.tenantId,
            gatePassId: p.id,
            fromStatus: p.custodyStatus,
            toStatus: dto.custodyStatus,
            changedById: actor.id,
            notes: 'Bulk custody update',
          })),
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.id,
            action: 'BULK_CUSTODY',
            entityType: 'GatePass',
            details: {
              updatedCount: updated.length,
              blockedCount: blocked.length,
              custodyStatus: dto.custodyStatus,
              passIds: updated,
              blockedDetails: blocked,
            } as Prisma.InputJsonValue,
          } as unknown as Prisma.AuditLogUncheckedCreateInput,
        });
      });
    }

    return { updated, blocked };
  }

  /**
   * Fetch passes by id and key into a Map. Uses the tenant-scoped middleware so
   * cross-tenant ids are silently filtered (and end up reported as not_found).
   */
  private async fetchOwnedPasses(ids: string[]) {
    const rows = await this.prisma.gatePass.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, custodyStatus: true, expiryDate: true, passNumber: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
}
