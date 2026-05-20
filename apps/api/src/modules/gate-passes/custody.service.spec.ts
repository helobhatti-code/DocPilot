import { CustodyStatus, UserRole } from '@prisma/client';
import { CustodyService } from './custody.service';
import {
  PASS_ID,
  STAFF_ID,
  makeMockPrisma,
  makeUser,
} from '../../../test/helpers';

function build() {
  const prisma = makeMockPrisma();
  const notifications = { dispatch: jest.fn().mockResolvedValue({ sent: 0 }) };
  const handoverPdf = {
    generate: jest.fn().mockResolvedValue({
      fileUrl: 'http://x/h.pdf',
      fileName: 'h.pdf',
      fileSizeBytes: 100,
    }),
  };
  const svc = new CustodyService(
    prisma as unknown as never,
    notifications as unknown as never,
    handoverPdf as unknown as never,
  );
  return { prisma, svc, notifications, handoverPdf };
}

const passFixture = (over: Partial<Record<string, unknown>> = {}) => ({
  id: PASS_ID,
  passNumber: '100001',
  custodyStatus: CustodyStatus.WITH_COMPANY,
  staff: { id: STAFF_ID, name: 'Alice', subcontractorOrgId: null },
  zones: [],
  ...over,
});

describe('CustodyService — transition rules', () => {
  describe('deliverToStaff (WITH_COMPANY -> WITH_PERSON)', () => {
    it('allows the canonical transition and generates the handover PDF', async () => {
      const { prisma, svc, handoverPdf, notifications } = build();
      prisma.gatePass.findUnique.mockResolvedValue(passFixture());
      prisma.gatePass.update.mockResolvedValue({ id: PASS_ID, custodyStatus: CustodyStatus.WITH_PERSON });
      prisma.custodyHistory.create.mockResolvedValue({});
      prisma.document.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await svc.deliverToStaff(makeUser(), PASS_ID, { notes: 'go' });

      expect(handoverPdf.generate).toHaveBeenCalledTimes(1);
      expect(prisma.gatePass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PASS_ID },
          data: expect.objectContaining({ custodyStatus: CustodyStatus.WITH_PERSON }),
        }),
      );
      expect(notifications.dispatch).toHaveBeenCalled();
    });

    it('rejects WITH_PERSON -> WITH_PERSON as already-in-state', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(passFixture({ custodyStatus: CustodyStatus.WITH_PERSON }));
      await expect(svc.deliverToStaff(makeUser(), PASS_ID, {})).rejects.toThrow(/already/i);
    });

    it('rejects illegal jumps like WITH_COMPANY -> SURRENDERED_TO_AUTHORITY', async () => {
      // We exercise deliverToStaff (target=WITH_PERSON) from a non-WITH_COMPANY
      // state to confirm transitions outside the allow-list raise.
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(
        passFixture({ custodyStatus: CustodyStatus.SURRENDERED_TO_AUTHORITY }),
      );
      await expect(svc.deliverToStaff(makeUser(), PASS_ID, {})).rejects.toThrow(/not allowed/i);
    });
  });

  describe('markReturned (WITH_PERSON -> RETURNED_TO_COMPANY)', () => {
    it('updates custody and writes a custody-history row', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(passFixture({ custodyStatus: CustodyStatus.WITH_PERSON }));
      prisma.gatePass.update.mockResolvedValue({});
      prisma.custodyHistory.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await svc.markReturned(makeUser(), PASS_ID, {});

      expect(prisma.gatePass.update).toHaveBeenCalled();
      expect(prisma.custodyHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromStatus: CustodyStatus.WITH_PERSON,
            toStatus: CustodyStatus.RETURNED_TO_COMPANY,
          }),
        }),
      );
    });

    it('rejects markReturned from WITH_COMPANY', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(passFixture());
      await expect(svc.markReturned(makeUser(), PASS_ID, {})).rejects.toThrow();
    });
  });

  describe('surrenderToAuthority (RETURNED_TO_COMPANY -> SURRENDERED_TO_AUTHORITY)', () => {
    it('persists officer details and handover date', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(
        passFixture({ custodyStatus: CustodyStatus.RETURNED_TO_COMPANY }),
      );
      prisma.gatePass.update.mockResolvedValue({});
      prisma.custodyHistory.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await svc.surrenderToAuthority(makeUser(), PASS_ID, {
        handoverDate: '2026-05-10',
        officerName: 'Sgt. Khan',
        referenceNumber: 'AUH-001',
      });

      expect(prisma.gatePass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            custodyStatus: CustodyStatus.SURRENDERED_TO_AUTHORITY,
            authorityOfficerName: 'Sgt. Khan',
            authorityReferenceNumber: 'AUH-001',
          }),
        }),
      );
    });

    it('rejects malformed handover date', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(
        passFixture({ custodyStatus: CustodyStatus.RETURNED_TO_COMPANY }),
      );
      await expect(
        svc.surrenderToAuthority(makeUser(), PASS_ID, {
          handoverDate: 'not-a-date',
          officerName: 'Sgt',
          referenceNumber: 'X',
        }),
      ).rejects.toThrow(/Invalid handover/);
    });
  });

  describe('subcontractor scoping', () => {
    it('forbids subcontractor from acting on a pass outside their org', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(
        passFixture({ staff: { id: STAFF_ID, name: 'Alice', subcontractorOrgId: 'OTHER' } }),
      );
      await expect(
        svc.deliverToStaff(
          makeUser({ role: UserRole.SUBCONTRACTOR, subcontractorOrgId: 'MINE' }),
          PASS_ID,
          {},
        ),
      ).rejects.toThrow(/own staff|forbidden/i);
    });
  });

  describe('pendingHandover()', () => {
    it('annotates each row with daysPendingHandover and isOverdue', async () => {
      const { prisma, svc } = build();
      const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
      const oneDayAgo = new Date(Date.now() - 1 * 86_400_000);
      prisma.gatePass.findMany.mockResolvedValue([
        {
          id: 'a', passNumber: '1', updatedAt: tenDaysAgo, staff: { name: 'A' }, zones: [],
          custodyHistory: [{ createdAt: tenDaysAgo }],
        },
        {
          id: 'b', passNumber: '2', updatedAt: oneDayAgo, staff: { name: 'B' }, zones: [],
          custodyHistory: [{ createdAt: oneDayAgo }],
        },
      ]);
      const out = await svc.pendingHandover({});
      expect(out).toHaveLength(2);
      expect(out[0].daysPendingHandover).toBeGreaterThanOrEqual(9);
      expect(out[0].isOverdue).toBe(true);
      expect(out[1].isOverdue).toBe(false);
    });

    it('overdueOnly filter drops rows under the threshold', async () => {
      const { prisma, svc } = build();
      const oneDayAgo = new Date(Date.now() - 1 * 86_400_000);
      prisma.gatePass.findMany.mockResolvedValue([
        { id: 'b', passNumber: '2', updatedAt: oneDayAgo, staff: { name: 'B' }, zones: [],
          custodyHistory: [{ createdAt: oneDayAgo }] },
      ]);
      const out = await svc.pendingHandover({ overdueOnly: true });
      expect(out).toHaveLength(0);
    });
  });
});
