import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CustodyStatus,
  DocumentType,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEngine } from '@/modules/notifications/notification-engine.service';
import { HandoverPdfService } from './handover-pdf.service';
import {
  DeliverToStaffDto,
  MarkReturnedDto,
  SurrenderToAuthorityDto,
} from './dto/custody.dto';

/**
 * Allowed custody transitions. Strictly enforced — any transition not present
 * here is rejected with a ConflictException. SUPER_ADMIN reset paths are out of
 * scope; correction requires direct DB intervention.
 */
const ALLOWED_TRANSITIONS: ReadonlyMap<CustodyStatus, ReadonlySet<CustodyStatus>> = new Map([
  [CustodyStatus.WITH_COMPANY, new Set([CustodyStatus.WITH_PERSON])],
  [CustodyStatus.WITH_PERSON, new Set([CustodyStatus.RETURNED_TO_COMPANY])],
  [CustodyStatus.RETURNED_TO_COMPANY, new Set([CustodyStatus.SURRENDERED_TO_AUTHORITY])],
  [CustodyStatus.SURRENDERED_TO_AUTHORITY, new Set<CustodyStatus>()],
]);

const HANDOVER_OVERDUE_DAYS = 7;

@Injectable()
export class CustodyService {
  private readonly logger = new Logger(CustodyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationEngine,
    private readonly handoverPdf: HandoverPdfService,
  ) {}

  // -------------------------------------------------------------------------
  // Transition: WITH_COMPANY -> WITH_PERSON (auto-generates handover doc)
  // -------------------------------------------------------------------------

  async deliverToStaff(actor: AuthUser, passId: string, dto: DeliverToStaffDto) {
    const pass = await this.loadFull(passId);
    this.assertOwnsPassIfSubcontractor(actor, pass);
    this.assertTransitionAllowed(pass.custodyStatus, CustodyStatus.WITH_PERSON);

    if (!pass.staff.isActive) {
      throw new BadRequestException(
        `Cannot hand over pass to ${pass.staff.name} — staff member is inactive. Reactivate them first.`,
      );
    }

    // Generate the unsigned handover document BEFORE we flip custody so a PDF
    // failure doesn't leave the system in an inconsistent state.
    const generated = await this.handoverPdf.generate(actor, pass);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gatePass.update({
        where: { id: passId },
        data: {
          custodyStatus: CustodyStatus.WITH_PERSON,
          handoverUnsignedUrl: generated.fileUrl,
        },
        include: { staff: true, zones: true },
      });

      await tx.custodyHistory.create({
        data: {
          tenantId: actor.tenantId,
          gatePassId: passId,
          fromStatus: CustodyStatus.WITH_COMPANY,
          toStatus: CustodyStatus.WITH_PERSON,
          changedById: actor.id,
          notes: dto.notes ?? 'Delivered to staff — handover document generated',
        },
      });

      await tx.document.create({
        data: {
          tenantId: actor.tenantId,
          gatePassId: passId,
          type: DocumentType.HANDOVER_UNSIGNED,
          fileUrl: generated.fileUrl,
          fileName: generated.fileName,
          fileSizeBytes: generated.fileSizeBytes,
          mimeType: 'application/pdf',
          uploadedById: actor.id,
        } as unknown as Prisma.DocumentUncheckedCreateInput,
      });

      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'CUSTODY_DELIVER_TO_STAFF',
          entityType: 'GatePass',
          entityId: passId,
          details: {
            passNumber: pass.passNumber,
            staffName: pass.staff?.name ?? null,
            handoverUnsignedUrl: generated.fileUrl,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });

      this.dispatchCustodyChange(actor, passId, pass, CustodyStatus.WITH_COMPANY, CustodyStatus.WITH_PERSON);
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Transition: WITH_PERSON -> RETURNED_TO_COMPANY
  // -------------------------------------------------------------------------

