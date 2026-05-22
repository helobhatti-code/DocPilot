import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, PersonType, Prisma } from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppConfig } from '@/config/configuration';
import { CancellationService } from '@/modules/gate-passes/cancellation.service';
import { NotificationEngine } from '@/modules/notifications/notification-engine.service';
import { computeExpiryBand, worstBand, type ExpiryBand } from '@/common/utils/expiry-band';
import { uploadAttachment, type AttachmentFile } from '@/common/utils/attachment-upload';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './dto/staff.dto';

function toDateTime(date: string | undefined): string | undefined {
  if (!date) return undefined;
  return date.includes('T') ? date : `${date}T00:00:00.000Z`;
}

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / 86_400_000);
}

type StaffRow = Prisma.StaffGetPayload<{ include: { subcontractorOrg: { select: { id: true; name: true } } } }>;

function decorateRow(row: StaffRow) {
  if (row.personType !== PersonType.DIRECT_EMPLOYEE) {
    return {
      ...row,
      visaExpiryBand: null,
      emiratesIdExpiryBand: null,
      laborCardExpiryBand: null,
      passportExpiryBand: null,
      worstExpiryBand: null,
    };
  }
  const visaBand     = computeExpiryBand(row.visaExpiryDate);
  const eidBand      = computeExpiryBand(row.emiratesIdExpiryDate);
  const laborBand    = computeExpiryBand(row.laborCardExpiryDate);
  const passportBand = computeExpiryBand(row.passportExpiryDate);
  const present      = [visaBand, eidBand, laborBand, passportBand].filter((b): b is ExpiryBand => b !== null);
  return {
    ...row,
    visaExpiryBand: visaBand,
    emiratesIdExpiryBand: eidBand,
    laborCardExpiryBand: laborBand,
    passportExpiryBand: passportBand,
    worstExpiryBand: present.length ? worstBand(present) : null,
  };
}

