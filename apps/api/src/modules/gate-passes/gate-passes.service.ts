import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CustodyStatus,
  GatePassStatus,
  Prisma,
} from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  CreateGatePassDto,
  ListGatePassesQueryDto,
  UpdateGatePassDto,
} from './dto/gate-passes.dto';

@Injectable()
export class GatePassesService {
  private readonly logger = new Logger(GatePassesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthUser, dto: CreateGatePassDto) {
    const issue = new Date(dto.issueDate);
    const expiry = new Date(dto.expiryDate);
    if (Number.isNaN(issue.getTime()) || Number.isNaN(expiry.getTime())) {
      throw new BadRequestException('Invalid issue or expiry date');
    }
    if (expiry <= issue) throw new BadRequestException('expiryDate must be after issueDate');

    const staff = await this.prisma.staff.findUnique({
      where: { id: dto.staffId },
      select: { id: true, isActive: true, name: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    if (!staff.isActive) {
      throw new BadRequestException(
        `Cannot issue a gate pass to ${staff.name} — staff member is inactive. Reactivate them first.`,
      );
    }

    return this.prisma.gatePass.create({
      data: {
        tenantId: actor.tenantId,   // explicit — middleware loses AsyncLocalStorage context
        passNumber: dto.passNumber,
        staffId: dto.staffId,
        organization: dto.organization,
        department: dto.department,
        airport: dto.airport,
        issueDate: issue,
        expiryDate: expiry,
        status: this.deriveStatus(expiry),
        passScanFrontUrl: dto.passScanFrontUrl,
        passScanBackUrl: dto.passScanBackUrl,
        receiptScanUrl: dto.receiptScanUrl,
        zones: { create: dto.zoneCodes.map((z) => ({ zoneCode: z })) },
        custodyHistory: {
          create: {
            tenantId: actor.tenantId,
            toStatus: CustodyStatus.WITH_COMPANY,
            changedById: actor.id,
            notes: 'Initial custody on issuance',
          },
        },
      } as Prisma.GatePassUncheckedCreateInput,
      include: { zones: true, staff: true },
    });
  }

  async list(query: ListGatePassesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.GatePassWhereInput = {};

    if (query.status?.length) where.status = { in: query.status };
    if (query.airport) where.airport = query.airport;
    if (query.custodyStatus) where.custodyStatus = query.custodyStatus;
    if (query.company) where.organization = { contains: query.company, mode: 'insensitive' };
    if (query.zone) where.zones = { some: { zoneCode: query.zone } };

    if (query.expiryFrom || query.expiryTo) {
      where.expiryDate = {};
      if (query.expiryFrom) where.expiryDate.gte = new Date(query.expiryFrom);
      if (query.expiryTo) where.expiryDate.lte = new Date(query.expiryTo);
    }

    if (query.pendingHandover) {
      where.AND = [
        { status: { in: [GatePassStatus.CANCELLATION_REQUESTED, GatePassStatus.EXPIRED] } },
        {
          custodyStatus: {
            in: [CustodyStatus.WITH_COMPANY, CustodyStatus.RETURNED_TO_COMPANY],
          },
        },
      ];
    }

    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { passNumber: { contains: q, mode: 'insensitive' } },
        { organization: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { staff: { name: { contains: q, mode: 'insensitive' } } },
        { staff: { companyName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.gatePass.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { expiryDate: 'asc' },
        include: {
          zones: { select: { zoneCode: true } },
          staff: { select: { id: true, name: true, companyName: true, photoUrl: true } },
        },
      }),
      this.prisma.gatePass.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async detail(id: string) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id },
      include: {
        zones: { select: { zoneCode: true } },
        staff: true,
        documents: { orderBy: { createdAt: 'desc' } },
        custodyHistory: {
          orderBy: { createdAt: 'desc' },
          include: { changedBy: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    return pass;
  }

  async update(actor: AuthUser, id: string, dto: UpdateGatePassDto) {
    const existing = await this.prisma.gatePass.findUnique({
      where: { id },
      select: { id: true, status: true, custodyStatus: true },
    });
    if (!existing) throw new NotFoundException('Gate pass not found');

    // Custody changes MUST go through the dedicated custody endpoints so that
    // strict transition rules + handover-doc generation + audit history all
    // run together. Block any attempt to mutate custody via the generic PATCH.
    if (dto.custodyStatus && dto.custodyStatus !== existing.custodyStatus) {
      throw new BadRequestException(
        'Custody changes must be performed via /gate-passes/:id/custody/{deliver|return|surrender}',
      );
    }
    if (
      dto.authorityHandoverDate ||
      dto.authorityOfficerName ||
      dto.authorityReferenceNumber
    ) {
      throw new BadRequestException(
        'Authority handover details must be recorded via /gate-passes/:id/custody/surrender',
      );
    }
    if (dto.handoverSignedUrl || dto.handoverUnsignedUrl) {
      throw new BadRequestException(
        'Handover documents must be managed via /gate-passes/:id/handover/{regenerate|signed}',
      );
    }

    const data: Prisma.GatePassUpdateInput = {
      organization: dto.organization,
      department: dto.department,
      airport: dto.airport,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      status: dto.status,
      passScanFrontUrl: dto.passScanFrontUrl,
      passScanBackUrl: dto.passScanBackUrl,
      receiptScanUrl: dto.receiptScanUrl,
    };

    return this.prisma.$transaction(async (tx) => {
      if (dto.zoneCodes) {
        await tx.gatePassZone.deleteMany({ where: { gatePassId: id } });
        await tx.gatePassZone.createMany({
          data: dto.zoneCodes.map((zoneCode) => ({ gatePassId: id, zoneCode })),
        });
      }

      return tx.gatePass.update({
        where: { id },
        data,
        include: { zones: true, staff: true },
      });
    });
  }

  async remove(id: string) {
    const exists = await this.prisma.gatePass.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Gate pass not found');
    // Soft-archive: keep record but mark cancelled.
    return this.prisma.gatePass.update({
      where: { id },
      data: { status: GatePassStatus.CANCELLED },
    });
  }

  async stats() {
    const grouped = await this.prisma.gatePass.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    );
    const total = grouped.reduce((acc, g) => acc + g._count._all, 0);
    return { total, byStatus };
  }

  /**
   * Status derived from expiry distance. Used when creating, and also by the
   * scheduled expiry job to bump rows nightly.
   */
  private deriveStatus(expiry: Date, today = new Date()): GatePassStatus {
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 3600 * 1000));
    if (diffDays < 0) return GatePassStatus.EXPIRED;
    if (diffDays <= 7) return GatePassStatus.EXPIRY_7;
    if (diffDays <= 15) return GatePassStatus.EXPIRY_15;
    if (diffDays <= 30) return GatePassStatus.EXPIRY_30;
    return GatePassStatus.VALID;
  }
}