  async markReturned(actor: AuthUser, passId: string, dto: MarkReturnedDto) {
    const pass = await this.loadFull(passId);
    this.assertOwnsPassIfSubcontractor(actor, pass);
    this.assertTransitionAllowed(pass.custodyStatus, CustodyStatus.RETURNED_TO_COMPANY);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gatePass.update({
        where: { id: passId },
        data: { custodyStatus: CustodyStatus.RETURNED_TO_COMPANY },
        include: { staff: true, zones: true },
      });

      await tx.custodyHistory.create({
        data: {
          tenantId: actor.tenantId,
          gatePassId: passId,
          fromStatus: CustodyStatus.WITH_PERSON,
          toStatus: CustodyStatus.RETURNED_TO_COMPANY,
          changedById: actor.id,
          notes: dto.notes ?? 'Returned to company',
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'CUSTODY_MARK_RETURNED',
          entityType: 'GatePass',
          entityId: passId,
          details: { passNumber: pass.passNumber } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });

      this.dispatchCustodyChange(
        actor,
        passId,
        pass,
        CustodyStatus.WITH_PERSON,
        CustodyStatus.RETURNED_TO_COMPANY,
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Transition: RETURNED_TO_COMPANY -> SURRENDERED_TO_AUTHORITY
  // -------------------------------------------------------------------------

  async surrenderToAuthority(actor: AuthUser, passId: string, dto: SurrenderToAuthorityDto) {
    const pass = await this.loadFull(passId);
    this.assertOwnsPassIfSubcontractor(actor, pass);
    this.assertTransitionAllowed(pass.custodyStatus, CustodyStatus.SURRENDERED_TO_AUTHORITY);

    const handoverDate = new Date(dto.handoverDate);
    if (Number.isNaN(handoverDate.getTime())) {
      throw new BadRequestException('Invalid handover date');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gatePass.update({
        where: { id: passId },
        data: {
          custodyStatus: CustodyStatus.SURRENDERED_TO_AUTHORITY,
          authorityHandoverDate: handoverDate,
          authorityOfficerName: dto.officerName,
          authorityReferenceNumber: dto.referenceNumber,
        },
        include: { staff: true, zones: true },
      });

      await tx.custodyHistory.create({
        data: {
          tenantId: actor.tenantId,
          gatePassId: passId,
          fromStatus: CustodyStatus.RETURNED_TO_COMPANY,
          toStatus: CustodyStatus.SURRENDERED_TO_AUTHORITY,
          changedById: actor.id,
          authorityHandoverDate: handoverDate,
          authorityOfficerName: dto.officerName,
          authorityReferenceNumber: dto.referenceNumber,
          notes: dto.notes ?? 'Surrendered to authority',
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'CUSTODY_SURRENDER_TO_AUTHORITY',
          entityType: 'GatePass',
          entityId: passId,
          details: {
            passNumber: pass.passNumber,
            handoverDate: handoverDate.toISOString().slice(0, 10),
            officerName: dto.officerName,
            referenceNumber: dto.referenceNumber,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });

      this.dispatchCustodyChange(
        actor,
        passId,
        pass,
        CustodyStatus.RETURNED_TO_COMPANY,
        CustodyStatus.SURRENDERED_TO_AUTHORITY,
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Pending Handover dashboard widget feed.
  // -------------------------------------------------------------------------

  /**
   * Passes whose custody is RETURNED_TO_COMPANY but have not yet been
   * surrendered to authority. Annotates each row with `daysPendingHandover`
   * (calendar days since the latest RETURNED_TO_COMPANY custody event) and
   * an `isOverdue` flag once it crosses HANDOVER_OVERDUE_DAYS.
   */
  async pendingHandover(opts: { overdueOnly?: boolean }) {
    const rows = await this.prisma.gatePass.findMany({
      where: { custodyStatus: CustodyStatus.RETURNED_TO_COMPANY },
      include: {
        staff: { select: { id: true, name: true, companyName: true, photoUrl: true } },
        zones: { select: { zoneCode: true } },
        custodyHistory: {
          where: { toStatus: CustodyStatus.RETURNED_TO_COMPANY },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    const today = startOfUTCDay(new Date()).getTime();
    const annotated = rows.map((r) => {
      const since = r.custodyHistory[0]?.createdAt ?? r.updatedAt;
      const daysPendingHandover = Math.floor((today - startOfUTCDay(since).getTime()) / (24 * 3600 * 1000));
      return {
        ...r,
        custodyHistory: undefined, // strip, not needed by UI
        daysPendingHandover,
        isOverdue: daysPendingHandover > HANDOVER_OVERDUE_DAYS,
      };
    });

    return opts.overdueOnly ? annotated.filter((r) => r.isOverdue) : annotated;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async loadFull(id: string) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id },
      include: {
        staff: true,
        zones: { select: { zoneCode: true } },
      },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    return pass;
  }

  private assertTransitionAllowed(from: CustodyStatus, to: CustodyStatus) {
    if (from === to) {
      throw new ConflictException(`Pass is already in ${to}`);
    }
    const allowed = ALLOWED_TRANSITIONS.get(from);
    if (!allowed || !allowed.has(to)) {
      throw new ConflictException(`Custody transition ${from} -> ${to} is not allowed`);
    }
  }

  private assertOwnsPassIfSubcontractor(
    actor: AuthUser,
    pass: { staff: { subcontractorOrgId?: string | null } | null },
  ) {
    if (actor.role !== UserRole.SUBCONTRACTOR) return;
    if (!pass.staff) throw new ForbiddenException();
    if (!actor.subcontractorOrgId || actor.subcontractorOrgId !== pass.staff.subcontractorOrgId) {
      throw new ForbiddenException('Subcontractors can only act on passes for their own staff');
    }
  }

  private dispatchCustodyChange(
    actor: AuthUser,
    passId: string,
    pass: { passNumber: string; staff: { name: string } | null },
    fromStatus: CustodyStatus,
    toStatus: CustodyStatus,
  ) {
    this.notifications
      .dispatch({
        tenantId: actor.tenantId,
        type: NotificationType.CUSTODY_CHANGE,
        entityId: passId,
        entityType: 'GatePass',
        variables: {
          passNumber: pass.passNumber,
          staffName: pass.staff?.name ?? '—',
          fromStatus,
          toStatus,
          actor: actor.email,
          actionUrl: `/passes/${passId}`,
        },
      })
      .catch((e) => this.logger.warn(`CUSTODY_CHANGE dispatch failed: ${(e as Error).message}`));
  }
}

function startOfUTCDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
