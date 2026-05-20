/**
 * Vehicles service unit tests.
 * Tests company scoping, expiry band computation, worstExpiryBand, and
 * bulk-import duplicate detection — all without a live database.
 */

import { InsuranceType, VehicleType } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { computeExpiryBand, worstBand } from '@/common/utils/expiry-band';
import { VehiclesService } from './vehicles.service';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';

// ─── Expiry band pure function tests ─────────────────────────────────────────

describe('computeExpiryBand', () => {
  const today = new Date('2024-06-01');

  it('returns "valid" for 31+ days', () => {
    expect(computeExpiryBand(new Date('2024-07-15'), today)).toBe('valid');
  });

  it('returns "30d" for 15–30 days', () => {
    expect(computeExpiryBand(new Date('2024-06-20'), today)).toBe('30d');
  });

  it('returns "14d" for 8–14 days (e.g. today + 10)', () => {
    const d = new Date(today);
    d.setDate(d.getDate() + 10);
    expect(computeExpiryBand(d, today)).toBe('14d');
  });

  it('returns "7d" for 1–7 days', () => {
    const d = new Date(today);
    d.setDate(d.getDate() + 5);
    expect(computeExpiryBand(d, today)).toBe('7d');
  });

  it('returns "expired" for past dates', () => {
    expect(computeExpiryBand(new Date('2024-05-01'), today)).toBe('expired');
  });

  it('returns null for null input', () => {
    expect(computeExpiryBand(null, today)).toBeNull();
  });
});

describe('worstBand', () => {
  it('picks the most urgent band', () => {
    expect(worstBand(['valid', '30d', '7d', null])).toBe('7d');
  });

  it('treats expired as worst', () => {
    expect(worstBand(['14d', 'expired', '30d'])).toBe('expired');
  });

  it('defaults to valid when all null', () => {
    expect(worstBand([null, null])).toBe('valid');
  });

  it('car license 10 days out produces 14d band, which dominates insurance valid', () => {
    const today = new Date('2024-06-01');
    const carLicense = computeExpiryBand(new Date('2024-06-11'), today); // 10 days → 14d
    const insurance  = computeExpiryBand(new Date('2024-08-01'), today); // 61 days → valid
    expect(carLicense).toBe('14d');
    expect(worstBand([carLicense, insurance])).toBe('14d');
  });
});

// ─── VehiclesService unit tests (mock Prisma) ─────────────────────────────────

function buildSvc() {
  const prisma  = makeMockPrisma();
  const config  = { get: jest.fn().mockReturnValue('./uploads') } as any;
  const svc     = new VehiclesService(prisma as unknown as never, config);
  return { prisma, svc };
}

const TODAY = new Date('2024-06-01T00:00:00Z');

function makeVehicle(overrides: Partial<any> = {}) {
  return {
    id:                          'v1',
    tenantId:                    TENANT_ID,
    companyId:                   'co1',
    vehicleType:                 VehicleType.COMPANY,
    ownerName:                   'John Doe',
    driverName:                  null,
    carMake:                     'Toyota',
    carModel:                    null,
    plateEmirate:                'AUH',
    plateCategory:               null,
    plateNumber:                 'AB 1234',
    carLicenseNo:                'LIC001',
    carLicenseExpiryDate:        new Date('2025-01-01'),
    carLicenseAttachmentId:      null,
    insuranceType:               InsuranceType.COMPREHENSIVE,
    insurancePolicyNo:           null,
    insuranceExpiryDate:         new Date('2025-01-01'),
    insuranceAttachmentId:       null,
    hasResidentialMawaqif:       false,
    residentialMawaqifExpiryDate:null,
    hasNormalMawaqif:            false,
    normalMawaqifExpiryDate:     null,
    formAttachmentId:            null,
    isActive:                    true,
    remarks:                     null,
    createdAt:                   new Date(),
    updatedAt:                   new Date(),
    createdBy:                   null,
    ...overrides,
  };
}

