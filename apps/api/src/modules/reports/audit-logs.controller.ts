import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { PrismaService } from '@/common/prisma/prisma.service';

class ListAuditQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number = 50;
}

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VIEWER)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() q: ListAuditQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.AuditLogWhereInput = {};
    if (q.action) where.action = { contains: q.action, mode: 'insensitive' };
    if (q.entityType) where.entityType = { contains: q.entityType, mode: 'insensitive' };
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    if (q.q) {
      where.OR = [
        { action: { contains: q.q, mode: 'insensitive' } },
        { entityType: { contains: q.q, mode: 'insensitive' } },
        { entityId: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        action: r.action,
        resource: r.entityType ?? '',
        resourceId: r.entityId,
        actor: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email } : null,
        metadata: r.details,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  @Get('recent')
  async recent() {
    const items = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return items.map((r) => ({
      id: r.id,
      action: r.action,
      resource: r.entityType ?? '',
      resourceId: r.entityId,
      actor: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email } : null,
      createdAt: r.createdAt,
    }));
  }
}
