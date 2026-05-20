import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';
import { ExpiryService } from './expiry.service';

const COMPANY_ID  = 'company-001';
const VEHICLE_ID  = 'vehicle-001';
const EMPLOYEE_ID = 'employee-001';
const DOC_ID      = 'doc-001';

function buildSvc() {
  const prisma = makeMockPrisma();
  const svc    = new ExpiryService(prisma as unknown as never);
  return { prisma, svc };
}

const futureDate = (days: number): Date => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// ─── 1. Vehicle in 7d band ────────────────────────────────────────────────────

describe('ExpiryService', () => {
  describe('list — vehicle with carLicenseExpiryDate in 5 days appears in band=7d', () => {
    it('returns the vehicle row when band=7d', async () => {
      const { prisma, svc } = buildSvc();

      const vehicleRow = {
        source: 'vehicle',
        source_id: VEHICLE_ID,
        tenant_id: TENANT_ID,
        company_id: COMPANY_ID,
        doc_kind: 'CAR_LICENSE',
        display_name: 'Toyota – ABC 1234 – Car License',
        expiry_date: futureDate(5),
        days_until_expiry: 5,
        band: '7d',
      };

      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([vehicleRow])   // SELECT items
        .mockResolvedValueOnce([{ total: 1 }]);// COUNT

      const result = await svc.list({ band: '7d' }, TENANT_ID);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].source).toBe('vehicle');
      expect(result.items[0].doc_kind).toBe('CAR_LICENSE');
      expect(result.items[0].days_until_expiry).toBe(5);
      expect(result.total).toBe(1);
    });
  });

  // ─── 2. Employee with expired visa ───────────────────────────────────────────

  describe('list — employee with visa expiry yesterday appears in band=expired', () => {
    it('returns the employee row when band=expired', async () => {
      const { prisma, svc } = buildSvc();

      const employeeRow = {
        source: 'employee',
        source_id: EMPLOYEE_ID,
        tenant_id: TENANT_ID,
        company_id: COMPANY_ID,
        doc_kind: 'VISA',
        display_name: 'Ahmed Ali – Visa',
        expiry_date: futureDate(-1),
        days_until_expiry: -1,
        band: 'expired',
      };

      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([employeeRow])
        .mockResolvedValueOnce([{ total: 1 }]);

      const result = await svc.list({ band: 'expired' }, TENANT_ID);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].source).toBe('employee');
      expect(result.items[0].doc_kind).toBe('VISA');
      expect(result.items[0].days_until_expiry).toBe(-1);
    });
  });

  // ─── 3. CIVIL_DEFENSE Hassantuk sub-expiry appears separately ────────────────

  describe('list — CIVIL_DEFENSE doc returns HASSANTUK row with doc_kind=HASSANTUK', () => {
    it('Hassantuk sub-expiry row has doc_kind HASSANTUK and separate days', async () => {
      const { prisma, svc } = buildSvc();

      const mainRow = {
        source: 'company_document', source_id: DOC_ID, tenant_id: TENANT_ID,
        company_id: COMPANY_ID, doc_kind: 'CIVIL_DEFENSE',
        display_name: 'Civil Defense Certificate',
        expiry_date: futureDate(60), days_until_expiry: 60, band: 'valid',
      };
      const hassantukRow = {
        source: 'company_document', source_id: DOC_ID, tenant_id: TENANT_ID,
        company_id: COMPANY_ID, doc_kind: 'HASSANTUK',
        display_name: 'Civil Defense Certificate – Hassantuk',
        expiry_date: futureDate(10), days_until_expiry: 10, band: '14d',
      };

      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([mainRow, hassantukRow])
        .mockResolvedValueOnce([{ total: 2 }]);

      const result = await svc.list({}, TENANT_ID);
      const hassantuk = result.items.find((r) => r.doc_kind === 'HASSANTUK');

      expect(hassantuk).toBeDefined();
      expect(hassantuk!.source_id).toBe(DOC_ID);
      expect(hassantuk!.days_until_expiry).toBe(10);
    });
  });

  // ─── 4. Deduplicate: second sweep on same day skips notification ──────────────

  describe('runDocumentExpirySweep — deduplication', () => {
    it('second sweep on the same day skips notification and log insert', async () => {
      const { prisma, svc } = buildSvc();

      const item = {
        source: 'vehicle', source_id: VEHICLE_ID,
        tenant_id: TENANT_ID, company_id: COMPANY_ID,
        doc_kind: 'CAR_LICENSE', display_name: 'Toyota – ABC – Car License',
        expiry_date: futureDate(3), days_until_expiry: 3, band: '7d',
      };

      // First call: no log entry → should notify
      prisma.$queryRawUnsafe.mockResolvedValueOnce([item]);
      prisma.expiryNotificationLog.findFirst.mockResolvedValueOnce(null);
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'user-001' }]);
      prisma.notification.createMany.mockResolvedValueOnce({ count: 1 });
      prisma.expiryNotificationLog.create.mockResolvedValueOnce({ id: 'log-001' });

      const tx = prisma as unknown as never;
      const first = await svc.runDocumentExpirySweep(tx);
      expect(first.processed).toBe(1);
      expect(first.skipped).toBe(0);
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);

      // Second call: log entry exists → should skip
      prisma.$queryRawUnsafe.mockResolvedValueOnce([item]);
      prisma.expiryNotificationLog.findFirst.mockResolvedValueOnce({ id: 'log-001' });

      const second = await svc.runDocumentExpirySweep(tx);
      expect(second.processed).toBe(0);
      expect(second.skipped).toBe(1);
      // createMany must NOT have been called again
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 5. Summary counts — new format (source/doc_kind/days + thresholds) ──────

  describe('summary — counts match view rows', () => {
    it('aggregates byBand and bySource correctly using per-docKind thresholds', async () => {
      const { prisma, svc } = buildSvc();

      // New summary query returns rows with (source, doc_kind, days, cnt, band1_days, ...)
      // band is computed in app layer from days + threshold columns
      prisma.$queryRaw.mockResolvedValueOnce([
        { source: 'vehicle',          doc_kind: 'CAR_LICENSE',   days: -5, cnt: BigInt(2),  band1_days: 30, band2_days: 14, band3_days: 7 },
        { source: 'employee',         doc_kind: 'VISA',          days: 3,  cnt: BigInt(3),  band1_days: 30, band2_days: 14, band3_days: 7 },
        { source: 'company_document', doc_kind: 'TRADE_LICENSE', days: 10, cnt: BigInt(1),  band1_days: 30, band2_days: 14, band3_days: 7 },
        { source: 'gate_pass',        doc_kind: 'GATE_PASS',     days: 60, cnt: BigInt(10), band1_days: 30, band2_days: 14, band3_days: 7 },
      ]);

      const result = await svc.summary(TENANT_ID);

      // days=-5 → expired; days=3 → 7d; days=10 → 14d; days=60 → valid
      expect(result.byBand.expired).toBe(2);
      expect(result.byBand['7d']).toBe(3);
      expect(result.byBand['14d']).toBe(1);
      expect(result.byBand.valid).toBe(10);
      expect(result.bySource.vehicle).toBe(2);
      expect(result.bySource.employee).toBe(3);
      expect(result.bySource.company_document).toBe(1);
      expect(result.bySource.gate_pass).toBe(10);
    });
  });

  // ─── 6. Custom threshold: TRADE_LICENSE 60/30/7 → 45 days = band 30d ─────────

  describe('list — custom threshold applied per docKind', () => {
    it('TRADE_LICENSE with 60/30/7 config: item at 45 days returns band=30d (not valid)', async () => {
      const { prisma, svc } = buildSvc();

      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{
          source: 'company_document', source_id: DOC_ID,
          tenant_id: TENANT_ID,       company_id: COMPANY_ID,
          doc_kind: 'TRADE_LICENSE',  display_name: 'Trade License 2025',
          expiry_date: futureDate(45), days_until_expiry: 45,
          band1_days: 60, band2_days: 30, band3_days: 7,
        }])
        .mockResolvedValueOnce([{ total: 1 }]);

      const result = await svc.list({}, TENANT_ID);

      // With defaults (30/14/7): 45 > 30 → 'valid'
      // With custom (60/30/7):   45 > 30 but <= 60 → '30d'
      expect(result.items[0].band).toBe('30d');
    });

    it('VISA with 60/30/14 config: item at 50 days returns band=30d', async () => {
      const { prisma, svc } = buildSvc();

      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{
          source: 'employee', source_id: EMPLOYEE_ID,
          tenant_id: TENANT_ID,  company_id: COMPANY_ID,
          doc_kind: 'VISA',   display_name: 'Ahmed Ali – Visa',
          expiry_date: futureDate(50), days_until_expiry: 50,
          band1_days: 60, band2_days: 30, band3_days: 14,
        }])
        .mockResolvedValueOnce([{ total: 1 }]);

      const result = await svc.list({}, TENANT_ID);

      // 50 > 30 but <= 60 → '30d'
      expect(result.items[0].band).toBe('30d');
    });

    it('after DELETE override: item at 45 days reverts to default → valid', async () => {
      const { prisma, svc } = buildSvc();

      // Default thresholds (no override — columns contain default values)
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{
          source: 'company_document', source_id: DOC_ID,
          tenant_id: TENANT_ID,       company_id: COMPANY_ID,
          doc_kind: 'TRADE_LICENSE',  display_name: 'Trade License 2025',
          expiry_date: futureDate(45), days_until_expiry: 45,
          band1_days: 30, band2_days: 14, band3_days: 7,  // back to defaults
        }])
        .mockResolvedValueOnce([{ total: 1 }]);

      const result = await svc.list({}, TENANT_ID);

      expect(result.items[0].band).toBe('valid'); // 45 > 30 → valid with defaults
    });
  });
});
