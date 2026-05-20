/**
 * HeavyMachinery service unit tests.
 * Tests company scoping and expiry band enrichment.
 */

import { MachineryStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { computeExpiryBand, worstBand } from '@/common/utils/expiry-band';
import { HeavyMachineryService } from './heavy-machinery.service';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';

function buildSvc() {
  const prisma = makeMockPrisma();
  const config = { get: jest.fn().mockReturnValue('./uploads') } as any;
  const svc    = new HeavyMachineryService(prisma as unknown as never, config);
  return { prisma, svc };
}

const TODAY = new Date('2024-06-01T00:00:00Z');

function makeMachinery(overrides: Partial<any> = {}) {
  return {
    id:                           'm1',
    tenantId:                     TENANT_ID,
    companyId:                    'co1',
    machineType:                  'Crane',
    make:                         'Liebherr',
    model:                        null,
    manufactureYear:              2018,
    serialNumber:                 'SN123',
    plateNumber:                  null,
    assignedOperator:             null,
    currentLocation:              null,
    projectSite:                  null,
    status:                       MachineryStatus.ACTIVE,
    operatorLicenseNo:            null,
    operatorLicenseExpiryDate:    null,
    operatorLicenseAttachmentId:  null,
    inspectionCertificateNo:      null,
    inspectionExpiryDate:         null,
    inspectionAttachmentId:       null,
    rtaRegistrationNo:            null,
    rtaRegistrationExpiryDate:    null,
    rtaRegistrationAttachmentId:  null,
    liftingTestCertificateNo:     null,
    liftingTestExpiryDate:        null,
    liftingTestAttachmentId:      null,
    insuranceType:                null,
    insuranceExpiryDate:          null,
    insuranceAttachmentId:        null,
    civilDefenseExpiryDate:       null,
    civilDefenseAttachmentId:     null,
    photoAttachmentId:            null,
    isActive:                     true,
    remarks:                      null,
    createdAt:                    new Date(),
    updatedAt:                    new Date(),
    createdBy:                    null,
    ...overrides,
  };
}

describe('HeavyMachineryService', () => {
  describe('expiry band enrichment on findOne', () => {
    it('inspection 10 days out → inspectionExpiryBand = "14d"', async () => {
      const { prisma, svc } = buildSvc();
      const actualToday = new Date();
      actualToday.setHours(0, 0, 0, 0);
      const expiry = new Date(actualToday);
      expiry.setDate(expiry.getDate() + 10);

      prisma.heavyMachinery.findUnique.mockResolvedValue(makeMachinery({
        inspectionExpiryDate: expiry,
      }));

      const result = await svc.findOne('m1');
      expect(result.inspectionExpiryBand).toBe(computeExpiryBand(expiry, actualToday));
      expect(result.inspectionExpiryBand).toBe('14d');
    });

    it('worstExpiryBand picks most urgent across all expiry fields', async () => {
      const { prisma, svc } = buildSvc();
      const actualToday = new Date();
      actualToday.setHours(0, 0, 0, 0);
      const soon   = new Date(actualToday); soon.setDate(soon.getDate() + 3);    // → "7d"
      const medium = new Date(actualToday); medium.setDate(medium.getDate() + 20); // → "30d"
      const far    = new Date(actualToday); far.setDate(far.getDate() + 100);      // → "valid"

      prisma.heavyMachinery.findUnique.mockResolvedValue(makeMachinery({
        inspectionExpiryDate:      far,
        rtaRegistrationExpiryDate: medium,
        civilDefenseExpiryDate:    soon,
      }));

      const result = await svc.findOne('m1');
      const expected = worstBand([
        computeExpiryBand(far,    actualToday),
        computeExpiryBand(medium, actualToday),
        computeExpiryBand(soon,   actualToday),
      ]);
      expect(result.worstExpiryBand).toBe(expected);
      expect(result.worstExpiryBand).toBe('7d');
    });

    it('all expiry dates null → worstExpiryBand = "valid"', async () => {
      const { prisma, svc } = buildSvc();
      prisma.heavyMachinery.findUnique.mockResolvedValue(makeMachinery());
      const result = await svc.findOne('m1');
      expect(result.worstExpiryBand).toBe('valid');
    });

    it('throws NotFoundException for missing machinery', async () => {
      const { prisma, svc } = buildSvc();
      prisma.heavyMachinery.findUnique.mockResolvedValue(null);
      await expect(svc.findOne('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('company scoping', () => {
    it('list query includes isActive filter (Prisma middleware enforces company scope)', async () => {
      const { prisma, svc } = buildSvc();
      prisma.heavyMachinery.findMany.mockResolvedValue([]);
      await svc.list({ page: 1, pageSize: 25 });
      const where = prisma.heavyMachinery.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
    });

    it('list with companyId filter passes companyId in where clause', async () => {
      const { prisma, svc } = buildSvc();
      prisma.heavyMachinery.findMany.mockResolvedValue([]);
      await svc.list({ page: 1, pageSize: 25, companyId: 'co-a' });
      const where = prisma.heavyMachinery.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe('co-a');
    });
  });

  describe('softDelete', () => {
    it('sets isActive = false', async () => {
      const { prisma, svc } = buildSvc();
      prisma.heavyMachinery.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.heavyMachinery.update.mockResolvedValue({ id: 'm1', isActive: false });
      await svc.softDelete('m1');
      expect(prisma.heavyMachinery.update.mock.calls[0][0].data).toEqual({ isActive: false });
    });
  });

  describe('create', () => {
    it('creates machinery with tenantId from actor', async () => {
      const { prisma, svc } = buildSvc();
      prisma.heavyMachinery.create.mockResolvedValue(makeMachinery());
      await svc.create(makeUser(), {
        machineType: 'Crane',
        make: 'Liebherr',
        serialNumber: 'SN999',
      });
      const args = prisma.heavyMachinery.create.mock.calls[0][0];
      expect(args.data.tenantId).toBe(TENANT_ID);
    });
  });
});
