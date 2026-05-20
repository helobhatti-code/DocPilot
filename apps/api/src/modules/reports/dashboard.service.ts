import { Injectable } from '@nestjs/common';
import {
  CustodyStatus,
  GatePassStatus,
  Prisma,
  UserRole,
  ZoneCode,
} from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';

const ACTIVE_STATUSES: GatePassStatus[] = [
  GatePassStatus.VALID,
  GatePassStatus.EXPIRY_30,
  GatePassStatus.EXPIRY_15,
  GatePassStatus.EXPIRY_7,
];

const EXPIRING_STATUSES: GatePassStatus[] = [
  GatePassStatus.EXPIRY_30,
  GatePassStatus.EXPIRY_15,
  GatePassStatus.EXPIRY_7,
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // KPI cards
  // ---------------------------------------------------------------------------
  async kpis(actor: AuthUser) {
    const where = this.scopeFor(actor);
    const today = startOfDay(new Date());
    const within7 = addDays(today, 7);

    const [
      activeCount,
      expiringSoonCount,
      within7Count,
      expiredCount,
      pendingActions,
      pendingHandover,
    ] = await Promise.all([
      this.prisma.gatePass.count({
        where: { ...where, status: { in: ACTIVE_STATUSES } },
      }),
      this.prisma.gatePass.count({
        where: { ...where, status: { in: EXPIRING_STATUSES } },
      }),
      this.prisma.gatePass.count({
        where: {
          ...where,
          status: { in: ACTIVE_STATUSES },
          expiryDate: { gte: today, lte: within7 },
        },
      }),
      this.prisma.gatePass.count({
        where: { ...where, status: GatePassStatus.EXPIRED },
      }),
      this.prisma.gatePass.count({
        where: {
          ...where,
          status: { in: [GatePassStatus.RENEWAL_SUBMITTED, GatePassStatus.CANCELLATION_REQUESTED] },
        },
      }),
      this.prisma.gatePass.count({
        where: { ...where, custodyStatus: CustodyStatus.RETURNED_TO_COMPANY },
      }),
    ]);

    return {
      activePasses: activeCount,
      expiringSoon: expiringSoonCount,
      expiringWithin7: within7Count,
      expired: expiredCount,
      pendingActions,
      pendingHandover,
    };
  }

  // ---------------------------------------------------------------------------
  // Expiry timeline — passes expiring per ISO week, next 12 weeks
  // ---------------------------------------------------------------------------
  async expiryTimeline(actor: AuthUser) {
    const where = this.scopeFor(actor);
    const today = startOfDay(new Date());
    const horizon = addDays(today, 7 * 12);

    const rows = await this.prisma.gatePass.findMany({
      where: {
        ...where,
        status: { in: [...ACTIVE_STATUSES, GatePassStatus.EXPIRED] },
        expiryDate: { gte: today, lte: horizon },
      },
      select: { expiryDate: true },
    });

    const buckets = new Map<string, { weekStart: string; label: string; count: number }>();
    for (let w = 0; w < 12; w++) {
      const start = addDays(today, w * 7);
      const key = start.toISOString().slice(0, 10);
      buckets.set(key, {
        weekStart: key,
        label: `W${w + 1}`,
        count: 0,
      });
    }
    for (const r of rows) {
      const diffDays = Math.floor((startOfDay(r.expiryDate).getTime() - today.getTime()) / 86_400_000);
      const week = Math.floor(diffDays / 7);
      if (week < 0 || week >= 12) continue;
      const start = addDays(today, week * 7);
      const key = start.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (b) b.count += 1;
    }
    return Array.from(buckets.values());
  }

  // ---------------------------------------------------------------------------
  // Zone Access Distribution — active passes per zone
  // ---------------------------------------------------------------------------
  async zoneDistribution(actor: AuthUser) {
    // Querying gatePassZone directly bypasses our tenant middleware (it's keyed
    // on GatePass.tenantId, not on the join row). Going through GatePass keeps
    // the middleware in charge of tenant scoping.
    const passes = await this.prisma.gatePass.findMany({
      where: { ...this.scopeFor(actor), status: { in: ACTIVE_STATUSES } },
      select: { zones: { select: { zoneCode: true } } },
    });
    const counts = new Map<ZoneCode, number>();
    for (const p of passes) {
      for (const z of p.zones) {
        counts.set(z.zoneCode, (counts.get(z.zoneCode) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([zone, count]) => ({ zone, count }));
  }

  // ---------------------------------------------------------------------------
  // Custody breakdown — donut
  // ---------------------------------------------------------------------------
  async custodyBreakdown(actor: AuthUser) {
    const where = this.scopeFor(actor);
    const rows = await this.prisma.gatePass.groupBy({
      by: ['custodyStatus'],
      _count: { _all: true },
      where,
    });
    const result: Record<CustodyStatus, number> = {
      WITH_COMPANY: 0,
      WITH_PERSON: 0,
      RETURNED_TO_COMPANY: 0,
      SURRENDERED_TO_AUTHORITY: 0,
    };
    for (const r of rows) result[r.custodyStatus] = r._count._all;
    return Object.entries(result).map(([custodyStatus, count]) => ({ custodyStatus, count }));
  }

  // ---------------------------------------------------------------------------
  // Recent activity feed — last 10 audit entries
  // ---------------------------------------------------------------------------
  async recentActivity(_actor: AuthUser) {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actor: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email } : null,
      details: r.details,
      createdAt: r.createdAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Upcoming auto-deletions — count + nearest date
  // ---------------------------------------------------------------------------
  async upcomingDeletions(actor: AuthUser) {
    const where = this.scopeFor(actor);
    const now = new Date();
    const horizon = addDays(now, 30);
    const [count, soonest] = await Promise.all([
      this.prisma.gatePass.count({
        where: {
          ...where,
          status: GatePassStatus.CANCELLED,
          dataDeletionScheduledAt: { not: null, lte: horizon },
        },
      }),
      this.prisma.gatePass.findFirst({
        where: {
          ...where,
          status: GatePassStatus.CANCELLED,
          dataDeletionScheduledAt: { not: null, gte: now },
        },
        orderBy: { dataDeletionScheduledAt: 'asc' },
        select: { dataDeletionScheduledAt: true },
      }),
    ]);
    return {
      withinNext30Days: count,
      nextDeletionDate: soonest?.dataDeletionScheduledAt ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Subcontractor compliance grid
  // ---------------------------------------------------------------------------
  async subcontractorCompliance(actor: AuthUser) {
    if (actor.role === UserRole.SUBCONTRACTOR) {
      if (!actor.subcontractorOrgId) return [];
      const org = await this.prisma.subcontractorOrg.findUnique({
        where: { id: actor.subcontractorOrgId },
        select: { id: true, name: true },
      });
      if (!org) return [];
      return [await this.complianceFor(org)];
    }

    const orgs = await this.prisma.subcontractorOrg.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return Promise.all(orgs.map((o) => this.complianceFor(o)));
  }

  private async complianceFor(org: { id: string; name: string }) {
    const passes = await this.prisma.gatePass.findMany({
      where: { staff: { subcontractorOrgId: org.id } },
      select: { status: true },
    });
    const active = passes.filter((p) => ACTIVE_STATUSES.includes(p.status)).length;
    const expiring = passes.filter((p) => EXPIRING_STATUSES.includes(p.status)).length;
    const expired = passes.filter((p) => p.status === GatePassStatus.EXPIRED).length;
    const total = passes.length;
    const compliance = total === 0 ? 100 : Math.max(0, Math.round(((active - expiring) / total) * 100));
    return {
      id: org.id,
      name: org.name,
      total,
      active,
      expiring,
      expired,
      complianceScore: compliance,
      health: compliance >= 80 ? 'good' : compliance >= 50 ? 'warn' : 'risk',
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private scopeFor(actor: AuthUser): Prisma.GatePassWhereInput {
    if (actor.role === UserRole.SUBCONTRACTOR && actor.subcontractorOrgId) {
      return { staff: { subcontractorOrgId: actor.subcontractorOrgId } };
    }
    return {};
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
