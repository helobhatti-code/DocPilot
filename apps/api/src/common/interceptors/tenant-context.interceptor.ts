/**
 * TenantContextInterceptor
 *
 * Wraps EVERY request in tenantStorage.run() — creating a proper isolated
 * AsyncLocalStorage context that is inherited by ALL child async operations
 * including Prisma's internal Promise chains.
 *
 * Also resolves company context per request (see resolveCompanyContext):
 *   1. canAccessAllCompanies + no header   → bypassCompany=true,  companyId=null
 *   2. x-company-id header present         → validate access, set companyId
 *   3. Otherwise                           → first UserCompanyAccess by createdAt
 */
import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../context/tenant-context';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;

    // Public routes (e.g. /auth/login) — no user yet
    if (!user) return next.handle();

    const headerTenant = req.headers['x-tenant-id'] as string | undefined;
    const tenantId =
      user.role === 'SUPER_ADMIN' && headerTenant ? headerTenant : user.tenantId;

    const xCompanyId = req.headers['x-company-id'] as string | undefined;

    return from(this.resolveCompanyContext(user, tenantId, xCompanyId)).pipe(
      switchMap(({ companyId, bypassCompany }) =>
        new Observable((observer) => {
          tenantStorage.run(
            { tenantId, userId: user.id, role: user.role, companyId, bypassCompany },
            () => {
              next.handle().subscribe({
                next:     (v) => observer.next(v),
                error:    (e) => observer.error(e),
                complete: ()  => observer.complete(),
              });
            },
          );
        }),
      ),
    );
  }

  private async resolveCompanyContext(
    user: AuthUser,
    tenantId: string,
    xCompanyId: string | undefined,
  ): Promise<{ companyId: string | null; bypassCompany: boolean }> {
    // Case 1: full access, no specific company requested → bypass filtering
    if (user.canAccessAllCompanies && !xCompanyId) {
      return { companyId: null, bypassCompany: true };
    }

    // Case 2: specific company requested via header
    if (xCompanyId) {
      if (!user.canAccessAllCompanies) {
        // Validate the user has a UserCompanyAccess row for this company
        const access = await this.prisma.userCompanyAccess.findFirst({
          where: { userId: user.id, companyId: xCompanyId },
          select: { id: true },
        });
        if (!access) throw new ForbiddenException('No access to requested company');
      }
      // Sanity-check: company must belong to the resolved tenant
      const company = await this.prisma.company.findFirst({
        where: { id: xCompanyId, tenantId },
        select: { id: true },
      });
      if (!company) throw new ForbiddenException('Company not found in this tenant');

      return { companyId: xCompanyId, bypassCompany: false };
    }

    // Case 3: no header — derive from UserCompanyAccess
    const accesses = await this.prisma.userCompanyAccess.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { companyId: true },
    });

    if (accesses.length === 0) {
      // No company assignments — no company filter (backward-compatible for admin users)
      return { companyId: null, bypassCompany: false };
    }

    // Use the first (oldest) assignment; if multiple exist the caller should
    // pass x-company-id to select one explicitly
    return { companyId: accesses[0].companyId, bypassCompany: false };
  }
}