const ATTACHMENT_FIELDS: Record<string, keyof Prisma.StaffUpdateInput> = {
  'emirates-id': 'emiratesIdAttachmentId',
  visa:          'visaAttachmentId',
  'labor-card':  'laborCardAttachmentId',
  passport:      'passportAttachmentId',
};

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cancellations: CancellationService,
    private readonly notifications: NotificationEngine,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  create(actor: AuthUser, dto: CreateStaffDto) {
    // Explicitly pass tenantId — Prisma $use middleware loses AsyncLocalStorage context
    return this.prisma.staff.create({
      data: {
        tenantId: actor.tenantId,
        ...dto,
        emiratesIdExpiryDate: toDateTime(dto.emiratesIdExpiryDate),
        visaExpiryDate:       toDateTime(dto.visaExpiryDate),
        laborCardExpiryDate:  toDateTime(dto.laborCardExpiryDate),
        passportExpiryDate:   toDateTime(dto.passportExpiryDate),
      } as Prisma.StaffUncheckedCreateInput,
    });
  }

  async list(query: ListStaffQueryDto) {
    const where: Prisma.StaffWhereInput = {};
    if (query.q) {
      where.OR = [
        { name:        { contains: query.q, mode: 'insensitive' } },
        { designation: { contains: query.q, mode: 'insensitive' } },
        { companyName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;
    if (query.subcontractorOrgId) where.subcontractorOrgId = query.subcontractorOrgId;
    if (query.personType) where.personType = query.personType;

    // expiryBand only applies to direct employees
    if (query.expiryBand) {
      where.personType = PersonType.DIRECT_EMPLOYEE;
    }

    const rows = await this.prisma.staff.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { subcontractorOrg: { select: { id: true, name: true } } },
    });

    const decorated = rows.map(decorateRow);

    if (query.expiryBand) {
      return decorated.filter((r) => r.worstExpiryBand === query.expiryBand);
    }
    return decorated;
  }

  /**
   * Update staff. If `lastWorkingDay` transitions from null/empty to a date,
   * we auto-queue cancellation for all active gate passes belonging to this
   * staff member, all inside one transaction.
   */
  async update(actor: AuthUser, id: string, dto: UpdateStaffDto) {
    const existing = await this.prisma.staff.findUnique({
      where: { id },
      select: { id: true, lastWorkingDay: true, personType: true, visaExpiryDate: true },
    });
    if (!existing) throw new NotFoundException('Staff not found');

    // Cross-field validation: a DIRECT_EMPLOYEE always needs a visa expiry date
    const effectivePersonType = dto.personType ?? existing.personType;
    const effectiveVisaExpiry =
      dto.visaExpiryDate !== undefined ? dto.visaExpiryDate : existing.visaExpiryDate;
    if (effectivePersonType === PersonType.DIRECT_EMPLOYEE && !effectiveVisaExpiry) {
      throw new BadRequestException('visaExpiryDate is required for direct employees');
    }

    const newLwd = dto.lastWorkingDay ? new Date(dto.lastWorkingDay) : null;
    const triggersOffboarding =
      newLwd !== null &&
      (existing.lastWorkingDay === null ||
        existing.lastWorkingDay.getTime() !== newLwd.getTime());

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staff.update({
        where: { id },
        data: {
          ...dto,
          emiratesIdExpiryDate: toDateTime(dto.emiratesIdExpiryDate),
          visaExpiryDate:       toDateTime(dto.visaExpiryDate),
          laborCardExpiryDate:  toDateTime(dto.laborCardExpiryDate),
          passportExpiryDate:   toDateTime(dto.passportExpiryDate),
          lastWorkingDay: newLwd ?? undefined,
          isActive: triggersOffboarding ? false : dto.isActive,
        },
      });

      let cancelledPassIds: string[] = [];
      if (triggersOffboarding) {
        const r = await this.cancellations.autoCancelForStaffOffboarding(
          tx,
          actor,
          id,
          newLwd!,
        );
        cancelledPassIds = r.passIds;
        this.logger.log(
          `Staff ${id} offboarded: queued ${r.cancelled} pass cancellation(s)`,
        );
      }

      return { staff: updated, cancelledPassIds };
    });

    if (triggersOffboarding && newLwd) {
      this.notifications
        .dispatch({
          tenantId: actor.tenantId,
          type: NotificationType.STAFF_OFFBOARDING,
          entityId: id,
          entityType: 'Staff',
          variables: {
            staffName: result.staff.name,
            lastWorkingDay: newLwd.toISOString().slice(0, 10),
          },
        })
        .catch((e) => this.logger.warn(`STAFF_OFFBOARDING dispatch failed: ${(e as Error).message}`));
    }

    return result.staff;
  }

  async remove(id: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const activePasses = await this.prisma.gatePass.count({
      where: { staffId: id, status: { notIn: ['CANCELLED', 'RENEWED'] } },
    });
    if (activePasses > 0) {
      throw new BadRequestException(
        `Cannot delete ${staff.name} — they have ${activePasses} active gate pass(es). Cancel all passes first.`,
      );
    }

    await this.prisma.staff.delete({ where: { id } });
    return { ok: true };
  }

  async uploadAttachment(id: string, kind: string, file: AttachmentFile) {
    const existing = await this.prisma.staff.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Staff not found');

    const field = ATTACHMENT_FIELDS[kind];
    if (!field) throw new BadRequestException(`Unknown attachment kind: ${kind}`);

    const uploadRoot = this.config.get('uploadDir', { infer: true }) ?? './uploads';
    const result = await uploadAttachment(file, uploadRoot, 'staff', id, kind);

    await this.prisma.staff.update({
      where: { id },
      data: { [field]: result.attachmentId },
    });
    return result;
  }

  // ─── Stats (used by dashboard People/Employees tab) ─────────────────────────

  async stats(personType?: PersonType) {
    const where: Prisma.StaffWhereInput = personType ? { personType, isActive: true } : { isActive: true };
    const rows = await this.prisma.staff.findMany({
      where,
      select: {
        id: true,
        designation: true,
        personType: true,
        visaExpiryDate: true,
        emiratesIdExpiryDate: true,
        laborCardExpiryDate: true,
        passportExpiryDate: true,
        name: true,
      },
    });

    const total = rows.length;
    const headcount = rows.filter((r) => r.personType === PersonType.DIRECT_EMPLOYEE).length;
    const byDesignation: Record<string, number> = {};
    const byBand: Record<string, number> = { expired: 0, '7d': 0, '14d': 0, '30d': 0, valid: 0 };

    let visaExpiringSoon = 0;
    let eidExpiringSoon = 0;
    let expiredDocs = 0;

    for (const r of rows) {
      const key = r.designation || 'Unspecified';
      byDesignation[key] = (byDesignation[key] ?? 0) + 1;

      if (r.personType !== PersonType.DIRECT_EMPLOYEE) continue;

      const visaDays = daysUntil(r.visaExpiryDate);
      const eidDays  = daysUntil(r.emiratesIdExpiryDate);
      const lcDays   = daysUntil(r.laborCardExpiryDate);
      const passDays = daysUntil(r.passportExpiryDate);

      [r.visaExpiryDate, r.emiratesIdExpiryDate, r.laborCardExpiryDate, r.passportExpiryDate].forEach((d) => {
        if (!d) return;
        const b = computeExpiryBand(d);
        if (!b) return;
        byBand[b] = (byBand[b] ?? 0) + 1;
      });

      if (visaDays !== null && visaDays >= 0 && visaDays <= 30) visaExpiringSoon++;
      if (eidDays  !== null && eidDays  >= 0 && eidDays  <= 30) eidExpiringSoon++;
      [visaDays, eidDays, lcDays, passDays].forEach((d) => {
        if (d !== null && d < 0) expiredDocs++;
      });
    }

    // Top 5 employees with soonest-expiring doc
    const soonest = rows
      .filter((r) => r.personType === PersonType.DIRECT_EMPLOYEE)
      .map((r) => {
        const dates = [r.visaExpiryDate, r.emiratesIdExpiryDate, r.laborCardExpiryDate, r.passportExpiryDate]
          .filter((d): d is Date => !!d);
        const minDays = dates.length
          ? Math.min(...dates.map((d) => daysUntil(d) ?? Number.POSITIVE_INFINITY))
          : null;
        return { id: r.id, name: r.name, designation: r.designation, daysUntilExpiry: minDays };
      })
      .filter((r) => r.daysUntilExpiry !== null)
      .sort((a, b) => (a.daysUntilExpiry! - b.daysUntilExpiry!))
      .slice(0, 5);

    return {
      total,
      headcount,
      byDesignation,
      byBand,
      visaExpiringSoon,
      eidExpiringSoon,
      expiredDocs,
      soonest,
    };
  }
}
