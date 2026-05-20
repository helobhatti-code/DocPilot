import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PermissionRequirement } from '../decorators/permissions.decorator';
import { AuthUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Authentication required');
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;

    const row = await this.prisma.rolePermission.findUnique({
      where: {
        tenantId_role_module_feature: {
          tenantId: user.tenantId,
          role: user.role,
          module: requirement.module,
          feature: requirement.feature,
        },
      },
      select: { isEnabled: true },
    });

    if (!row?.isEnabled) {
      throw new ForbiddenException(
        `Missing permission: ${requirement.module}.${requirement.feature}`,
      );
    }
    return true;
  }
}
