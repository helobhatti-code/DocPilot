import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CancellationService } from '@/modules/gate-passes/cancellation.service';
import { NotificationEngine } from '@/modules/notifications/notification-engine.service';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './dto/staff.dto';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cancellations: CancellationService,
    private readonly notifications: NotificationEngine,
  ) {}

  create(actor: AuthUser, dto: CreateStaffDto) {
    // Explicitly pass tenantId — Prisma $use middleware loses AsyncLocalStorage context
    return this.prisma.staff.create({
      data: { tenantId: actor.tenantId, ...dto } as Prisma.StaffUncheckedCreateInput,
    });
  }

  list(query: ListStaffQueryDto) {
    const where: Prisma.StaffWhereInput = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { designation: { contains: query.q, mode: 'insensitive' } },
        { companyName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;
    if (query.subcontractorOrgId) where.subcontractorOrgId = query.subcontractorOrgId;
    return this.prisma.staff.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { subcontractorOrg: { select: { id: true, name: true } } },
    });
  }

  /**
   * Update staff. If `lastWorkingDay` transitions from null/empty to a date,
   * we auto-queue cancellation for all active gate passes belonging to this
   * staff member, all inside one transaction.
   */
  async update(actor: AuthUser, id: string, dto: UpdateStaffDto) {
    const existing = await this.prisma.staff.findUnique({
      where: { id },
      select: { id: true, lastWorkingDay: true },
    });
    if (!existing) throw new NotFoundException('Staff not found');

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

    // STAFF_OFFBOARDING notification — Secretary, PM (per spec 3B).
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

    // Block deletion if they have any non-cancelled gate passes
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
}