describe('VehiclesService', () => {
  describe('expiry band enrichment on findOne', () => {
    it('car license 10 days out → carLicenseExpiryBand = "14d"', async () => {
      const { prisma, svc } = buildSvc();
      // Use actual today so the service and the assertion use the same reference.
      const actualToday = new Date();
      actualToday.setHours(0, 0, 0, 0);
      const expiry = new Date(actualToday);
      expiry.setDate(expiry.getDate() + 10); // +10 → falls in 8–14 range → "14d"

      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle({
        carLicenseExpiryDate: expiry,
        insuranceExpiryDate:  new Date(actualToday.getTime() + 365 * 24 * 3600 * 1000), // far future
      }));

      const result = await svc.findOne('v1');

      // Verify against the pure function with the same date
      expect(result.carLicenseExpiryBand).toBe(computeExpiryBand(expiry, actualToday));
      expect(result.carLicenseExpiryBand).toBe('14d');
    });

    it('worstExpiryBand is most urgent across all fields', async () => {
      const { prisma, svc } = buildSvc();
      const actualToday = new Date();
      actualToday.setHours(0, 0, 0, 0);
      const soon  = new Date(actualToday); soon.setDate(soon.getDate() + 5);   // → "7d"
      const later = new Date(actualToday); later.setDate(later.getDate() + 60); // → "valid"

      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle({
        carLicenseExpiryDate:  later,
        insuranceExpiryDate:   soon,
        hasNormalMawaqif:      false,
        hasResidentialMawaqif: false,
      }));

      const result = await svc.findOne('v1');

      const carBand       = computeExpiryBand(later, actualToday);
      const insuranceBand = computeExpiryBand(soon,  actualToday);
      expect(result.worstExpiryBand).toBe(worstBand([carBand, insuranceBand, null, null]));
      expect(result.worstExpiryBand).toBe('7d');
    });

    it('throws NotFoundException for missing vehicle', async () => {
      const { prisma, svc } = buildSvc();
      prisma.vehicle.findUnique.mockResolvedValue(null);
      await expect(svc.findOne('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('company scoping', () => {
    it('list query includes isActive filter (Prisma middleware enforces company scope)', async () => {
      const { prisma, svc } = buildSvc();
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.vehicle.count.mockResolvedValue(0);
      await svc.list({ page: 1, pageSize: 25 });
      const where = prisma.vehicle.findMany.mock.calls[0][0].where;
      // Tenant and company scoping is enforced by Prisma middleware, not the service.
      // The service only adds isActive filter.
      expect(where.isActive).toBe(true);
    });
  });

  describe('softDelete', () => {
    it('sets isActive = false', async () => {
      const { prisma, svc } = buildSvc();
      prisma.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.vehicle.update.mockResolvedValue({ id: 'v1', isActive: false });
      await svc.softDelete('v1');
      expect(prisma.vehicle.update.mock.calls[0][0].data).toEqual({ isActive: false });
    });
  });

  describe('bulk import preview', () => {
    it('rejects duplicate plate numbers within the same xlsx', async () => {
      const { svc } = buildSvc();

      // Build a minimal xlsx buffer with duplicate plate numbers
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Vehicles');
      const HEADERS = [
        'Owner Name', 'Driver Name', 'Car Make', 'Car Model',
        'Plate Emirate', 'Plate Category', 'Plate Number',
        'Car License No', 'Car License Expiry Date (YYYY-MM-DD)',
        'Vehicle Type (PRIVATE/COMPANY)', 'Insurance Type (COMPREHENSIVE/THIRD_PARTY)',
        'Insurance Policy No', 'Insurance Expiry Date (YYYY-MM-DD)',
        'Has Residential Mawaqif (YES/NO)', 'Residential Mawaqif Expiry Date (YYYY-MM-DD)',
        'Has Normal Mawaqif (YES/NO)', 'Normal Mawaqif Expiry Date (YYYY-MM-DD)',
        'Remarks',
      ];
      ws.addRow(HEADERS);
      // Two rows with the same plate number
      ws.addRow(['Owner1', '', 'Toyota', '', 'AUH', '', 'AB1234', 'LIC1', '2025-01-01', 'COMPANY', 'COMPREHENSIVE', '', '2025-06-01', 'NO', '', 'NO', '', '']);
      ws.addRow(['Owner2', '', 'Honda',  '', 'AUH', '', 'AB1234', 'LIC2', '2025-01-01', 'PRIVATE', 'THIRD_PARTY',   '', '2025-06-01', 'NO', '', 'NO', '', '']);

      const buffer = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
      const result = await svc.parseAndValidate(makeUser(), buffer);

      const dupeRow = result.rows.find((r) => r.rowNumber === 3);
      expect(dupeRow?.ok).toBe(false);
      expect(dupeRow?.errors.some((e: string) => e.includes('Duplicate'))).toBe(true);
    });
  });
});
