// Service uses `import { promises as fs } from 'fs'`. Preserve the rest of the
// `fs` module (Prisma needs fs.existsSync etc.) and only override the promises
// methods we care about.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      unlink: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(Buffer.from('')),
    },
  };
});

import { promises as fs } from 'fs';
import { GatePassStatus } from '@prisma/client';
import { RetentionService } from './retention.service';
import {
  PASS_ID,
  TENANT_ID,
  makeMockPrisma,
  makeUser,
} from '../../../test/helpers';

function build() {
  const prisma = makeMockPrisma();
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'uploadDir') return '/tmp/uploads';
      if (key === 'publicBaseUrl') return 'http://x';
      return null;
    }),
  };
  const notifications = { dispatch: jest.fn().mockResolvedValue({ sent: 1 }) };
  const svc = new RetentionService(
    config as unknown as never,
    prisma as unknown as never,
    notifications as unknown as never,
  );
  return { prisma, svc, notifications };
}

describe('RetentionService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('extend()', () => {
    it('pushes the deletion date forward by N days', async () => {
      const { prisma, svc } = build();
      const base = new Date('2026-05-01T00:00:00Z');
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        status: GatePassStatus.CANCELLED,
        passNumber: '100001',
        dataDeletionScheduledAt: base,
      });
      prisma.gatePass.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await svc.extend(makeUser(), PASS_ID, 7);
      const updateCall = prisma.gatePass.update.mock.calls[0][0];
      const newDate: Date = updateCall.data.dataDeletionScheduledAt;
      expect(newDate.toISOString().slice(0, 10)).toBe('2026-05-08');
    });

    it('rejects extending non-CANCELLED passes', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        status: GatePassStatus.VALID,
        passNumber: '100001',
        dataDeletionScheduledAt: null,
      });
      await expect(svc.extend(makeUser(), PASS_ID, 7)).rejects.toThrow(/CANCELLED/i);
    });

    it('rejects out-of-range day count', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID, status: GatePassStatus.CANCELLED, passNumber: '1', dataDeletionScheduledAt: null,
      });
      await expect(svc.extend(makeUser(), PASS_ID, 0)).rejects.toThrow(/days/);
      await expect(svc.extend(makeUser(), PASS_ID, 9999)).rejects.toThrow(/days/);
    });
  });

  describe('makePermanent()', () => {
    it('clears dataDeletionScheduledAt', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID, status: GatePassStatus.CANCELLED, passNumber: '1',
        dataDeletionScheduledAt: new Date(),
      });
      prisma.gatePass.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      await svc.makePermanent(makeUser(), PASS_ID);
      expect(prisma.gatePass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { dataDeletionScheduledAt: null },
        }),
      );
    });

    it('rejects when pass is not CANCELLED', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID, status: GatePassStatus.VALID, passNumber: '1', dataDeletionScheduledAt: null,
      });
      await expect(svc.makePermanent(makeUser(), PASS_ID)).rejects.toThrow(/CANCELLED/i);
    });
  });

  describe('purgeNow()', () => {
    it('removes documents, strips PII URLs, and writes audit row', async () => {
      const { prisma, svc } = build();
      // Outer findUnique + inner findUnique inside purgeOne
      prisma.gatePass.findUnique
        .mockResolvedValueOnce({
          id: PASS_ID, tenantId: TENANT_ID, status: GatePassStatus.CANCELLED, passNumber: '100001',
        })
        .mockResolvedValueOnce({
          id: PASS_ID,
          tenantId: TENANT_ID,
          passNumber: '100001',
          organization: 'Org',
          authorityHandoverDate: new Date('2026-04-30'),
          staffId: 'staff-1',
          staff: { id: 'staff-1', companyName: 'Org', name: 'Alice' },
          documents: [
            { fileUrl: 'http://x/uploads/t/file.pdf' },
          ],
        });
      prisma.document.deleteMany.mockResolvedValue({ count: 1 });
      prisma.gatePass.update.mockResolvedValue({});
      prisma.gatePass.count.mockResolvedValue(0);
      prisma.staff.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await svc.purgeNow(makeUser(), PASS_ID);

      expect(fs.unlink).toHaveBeenCalled();
      expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { gatePassId: PASS_ID } });
      expect(prisma.gatePass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passScanFrontUrl: null,
            handoverSignedUrl: null,
            dataDeletionScheduledAt: null,
          }),
        }),
      );
      expect(prisma.staff.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            photoUrl: null,
            nationality: null,
            designation: null,
          }),
        }),
      );
    });

    it('keeps staff PII when other active passes still exist', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique
        .mockResolvedValueOnce({
          id: PASS_ID, tenantId: TENANT_ID, status: GatePassStatus.CANCELLED, passNumber: '1',
        })
        .mockResolvedValueOnce({
          id: PASS_ID,
          tenantId: TENANT_ID,
          passNumber: '1',
          organization: '',
          authorityHandoverDate: null,
          staffId: 'staff-2',
          staff: { id: 'staff-2', companyName: '', name: 'Bob' },
          documents: [],
        });
      prisma.document.deleteMany.mockResolvedValue({ count: 0 });
      prisma.gatePass.update.mockResolvedValue({});
      prisma.gatePass.count.mockResolvedValue(2); // remaining active passes
      prisma.staff.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await svc.purgeNow(makeUser(), PASS_ID);
      expect(prisma.staff.update).not.toHaveBeenCalled();
    });

    it('rejects manual purge for non-CANCELLED passes', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID, tenantId: TENANT_ID, status: GatePassStatus.VALID, passNumber: '1',
      });
      await expect(svc.purgeNow(makeUser(), PASS_ID)).rejects.toThrow(/CANCELLED/i);
    });
  });

  describe('runDailyPurge()', () => {
    it('aggregates purged + warned counts', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findMany
        .mockResolvedValueOnce([]) // due passes for purge
        .mockResolvedValueOnce([]); // upcoming for warnings

      const out = await svc.runDailyPurge();
      expect(out).toMatchObject({ purged: 0, warned: 0 });
      expect(typeof out.durationMs).toBe('number');
    });
  });

  describe('previewRetentionChange()', () => {
    it('reports cancelledTotal and alreadyDue counts; returns 0 dueWithinNewWindow when permanent', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.count
        .mockResolvedValueOnce(10) // cancelledTotal
        .mockResolvedValueOnce(2); // alreadyDue
      const out = await svc.previewRetentionChange(TENANT_ID, 'permanent');
      expect(out).toMatchObject({ cancelledTotal: 10, alreadyDue: 2, dueWithinNewWindow: 0 });
    });

    it('runs the third count for a numeric window', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.count
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(8);
      const out = await svc.previewRetentionChange(TENANT_ID, 14);
      expect(out).toEqual({ cancelledTotal: 20, alreadyDue: 5, dueWithinNewWindow: 8 });
    });
  });
});
