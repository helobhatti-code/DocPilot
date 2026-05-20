import { AsyncLocalStorage } from 'async_hooks';
import { UserRole } from '@prisma/client';

export interface RequestContext {
  tenantId: string | null;
  userId: string | null;
  role: UserRole | null;
  bypassRls?: boolean;
  /** Null means no company filter is active (canAccessAllCompanies + no header, or unassigned). */
  companyId: string | null;
  /** When true, Prisma middleware skips company_id injection/filtering entirely. */
  bypassCompany: boolean;
}

export const tenantStorage = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return tenantStorage.getStore();
}

export function currentTenantId(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}
