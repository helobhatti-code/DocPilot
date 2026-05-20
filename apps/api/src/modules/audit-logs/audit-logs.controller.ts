import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Prisma, UserRole } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { PrismaService } from '@/common/prisma/prisma.service';

class ListAuditQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number = 50;
}

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Search audit log entries' })
  async list(@Query() q: ListAuditQueryDto) {
    const where = this.buildWhere(q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit log entries to Excel' })
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="audit-log.xlsx"')
  async export(
    @Query() q: ListAuditQueryDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) _res: Response,
  ) {
    const where = this.buildWhere(q);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      include: { user: { select: { name: true, email: true, role: true } } },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DocPilot';
    wb.created = new Date();
    const ws = wb.addWorksheet('Audit Log');
    ws.columns = [
      { header: 'Timestamp (UTC)', key: 'createdAt', width: 22 },
      { header: 'User', key: 'user', width: 28 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 14 },
      { header: 'Action', key: 'action', width: 38 },
      { header: 'Entity', key: 'entityType', width: 18 },
      { header: 'Entity ID', key: 'entityId', width: 38 },
      { header: 'IP', key: 'ip', width: 16 },
      { header: 'Details', key: 'details', width: 60 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      ws.addRow({
        createdAt: r.createdAt.toISOString(),
        user: r.user?.name ?? '—',
        email: r.user?.email ?? '—',
        role: r.user?.role ?? '—',
        action: r.action,
        entityType: r.entityType ?? '',
        entityId: r.entityId ?? '',
        ip: r.ipAddress ?? '',
        details: r.details ? JSON.stringify(r.details) : '',
      });
    }

    // Audit the export itself
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'AUDIT_LOG_EXPORTED',
        entityType: 'AuditLog',
        details: { count: rows.length, filters: q } as unknown as Prisma.InputJsonValue,
      } as unknown as Prisma.AuditLogUncheckedCreateInput,
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new StreamableFile(Buffer.from(buffer as ArrayBuffer));
  }

  private buildWhere(q: ListAuditQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (q.action) where.action = { contains: q.action, mode: 'insensitive' };
    if (q.entityType) where.entityType = q.entityType;
    if (q.userId) where.userId = q.userId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    if (q.q) {
      const term = q.q.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { entityType: { contains: term, mode: 'insensitive' } },
        { entityId: { contains: term, mode: 'insensitive' } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }
    return where;
  }
}
