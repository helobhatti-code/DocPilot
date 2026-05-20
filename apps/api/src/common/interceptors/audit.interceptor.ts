import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const method = req.method as string;
    const user = req.user as AuthUser | undefined;

    if (!user || !MUTATING_METHODS.has(method)) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.prisma.auditLog
          .create({
            data: {
              userId: user.id,
              action: `${method} ${req.route?.path ?? req.url}`,
              entityType: this.entityType(req.url),
              entityId: req.params?.id,
              ipAddress: req.ip,
              details: { body: this.scrub(req.body) } as Prisma.InputJsonValue,
              // tenantId injected by PrismaService middleware
            } as unknown as Prisma.AuditLogUncheckedCreateInput,
          })
          .catch((e) => this.logger.warn(`Audit log failed: ${e.message}`));
      }),
    );
  }

  private entityType(url: string): string | undefined {
    const seg = url.split('/').filter(Boolean)[2];
    return seg;
  }

  private scrub(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const key of ['password', 'passwordHash', 'token', 'refreshToken', 'invitationToken']) {
      if (key in clone) clone[key] = '[REDACTED]';
    }
    return clone;
  }
}
