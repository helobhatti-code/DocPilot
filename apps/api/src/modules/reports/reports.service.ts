import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CustodyStatus,
  GatePassStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  ReportColumn,
  ReportFilterDto,
  ReportResult,
  ReportType,
} from './dto/reports.dto';

const ACTIVE_STATUSES: GatePassStatus[] = [
  GatePassStatus.VALID,
  GatePassStatus.EXPIRY_30,
  GatePassStatus.EXPIRY_15,
  GatePassStatus.EXPIRY_7,
];

const PENDING_ACTION_STATUSES: GatePassStatus[] = [
  GatePassStatus.RENEWAL_SUBMITTED,
  GatePassStatus.CANCELLATION_REQUESTED,
];

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(actor: AuthUser, type: ReportType, filter: ReportFilterDto): Promise<ReportResult> {
    const scoped = this.applySubcontractorScope(actor, filter);
    switch (type) {
      case 'pass-register':    return this.passRegister(scoped);
      case 'expiry':           return this.expiryReport(scoped);
      case 'compliance':       return this.complianceReport(scoped);
      case 'custody':          return this.custodyReport(scoped);
      case 'pending-handover': return this.pendingHandover(scoped);
      case 'retention':        return this.retentionReport(scoped);
      case 'zone-access':      return this.zoneAccessReport(scoped);
      case 'staff-history':    return this.staffHistoryReport(scoped);
      case 'subcontractor':    return this.subcontractorReport(scoped);
      case 'audit-trail':            return this.auditTrailReport(scoped);
      case 'vehicles-expiry':        return this.vehiclesExpiryReport(actor, scoped);
      case 'machinery-compliance':   return this.machineryComplianceReport(actor, scoped);
      case 'employees-visa-status':  return this.employeesVisaStatusReport(actor, scoped);
      case 'company-docs-compliance': return this.companyDocsComplianceReport(actor, scoped);
      case 'master-expiry':          return this.masterExpiryReport(actor, scoped);
      default:
        throw new BadRequestException(`Unknown report type: ${type}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Pass Register
  // ---------------------------------------------------------------------------
  private async passRegister(f: ReportFilterDto): Promise<ReportResult> {
    const where = this.gatePassWhere(f);
    const rows = await this.prisma.gatePass.findMany({
      where,
      orderBy: { expiryDate: 'asc' },
      include: {
        staff: { select: { name: true, companyName: true, designation: true, nationality: true } },
        zones: { select: { zoneCode: true } },
      },
      take: f.pageSize ?? 500,
    });

    const flattened = rows.map((p) => ({
      passNumber: p.passNumber,
      staffName: p.staff?.name ?? '',
      designation: p.staff?.designation ?? '',
      nationality: p.staff?.nationality ?? '',
      company: p.organization ?? p.staff?.companyName ?? '',
      department: p.department ?? '',
      airport: p.airport,
      zones: p.zones.map((z) => z.zoneCode).join(', '),
      issueDate: this.dateOnly(p.issueDate),
      expiryDate: this.dateOnly(p.expiryDate),
      status: p.status,
      custodyStatus: p.custodyStatus,
    }));

    return {
      type: 'pass-register',
      title: 'Pass Register',
      generatedAt: new Date().toISOString(),
      total: flattened.length,
      columns: [
        { key: 'passNumber',    label: 'Pass #',       width: 12 },
        { key: 'staffName',     label: 'Staff',        width: 24 },
        { key: 'designation',   label: 'Designation',  width: 18 },
        { key: 'nationality',   label: 'Nationality',  width: 14 },
        { key: 'company',       label: 'Company',      width: 22 },
        { key: 'department',    label: 'Department',   width: 18 },
        { key: 'airport',       label: 'Airport',      width: 10 },
        { key: 'zones',         label: 'Zones',        width: 18 },
        { key: 'issueDate',     label: 'Issued',       width: 12, format: 'date' },
        { key: 'expiryDate',    label: 'Expires',      width: 12, format: 'date' },
        { key: 'status',        label: 'Status',       width: 16, format: 'pill' },
        { key: 'custodyStatus', label: 'Custody',      width: 18, format: 'pill' },
      ],
      rows: flattened,
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Expiry Report — grouped by 30/15/7/expired
  // ---------------------------------------------------------------------------
  private async expiryReport(f: ReportFilterDto): Promise<ReportResult> {
    const where = this.gatePassWhere(f);
    where.status = { in: [
      GatePassStatus.EXPIRY_30,
      GatePassStatus.EXPIRY_15,
      GatePassStatus.EXPIRY_7,
      GatePassStatus.EXPIRED,
    ] };

    const rows = await this.prisma.gatePass.findMany({
      where,
      orderBy: { expiryDate: 'asc' },
      include: {
        staff: { select: { name: true, companyName: true } },
        zones: { select: { zoneCode: true } },
      },
    });
    const today = startOfDay(new Date());
    const flat = rows.map((p) => {
      const expiry = startOfDay(p.expiryDate);
      const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
      const bucket =
        p.status === GatePassStatus.EXPIRED ? 'Expired' :
        days <= 7 ? 'Within 7 days' :
        days <= 15 ? 'Within 15 days' : 'Within 30 days';
      return {
        bucket,
        passNumber: p.passNumber,
        staffName: p.staff?.name ?? '',
        company: p.organization ?? p.staff?.companyName ?? '',
        airport: p.airport,
        zones: p.zones.map((z) => z.zoneCode).join(', '),
        expiryDate: this.dateOnly(p.expiryDate),
        daysToExpiry: days,
        status: p.status,
      };
    });

    const buckets = ['Within 7 days', 'Within 15 days', 'Within 30 days', 'Expired'];
    const groups = buckets.map((label) => ({
      key: label,
      label,
      rows: flat.filter((r) => r.bucket === label),
    })).filter((g) => g.rows.length > 0);

    return {
      type: 'expiry',
      title: 'Expiry Report',
      generatedAt: new Date().toISOString(),
      total: flat.length,
      columns: [
        { key: 'passNumber',   label: 'Pass #',      width: 12 },
        { key: 'staffName',    label: 'Staff',       width: 24 },
        { key: 'company',      label: 'Company',     width: 22 },
        { key: 'airport',      label: 'Airport',     width: 10 },
        { key: 'zones',        label: 'Zones',       width: 18 },
        { key: 'expiryDate',   label: 'Expiry',      width: 12, format: 'date' },
        { key: 'daysToExpiry', label: 'Days',        width: 8,  format: 'number' },
        { key: 'status',       label: 'Status',      width: 14, format: 'pill' },
      ],
      rows: flat,
      groups,
      summary: {
        within7: flat.filter((r) => r.bucket === 'Within 7 days').length,
        within15: flat.filter((r) => r.bucket === 'Within 15 days').length,
        within30: flat.filter((r) => r.bucket === 'Within 30 days').length,
        expired: flat.filter((r) => r.bucket === 'Expired').length,
      },
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Compliance Report — overdue renewals/cancellations/handovers
  // ---------------------------------------------------------------------------
  private async complianceReport(f: ReportFilterDto): Promise<ReportResult> {
    const today = startOfDay(new Date());
    const sub = this.subcontractorScope(f);

    const overdueRenewals = await this.prisma.gatePass.findMany({
      where: {
        ...sub,
        status: GatePassStatus.RENEWAL_SUBMITTED,
        renewalSubmittedAt: { lt: addDays(today, -5) },
      },
      include: { staff: { select: { name: true, companyName: true } } },
    });
    const overdueCancellations = await this.prisma.gatePass.findMany({
      where: {
        ...sub,
        status: GatePassStatus.CANCELLATION_REQUESTED,
        cancellationRequestedAt: { lt: addDays(today, -5) },
      },
      include: { staff: { select: { name: true, companyName: true } } },
    });
    const overdueHandovers = await this.prisma.gatePass.findMany({
      where: {
        ...sub,
        custodyStatus: CustodyStatus.RETURNED_TO_COMPANY,
      },
      include: {
        staff: { select: { name: true, companyName: true } },
        custodyHistory: {
          where: { toStatus: CustodyStatus.RETURNED_TO_COMPANY },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const flat = [
      ...overdueRenewals.map((p) => ({
        category: 'Overdue Renewal',
        passNumber: p.passNumber,
        staffName: p.staff?.name ?? '',
        company: p.organization ?? p.staff?.companyName ?? '',
        sinceDate: this.dateOnly(p.renewalSubmittedAt!),
        daysOverdue: Math.floor((today.getTime() - p.renewalSubmittedAt!.getTime()) / 86_400_000) - 5,
      })),
      ...overdueCancellations.map((p) => ({
        category: 'Overdue Cancellation',
        passNumber: p.passNumber,
        staffName: p.staff?.name ?? '',
        company: p.organization ?? p.staff?.companyName ?? '',
        sinceDate: this.dateOnly(p.cancellationRequestedAt!),
        daysOverdue: Math.floor((today.getTime() - p.cancellationRequestedAt!.getTime()) / 86_400_000) - 5,
      })),
      ...overdueHandovers
        .map((p) => {
          const since = p.custodyHistory[0]?.createdAt ?? p.updatedAt;
          const days = Math.floor((today.getTime() - startOfDay(since).getTime()) / 86_400_000);
          return {
            category: 'Pending Authority Handover',
            passNumber: p.passNumber,
            staffName: p.staff?.name ?? '',
            company: p.organization ?? p.staff?.companyName ?? '',
            sinceDate: this.dateOnly(since),
            daysOverdue: days - 7,
          };
        })
        .filter((r) => r.daysOverdue > 0),
    ];

    const groups = ['Overdue Renewal', 'Overdue Cancellation', 'Pending Authority Handover']
      .map((label) => ({ key: label, label, rows: flat.filter((r) => r.category === label) }))
      .filter((g) => g.rows.length > 0);

    return {
      type: 'compliance',
      title: 'Compliance Report',
      generatedAt: new Date().toISOString(),
      total: flat.length,
      columns: [
        { key: 'category',    label: 'Category',     width: 24, format: 'pill' },
        { key: 'passNumber',  label: 'Pass #',       width: 12 },
        { key: 'staffName',   label: 'Staff',        width: 22 },
        { key: 'company',     label: 'Company',      width: 22 },
        { key: 'sinceDate',   label: 'Since',        width: 12, format: 'date' },
        { key: 'daysOverdue', label: 'Days overdue', width: 10, format: 'number' },
      ],
      rows: flat,
      groups,
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Custody Report — grouped by custody status
  // ---------------------------------------------------------------------------
  private async custodyReport(f: ReportFilterDto): Promise<ReportResult> {
    const where = this.gatePassWhere(f);
    const rows = await this.prisma.gatePass.findMany({
      where,
      orderBy: [{ custodyStatus: 'asc' }, { updatedAt: 'desc' }],
      include: {
        staff: { select: { name: true, companyName: true } },
      },
    });
    const flat = rows.map((p) => ({
      custodyStatus: p.custodyStatus,
      passNumber: p.passNumber,
      staffName: p.staff?.name ?? '',
      company: p.organization ?? p.staff?.companyName ?? '',
      authorityHandoverDate: this.dateOnly(p.authorityHandoverDate),
      authorityOfficerName: p.authorityOfficerName ?? '',
      lastUpdated: this.dateOnly(p.updatedAt),
    }));
    const order: CustodyStatus[] = [
      CustodyStatus.WITH_COMPANY,
      CustodyStatus.WITH_PERSON,
      CustodyStatus.RETURNED_TO_COMPANY,
      CustodyStatus.SURRENDERED_TO_AUTHORITY,
    ];
    const groups = order.map((s) => ({
      key: s,
      label: this.custodyLabel(s),
      rows: flat.filter((r) => r.custodyStatus === s),
    })).filter((g) => g.rows.length > 0);

    return {
      type: 'custody',
      title: 'Custody Report',
      generatedAt: new Date().toISOString(),
      total: flat.length,
      columns: [
        { key: 'custodyStatus',         label: 'Custody',      width: 22, format: 'pill' },
        { key: 'passNumber',            label: 'Pass #',       width: 12 },
        { key: 'staffName',             label: 'Staff',        width: 22 },
        { key: 'company',               label: 'Company',      width: 22 },
        { key: 'authorityHandoverDate', label: 'Surrendered',  width: 14, format: 'date' },
        { key: 'authorityOfficerName',  label: 'Officer',      width: 22 },
        { key: 'lastUpdated',           label: 'Updated',      width: 12, format: 'date' },
      ],
      rows: flat,
      groups,
      summary: Object.fromEntries(
        order.map((s) => [s, flat.filter((r) => r.custodyStatus === s).length]),
      ),
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Pending Handover — RETURNED_TO_COMPANY with days elapsed
  // ---------------------------------------------------------------------------
  private async pendingHandover(f: ReportFilterDto): Promise<ReportResult> {
    const sub = this.subcontractorScope(f);
    const rows = await this.prisma.gatePass.findMany({
      where: { ...sub, custodyStatus: CustodyStatus.RETURNED_TO_COMPANY },
      include: {
        staff: { select: { name: true, companyName: true } },
        custodyHistory: {
          where: { toStatus: CustodyStatus.RETURNED_TO_COMPANY },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });
    const today = startOfDay(new Date()).getTime();
    const flat = rows.map((p) => {
      const since = p.custodyHistory[0]?.createdAt ?? p.updatedAt;
      const days = Math.floor((today - startOfDay(since).getTime()) / 86_400_000);
      return {
        passNumber: p.passNumber,
        staffName: p.staff?.name ?? '',
        company: p.organization ?? p.staff?.companyName ?? '',
        returnedAt: this.dateOnly(since),
        daysElapsed: days,
        overdue: days > 7 ? 'Yes' : 'No',
      };
    });

    return {
      type: 'pending-handover',
      title: 'Pending Authority Handover',
      generatedAt: new Date().toISOString(),
      total: flat.length,
      columns: [
        { key: 'passNumber',  label: 'Pass #',     width: 12 },
        { key: 'staffName',   label: 'Staff',      width: 22 },
        { key: 'company',     label: 'Company',    width: 22 },
        { key: 'returnedAt',  label: 'Returned',   width: 12, format: 'date' },
        { key: 'daysElapsed', label: 'Days',       width: 8,  format: 'number' },
        { key: 'overdue',     label: 'Overdue?',   width: 10, format: 'pill' },
      ],
      rows: flat,
      summary: {
        total: flat.length,
        overdue: flat.filter((r) => r.overdue === 'Yes').length,
      },
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Data Retention — scheduled deletions w/ countdown
  // ---------------------------------------------------------------------------
  private async retentionReport(f: ReportFilterDto): Promise<ReportResult> {
    const sub = this.subcontractorScope(f);
    const rows = await this.prisma.gatePass.findMany({
      where: {
        ...sub,
        status: GatePassStatus.CANCELLED,
        dataDeletionScheduledAt: { not: null },
      },
      orderBy: { dataDeletionScheduledAt: 'asc' },
      include: {
        staff: { select: { name: true, companyName: true } },
      },
    });
    const today = startOfDay(new Date()).getTime();
    const flat = rows.map((p) => {
      const due = p.dataDeletionScheduledAt!.getTime();
      const days = Math.ceil((due - today) / 86_400_000);
      return {
        passNumber: p.passNumber,
        staffName: p.staff?.name ?? '',
        company: p.organization ?? p.staff?.companyName ?? '',
        cancelledAt: this.dateOnly(p.cancellationCompletedAt),
        scheduledDeletion: this.dateOnly(p.dataDeletionScheduledAt),
        daysUntilDeletion: days,
      };
    });

    return {
      type: 'retention',
      title: 'Data Retention',
      generatedAt: new Date().toISOString(),
      total: flat.length,
      columns: [
        { key: 'passNumber',         label: 'Pass #',       width: 12 },
        { key: 'staffName',          label: 'Staff',        width: 22 },
        { key: 'company',            label: 'Company',      width: 22 },
        { key: 'cancelledAt',        label: 'Cancelled',    width: 12, format: 'date' },
        { key: 'scheduledDeletion',  label: 'Scheduled',    width: 12, format: 'date' },
        { key: 'daysUntilDeletion',  label: 'Days left',    width: 10, format: 'number' },
      ],
      rows: flat,
      summary: {
        total: flat.length,
        within7: flat.filter((r) => r.daysUntilDeletion <= 7).length,
      },
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 7. Zone Access — grouped by zone with status breakdown
  // ---------------------------------------------------------------------------
  private async zoneAccessReport(f: ReportFilterDto): Promise<ReportResult> {
    // Query GatePass (tenant-scoped) and fan out by zone — keeps the tenant
    // middleware in charge of isolation.
    const where: Prisma.GatePassWhereInput = { ...this.subcontractorScope(f) };
    if (f.zone) where.zones = { some: { zoneCode: f.zone } };
    const passes = await this.prisma.gatePass.findMany({
      where,
      select: {
        passNumber: true,
        status: true,
        organization: true,
        zones: { select: { zoneCode: true } },
        staff: { select: { name: true, companyName: true } },
      },
    });
    const flat = passes.flatMap((p) =>
      p.zones.map((z) => ({
        zone: z.zoneCode,
        passNumber: p.passNumber,
        staffName: p.staff?.name ?? '',
        company: p.organization ?? p.staff?.companyName ?? '',
        status: p.status,
        isActive: ACTIVE_STATUSES.includes(p.status) ? 'Active' : 'Inactive',
      })),
    );

    const zoneOrder = Array.from(new Set(flat.map((r) => r.zone))).sort();
    const groups = zoneOrder.map((z) => ({
      key: z,
      label: z,
      rows: flat.filter((r) => r.zone === z),
    }));

    return {
      type: 'zone-access',
      title: 'Zone Access',
      generatedAt: new Date().toISOString(),
      total: flat.length,
      columns: [
        { key: 'zone',       label: 'Zone',     width: 10 },
        { key: 'passNumber', label: 'Pass #',   width: 12 },
        { key: 'staffName',  label: 'Staff',    width: 22 },
        { key: 'company',    label: 'Company',  width: 22 },
        { key: 'status',     label: 'Status',   width: 16, format: 'pill' },
        { key: 'isActive',   label: 'Active?',  width: 10, format: 'pill' },
      ],
      rows: flat,
      groups,
      summary: Object.fromEntries(
        zoneOrder.map((z) => [z, flat.filter((r) => r.zone === z && r.isActive === 'Active').length]),
      ),
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 8. Staff Pass History — single staff, timeline
  // ---------------------------------------------------------------------------
  private async staffHistoryReport(f: ReportFilterDto): Promise<ReportResult> {
    if (!f.staffId) throw new BadRequestException('staffId is required');
    const staff = await this.prisma.staff.findUnique({
      where: { id: f.staffId },
      select: { id: true, name: true, companyName: true, designation: true, nationality: true },
    });
    if (!staff) throw new BadRequestException('Staff not found');

    const passes = await this.prisma.gatePass.findMany({
      where: { staffId: f.staffId },
      orderBy: { issueDate: 'desc' },
      include: { zones: { select: { zoneCode: true } } },
    });

    const flat = passes.map((p) => ({
      passNumber: p.passNumber,
      airport: p.airport,
      zones: p.zones.map((z) => z.zoneCode).join(', '),
      issueDate: this.dateOnly(p.issueDate),
      expiryDate: this.dateOnly(p.expiryDate),
      status: p.status,
      custodyStatus: p.custodyStatus,
      cancelledAt: this.dateOnly(p.cancellationCompletedAt),
    }));

    return {
      type: 'staff-history',
      title: `Pass History — ${staff.name}`,
      generatedAt: new Date().toISOString(),
      total: flat.length,
      columns: [
        { key: 'passNumber',    label: 'Pass #',      width: 12 },
        { key: 'airport',       label: 'Airport',     width: 10 },
        { key: 'zones',         label: 'Zones',       width: 18 },
        { key: 'issueDate',     label: 'Issued',      width: 12, format: 'date' },
        { key: 'expiryDate',    label: 'Expires',     width: 12, format: 'date' },
        { key: 'status',        label: 'Status',      width: 16, format: 'pill' },
        { key: 'custodyStatus', label: 'Custody',     width: 18, format: 'pill' },
        { key: 'cancelledAt',   label: 'Cancelled',   width: 12, format: 'date' },
      ],
      rows: flat,
      summary: {
        staffName: staff.name,
        company: staff.companyName ?? '',
        designation: staff.designation ?? '',
        nationality: staff.nationality ?? '',
        totalPasses: flat.length,
      },
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 9. Subcontractor Report — per-org compliance scores
  // ---------------------------------------------------------------------------
  private async subcontractorReport(f: ReportFilterDto): Promise<ReportResult> {
    const orgs = await this.prisma.subcontractorOrg.findMany({
      where: f.subcontractorOrgId ? { id: f.subcontractorOrgId } : {},
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      orgs.map(async (org) => {
        const passes = await this.prisma.gatePass.findMany({
          where: { staff: { subcontractorOrgId: org.id } },
          select: { status: true },
        });
        const active = passes.filter((p) => ACTIVE_STATUSES.includes(p.status)).length;
        const expiringSet: GatePassStatus[] = [
          GatePassStatus.EXPIRY_30,
          GatePassStatus.EXPIRY_15,
          GatePassStatus.EXPIRY_7,
        ];
        const expiring = passes.filter((p) => expiringSet.includes(p.status)).length;
        const expired = passes.filter((p) => p.status === GatePassStatus.EXPIRED).length;
        const cancelled = passes.filter((p) => p.status === GatePassStatus.CANCELLED).length;
        const total = passes.length;
        const compliance = total > 0
          ? Math.round(((active - expiring) / total) * 100)
          : 100;
        return {
          subcontractorOrgId: org.id,
          name: org.name,
          contactPerson: org.contactPerson ?? '',
          contactEmail: org.contactEmail ?? '',
          total,
          active,
          expiring,
          expired,
          cancelled,
          complianceScore: Math.max(0, Math.min(100, compliance)),
        };
      }),
    );

    return {
      type: 'subcontractor',
      title: 'Subcontractor Report',
      generatedAt: new Date().toISOString(),
      total: rows.length,
      columns: [
        { key: 'name',             label: 'Organisation',  width: 28 },
        { key: 'contactPerson',    label: 'Contact',       width: 20 },
        { key: 'total',            label: 'Total',         width: 8,  format: 'number' },
        { key: 'active',           label: 'Active',        width: 8,  format: 'number' },
        { key: 'expiring',         label: 'Expiring',      width: 10, format: 'number' },
        { key: 'expired',          label: 'Expired',       width: 8,  format: 'number' },
        { key: 'cancelled',        label: 'Cancelled',     width: 10, format: 'number' },
        { key: 'complianceScore',  label: 'Compliance %',  width: 12, format: 'number' },
      ],
      rows,
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 10. Audit Trail — searchable log
  // ---------------------------------------------------------------------------
  private async auditTrailReport(f: ReportFilterDto): Promise<ReportResult> {
    const where: Prisma.AuditLogWhereInput = {};
    if (f.action) where.action = { contains: f.action, mode: 'insensitive' };
    if (f.from || f.to) {
      where.createdAt = {};
      if (f.from) where.createdAt.gte = new Date(f.from);
      if (f.to) where.createdAt.lte = new Date(f.to);
    }
    if (f.q) {
      where.OR = [
        { action: { contains: f.q, mode: 'insensitive' } },
        { entityType: { contains: f.q, mode: 'insensitive' } },
        { entityId: { contains: f.q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: f.pageSize ?? 200,
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const flat = rows.map((r) => ({
      timestamp: r.createdAt.toISOString(),
      actor: r.user?.name ?? r.user?.email ?? '—',
      action: r.action,
      entityType: r.entityType ?? '',
      entityId: r.entityId ?? '',
      ipAddress: r.ipAddress ?? '',
      details: r.details ? JSON.stringify(r.details) : '',
    }));

    return {
      type: 'audit-trail',
      title: 'Audit Trail',
      generatedAt: new Date().toISOString(),
      total: flat.length,
      columns: [
        { key: 'timestamp',  label: 'Timestamp',    width: 22, format: 'datetime' },
        { key: 'actor',      label: 'Actor',        width: 22 },
        { key: 'action',     label: 'Action',       width: 28 },
        { key: 'entityType', label: 'Entity',       width: 14 },
        { key: 'entityId',   label: 'Entity ID',    width: 36 },
        { key: 'ipAddress',  label: 'IP',           width: 14 },
        { key: 'details',    label: 'Details',      width: 40 },
      ],
      rows: flat,
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 11. Vehicles Expiry Report
  // ---------------------------------------------------------------------------
  private async vehiclesExpiryReport(actor: AuthUser, f: ReportFilterDto): Promise<ReportResult> {
    const daysAhead = f.daysAhead ?? 30;
    const today = startOfDay(new Date());
    const cutoff = addDays(today, daysAhead);

    const where: Prisma.VehicleWhereInput = { isActive: true };
    if (f.companyId) where.companyId = f.companyId;

    // Fetch vehicles where any expiry date falls within the window
    where.OR = [
      { carLicenseExpiryDate: { lte: cutoff } },
      { insuranceExpiryDate: { lte: cutoff } },
      { residentialMawaqifExpiryDate: { lte: cutoff }, hasResidentialMawaqif: true },
      { normalMawaqifExpiryDate: { lte: cutoff }, hasNormalMawaqif: true },
    ];

    const vehicles = await this.prisma.vehicle.findMany({
      where,
      orderBy: { carLicenseExpiryDate: 'asc' },
      include: { company: { select: { name: true } } },
    });

    const rows = vehicles
      .map((v) => {
        const carLicenseDays = this.daysBetween(today, v.carLicenseExpiryDate);
        const insuranceDays  = this.daysBetween(today, v.insuranceExpiryDate);
        const resMawaqifDays = v.hasResidentialMawaqif && v.residentialMawaqifExpiryDate
          ? this.daysBetween(today, v.residentialMawaqifExpiryDate)
          : null;
        const normMawaqifDays = v.hasNormalMawaqif && v.normalMawaqifExpiryDate
          ? this.daysBetween(today, v.normalMawaqifExpiryDate)
          : null;

        const carLicenseBand  = bandFromDays(carLicenseDays);
        const insuranceBand   = bandFromDays(insuranceDays);
        const resMawaqifBand  = resMawaqifDays !== null ? bandFromDays(resMawaqifDays) : null;
        const normMawaqifBand = normMawaqifDays !== null ? bandFromDays(normMawaqifDays) : null;
        const worstExpiryBand = worstBand(carLicenseBand, insuranceBand, resMawaqifBand, normMawaqifBand);

        return {
          vehicleId:                    v.id,
          vehicleType:                  v.vehicleType,
          ownerName:                    v.ownerName,
          carMake:                      v.carMake,
          plateNumber:                  v.plateNumber,
          carLicenseExpiryDate:         this.dateOnly(v.carLicenseExpiryDate),
          carLicenseExpiryBand:         carLicenseBand,
          insuranceExpiryDate:          this.dateOnly(v.insuranceExpiryDate),
          insuranceExpiryBand:          insuranceBand,
          residentialMawaqifExpiryDate: v.hasResidentialMawaqif ? this.dateOnly(v.residentialMawaqifExpiryDate) : null,
          residentialMawaqifBand:       resMawaqifBand,
          normalMawaqifExpiryDate:      v.hasNormalMawaqif ? this.dateOnly(v.normalMawaqifExpiryDate) : null,
          normalMawaqifBand:            normMawaqifBand,
          worstExpiryBand,
          companyName:                  v.company?.name ?? '',
        };
      })
      .filter((r) => r.worstExpiryBand !== 'valid');

    return {
      type: 'vehicles-expiry',
      title: 'Vehicles Expiry Report',
      generatedAt: new Date().toISOString(),
      total: rows.length,
      columns: [
        { key: 'carMake',                       label: 'Make',              width: 14 },
        { key: 'plateNumber',                   label: 'Plate',             width: 14 },
        { key: 'vehicleType',                   label: 'Type',              width: 10, format: 'pill' },
        { key: 'ownerName',                     label: 'Owner',             width: 22 },
        { key: 'carLicenseExpiryDate',          label: 'Car Lic Expiry',    width: 14, format: 'date' },
        { key: 'carLicenseExpiryBand',          label: 'Car Lic Band',      width: 12, format: 'pill' },
        { key: 'insuranceExpiryDate',           label: 'Insurance Expiry',  width: 14, format: 'date' },
        { key: 'insuranceExpiryBand',           label: 'Ins. Band',         width: 12, format: 'pill' },
        { key: 'residentialMawaqifExpiryDate',  label: 'Res. Mawaqif Exp',  width: 14, format: 'date' },
        { key: 'residentialMawaqifBand',        label: 'Res. Band',         width: 12, format: 'pill' },
        { key: 'normalMawaqifExpiryDate',       label: 'Norm. Mawaqif Exp', width: 14, format: 'date' },
        { key: 'normalMawaqifBand',             label: 'Norm. Band',        width: 12, format: 'pill' },
        { key: 'worstExpiryBand',               label: 'Worst Band',        width: 12, format: 'pill' },
        { key: 'companyName',                   label: 'Company',           width: 22 },
      ],
      rows,
      summary: {
        total: rows.length,
        expired: rows.filter((r) => r.worstExpiryBand === 'expired').length,
        '7d':    rows.filter((r) => r.worstExpiryBand === '7d').length,
        '14d':   rows.filter((r) => r.worstExpiryBand === '14d').length,
        '30d':   rows.filter((r) => r.worstExpiryBand === '30d').length,
      },
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 12. Heavy Machinery Compliance Report
  // ---------------------------------------------------------------------------
  private async machineryComplianceReport(actor: AuthUser, f: ReportFilterDto): Promise<ReportResult> {
    const where: Prisma.HeavyMachineryWhereInput = { isActive: true };
    if (f.companyId) where.companyId = f.companyId;

    const machines = await this.prisma.heavyMachinery.findMany({
      where,
      orderBy: { make: 'asc' },
      include: { company: { select: { name: true } } },
    });

    const today = startOfDay(new Date());

    const rows = machines.map((m) => {
      const opBand   = m.operatorLicenseExpiryDate  ? bandFromDays(this.daysBetween(today, m.operatorLicenseExpiryDate))  : null;
      const insBand  = m.inspectionExpiryDate        ? bandFromDays(this.daysBetween(today, m.inspectionExpiryDate))        : null;
      const rtaBand  = m.rtaRegistrationExpiryDate   ? bandFromDays(this.daysBetween(today, m.rtaRegistrationExpiryDate))   : null;
      const liftBand = m.liftingTestExpiryDate       ? bandFromDays(this.daysBetween(today, m.liftingTestExpiryDate))       : null;
      const insBand2 = m.insuranceExpiryDate         ? bandFromDays(this.daysBetween(today, m.insuranceExpiryDate))         : null;
      const cdBand   = m.civilDefenseExpiryDate      ? bandFromDays(this.daysBetween(today, m.civilDefenseExpiryDate))      : null;
      const worst    = worstBand(opBand, insBand, rtaBand, liftBand, insBand2, cdBand);

      return {
        machineryId:                  m.id,
        machineType:                  m.machineType,
        make:                         m.make,
        serialNumber:                 m.serialNumber,
        status:                       m.status,
        assignedOperator:             m.assignedOperator ?? '',
        projectSite:                  m.projectSite ?? '',
        operatorLicenseExpiryDate:    this.dateOnly(m.operatorLicenseExpiryDate),
        operatorLicenseExpiryBand:    opBand,
        inspectionExpiryDate:         this.dateOnly(m.inspectionExpiryDate),
        inspectionExpiryBand:         insBand,
        rtaRegistrationExpiryDate:    this.dateOnly(m.rtaRegistrationExpiryDate),
        rtaRegistrationExpiryBand:    rtaBand,
        liftingTestExpiryDate:        this.dateOnly(m.liftingTestExpiryDate),
        liftingTestExpiryBand:        liftBand,
        insuranceExpiryDate:          this.dateOnly(m.insuranceExpiryDate),
        insuranceExpiryBand:          insBand2,
        civilDefenseExpiryDate:       this.dateOnly(m.civilDefenseExpiryDate),
        civilDefenseExpiryBand:       cdBand,
        worstExpiryBand:              worst,
        companyName:                  m.company?.name ?? '',
      };
    });

    return {
      type: 'machinery-compliance',
      title: 'Heavy Machinery Compliance',
      generatedAt: new Date().toISOString(),
      total: rows.length,
      columns: [
        { key: 'make',                        label: 'Make',            width: 14 },
        { key: 'machineType',                 label: 'Type',            width: 18 },
        { key: 'serialNumber',                label: 'Serial #',        width: 18 },
        { key: 'status',                      label: 'Status',          width: 14, format: 'pill' },
        { key: 'assignedOperator',            label: 'Operator',        width: 20 },
        { key: 'projectSite',                 label: 'Site',            width: 18 },
        { key: 'operatorLicenseExpiryDate',   label: 'Op. Lic Exp',     width: 12, format: 'date' },
        { key: 'operatorLicenseExpiryBand',   label: 'Op. Lic Band',    width: 12, format: 'pill' },
        { key: 'inspectionExpiryDate',        label: 'Inspection Exp',  width: 12, format: 'date' },
        { key: 'inspectionExpiryBand',        label: 'Insp. Band',      width: 12, format: 'pill' },
        { key: 'rtaRegistrationExpiryDate',   label: 'RTA Exp',         width: 12, format: 'date' },
        { key: 'rtaRegistrationExpiryBand',   label: 'RTA Band',        width: 12, format: 'pill' },
        { key: 'liftingTestExpiryDate',       label: 'Lift Test Exp',   width: 12, format: 'date' },
        { key: 'liftingTestExpiryBand',       label: 'Lift Band',       width: 12, format: 'pill' },
        { key: 'insuranceExpiryDate',         label: 'Insurance Exp',   width: 12, format: 'date' },
        { key: 'insuranceExpiryBand',         label: 'Ins. Band',       width: 12, format: 'pill' },
        { key: 'civilDefenseExpiryDate',      label: 'Civil Def Exp',   width: 12, format: 'date' },
        { key: 'civilDefenseExpiryBand',      label: 'CD Band',         width: 12, format: 'pill' },
        { key: 'worstExpiryBand',             label: 'Worst Band',      width: 12, format: 'pill' },
        { key: 'companyName',                 label: 'Company',         width: 22 },
      ],
      rows,
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 13. Employees Visa Status Report
  // ---------------------------------------------------------------------------
  private async employeesVisaStatusReport(actor: AuthUser, f: ReportFilterDto): Promise<ReportResult> {
    const where: Prisma.EmployeeWhereInput = { isActive: true, status: 'ACTIVE' };
    if (f.companyId) where.companyId = f.companyId;

    const employees = await this.prisma.employee.findMany({
      where,
      orderBy: { visaExpiryDate: 'asc' },
      include: { company: { select: { name: true } } },
    });

    const today = startOfDay(new Date());

    const rows = employees
      .map((e) => {
        const visaDays             = this.daysBetween(today, e.visaExpiryDate);
        const visaExpiryBand       = bandFromDays(visaDays);
        const emiratesIdBand       = e.emiratesIdExpiryDate ? bandFromDays(this.daysBetween(today, e.emiratesIdExpiryDate)) : null;
        const laborCardBand        = e.laborCardExpiryDate  ? bandFromDays(this.daysBetween(today, e.laborCardExpiryDate))  : null;
        const passportBand         = e.passportExpiryDate   ? bandFromDays(this.daysBetween(today, e.passportExpiryDate))   : null;
        const worst                = worstBand(visaExpiryBand, emiratesIdBand, laborCardBand, passportBand);

        return {
          employeeId:           e.id,
          name:                 e.name,
          designation:          e.designation,
          visaExpiryDate:       this.dateOnly(e.visaExpiryDate),
          visaExpiryBand,
          daysUntilVisaExpiry:  visaDays,
          emiratesIdExpiryBand: emiratesIdBand,
          laborCardExpiryBand:  laborCardBand,
          worstExpiryBand:      worst,
          companyName:          e.company?.name ?? '',
        };
      })
      .filter((r) => !f.band || f.band.split(',').map((b) => b.trim()).includes(r.visaExpiryBand));

    return {
      type: 'employees-visa-status',
      title: 'Employees Visa Status',
      generatedAt: new Date().toISOString(),
      total: rows.length,
      columns: [
        { key: 'name',                  label: 'Name',              width: 24 },
        { key: 'designation',           label: 'Designation',       width: 20 },
        { key: 'visaExpiryDate',        label: 'Visa Expiry',       width: 12, format: 'date' },
        { key: 'visaExpiryBand',        label: 'Visa Band',         width: 12, format: 'pill' },
        { key: 'daysUntilVisaExpiry',   label: 'Days',              width: 8,  format: 'number' },
        { key: 'emiratesIdExpiryBand',  label: 'EID Band',          width: 12, format: 'pill' },
        { key: 'laborCardExpiryBand',   label: 'Labor Card Band',   width: 14, format: 'pill' },
        { key: 'worstExpiryBand',       label: 'Worst Band',        width: 12, format: 'pill' },
        { key: 'companyName',           label: 'Company',           width: 22 },
      ],
      rows,
      summary: {
        total:   rows.length,
        expired: rows.filter((r) => r.visaExpiryBand === 'expired').length,
        '7d':    rows.filter((r) => r.visaExpiryBand === '7d').length,
        '14d':   rows.filter((r) => r.visaExpiryBand === '14d').length,
        '30d':   rows.filter((r) => r.visaExpiryBand === '30d').length,
      },
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 14. Company Documents Compliance Report
  // ---------------------------------------------------------------------------
  private async companyDocsComplianceReport(actor: AuthUser, f: ReportFilterDto): Promise<ReportResult> {
    const where: Prisma.CompanyDocumentWhereInput = { isActive: true };
    if (f.companyId) where.companyId = f.companyId;
    if (f.docType)   where.docType   = f.docType as never;

    const docs = await this.prisma.companyDocument.findMany({
      where,
      orderBy: { expiryDate: 'asc' },
      include: { company: { select: { name: true } } },
    });

    const today = startOfDay(new Date());

    const rows = docs
      .flatMap((d) => {
        const days          = this.daysBetween(today, d.expiryDate);
        const expiryBand    = bandFromDays(days);
        const meta          = (d.metadata ?? {}) as Record<string, string>;
        const baseRow: Record<string, unknown> = {
          documentId:        d.id,
          docType:           d.docType,
          docName:           d.docName,
          docNumber:         d.docNumber ?? '',
          expiryDate:        this.dateOnly(d.expiryDate),
          expiryBand,
          daysUntilExpiry:   days,
          status:            d.status,
          companyName:       d.company?.name ?? '',
          hassantukExpiryDate: null,
          hassantukExpiryBand: null,
        };

        if (d.docType === 'CIVIL_DEFENSE' && meta.hassantukExpiryDate) {
          const hDate = new Date(meta.hassantukExpiryDate);
          if (!Number.isNaN(hDate.getTime())) {
            const hDays = this.daysBetween(today, hDate);
            baseRow.hassantukExpiryDate = this.dateOnly(hDate);
            baseRow.hassantukExpiryBand = bandFromDays(hDays);
          }
        }

        return [baseRow];
      })
      .filter((r) => !f.band || f.band.split(',').map((b) => b.trim()).includes(String(r.expiryBand)));

    return {
      type: 'company-docs-compliance',
      title: 'Company Documents Compliance',
      generatedAt: new Date().toISOString(),
      total: rows.length,
      columns: [
        { key: 'docType',             label: 'Doc Type',          width: 18 },
        { key: 'docName',             label: 'Doc Name',          width: 28 },
        { key: 'docNumber',           label: 'Doc Number',        width: 18 },
        { key: 'expiryDate',          label: 'Expiry',            width: 12, format: 'date' },
        { key: 'expiryBand',          label: 'Band',              width: 12, format: 'pill' },
        { key: 'daysUntilExpiry',     label: 'Days',              width: 8,  format: 'number' },
        { key: 'status',              label: 'Status',            width: 14, format: 'pill' },
        { key: 'hassantukExpiryDate', label: 'Hassantuk Exp',     width: 12, format: 'date' },
        { key: 'hassantukExpiryBand', label: 'Hassantuk Band',    width: 14, format: 'pill' },
        { key: 'companyName',         label: 'Company',           width: 22 },
      ],
      rows,
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // 15. Master Expiry Report — all modules in one export
  // ---------------------------------------------------------------------------
  private async masterExpiryReport(actor: AuthUser, f: ReportFilterDto): Promise<ReportResult> {
    const bands = (f.band ?? 'expired,7d,14d,30d').split(',').map((b) => b.trim()).filter(Boolean);

    // Build WHERE conditions for days_until_expiry based on requested bands
    const bandClauses = bands.map((b) => {
      switch (b) {
        case 'expired': return 'days_until_expiry < 0';
        case '7d':      return '(days_until_expiry >= 0 AND days_until_expiry <= 7)';
        case '14d':     return '(days_until_expiry > 7 AND days_until_expiry <= 14)';
        case '30d':     return '(days_until_expiry > 14 AND days_until_expiry <= 30)';
        case 'valid':   return 'days_until_expiry > 30';
        default:        return null;
      }
    }).filter(Boolean);

    const conditions: string[] = [`tenant_id = $1`];
    const params: unknown[]    = [actor.tenantId];
    let idx = 2;

    if (bandClauses.length > 0) {
      conditions.push(`(${bandClauses.join(' OR ')})`);
    }

    if (f.companyId) {
      conditions.push(`company_id = $${idx}`);
      params.push(f.companyId);
      idx++;
    }

    const where = conditions.join(' AND ');
    const sql = `
      SELECT source, source_id, tenant_id, company_id, doc_kind, display_name,
             expiry_date, days_until_expiry
      FROM   expiry_items_v
      WHERE  ${where}
      ORDER  BY days_until_expiry ASC
      LIMIT  5000
    `;

    const rawRows = await this.prisma.$queryRawUnsafe<Array<{
      source: string; source_id: string; tenant_id: string; company_id: string | null;
      doc_kind: string; display_name: string; expiry_date: Date; days_until_expiry: number;
    }>>(sql, ...params);

    const SOURCE_NAMES: Record<string, string> = {
      gate_pass:        'Gate Passes',
      vehicle:          'Vehicles',
      machinery:        'Machinery',
      employee:         'Employees',
      company_document: 'Company Documents',
    };

    const SHEET_ORDER = ['gate_pass', 'vehicle', 'machinery', 'employee', 'company_document'];
    const EXPIRY_COLS: ReportColumn[] = [
      { key: 'display_name',       label: 'Display Name',    width: 36 },
      { key: 'doc_kind',           label: 'Doc Kind',        width: 20 },
      { key: 'expiry_date_str',    label: 'Expiry Date',     width: 12, format: 'date' },
      { key: 'days_until_expiry',  label: 'Days',            width: 8,  format: 'number' },
      { key: 'band',               label: 'Band',            width: 12, format: 'pill' },
    ];

    const flatRows = rawRows.map((r) => ({
      source:           r.source,
      source_id:        r.source_id,
      company_id:       r.company_id ?? '',
      doc_kind:         r.doc_kind,
      display_name:     r.display_name,
      expiry_date_str:  this.dateOnly(r.expiry_date),
      days_until_expiry: r.days_until_expiry,
      band:             bandFromDays(r.days_until_expiry),
    }));

    const groups = SHEET_ORDER
      .map((src) => ({
        key:   src,
        label: SOURCE_NAMES[src] ?? src,
        rows:  flatRows.filter((r) => r.source === src),
      }))
      .filter((g) => g.rows.length > 0);

    const sheets = SHEET_ORDER.map((src) => ({
      name:    SOURCE_NAMES[src] ?? src,
      columns: EXPIRY_COLS,
      rows:    flatRows.filter((r) => r.source === src),
    }));

    return {
      type: 'master-expiry',
      title: 'Master Expiry Report',
      generatedAt: new Date().toISOString(),
      total: flatRows.length,
      columns: [
        { key: 'source',             label: 'Module',          width: 18, format: 'pill' },
        ...EXPIRY_COLS,
      ],
      rows: flatRows,
      groups,
      sheets,
      summary: {
        expired: flatRows.filter((r) => r.band === 'expired').length,
        '7d':    flatRows.filter((r) => r.band === '7d').length,
        '14d':   flatRows.filter((r) => r.band === '14d').length,
        '30d':   flatRows.filter((r) => r.band === '30d').length,
      },
      filters: this.summariseFilter(f),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private gatePassWhere(f: ReportFilterDto): Prisma.GatePassWhereInput {
    const where: Prisma.GatePassWhereInput = { ...this.subcontractorScope(f) };
    if (f.status?.length) where.status = { in: f.status };
    if (f.airport) where.airport = f.airport;
    if (f.custodyStatus) where.custodyStatus = f.custodyStatus;
    if (f.zone) where.zones = { some: { zoneCode: f.zone } };
    if (f.company) where.organization = { contains: f.company, mode: 'insensitive' };
    if (f.from || f.to) {
      where.expiryDate = {};
      if (f.from) where.expiryDate.gte = new Date(f.from);
      if (f.to) where.expiryDate.lte = new Date(f.to);
    }
    if (f.q) {
      where.OR = [
        { passNumber: { contains: f.q, mode: 'insensitive' } },
        { organization: { contains: f.q, mode: 'insensitive' } },
        { staff: { name: { contains: f.q, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  private subcontractorScope(f: ReportFilterDto): Prisma.GatePassWhereInput {
    if (f.subcontractorOrgId) {
      return { staff: { subcontractorOrgId: f.subcontractorOrgId } };
    }
    return {};
  }

  /**
   * Subcontractors only see their own org. We mutate the filter in place so any
   * downstream dimension uses the org scope automatically.
   */
  private applySubcontractorScope(actor: AuthUser, f: ReportFilterDto): ReportFilterDto {
    if (actor.role === UserRole.SUBCONTRACTOR && actor.subcontractorOrgId) {
      return { ...f, subcontractorOrgId: actor.subcontractorOrgId };
    }
    return f;
  }

  private summariseFilter(f: ReportFilterDto): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === null || v === '') continue;
      if (k === 'page' || k === 'pageSize') continue;
      out[k] = v;
    }
    return out;
  }

  private dateOnly(d: Date | string | null | undefined): string {
    if (!d) return '';
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return x.toISOString().slice(0, 10);
  }

  private daysBetween(from: Date, to: Date): number {
    const f = new Date(from); f.setUTCHours(0, 0, 0, 0);
    const t = new Date(to);   t.setUTCHours(0, 0, 0, 0);
    return Math.round((t.getTime() - f.getTime()) / 86_400_000);
  }

  private custodyLabel(c: CustodyStatus): string {
    switch (c) {
      case CustodyStatus.WITH_COMPANY: return 'With Company';
      case CustodyStatus.WITH_PERSON: return 'With Person';
      case CustodyStatus.RETURNED_TO_COMPANY: return 'Returned to Company';
      case CustodyStatus.SURRENDERED_TO_AUTHORITY: return 'Surrendered to Authority';
    }
  }
}

function startOfDay(d: Date | string): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Compute expiry band using default 30/14/7 thresholds. */
function bandFromDays(days: number): string {
  if (days < 0)   return 'expired';
  if (days <= 7)  return '7d';
  if (days <= 14) return '14d';
  if (days <= 30) return '30d';
  return 'valid';
}

const BAND_RANK: Record<string, number> = { expired: 5, '7d': 4, '14d': 3, '30d': 2, valid: 1 };

/** Return the band representing the most urgent (worst) expiry across a set of bands. */
function worstBand(...bands: (string | null | undefined)[]): string {
  let worst = 'valid';
  for (const b of bands) {
    if (!b) continue;
    if ((BAND_RANK[b] ?? 0) > (BAND_RANK[worst] ?? 0)) worst = b;
  }
  return worst;
}
