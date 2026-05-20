import { ReportsService } from './reports.service';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';
import type { ReportFilterDto } from './dto/reports.dto';

function build() {
  const prisma = makeMockPrisma();
  const svc    = new ReportsService(prisma as unknown as never);
  return { prisma, svc };
}

const today = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };
const day   = (n: number) => { const d = today(); d.setUTCDate(d.getUTCDate() + n); return d; };
const F     = (o: Partial<ReportFilterDto> = {}): ReportFilterDto => ({ page: 1, pageSize: 50, ...o });

const makeVehicle = (carDays: number, insDays: number) => ({
  id:                          'v-1',
  vehicleType:                 'COMPANY',
  ownerName:                   'Owner',
  carMake:                     'Toyota',
  plateNumber:                 'ABC 123',
  carLicenseExpiryDate:        day(carDays),
  insuranceExpiryDate:         day(insDays),
  hasResidentialMawaqif:       false,
  residentialMawaqifExpiryDate: null,
  hasNormalMawaqif:            false,
  normalMawaqifExpiryDate:     null,
  isActive:                    true,
  company:                     { name: 'ACME Corp' },
});

// ─── 1. Vehicles expiry — excludes vehicles with all valid bands ───────────────

describe('ReportsService extended — vehicles-expiry', () => {
  it('excludes vehicles whose worst band is valid', async () => {
    const { prisma, svc } = build();

    // Two vehicles: one with car license expiring in 5 days (7d), one with everything > 30 days (valid).
    // Because the WHERE clause filters by cutoff=30, the "valid" vehicle won't be returned by findMany.
    // We simulate this by only returning the expiring vehicle from the mock.
    prisma.vehicle.findMany.mockResolvedValue([
      makeVehicle(5, 90),   // carLicense in 7d band → should be included
    ]);

    const r = await svc.run(makeUser(), 'vehicles-expiry', F({ daysAhead: 30 }));

    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].worstExpiryBand).toBe('7d');
    expect(r.rows[0].worstExpiryBand).not.toBe('valid');
    expect(r.rows[0].companyName).toBe('ACME Corp');
  });

  it('post-filters out rows where worstExpiryBand is valid (both fields > daysAhead)', async () => {
    const { prisma, svc } = build();

    // If the WHERE clause is bypassed by mock, the service should still post-filter
    // a vehicle where all bands compute to 'valid'.
    prisma.vehicle.findMany.mockResolvedValue([
      makeVehicle(60, 90),   // both > 30 → all bands valid
    ]);

    const r = await svc.run(makeUser(), 'vehicles-expiry', F({ daysAhead: 30 }));

    expect(r.rows).toHaveLength(0);
  });

  it('applies companyId to the Prisma where clause', async () => {
    const { prisma, svc } = build();
    prisma.vehicle.findMany.mockResolvedValue([]);

    await svc.run(makeUser(), 'vehicles-expiry', F({ companyId: 'co-123' }));

    const where = prisma.vehicle.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe('co-123');
  });
});

// ─── 2. Master expiry — 5 sheets ─────────────────────────────────────────────

describe('ReportsService extended — master-expiry xlsx sheets', () => {
  it('result has sheets array with 5 entries named correctly', async () => {
    const { prisma, svc } = build();

    prisma.$queryRawUnsafe.mockResolvedValue([
      { source: 'gate_pass',        source_id: 'gp1', tenant_id: TENANT_ID, company_id: 'c1',
        doc_kind: 'GATE_PASS',      display_name: 'Pass 001', expiry_date: day(-1), days_until_expiry: -1 },
      { source: 'vehicle',          source_id: 'v1',  tenant_id: TENANT_ID, company_id: 'c1',
        doc_kind: 'CAR_LICENSE',    display_name: 'Toyota ABC', expiry_date: day(3),  days_until_expiry: 3 },
      { source: 'machinery',        source_id: 'm1',  tenant_id: TENANT_ID, company_id: 'c1',
        doc_kind: 'INSPECTION_CERT', display_name: 'Crane #S1', expiry_date: day(10), days_until_expiry: 10 },
      { source: 'employee',         source_id: 'e1',  tenant_id: TENANT_ID, company_id: 'c1',
        doc_kind: 'VISA',           display_name: 'Ahmed – Visa', expiry_date: day(-5), days_until_expiry: -5 },
      { source: 'company_document', source_id: 'd1',  tenant_id: TENANT_ID, company_id: 'c1',
        doc_kind: 'TRADE_LICENSE',  display_name: 'Trade License 2025', expiry_date: day(25), days_until_expiry: 25 },
    ]);

    const r = await svc.run(makeUser(), 'master-expiry', F({ band: 'expired,7d,14d,30d' }));

    expect(r.sheets).toBeDefined();
    expect(r.sheets!.length).toBe(5);

    const names = r.sheets!.map((s) => s.name);
    expect(names).toContain('Gate Passes');
    expect(names).toContain('Vehicles');
    expect(names).toContain('Machinery');
    expect(names).toContain('Employees');
    expect(names).toContain('Company Documents');
  });

  it('each sheet contains only rows for its source module', async () => {
    const { prisma, svc } = build();

    prisma.$queryRawUnsafe.mockResolvedValue([
      { source: 'vehicle',  source_id: 'v1', tenant_id: TENANT_ID, company_id: 'c1',
        doc_kind: 'CAR_LICENSE', display_name: 'Toyota', expiry_date: day(3), days_until_expiry: 3 },
      { source: 'employee', source_id: 'e1', tenant_id: TENANT_ID, company_id: 'c1',
        doc_kind: 'VISA',       display_name: 'Ahmed',  expiry_date: day(-1), days_until_expiry: -1 },
    ]);

    const r = await svc.run(makeUser(), 'master-expiry', F());

    const vehicleSheet   = r.sheets!.find((s) => s.name === 'Vehicles');
    const employeeSheet  = r.sheets!.find((s) => s.name === 'Employees');

    expect(vehicleSheet!.rows).toHaveLength(1);
    expect(employeeSheet!.rows).toHaveLength(1);
    expect(vehicleSheet!.rows[0].doc_kind).toBe('CAR_LICENSE');
    expect(employeeSheet!.rows[0].doc_kind).toBe('VISA');
  });
});

