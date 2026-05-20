import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GatePassStatus, UserRole } from '@prisma/client';
import {
  RenewalService,
  daysBetween,
  deriveExpiryStatus,
  readValidityMonths,
} from './renewal.service';
import {
  PASS_ID,
  STAFF_ID,
  makeMockPrisma,
  makeUser,
} from '../../../test/helpers';

function build() {
  const prisma = makeMockPrisma();
  const notifications = { dispatch: jest.fn().mockResolvedValue({ sent: 1 }) };
  const svc = new RenewalService(
    prisma as unknown as never,
    notifications as unknown as never,
  );
  return { prisma, svc, notifications };
}

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

describe('RenewalService', () => {
  describe('submit (7-day window)', () => {
    it('BLOCKS submission when expiry is more than 7 days away', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '100001',
        status: GatePassStatus.EXPIRY_30,
        expiryDate: day(20),
        staff: { name: 'A', subcontractorOrgId: null },
      });
      await expect(svc.submit(makeUser(), PASS_ID, {} as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.gatePass.update).not.toHaveBeenCalled();
    });

    it('ALLOWS submission within the 7-day window', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '100001',
        status: GatePassStatus.EXPIRY_7,
        expiryDate: day(3),
        staff: { name: 'A', subcontractorOrgId: null },
      });
      prisma.gatePass.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      await svc.submit(makeUser(), PASS_ID, {} as never);
      expect(prisma.gatePass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: GatePassStatus.RENEWAL_SUBMITTED }),
        }),
      );
    });

    it('rejects submission from non-active statuses', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '1',
        status: GatePassStatus.CANCELLED,
        expiryDate: day(2),
        staff: { name: 'A', subcontractorOrgId: null },
      });
      await expect(svc.submit(makeUser(), PASS_ID, {} as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('forbids subcontractors from submitting on someone else’s pass', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '1',
        status: GatePassStatus.EXPIRY_7,
        expiryDate: day(3),
        staff: { name: 'A', subcontractorOrgId: 'OTHER' },
      });
      await expect(
        svc.submit(
          makeUser({ role: UserRole.SUBCONTRACTOR, subcontractorOrgId: 'MINE' }),
          PASS_ID,
          {} as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for missing pass', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue(null);
      await expect(svc.submit(makeUser(), PASS_ID, {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('approve / reject', () => {
    it('approve transitions RENEWAL_SUBMITTED -> RENEWAL_APPROVED', async () => {
      const { prisma, svc, notifications } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '1',
        status: GatePassStatus.RENEWAL_SUBMITTED,
        expiryDate: day(3),
        staff: { name: 'A', subcontractorOrgId: null },
      });
      prisma.gatePass.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      await svc.approve(makeUser(), PASS_ID);
      expect(prisma.gatePass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: GatePassStatus.RENEWAL_APPROVED }),
        }),
      );
      expect(notifications.dispatch).toHaveBeenCalled();
    });

    it('approve rejects from non-RENEWAL_SUBMITTED', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '1',
        status: GatePassStatus.VALID,
        expiryDate: day(3),
        staff: { name: 'A', subcontractorOrgId: null },
      });
      await expect(svc.approve(makeUser(), PASS_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('reject reverts status based on remaining days', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '1',
        status: GatePassStatus.RENEWAL_SUBMITTED,
        expiryDate: day(20),
        staff: { name: 'A', subcontractorOrgId: null },
      });
      prisma.gatePass.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      await svc.reject(makeUser(), PASS_ID, { reason: 'docs missing' } as never);
      const update = prisma.gatePass.update.mock.calls[0][0];
      expect(update.data.status).toBe(GatePassStatus.EXPIRY_30);
    });
  });

  describe('complete', () => {
    it('rejects if not RENEWAL_APPROVED', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '1',
        status: GatePassStatus.VALID,
        zones: [], staff: { id: STAFF_ID, name: 'A' },
      });
      await expect(
        svc.complete(makeUser(), PASS_ID, { newPassNumber: '999999' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects duplicate new pass numbers', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '1',
        status: GatePassStatus.RENEWAL_APPROVED,
        zones: [{ zoneCode: 'AP' }],
        staffId: STAFF_ID,
        staff: { id: STAFF_ID, name: 'A' },
        organization: 'Org',
        department: 'IT',
        airport: 'AUH',
      });
      prisma.tenant.findUnique.mockResolvedValue({ settings: { pass_validity_months: 6 } });
      prisma.gatePass.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(
        svc.complete(makeUser(), PASS_ID, { newPassNumber: '999999' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('archives old pass and creates a new one with derived expiry', async () => {
      const { prisma, svc } = build();
      prisma.gatePass.findUnique.mockResolvedValue({
        id: PASS_ID,
        passNumber: '1',
        status: GatePassStatus.RENEWAL_APPROVED,
        zones: [{ zoneCode: 'AP' }],
        staffId: STAFF_ID,
        staff: { id: STAFF_ID, name: 'A' },
        organization: 'Org',
        department: 'IT',
        airport: 'AUH',
      });
      prisma.tenant.findUnique.mockResolvedValue({ settings: { pass_validity_months: 6 } });
      prisma.gatePass.findFirst.mockResolvedValue(null);
      prisma.gatePass.update.mockResolvedValue({});
      prisma.gatePass.create.mockResolvedValue({ id: 'new', passNumber: '999999' });
      prisma.auditLog.create.mockResolvedValue({});

      await svc.complete(makeUser(), PASS_ID, {
        newPassNumber: '999999',
        newIssueDate: '2026-05-01',
      } as never);

      // old pass archived
      expect(prisma.gatePass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PASS_ID },
          data: { status: GatePassStatus.RENEWED },
        }),
      );
      // new pass created with renewedFromPassId
      const create = prisma.gatePass.create.mock.calls[0][0];
      expect(create.data.passNumber).toBe('999999');
      expect(create.data.renewedFromPassId).toBe(PASS_ID);
      // expiry = issue + 6 months
      const expiry: Date = create.data.expiryDate;
      expect(expiry.toISOString().slice(0, 10)).toBe('2026-11-01');
    });
  });

  describe('pure helpers', () => {
    it('daysBetween counts UTC-day differences', () => {
      const a = new Date('2026-05-01T08:00:00Z');
      const b = new Date('2026-05-08T20:00:00Z');
      expect(daysBetween(a, b)).toBe(7);
    });

    it('deriveExpiryStatus picks the right bucket', () => {
      const today = new Date('2026-05-01T00:00:00Z');
      expect(deriveExpiryStatus(new Date('2026-04-30'), today)).toBe(GatePassStatus.EXPIRED);
      expect(deriveExpiryStatus(new Date('2026-05-05'), today)).toBe(GatePassStatus.EXPIRY_7);
      expect(deriveExpiryStatus(new Date('2026-05-15'), today)).toBe(GatePassStatus.EXPIRY_15);
      expect(deriveExpiryStatus(new Date('2026-05-25'), today)).toBe(GatePassStatus.EXPIRY_30);
      expect(deriveExpiryStatus(new Date('2026-08-01'), today)).toBe(GatePassStatus.VALID);
    });

    it('readValidityMonths defaults to 6 and clamps invalid input', () => {
      expect(readValidityMonths(null)).toBe(6);
      expect(readValidityMonths({ pass_validity_months: 12 })).toBe(12);
      expect(readValidityMonths({ pass_validity_months: 0 })).toBe(6);
      expect(readValidityMonths({ pass_validity_months: 9999 })).toBe(6);
    });
  });
});
