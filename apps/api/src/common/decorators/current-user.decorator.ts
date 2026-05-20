import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
  subcontractorOrgId?: string | null;
  canAccessAllCompanies: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser | undefined;
  },
);
