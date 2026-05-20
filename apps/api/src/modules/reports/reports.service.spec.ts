import { CustodyStatus, GatePassStatus, UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import {
  makeMockPrisma,
  makeUser,
} from '../../../test/helpers';
import type { ReportFilterDto } from './dto/reports.dto';

function build() {
  const prisma = makeMockPrisma();
  const svc = new ReportsService(prisma as unknown as never);
  return { prisma, svc };
}

const today = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const day = (offset: number) => {
  const d = today();
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

const F = (override: Partial<ReportFilterDto> = {}): ReportFilterDto => ({
  page: 1,
  pageSize: 50,
  ...override,
});

describe('ReportsService', () => {
  describe('1. pass-register', () => {
    it('flattens passes with zones, status and custody', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([
        {
          passNumber: '100001',
          organization: 'Org A',
          department: 'IT',
          airport: 'AUH',
          issueDate: day(-30),
          expiryDate: day(150),
          status: GatePassStatus.VALID,
          custodyStatus: CustodyStatus.WITH_PERSON,
          staff: { name: 'Alice', companyName: 'Org A', designation: 'Eng', nationality: 'AE' },
          zones: [{ zoneCode: 'AP' }, { zoneCode: 'AR' }],
        },
      ]);
      const r = await svc.run(makeUser(), 'pass-register', F());
      expect(r.title).toBe('Pass Register');
      expect(r.total).toBe(1);
      expect(r.rows[0]).toMatchObject({
        passNumber: '100001',
        staffName: 'Alice',
        zones: 'AP, AR',
        status: GatePassStatus.VALID,
        custodyStatus: CustodyStatus.WITH_PERSON,
      });
    });

    it('returns empty rows when DB has no matches', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([]);
      const r = await svc.run(makeUser(), 'pass-register', F());
      expect(r.total).toBe(0);
      expect(r.rows).toEqual([]);
    });
  });

  describe('2. expiry', () => {
    it('groups passes into 7/15/30 + expired buckets and emits a summary', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([
        { passNumber: '1', organization: '', expiryDate: day(3),  status: GatePassStatus.EXPIRY_7,  staff: { name: 'A', companyName: '' }, zones: [], airport: 'AUH' },
        { passNumber: '2', organization: '', expiryDate: day(12), status: GatePassStatus.EXPIRY_15, staff: { name: 'B', companyName: '' }, zones: [], airport: 'AUH' },
        { passNumber: '3', organization: '', expiryDate: day(25), status: GatePassStatus.EXPIRY_30, staff: { name: 'C', companyName: '' }, zones: [], airport: 'AUH' },
        { passNumber: '4', organization: '', expiryDate: day(-3), status: GatePassStatus.EXPIRED,   staff: { name: 'D', companyName: '' }, zones: [], airport: 'AUH' },
      ]);
      const r = await svc.run(makeUser(), 'expiry', F());
      expect(r.summary).toEqual({ within7: 1, within15: 1, within30: 1, expired: 1 });
      const labels = r.groups!.map((g) => g.label);
      expect(labels).toEqual(['Within 7 days', 'Within 15 days', 'Within 30 days', 'Expired']);
    });
  });

  describe('3. compliance', () => {
    it('builds three categories: overdue renewal / cancellation / handover', async () => {
      const { prisma, svc } = build();
      const old = day(-10);
      // 1st findMany call -> overdue renewals
      prisma.gatePass.findMany
        .mockResolvedValueOnce([
          { passNumber: 'R', organization: '', renewalSubmittedAt: old, staff: { name: 'A', companyName: '' } },
        ])
        .mockResolvedValueOnce([
          { passNumber: 'C', organization: '', cancellationRequestedAt: old, staff: { name: 'B', companyName: '' } },
        ])
        .mockResolvedValueOnce([
          {
            passNumber: 'H',
            organization: '',
            updatedAt: old,
            staff: { name: 'C', companyName: '' },
            custodyHistory: [{ createdAt: old }],
          },
        ]);
      const r = await svc.run(makeUser(), 'compliance', F());
      const labels = r.groups!.map((g) => g.label);
      expect(labels).toEqual(['Overdue Renewal', 'Overdue Cancellation', 'Pending Authority Handover']);
      expect(r.total).toBe(3);
    });

    it('drops handovers younger than 7 days', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            passNumber: 'H',
            organization: '',
            updatedAt: day(-3),
            staff: { name: 'X', companyName: '' },
            custodyHistory: [{ createdAt: day(-3) }],
          },
        ]);
      const r = await svc.run(makeUser(), 'compliance', F());
      expect(r.total).toBe(0);
    });
  });

  describe('4. custody', () => {
    it('groups by custody status in a fixed order', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([
        { passNumber: '1', organization: '', custodyStatus: CustodyStatus.WITH_COMPANY,            authorityHandoverDate: null, authorityOfficerName: null, updatedAt: day(0), staff: { name: 'A', companyName: '' } },
        { passNumber: '2', organization: '', custodyStatus: CustodyStatus.SURRENDERED_TO_AUTHORITY, authorityHandoverDate: day(-1), authorityOfficerName: 'Off', updatedAt: day(0), staff: { name: 'B', companyName: '' } },
      ]);
      const r = await svc.run(makeUser(), 'custody', F());
      expect(r.groups!.map((g) => g.key)).toEqual([
        CustodyStatus.WITH_COMPANY,
        CustodyStatus.SURRENDERED_TO_AUTHORITY,
      ]);
      expect(r.summary).toMatchObject({
        WITH_COMPANY: 1,
        WITH_PERSON: 0,
        SURRENDERED_TO_AUTHORITY: 1,
      });
    });
  });

  describe('5. pending-handover', () => {
    it('flags rows older than 7 days as overdue', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([
        {
          passNumber: 'P1', organization: '', updatedAt: day(-10),
          staff: { name: 'A', companyName: '' },
          custodyHistory: [{ createdAt: day(-10) }],
        },
        {
          passNumber: 'P2', organization: '', updatedAt: day(-2),
          staff: { name: 'B', companyName: '' },
          custodyHistory: [{ createdAt: day(-2) }],
        },
      ]);
      const r = await svc.run(makeUser(), 'pending-handover', F());
      expect(r.total).toBe(2);
      expect(r.summary).toEqual({ total: 2, overdue: 1 });
      const overdueRow = r.rows.find((row) => row.passNumber === 'P1');
      expect(overdueRow!.overdue).toBe('Yes');
    });
  });

  describe('6. retention', () => {
    it('reports days-until-deletion countdown', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([
        {
          passNumber: '1', organization: 'Org', cancellationCompletedAt: day(-5),
          dataDeletionScheduledAt: day(10),
          staff: { name: 'A', companyName: 'Org' },
        },
      ]);
      const r = await svc.run(makeUser(), 'retention', F());
      expect(r.total).toBe(1);
      expect(r.rows[0].daysUntilDeletion).toBe(10);
    });
  });

  describe('7. zone-access', () => {
    it('fans out by zone and tags Active/Inactive based on status', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([
        {
          passNumber: '1', organization: '', status: GatePassStatus.VALID,
          zones: [{ zoneCode: 'AP' }, { zoneCode: 'AR' }],
          staff: { name: 'Alice', companyName: '' },
        },
        {
          passNumber: '2', organization: '', status: GatePassStatus.EXPIRED,
          zones: [{ zoneCode: 'AR' }],
          staff: { name: 'Bob', companyName: '' },
        },
      ]);
      const r = await svc.run(makeUser(), 'zone-access', F());
      expect(r.total).toBe(3);
      expect(r.summary).toMatchObject({ AP: 1, AR: 1 });
      const apRow = r.rows.find((row) => row.zone === 'AP');
      expect(apRow!.isActive).toBe('Active');
    });
  });

  describe('8. staff-history', () => {
    it('requires staffId and returns full timeline', async () => {
      const { prisma, svc } = build();
      prisma.staff.findUnique.mockResolvedValue({
        id: 'staff-1', name: 'Alice', companyName: 'Org', designation: 'Eng', nationality: 'AE',
      });
      prisma.gatePass.findMany.mockResolvedValue([
        {
          passNumber: '1', airport: 'AUH', issueDate: day(-365), expiryDate: day(-180),
          status: GatePassStatus.RENEWED, custodyStatus: CustodyStatus.SURRENDERED_TO_AUTHORITY,
          cancellationCompletedAt: null,
          zones: [{ zoneCode: 'AP' }],
        },
        {
          passNumber: '2', airport: 'AUH', issueDate: day(-30), expiryDate: day(150),
          status: GatePassStatus.VALID, custodyStatus: CustodyStatus.WITH_PERSON,
          cancellationCompletedAt: null,
          zones: [{ zoneCode: 'AP' }],
        },
      ]);
      const r = await svc.run(makeUser(), 'staff-history', F({ staffId: 'staff-1' }));
      expect(r.total).toBe(2);
      expect(r.summary).toMatchObject({ staffName: 'Alice', totalPasses: 2 });
    });

    it('throws BadRequest when staffId missing', async () => {
      const { svc } = build();
      await expect(svc.run(makeUser(), 'staff-history', F())).rejects.toThrow(/staffId/i);
    });

    it('throws when the staff record does not exist', async () => {
      const { prisma, svc } = build();
      prisma.staff.findUnique.mockResolvedValue(null);
      await expect(svc.run(makeUser(), 'staff-history', F({ staffId: 'missing' })))
        .rejects.toThrow(/Staff not found/);
    });
  });

  describe('9. subcontractor', () => {
    it('computes per-org compliance scores', async () => {
      const { prisma, svc } = build();
      prisma.subcontractorOrg.findMany = jest.fn().mockResolvedValue([
        { id: 'o1', name: 'Acme', contactPerson: 'Pat', contactEmail: 'p@a.com' },
      ]);
      prisma.gatePass.findMany.mockResolvedValue([
        { status: GatePassStatus.VALID },
        { status: GatePassStatus.VALID },
        { status: GatePassStatus.EXPIRY_7 },
        { status: GatePassStatus.EXPIRED },
      ]);
      const r = await svc.run(makeUser(), 'subcontractor', F());
      expect(r.rows[0]).toMatchObject({
        name: 'Acme',
        total: 4,
        active: 3,
        expiring: 1,
        expired: 1,
      });
      // (active - expiring) / total = (3-1)/4 = 50
      expect(r.rows[0].complianceScore).toBe(50);
    });
  });

  describe('10. audit-trail', () => {
    it('returns audit rows with timestamp/actor/action', async () => {
      const { prisma, svc } = build();
      prisma.auditLog.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-01-01T12:00:00Z'),
          action: 'CUSTODY_DELIVER_TO_STAFF',
          entityType: 'GatePass',
          entityId: 'p1',
          ipAddress: '10.0.0.1',
          details: { passNumber: '111' },
          user: { id: 'u', name: 'Op', email: 'op@x.com' },
        },
      ]);
      const r = await svc.run(makeUser(), 'audit-trail', F({ q: 'CUSTODY' }));
      expect(r.rows[0].action).toBe('CUSTODY_DELIVER_TO_STAFF');
      expect(r.rows[0].actor).toBe('Op');
      // Filter forwarded into where.OR
      const where = prisma.auditLog.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeDefined();
    });
  });

  describe('Subcontractor scoping', () => {
    it('forces a subcontractorOrgId filter on GatePass when actor is SUBCONTRACTOR', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([]);
      await svc.run(
        makeUser({ role: UserRole.SUBCONTRACTOR, subcontractorOrgId: 'sub-77' }),
        'pass-register',
        F(),
      );
      const where = prisma.gatePass.findMany.mock.calls[0][0].where;
      expect(where.staff).toEqual({ subcontractorOrgId: 'sub-77' });
    });
  });

  describe('Unknown report type', () => {
    it('throws BadRequest on unknown report', async () => {
      const { svc } = build();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(svc.run(makeUser(), 'bogus' as any, F())).rejects.toThrow(/Unknown report/);
    });
  });
});
