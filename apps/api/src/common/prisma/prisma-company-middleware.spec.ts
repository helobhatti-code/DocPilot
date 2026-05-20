/**
 * Tests for PrismaService company middleware behaviour.
 *
 * Verifies that companyId is auto-injected on writes, AND-filtered on reads,
 * and that bypassCompany / null companyId skip all company filtering.
 */

// jest.mock is hoisted before imports — FakePrismaClient replaces the real one
// but all other exports (UserRole, Prisma namespace) come from the real module.
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual<typeof import('@prisma/client')>('@prisma/client');
  class FakePrismaClient {
    $use = jest.fn();
    $connect = jest.fn();
    $disconnect = jest.fn();
    $on  = jest.fn();
  }
  return { ...actual, PrismaClient: FakePrismaClient };
});

import { UserRole } from '@prisma/client';
import { tenantStorage } from '../context/tenant-context';
import { PrismaService } from './prisma.service';

const COMPANY_ID = 'company-cuid-1234';
const TENANT_ID  = '11111111-1111-1111-1111-111111111111';

type Params = {
  model: string;
  action: string;
  args: Record<string, unknown>;
  dataPath: string[];
  runInTransaction: boolean;
};

function makeParams(model: string, action: string, args: Record<string, unknown> = {}): Params {
  return { model, action, args, dataPath: [], runInTransaction: false };
}

const noopNext = jest.fn(async () => ({}));

/** Run the company middleware with a given context and params, return mutated params. */
async function runCompanyMw(
  ctx: { companyId: string | null; bypassCompany: boolean },
  params: Params,
): Promise<Params> {
  const svc = new PrismaService();
  const mw  = (svc as unknown as Record<string, (p: Params, n: typeof noopNext) => Promise<void>>)
    ['companyMiddleware'].bind(svc);

  return tenantStorage.run(
    {
      tenantId:      TENANT_ID,
      userId:        'u1',
      role:          UserRole.ADMIN,
      companyId:     ctx.companyId,
      bypassCompany: ctx.bypassCompany,
    },
    async () => {
      await mw(params, noopNext);
      return params;
    },
  );
}

describe('PrismaService company middleware', () => {
  describe('write injection (create)', () => {
    it('injects companyId on GatePass create', async () => {
      const params = makeParams('GatePass', 'create', { data: { passNumber: '123456' } });
      const result = await runCompanyMw({ companyId: COMPANY_ID, bypassCompany: false }, params);
      expect((result.args.data as Record<string, unknown>).companyId).toBe(COMPANY_ID);
    });

    it('injects companyId on Staff create', async () => {
      const params = makeParams('Staff', 'create', { data: { name: 'Alice' } });
      const result = await runCompanyMw({ companyId: COMPANY_ID, bypassCompany: false }, params);
      expect((result.args.data as Record<string, unknown>).companyId).toBe(COMPANY_ID);
    });

    it('injects companyId on SubcontractorOrg create', async () => {
      const params = makeParams('SubcontractorOrg', 'create', { data: { name: 'Sub Inc' } });
      const result = await runCompanyMw({ companyId: COMPANY_ID, bypassCompany: false }, params);
      expect((result.args.data as Record<string, unknown>).companyId).toBe(COMPANY_ID);
    });

    it('does NOT inject companyId when bypassCompany = true', async () => {
      const params = makeParams('GatePass', 'create', { data: { passNumber: '123456' } });
      const result = await runCompanyMw({ companyId: null, bypassCompany: true }, params);
      expect((result.args.data as Record<string, unknown>).companyId).toBeUndefined();
    });

    it('does NOT inject companyId when companyId is null and bypassCompany is false', async () => {
      const params = makeParams('GatePass', 'create', { data: { passNumber: '123456' } });
      const result = await runCompanyMw({ companyId: null, bypassCompany: false }, params);
      expect((result.args.data as Record<string, unknown>).companyId).toBeUndefined();
    });

    it('does NOT inject companyId on non-company-scoped model (CustodyHistory)', async () => {
      const params = makeParams('CustodyHistory', 'create', { data: { toStatus: 'WITH_COMPANY' } });
      const result = await runCompanyMw({ companyId: COMPANY_ID, bypassCompany: false }, params);
      expect((result.args.data as Record<string, unknown>).companyId).toBeUndefined();
    });
  });

  describe('read filtering (findMany / findUnique)', () => {
    it('AND-wraps the where clause with companyId on findMany', async () => {
      const params = makeParams('GatePass', 'findMany', { where: { status: 'VALID' } });
      const result = await runCompanyMw({ companyId: COMPANY_ID, bypassCompany: false }, params);
      const where  = result.args.where as Record<string, unknown>;
      expect(Array.isArray(where.AND)).toBe(true);
      expect((where.AND as Array<unknown>)[0]).toEqual({ companyId: COMPANY_ID });
    });

    it('converts findUnique → findFirst and injects companyId filter', async () => {
      const params = makeParams('GatePass', 'findUnique', { where: { id: 'abc' } });
      const result = await runCompanyMw({ companyId: COMPANY_ID, bypassCompany: false }, params);
      expect(result.action).toBe('findFirst');
      const where = result.args.where as Record<string, unknown>;
      expect((where.AND as Array<unknown>)[0]).toEqual({ companyId: COMPANY_ID });
    });

    it('skips read filter when bypassCompany = true', async () => {
      const params = makeParams('GatePass', 'findMany', { where: { status: 'VALID' } });
      const result = await runCompanyMw({ companyId: null, bypassCompany: true }, params);
      const where  = result.args.where as Record<string, unknown>;
      expect(where.AND).toBeUndefined();
      expect(where.status).toBe('VALID');
    });
  });

  describe('RLS isolation (documented behaviour)', () => {
    /**
     * The migration 0006_company_rls adds per-table policies on gate_passes, staff, and
     * subcontractor_orgs. For a non-owner DB role, only rows matching the GUC
     * `app.company_id` (or where company_id IS NULL) are visible.
     *
     * Full integration test requires a live Postgres instance with the migration applied
     * and a non-owner role. Primary isolation is enforced by the middleware tests above.
     */
    it.todo('non-owner role sees only own-company gate_passes via raw SQL (requires live Postgres)');
  });
});
