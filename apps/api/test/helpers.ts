import { UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/decorators/current-user.decorator';

export const TENANT_ID = '11111111-1111-1111-1111-111111111111';
export const USER_ID = '22222222-2222-2222-2222-222222222222';
export const PASS_ID = '33333333-3333-3333-3333-333333333333';
export const STAFF_ID = '44444444-4444-4444-4444-444444444444';

export function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: USER_ID,
    tenantId: TENANT_ID,
    email: 'admin@gpms.test',
    role: UserRole.ADMIN,
    subcontractorOrgId: null,
    canAccessAllCompanies: false,
    ...overrides,
  };
}

interface MockModel {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  groupBy: jest.Mock;
  aggregate: jest.Mock;
}

export interface MockPrisma {
  gatePass: MockModel;
  staff: MockModel;
  user: MockModel;
  tenant: MockModel;
  custodyHistory: MockModel;
  document: MockModel;
  auditLog: MockModel;
  notification: MockModel;
  notificationTemplate: MockModel;
  gatePassZone: MockModel;
  subcontractorOrg: MockModel;
  rolePermission: MockModel;
  company: MockModel;
  userCompanyAccess: MockModel;
  vehicle: MockModel;
  heavyMachinery: MockModel;
  employee: MockModel;
  companyDocument: MockModel;
  expiryNotificationLog: MockModel;
  alarmThresholdConfig: MockModel;
  onboardingTask: MockModel;
  $transaction: jest.Mock;
  runUnscoped: jest.Mock;
  $executeRawUnsafe: jest.Mock;
  $queryRaw: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $use: jest.Mock;
}

/**
 * Create a Jest mock that mirrors the small slice of the Prisma client our
 * services touch. Each model is its own object holding individual jest.fn()
 * instances so a test can stub return values per call without leakage between
 * tests (we rely on Jest's `clearMocks: true`).
 */
export function makeMockPrisma(): MockPrisma {
  const mock: MockPrisma = {
    gatePass: makeModel(),
    staff: makeModel(),
    user: makeModel(),
    tenant: makeModel(),
    custodyHistory: makeModel(),
    document: makeModel(),
    auditLog: makeModel(),
    notification: makeModel(),
    notificationTemplate: makeModel(),
    gatePassZone: makeModel(),
    subcontractorOrg: makeModel(),
    rolePermission: makeModel(),
    company: makeModel(),
    userCompanyAccess: makeModel(),
    vehicle: makeModel(),
    heavyMachinery: makeModel(),
    employee: makeModel(),
    companyDocument: makeModel(),
    expiryNotificationLog: makeModel(),
    alarmThresholdConfig: makeModel(),
    onboardingTask: makeModel(),
    /**
     * Replicate Prisma's $transaction behaviour: if called with an array, run
     * each promise to completion. If called with a callback, invoke it with
     * the prisma mock itself so service code that uses `tx.something` works.
     */
    $transaction: jest.fn(async (arg: unknown): Promise<unknown> => {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === 'function') {
        return (arg as (tx: MockPrisma) => Promise<unknown>)(mock);
      }
      throw new Error('Unsupported $transaction signature in mock');
    }),
    runUnscoped: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $use: jest.fn(),
  };
  return mock;
}

function makeModel(): MockModel {
  return {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  };
}
