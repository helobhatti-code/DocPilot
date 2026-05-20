import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { tenantStorage } from '../context/tenant-context';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Establishes per-request tenant context (AsyncLocalStorage) so the Prisma
 * middleware can auto-inject tenant_id on every query.
 *
 * Must run after JwtAuthGuard. SUPER_ADMIN may operate cross-tenant by passing
 * `x-tenant-id` header — bypassing storage scoping but never RLS without an
 * explicit `runUnscoped` call.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Tenant context unavailable');

    const headerTenant = req.headers['x-tenant-id'] as string | undefined;
    const tenantId =
      user.role === 'SUPER_ADMIN' && headerTenant ? headerTenant : user.tenantId;

    // Company context defaults — the authoritative company resolution happens in
    // TenantContextInterceptor (which uses tenantStorage.run() for reliable ALS
    // propagation into Prisma middleware). Guard-level defaults avoid undefined
    // reads if anything accesses the store during guard execution.
    tenantStorage.enterWith({
      tenantId,
      userId: user.id,
      role: user.role,
      companyId: null,
      bypassCompany: user.canAccessAllCompanies === true,
    });
    return true;
  }
}
