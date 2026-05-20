import { CustodyStatus, GatePassStatus, UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import {
  makeMockPrisma,
  makeUser,
  type MockPrisma,
} from '../../../test/helpers';

function build() {
  const prisma = makeMockPrisma();
  const svc = new DashboardService(prisma as unknown as never);
  return { prisma, svc };
}

describe('DashboardService', () => {
  describe('kpis', () => {
    it('runs all six counts and returns the correct shape', async () => {
      const { prisma, svc } = build();
      // Order matches the Promise.all in svc.kpis()
      prisma.gatePass.count
        .mockResolvedValueOnce(7)   // active
        .mockResolvedValueOnce(4)   // expiringSoon
        .mockResolvedValueOnce(2)   // within7
        .mockResolvedValueOnce(1)   // expired
        .mockResolvedValueOnce(3)   // pendingActions
        .mockResolvedValueOnce(2);  // pendingHandover

      const out = await svc.kpis(makeUser());
      expect(out).toEqual({
        activePasses: 7,
        expiringSoon: 4,
        expiringWithin7: 2,
        expired: 1,
        pendingActions: 3,
        pendingHandover: 2,
      });
      expect(prisma.gatePass.count).toHaveBeenCalledTimes(6);
    });

    it('subcontractor users are scoped to their org on every count', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.count.mockResolvedValue(0);

      await svc.kpis(
        makeUser({ role: UserRole.SUBCONTRACTOR, subcontractorOrgId: 'sub-1' }),
      );

      const calls = prisma.gatePass.count.mock.calls;
      expect(calls).toHaveLength(6);
      for (const [args] of calls) {
        expect(args.where.staff).toEqual({ subcontractorOrgId: 'sub-1' });
      }
    });
  });

  describe('expiryTimeline', () => {
    it('always returns 12 weekly buckets even with zero matches', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([]);
      const out = await svc.expiryTimeline(makeUser());
      expect(out).toHaveLength(12);
      expect(out.every((b) => b.count === 0)).toBe(true);
      expect(out[0].label).toBe('W1');
      expect(out[11].label).toBe('W12');
    });

    it('places passes in the correct weekly bucket', async () => {
      const { prisma, svc } = build();
      const today = new Date();
      const day = (n: number) => {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() + n);
        d.setUTCHours(0, 0, 0, 0);
        return d;
      };
      prisma.gatePass.findMany.mockResolvedValue([
        { expiryDate: day(0) },   // week 0
        { expiryDate: day(3) },   // week 0
        { expiryDate: day(8) },   // week 1
        { expiryDate: day(50) },  // week 7
        { expiryDate: day(200) }, // out of horizon — dropped
      ]);

      const out = await svc.expiryTimeline(makeUser());
      expect(out[0].count).toBe(2);
      expect(out[1].count).toBe(1);
      expect(out[7].count).toBe(1);
      const total = out.reduce((s, b) => s + b.count, 0);
      expect(total).toBe(4);
    });
  });

  describe('zoneDistribution', () => {
    it('aggregates zones across passes and sorts descending', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([
        { zones: [{ zoneCode: 'AP' }, { zoneCode: 'AR' }] },
        { zones: [{ zoneCode: 'AP' }] },
        { zones: [{ zoneCode: 'AP' }, { zoneCode: 'CO' }] },
      ]);
      const out = await svc.zoneDistribution(makeUser());
      expect(out[0]).toEqual({ zone: 'AP', count: 3 });
      // Stable sort: remaining zones each have count 1
      expect(out.find((r) => r.zone === 'AR')?.count).toBe(1);
      expect(out.find((r) => r.zone === 'CO')?.count).toBe(1);
      // findMany was scoped to active statuses
      const where = prisma.gatePass.findMany.mock.calls[0][0].where;
      expect(where.status.in).toEqual(
        expect.arrayContaining([
          GatePassStatus.VALID,
          GatePassStatus.EXPIRY_30,
          GatePassStatus.EXPIRY_15,
          GatePassStatus.EXPIRY_7,
        ]),
      );
    });

    it('returns empty array when there are no active passes', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([]);
      expect(await svc.zoneDistribution(makeUser())).toEqual([]);
    });
  });

  describe('custodyBreakdown', () => {
    it('always includes all four statuses, zero-filling missing ones', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.groupBy.mockResolvedValue([
        { custodyStatus: CustodyStatus.WITH_COMPANY, _count: { _all: 5 } },
        { custodyStatus: CustodyStatus.WITH_PERSON, _count: { _all: 3 } },
      ]);
      const out = await svc.custodyBreakdown(makeUser());
      const map = Object.fromEntries(out.map((d) => [d.custodyStatus, d.count]));
      expect(map).toEqual({
        WITH_COMPANY: 5,
        WITH_PERSON: 3,
        RETURNED_TO_COMPANY: 0,
        SURRENDERED_TO_AUTHORITY: 0,
      });
    });
  });

  describe('subcontractorCompliance', () => {
    it('computes compliance score as ((active - expiring) / total) * 100', async () => {
      const { prisma, svc } = build();
      prisma.subcontractorOrg.findMany = jest.fn().mockResolvedValue([{ id: 'a', name: 'Acme' }]);
      prisma.gatePass.findMany.mockResolvedValue([
        // 4 active (1 expiring), 1 expired, 5 total => (4-1)/5 = 60%
        { status: GatePassStatus.VALID },
        { status: GatePassStatus.VALID },
        { status: GatePassStatus.VALID },
        { status: GatePassStatus.EXPIRY_7 },
        { status: GatePassStatus.EXPIRED },
      ]);
      const out = await svc.subcontractorCompliance(makeUser());
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: 'a',
        name: 'Acme',
        total: 5,
        active: 4,
        expiring: 1,
        expired: 1,
        complianceScore: 60,
        health: 'warn',
      });
    });

    it('returns 100% / good when an org has no passes', async () => {
      const { prisma, svc } = build();
      prisma.subcontractorOrg.findMany = jest.fn().mockResolvedValue([{ id: 'b', name: 'Beta' }]);
      prisma.gatePass.findMany.mockResolvedValue([]);
      const [row] = await svc.subcontractorCompliance(makeUser());
      expect(row.complianceScore).toBe(100);
      expect(row.health).toBe('good');
      expect(row.total).toBe(0);
    });

    it('subcontractor user only sees their own org', async () => {
      const { prisma, svc } = build();
      prisma.subcontractorOrg.findUnique.mockResolvedValue({ id: 'sub-1', name: 'Self' });
      prisma.gatePass.findMany.mockResolvedValue([]);
      const out = await svc.subcontractorCompliance(
        makeUser({ role: UserRole.SUBCONTRACTOR, subcontractorOrgId: 'sub-1' }),
      );
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe('sub-1');
      // The findUnique was called, not findMany
      expect(prisma.subcontractorOrg.findUnique).toHaveBeenCalled();
    });

    it('subcontractor with no org returns empty list', async () => {
      const { svc } = build();
      const out = await svc.subcontractorCompliance(
        makeUser({ role: UserRole.SUBCONTRACTOR, subcontractorOrgId: null }),
      );
      expect(out).toEqual([]);
    });
  });

  describe('upcomingDeletions', () => {
    it('returns count + nearest date', async () => {
      const { prisma, svc } = build();
      const next = new Date(Date.now() + 5 * 86_400_000);
      prisma.gatePass.count.mockResolvedValueOnce(3);
      prisma.gatePass.findFirst.mockResolvedValue({ dataDeletionScheduledAt: next });

      const out = await svc.upcomingDeletions(makeUser());
      expect(out.withinNext30Days).toBe(3);
      expect(out.nextDeletionDate).toEqual(next);
    });
  });

  describe('recentActivity', () => {
    it('flattens audit rows with actor info', async () => {
      const { prisma, svc } = build();
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: '1',
          action: 'PASS_CREATED',
          entityType: 'GatePass',
          entityId: 'p',
          details: null,
          createdAt: new Date(),
          user: { id: 'u', name: 'Sara', email: 's@x.com' },
        },
      ]);
      const out = await svc.recentActivity(makeUser());
      expect(out[0].actor).toEqual({ id: 'u', name: 'Sara', email: 's@x.com' });
      expect(out[0].action).toBe('PASS_CREATED');
    });
  });
});

// Surface compilation issue if MockPrisma type drifts
const _typecheck: MockPrisma | undefined = undefined;
void _typecheck;
