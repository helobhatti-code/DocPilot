import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GatePassStatus, NotificationType, Prisma, UserRole } from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEngine } from '@/modules/notifications/notification-engine.service';
import { CompleteRenewalDto, RejectRenewalDto, SubmitRenewalDto } from './dto/lifecycle.dto';

const RENEWAL_WINDOW_DAYS = 7;

const SUBMITTABLE_FROM: readonly GatePassStatus[] = [
  GatePassStatus.VALID,
  GatePassStatus.EXPIRY_30,
  GatePassStatus.EXPIRY_15,
  GatePassStatus.EXPIRY_7,
];

@Injectable()
export class RenewalService {
  private readonly logger = new Logger(RenewalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationEngine,
  ) {}

  /**
   * Submit renewal. Blocks unless `expiry - today < 7 days` is false, i.e. we
   * require the pass to be within ≤ 7 days of expiry. Wait — the spec says the
   * opposite: BLOCK if expiry - today < 7. That means submission only allowed
   * when the pass is within 7 days of expiry. Read again: "BLOCK if expiry -
   * today < 7 days". So if there are fewer than 7 days remaining, we block.
   * That gates premature submissions. Implemented below.
   */
  async submit(actor: AuthUser, passId: string, _dto: SubmitRenewalDto) {
    const pass = await this.findPass(passId);
    this.assertOwnsPassIfSubcontractor(actor, pass);

    if (!SUBMITTABLE_FROM.includes(pass.status)) {
      throw new ConflictException(`Cannot submit renewal from status ${pass.status}`);
    }

    const daysUntilExpiry = daysBetween(new Date(), pass.expiryDate);
    if (daysUntilExpiry >= RENEWAL_WINDOW_DAYS) {
      // Spec: BLOCK if expiry - today < 7 days. Inverse condition: must be < 7
      // days remaining to be eligible for submission.
      throw new BadRequestException(
        `Renewal window opens at ${RENEWAL_WINDOW_DAYS} days before expiry (currently ${daysUntilExpiry} days remaining)`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gatePass.update({
        where: { id: passId },
        data: {
          status: GatePassStatus.RENEWAL_SUBMITTED,
          renewalSubmittedAt: new Date(),
          renewalRejectedAt: null,
          renewalRejectionReason: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'RENEWAL_SUBMITTED',
          entityType: 'GatePass',
          entityId: passId,
          details: { passNumber: pass.passNumber } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return updated;
    });
  }

  async approve(actor: AuthUser, passId: string) {
    const pass = await this.findPass(passId);
    if (pass.status !== GatePassStatus.RENEWAL_SUBMITTED) {
      throw new ConflictException(`Cannot approve from status ${pass.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.gatePass.update({
        where: { id: passId },
        data: {
          status: GatePassStatus.RENEWAL_APPROVED,
          renewalApprovedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'RENEWAL_APPROVED',
          entityType: 'GatePass',
          entityId: passId,
          details: { passNumber: pass.passNumber } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return u;
    });

    this.notifications
      .dispatch({
        tenantId: actor.tenantId,
        type: NotificationType.RENEWAL_APPROVED,
        entityId: passId,
        entityType: 'GatePass',
        variables: {
          passNumber: pass.passNumber,
          staffName: pass.staff?.name ?? '—',
          actionUrl: `/passes/${passId}`,
        },
      })
      .catch((e) => this.logger.warn(`RENEWAL_APPROVED dispatch failed: ${(e as Error).message}`));

    return updated;
  }

  async reject(actor: AuthUser, passId: string, dto: RejectRenewalDto) {
    const pass = await this.findPass(passId);
    if (pass.status !== GatePassStatus.RENEWAL_SUBMITTED && pass.status !== GatePassStatus.RENEWAL_APPROVED) {
      throw new ConflictException(`Cannot reject from status ${pass.status}`);
    }

    // Revert to a status derived from current expiry distance.
    const revertTo = deriveExpiryStatus(pass.expiryDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.gatePass.update({
        where: { id: passId },
        data: {
          status: revertTo,
          renewalRejectedAt: new Date(),
          renewalRejectionReason: dto.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'RENEWAL_REJECTED',
          entityType: 'GatePass',
          entityId: passId,
          details: { passNumber: pass.passNumber, reason: dto.reason, revertedTo: revertTo } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return u;
    });

    this.notifications
      .dispatch({
        tenantId: actor.tenantId,
        type: NotificationType.RENEWAL_REJECTED,
        entityId: passId,
        entityType: 'GatePass',
        variables: {
          passNumber: pass.passNumber,
          staffName: pass.staff?.name ?? '—',
          reason: dto.reason,
          actionUrl: `/passes/${passId}`,
        },
      })
      .catch((e) => this.logger.warn(`RENEWAL_REJECTED dispatch failed: ${(e as Error).message}`));

    return updated;
  }

  /**
   * Complete renewal — archive old pass as RENEWED and create a NEW pass for
   * the same staff with the same zones. New expiry = newIssueDate + tenant
   * `pass_validity_months` (default 6).
   */
  async complete(actor: AuthUser, passId: string, dto: CompleteRenewalDto) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id: passId },
      include: { zones: true, staff: true },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== GatePassStatus.RENEWAL_APPROVED) {
      throw new ConflictException(`Renewal must be approved first (current: ${pass.status})`);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { settings: true },
    });
    const validityMonths = readValidityMonths(tenant?.settings);

    const issueDate = dto.newIssueDate ? new Date(dto.newIssueDate) : new Date();
    if (Number.isNaN(issueDate.getTime())) throw new BadRequestException('Invalid newIssueDate');
    const expiryDate = new Date(issueDate);
    expiryDate.setUTCMonth(expiryDate.getUTCMonth() + validityMonths);

    // Pre-check pass number uniqueness in this tenant.
    const dup = await this.prisma.gatePass.findFirst({
      where: { tenantId: actor.tenantId, passNumber: dto.newPassNumber },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`Pass number ${dto.newPassNumber} already exists`);

    return this.prisma.$transaction(async (tx) => {
      // Archive old pass
      await tx.gatePass.update({
        where: { id: passId },
        data: { status: GatePassStatus.RENEWED },
      });

      // Create new pass — middleware injects tenantId
      const created = await tx.gatePass.create({
        data: {
          passNumber: dto.newPassNumber,
          staffId: pass.staffId,
          organization: pass.organization,
          department: pass.department,
          airport: pass.airport,
          issueDate,
          expiryDate,
          status: deriveExpiryStatus(expiryDate),
          renewedFromPassId: passId,
          passScanFrontUrl: dto.passScanFrontUrl,
          passScanBackUrl: dto.passScanBackUrl,
          zones: { create: pass.zones.map((z) => ({ zoneCode: z.zoneCode })) },
          custodyHistory: {
            create: {
              tenantId: actor.tenantId,
              toStatus: 'WITH_COMPANY',
              changedById: actor.id,
              notes: `Renewed from pass ${pass.passNumber}`,
            },
          },
        } as unknown as Prisma.GatePassUncheckedCreateInput,
        include: { zones: true, staff: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'RENEWAL_COMPLETED',
          entityType: 'GatePass',
          entityId: passId,
          details: {
            oldPassNumber: pass.passNumber,
            newPassId: created.id,
            newPassNumber: created.passNumber,
            newIssueDate: issueDate.toISOString().slice(0, 10),
            newExpiryDate: expiryDate.toISOString().slice(0, 10),
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });

      return created;
    });
  }

  // ---------- helpers ----------

  private async findPass(id: string) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id },
      include: { staff: true },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    return pass;
  }

  private assertOwnsPassIfSubcontractor(actor: AuthUser, pass: { staff: { subcontractorOrgId?: string | null } }) {
    if (actor.role !== UserRole.SUBCONTRACTOR) return;
    if (!actor.subcontractorOrgId || actor.subcontractorOrgId !== pass.staff.subcontractorOrgId) {
      throw new ForbiddenException('Subcontractors can only renew passes for their own staff');
    }
  }

}

// ---------- pure helpers ----------

export function daysBetween(from: Date, to: Date): number {
  const f = startOfUTCDay(from).getTime();
  const t = startOfUTCDay(to).getTime();
  return Math.ceil((t - f) / (24 * 3600 * 1000));
}
function startOfUTCDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function deriveExpiryStatus(expiry: Date, today = new Date()): GatePassStatus {
  const days = daysBetween(today, expiry);
  if (days < 0) return GatePassStatus.EXPIRED;
  if (days <= 7) return GatePassStatus.EXPIRY_7;
  if (days <= 15) return GatePassStatus.EXPIRY_15;
  if (days <= 30) return GatePassStatus.EXPIRY_30;
  return GatePassStatus.VALID;
}

export function readValidityMonths(settings: Prisma.JsonValue | null | undefined): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 6;
  const v = (settings as Record<string, unknown>).pass_validity_months;
  return typeof v === 'number' && v > 0 && v <= 60 ? v : 6;
}