// ─── 3. Master expiry — company scoping ──────────────────────────────────────

describe('ReportsService extended — master-expiry company scoping', () => {
  it('includes company_id = param in the raw SQL params', async () => {
    const { prisma, svc } = build();
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    await svc.run(makeUser(), 'master-expiry', F({ companyId: 'co-abc' }));

    const call   = prisma.$queryRawUnsafe.mock.calls[0];
    const params = call.slice(1);
    expect(params).toContain('co-abc');
  });
});

// ─── 4. Machinery compliance — null certificate dates don't crash ─────────────

describe('ReportsService extended — machinery-compliance', () => {
  it('includes null bands for optional certificate fields', async () => {
    const { prisma, svc } = build();

    prisma.heavyMachinery.findMany.mockResolvedValue([
      {
        id: 'm1', machineType: 'Excavator', make: 'Caterpillar', serialNumber: 'CAT-001',
        status: 'ACTIVE', assignedOperator: null, projectSite: null,
        // Only operator license is set; all others null
        operatorLicenseExpiryDate:  day(5),
        inspectionExpiryDate:       null,
        rtaRegistrationExpiryDate:  null,
        liftingTestExpiryDate:      null,
        insuranceExpiryDate:        null,
        civilDefenseExpiryDate:     null,
        isActive: true,
        company: { name: 'Builder Co' },
      },
    ]);

    const r = await svc.run(makeUser(), 'machinery-compliance', F());

    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];

    // Operator license has a real band
    expect(row.operatorLicenseExpiryBand).toBe('7d');

    // All other bands are null (not 'valid' — they're absent)
    expect(row.inspectionExpiryBand).toBeNull();
    expect(row.rtaRegistrationExpiryBand).toBeNull();
    expect(row.liftingTestExpiryBand).toBeNull();
    expect(row.insuranceExpiryBand).toBeNull();
    expect(row.civilDefenseExpiryBand).toBeNull();

    // worstBand is driven by operator license
    expect(row.worstExpiryBand).toBe('7d');
    expect(row.companyName).toBe('Builder Co');
  });
});

// ─── 5. Admin companyId scoping ───────────────────────────────────────────────

describe('ReportsService extended — company scoping', () => {
  it('vehicles-expiry WHERE includes companyId when param is provided', async () => {
    const { prisma, svc } = build();
    prisma.vehicle.findMany.mockResolvedValue([]);

    await svc.run(makeUser(), 'vehicles-expiry', F({ companyId: 'specific-company' }));

    const where = prisma.vehicle.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe('specific-company');
  });

  it('employees-visa-status WHERE includes companyId when param is provided', async () => {
    const { prisma, svc } = build();
    prisma.employee.findMany.mockResolvedValue([]);

    await svc.run(makeUser(), 'employees-visa-status', F({ companyId: 'emp-company' }));

    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe('emp-company');
  });

  it('machinery-compliance WHERE includes companyId when param is provided', async () => {
    const { prisma, svc } = build();
    prisma.heavyMachinery.findMany.mockResolvedValue([]);

    await svc.run(makeUser(), 'machinery-compliance', F({ companyId: 'mach-company' }));

    const where = prisma.heavyMachinery.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe('mach-company');
  });
});
