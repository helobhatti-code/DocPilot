import { BadRequestException, NotFoundException } from '@nestjs/common';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';
import { AlarmThresholdsService, DEFAULT_THRESHOLDS } from './alarm-thresholds.service';

const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER_ID  = '33333333-3333-3333-3333-333333333333';

function buildSvc() {
  const prisma = makeMockPrisma();
  const svc    = new AlarmThresholdsService(prisma as unknown as never);
  return { prisma, svc };
}

describe('AlarmThresholdsService', () => {

  // ─── 1. Upsert & list — custom thresholds are stored and returned ─────────────

  describe('list — returns overrides merged with defaults', () => {
    it('returns custom config when override exists for docKind', async () => {
      const { prisma, svc } = buildSvc();

      prisma.alarmThresholdConfig.findMany.mockResolvedValueOnce([
        { docKind: 'TRADE_LICENSE', band1Days: 60, band2Days: 30, band3Days: 7, updatedAt: new Date() },
      ]);

      const result = await svc.list(TENANT_ID);
      const tl = result.find((r) => r.docKind === 'TRADE_LICENSE');

      expect(tl?.band1Days).toBe(60);
      expect(tl?.band2Days).toBe(30);
      expect(tl?.band3Days).toBe(7);
      expect(tl?.isOverridden).toBe(true);
    });

    it('returns defaults for docKinds without an override', async () => {
      const { prisma, svc } = buildSvc();
      prisma.alarmThresholdConfig.findMany.mockResolvedValueOnce([]); // no overrides

      const result = await svc.list(TENANT_ID);
      const visa = result.find((r) => r.docKind === 'VISA');

      expect(visa?.band1Days).toBe(DEFAULT_THRESHOLDS.band1Days);
      expect(visa?.band2Days).toBe(DEFAULT_THRESHOLDS.band2Days);
      expect(visa?.band3Days).toBe(DEFAULT_THRESHOLDS.band3Days);
      expect(visa?.isOverridden).toBe(false);
    });
  });

  // ─── 2. Upsert validation ────────────────────────────────────────────────────

  describe('upsert — descending order validation', () => {
    it('accepts a valid 60/30/7 config', async () => {
      const { prisma, svc } = buildSvc();
      prisma.alarmThresholdConfig.upsert.mockResolvedValueOnce({
        id: 'cfg-1', docKind: 'TRADE_LICENSE',
        band1Days: 60, band2Days: 30, band3Days: 7, updatedAt: new Date(),
      });

      await expect(
        svc.upsert(TENANT_ID, 'TRADE_LICENSE', { band1Days: 60, band2Days: 30, band3Days: 7 }, USER_ID),
      ).resolves.toMatchObject({ band1Days: 60, isOverridden: true });
    });

    it('rejects when band1Days <= band2Days (400)', async () => {
      const { svc } = buildSvc();
      await expect(
        svc.upsert(TENANT_ID, 'VISA', { band1Days: 10, band2Days: 20, band3Days: 5 }, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when band2Days <= band3Days (400)', async () => {
      const { svc } = buildSvc();
      await expect(
        svc.upsert(TENANT_ID, 'VISA', { band1Days: 30, band2Days: 7, band3Days: 7 }, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown docKind with 404', async () => {
      const { svc } = buildSvc();
      await expect(
        svc.upsert(TENANT_ID, 'NONEXISTENT_KIND', { band1Days: 30, band2Days: 14, band3Days: 7 }, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── 3. Remove — reverts to defaults ──────────────────────────────────────────

  describe('remove — delete override reverts to defaults', () => {
    it('deleteMany removes the override and returns default values', async () => {
      const { prisma, svc } = buildSvc();
      prisma.alarmThresholdConfig.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await svc.remove(TENANT_ID, 'TRADE_LICENSE');

      expect(prisma.alarmThresholdConfig.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, docKind: 'TRADE_LICENSE' },
      });
      expect(result.band1Days).toBe(DEFAULT_THRESHOLDS.band1Days);
      expect(result.band2Days).toBe(DEFAULT_THRESHOLDS.band2Days);
      expect(result.band3Days).toBe(DEFAULT_THRESHOLDS.band3Days);
      expect(result.isOverridden).toBe(false);
    });
  });

  // ─── 4. Tenant isolation — config for tenant A does not leak to tenant B ──────

  describe('tenant isolation', () => {
    it('list() for tenant B returns defaults even though tenant A has a custom config', async () => {
      const { prisma, svc } = buildSvc();

      // First call (tenant A): has VISA override
      prisma.alarmThresholdConfig.findMany
        .mockResolvedValueOnce([
          { docKind: 'VISA', band1Days: 60, band2Days: 30, band3Days: 14, updatedAt: new Date() },
        ])
        // Second call (tenant B): no overrides
        .mockResolvedValueOnce([]);

      const tenantA = await svc.list(TENANT_ID);
      const tenantB = await svc.list(TENANT_B);

      const visaA = tenantA.find((r) => r.docKind === 'VISA');
      const visaB = tenantB.find((r) => r.docKind === 'VISA');

      expect(visaA?.band1Days).toBe(60);     // custom for A
      expect(visaB?.band1Days).toBe(30);     // default for B
      expect(visaA?.isOverridden).toBe(true);
      expect(visaB?.isOverridden).toBe(false);

      // findMany was called with the correct tenantId each time
      expect(prisma.alarmThresholdConfig.findMany.mock.calls[0][0].where.tenantId).toBe(TENANT_ID);
      expect(prisma.alarmThresholdConfig.findMany.mock.calls[1][0].where.tenantId).toBe(TENANT_B);
    });
  });
});
