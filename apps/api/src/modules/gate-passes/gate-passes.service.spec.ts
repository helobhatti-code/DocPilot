import { CustodyStatus, GatePassStatus } from '@prisma/client';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { GatePassesService } from './gate-passes.service';
import {
  PASS_ID,
  STAFF_ID,
  makeMockPrisma,
  makeUser,
} from '../../../test/helpers';

function build() {
  const prisma = makeMockPrisma();
  const svc = new GatePassesService(prisma as unknown as never);
  return { prisma, svc };
}

const futureExpiry = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('GatePassesService', () => {
  describe('create', () => {
    it('persists a pass with derived VALID status and creates initial custody history', async () => {
      const { prisma, svc } = build();
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      prisma.gatePass.create.mockResolvedValue({ id: 'new', passNumber: '100001', staffId: STAFF_ID });

      await svc.create(makeUser(), {
        passNumber: '100001',
        staffId: STAFF_ID,
        airport: 'AUH',
        issueDate: futureExpiry(-30),
        expiryDate: futureExpiry(150),
        zoneCodes: ['AP', 'AR'],
      });

      const args = prisma.gatePass.create.mock.calls[0][0];
      expect(args.data.status).toBe(GatePassStatus.VALID);
      expect(args.data.zones.create).toEqual([{ zoneCode: 'AP' }, { zoneCode: 'AR' }]);
      expect(args.data.custodyHistory.create).toMatchObject({
        toStatus: CustodyStatus.WITH_COMPANY,
      });
    });

    it('derives EXPIRY_7 when expiry is within a week', async () => {
      const { prisma, svc } = build();
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      prisma.gatePass.create.mockResolvedValue({});
      await svc.create(makeUser(), {
        passNumber: '100002',
        staffId: STAFF_ID,
        airport: 'AUH',
        issueDate: futureExpiry(-30),
        expiryDate: futureExpiry(5),
        zoneCodes: ['AP'],
      });
      expect(prisma.gatePass.create.mock.calls[0][0].data.status).toBe(GatePassStatus.EXPIRY_7);
    });

    it('rejects when expiryDate <= issueDate', async () => {
      const { prisma, svc } = build();
      prisma.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
      await expect(
        svc.create(makeUser(), {
          passNumber: '100003',
          staffId: STAFF_ID,
          airport: 'AUH',
          issueDate: futureExpiry(0),
          expiryDate: futureExpiry(0),
          zoneCodes: ['AP'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound for missing staff', async () => {
      const { prisma, svc } = build();
      prisma.staff.findUnique.mockResolvedValue(null);
      await expect(
        svc.create(makeUser(), {
          passNumber: '100004',
          staffId: STAFF_ID,
          airport: 'AUH',
          issueDate: futureExpiry(0),
          expiryDate: futureExpiry(150),
          zoneCodes: ['AP'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('builds OR clause for free-text search', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([]);
      prisma.gatePass.count.mockResolvedValue(0);
      // $transaction returns the array as-is in our mock
      await svc.list({ q: 'Alice', page: 1, pageSize: 10 } as never);
      const where = prisma.gatePass.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeDefined();
      expect(where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ passNumber: expect.anything() }),
          expect.objectContaining({ staff: expect.anything() }),
        ]),
      );
    });

    it('applies pendingHandover combo filter', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany.mockResolvedValue([]);
      prisma.gatePass.count.mockResolvedValue(0);
      await svc.list({ pendingHandover: true, page: 1, pageSize: 10 } as never);
      const where = prisma.gatePass.findMany.mock.calls[0][0].where;
      expect(where.AND).toBeDefined();
    });
  });

  describe('detail', () => {
    it('throws NotFound when pass does not exist', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(null);
      await expect(svc.detail(PASS_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('blocks generic PATCH from changing custody', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        status: GatePassStatus.VALID,
        custodyStatus: CustodyStatus.WITH_COMPANY,
      });
      await expect(
        svc.update(makeUser(), PASS_ID, { custodyStatus: CustodyStatus.WITH_PERSON }),
      ).rejects.toThrow(/custody/i);
    });

    it('blocks generic PATCH from setting handover documents', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        status: GatePassStatus.VALID,
        custodyStatus: CustodyStatus.WITH_COMPANY,
      });
      await expect(
        svc.update(makeUser(), PASS_ID, { handoverSignedUrl: 'http://x/sig.pdf' }),
      ).rejects.toThrow(/handover/i);
    });

    it('blocks generic PATCH from setting authority handover details', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        status: GatePassStatus.VALID,
        custodyStatus: CustodyStatus.WITH_COMPANY,
      });
      await expect(
        svc.update(makeUser(), PASS_ID, { authorityOfficerName: 'X' }),
      ).rejects.toThrow(/Authority handover|surrender/i);
    });

    it('updates allowed fields and rewrites zones', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        status: GatePassStatus.VALID,
        custodyStatus: CustodyStatus.WITH_COMPANY,
      });
      prisma.gatePassZone.deleteMany.mockResolvedValue({ count: 1 });
      prisma.gatePassZone.createMany.mockResolvedValue({ count: 2 });
      prisma.gatePass.update.mockResolvedValue({ id: PASS_ID });

      await svc.update(makeUser(), PASS_ID, {
        organization: 'New Org',
        zoneCodes: ['AP', 'CO'],
      });
      expect(prisma.gatePassZone.deleteMany).toHaveBeenCalled();
      expect(prisma.gatePassZone.createMany).toHaveBeenCalledWith({
        data: [
          { gatePassId: PASS_ID, zoneCode: 'AP' },
          { gatePassId: PASS_ID, zoneCode: 'CO' },
        ],
      });
    });
  });

  describe('remove', () => {
    it('soft-archives by setting status to CANCELLED', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({ id: PASS_ID });
      prisma.gatePass.update.mockResolvedValue({});
      await svc.remove(PASS_ID);
      expect(prisma.gatePass.update).toHaveBeenCalledWith({
        where: { id: PASS_ID },
        data: { status: GatePassStatus.CANCELLED },
      });
    });
  });

  describe('stats', () => {
    it('aggregates counts grouped by status', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.groupBy.mockResolvedValue([
        { status: GatePassStatus.VALID, _count: { _all: 4 } },
        { status: GatePassStatus.EXPIRED, _count: { _all: 1 } },
      ]);
      const out = await svc.stats();
      expect(out).toEqual({
        total: 5,
        byStatus: { VALID: 4, EXPIRED: 1 },
      });
    });
  });
});
