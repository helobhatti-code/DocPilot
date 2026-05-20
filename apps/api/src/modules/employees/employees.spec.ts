/**
 * Employees service unit tests.
 * Tests: CRUD company scoping, expiry band thresholds (including 30-day visa alarm),
 * worstExpiryBand selection, bulk-import duplicate EID detection, soft-delete.
 */

import { EmployeeStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { computeExpiryBand, worstBand } from '@/common/utils/expiry-band';
import { EmployeesService } from './employees.service';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';

function buildSvc() {
  const prisma  = makeMockPrisma();
  const config  = { get: jest.fn().mockReturnValue('./uploads') } as any;
  const svc     = new EmployeesService(prisma as unknown as never, config);
  return { prisma, svc };
}

// ─── Reference date (actual today to align with service's new Date()) ─────────
function daysFromToday(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

function makeEmployee(overrides: Partial<any> = {}) {
  return {
    id:                       'e1',
    tenantId:                 TENANT_ID,
    companyId:                'co1',
    name:                     'Alice',
    designation:              'Engineer',
    emiratesIdNo:             'EID123456',
    emiratesIdExpiryDate:     daysFromToday(100),
    emiratesIdAttachmentId:   null,
    visaNo:                   'VISA001',
    visaExpiryDate:           daysFromToday(200),
    visaAttachmentId:         null,
    laborCardNo:              null,
    laborCardExpiryDate:      null,
    laborCardAttachmentId:    null,
    passportNo:               null,
    passportExpiryDate:       null,
    passportAttachmentId:     null,
    phone:                    null,
    email:                    null,
    joinDate:                 null,
    status:                   EmployeeStatus.ACTIVE,
    isActive:                 true,
    remarks:                  null,
    createdAt:                new Date(),
    updatedAt:                new Date(),
    createdBy:                null,
    ...overrides,
  };
}

// ─── 1. CRUD scoped to company ────────────────────────────────────────────────

describe('EmployeesService — company scoping', () => {
  it('list query always includes isActive=true (Prisma middleware enforces company scope)', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employee.count.mockResolvedValue(0);
    await svc.list({ page: 1, pageSize: 25 });
    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
  });

  it('companyId filter is passed through to the where clause', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employee.count.mockResolvedValue(0);
    await svc.list({ page: 1, pageSize: 25, companyId: 'co-x' });
    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe('co-x');
  });

  it('create injects tenantId from the authenticated user', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.create.mockResolvedValue(makeEmployee());
    await svc.create(makeUser(), {
      name:          'Bob',
      designation:   'Technician',
      emiratesIdNo:  'EID999',
      visaExpiryDate:'2026-01-01',
    });
    const args = prisma.employee.create.mock.calls[0][0];
    expect(args.data.tenantId).toBe(TENANT_ID);
  });
});

// ─── 2. Visa expiry in 25 days → "30d" band ───────────────────────────────────

describe('EmployeesService — visa 30-day alarm rule', () => {
  it('visa expiry in 25 days produces visaExpiryBand = "30d"', async () => {
    const { prisma, svc } = buildSvc();
    const visa25 = daysFromToday(25); // 25 days → falls in 15–30 range → "30d"

    prisma.employee.findUnique.mockResolvedValue(makeEmployee({ visaExpiryDate: visa25 }));
    const result = await svc.findOne('e1');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(result.visaExpiryBand).toBe(computeExpiryBand(visa25, today));
    expect(result.visaExpiryBand).toBe('30d');
  });

  it('visa expiry in 31 days produces visaExpiryBand = "valid"', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(makeEmployee({ visaExpiryDate: daysFromToday(31) }));
    const result = await svc.findOne('e1');
    expect(result.visaExpiryBand).toBe('valid');
  });
});

// ─── 3. worstExpiryBand = most urgent across all docs ────────────────────────

describe('EmployeesService — worstExpiryBand', () => {
  it('visa 5 days + EID 35 days → worstExpiryBand = "7d"', async () => {
    const { prisma, svc } = buildSvc();
    const visa5  = daysFromToday(5);   // → "7d"
    const eid35  = daysFromToday(35);  // → "valid"

    prisma.employee.findUnique.mockResolvedValue(makeEmployee({
      visaExpiryDate:       visa5,
      emiratesIdExpiryDate: eid35,
    }));
    const result = await svc.findOne('e1');

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expected = worstBand([
      computeExpiryBand(visa5,  today),
      computeExpiryBand(eid35,  today),
      null,
      null,
    ]);
    expect(result.worstExpiryBand).toBe(expected);
    expect(result.worstExpiryBand).toBe('7d');
  });

  it('all docs far out → worstExpiryBand = "valid"', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(makeEmployee({
      visaExpiryDate:       daysFromToday(120),
      emiratesIdExpiryDate: daysFromToday(200),
    }));
    const result = await svc.findOne('e1');
    expect(result.worstExpiryBand).toBe('valid');
  });

  it('throws NotFoundException for missing employee', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue(null);
    await expect(svc.findOne('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── 4. Bulk import rejects duplicate Emirates IDs ───────────────────────────

describe('EmployeesService — bulk import duplicate EID detection', () => {
  it('rejects duplicate Emirates ID numbers within the same xlsx', async () => {
    const { svc } = buildSvc();
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Employees');
    ws.addRow([
      'Name', 'Designation', 'Emirates ID No.', 'Emirates ID Expiry (YYYY-MM-DD)',
      'Visa No.', 'Visa Expiry (YYYY-MM-DD)',
      'Labor Card No.', 'Labor Card Expiry (YYYY-MM-DD)',
      'Passport No.', 'Passport Expiry (YYYY-MM-DD)',
      'Phone', 'Email', 'Join Date (YYYY-MM-DD)',
      'Status (ACTIVE/ON_LEAVE/TERMINATED)', 'Remarks',
    ]);
    // Two rows with the same Emirates ID
    ws.addRow(['Alice', 'Engineer', 'EID123', '', '', '2026-01-01', '', '', '', '', '', '', '', 'ACTIVE', '']);
    ws.addRow(['Bob',   'Technician','EID123','', '', '2026-06-01', '', '', '', '', '', '', '', 'ACTIVE', '']);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
    const result = await svc.parseAndValidate(makeUser(), buffer);

    const dupeRow = result.rows.find((r: any) => r.rowNumber === 3);
    expect(dupeRow?.ok).toBe(false);
    expect(dupeRow?.errors.some((e: string) => e.includes('Duplicate'))).toBe(true);
  });
});

// ─── 5. Soft delete ───────────────────────────────────────────────────────────

describe('EmployeesService — soft delete', () => {
  it('sets isActive=false and status=TERMINATED', async () => {
    const { prisma, svc } = buildSvc();
    prisma.employee.findUnique.mockResolvedValue({ id: 'e1' });
    prisma.employee.update.mockResolvedValue({ id: 'e1', isActive: false, status: EmployeeStatus.TERMINATED });
    await svc.softDelete('e1');
    const updateCall = prisma.employee.update.mock.calls[0][0];
    expect(updateCall.data.isActive).toBe(false);
    expect(updateCall.data.status).toBe(EmployeeStatus.TERMINATED);
  });

  it('soft-deleted employee not returned in active list (isActive=true filter)', async () => {
    const { prisma, svc } = buildSvc();
    // List always filters isActive=true, so a deleted employee won't appear
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employee.count.mockResolvedValue(0);
    await svc.list({ page: 1, pageSize: 25 });
    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
  });
});
