import { BullModule } from '@nestjs/bull';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { NotificationType, Prisma, UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { PrismaService } from '@/common/prisma/prisma.service';
import { DEFAULT_TEMPLATES } from './default-templates';
import { EmailProcessor } from './email.processor';
import {
  NotificationEngine,
  TEMPLATE_VARIABLES,
} from './notification-engine.service';
import { NotificationCronProcessor } from './notification-cron.processor';

// ----------------------- DTOs -----------------------

class ListNotificationsQuery {
  @ApiPropertyOptional({ enum: NotificationType }) @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) unreadOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ default: 25 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 25;
}

class BulkMarkReadDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true })
  ids!: string[];
}

class UpdateTemplateDto {
  @ApiProperty() @IsString() @MinLength(3) subjectTemplate!: string;
  @ApiProperty() @IsString() @MinLength(3) bodyTemplate!: string;
}

class PreviewTemplateDto {
  @ApiPropertyOptional({ description: 'Variables to render. Falls back to demo data if omitted.' })
  @IsOptional() @IsObject() variables?: Record<string, string | number>;
  @ApiPropertyOptional() @IsOptional() @IsString() subjectTemplate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyTemplate?: string;
}

// ----------------------- Service -----------------------

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, q: ListNotificationsQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const where: Prisma.NotificationWhereInput = { userId };
    if (q.type) where.type = q.type;
    if (q.unreadOnly) where.isRead = false;
    if (q.entityId) where.entityId = q.entityId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { items, total, page, pageSize, unreadCount };
  }

  /** Recent items for the bell dropdown — capped at 10. */
  async recent(userId: string) {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { items, unreadCount };
  }

  async markRead(id: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Notification not found');
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true, marked: result.count };
  }

  async bulkMarkRead(userId: string, ids: string[]) {
    const result = await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true, marked: result.count };
  }
}

// ----------------------- Templates Service -----------------------

@Injectable()
export class NotificationTemplatesService {
  constructor(private readonly prisma: PrismaService, private readonly engine: NotificationEngine) {}

  async list(tenantId: string) {
    const rows = await this.prisma.notificationTemplate.findMany({
      where: { tenantId },
      orderBy: { type: 'asc' },
    });
    const byType = new Map(rows.map((r) => [r.type, r]));
    // Merge with defaults so the editor always shows every type, even the
    // ones the tenant hasn't customised yet.
    return DEFAULT_TEMPLATES.map((d) => {
      const row = byType.get(d.type);
      return {
        type: d.type,
        subjectTemplate: row?.subjectTemplate ?? d.subjectTemplate,
        bodyTemplate: row?.bodyTemplate ?? d.bodyTemplate,
        isCustomized: row?.isCustomized ?? false,
        defaultSubject: d.subjectTemplate,
        defaultBody: d.bodyTemplate,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async update(tenantId: string, type: NotificationType, dto: UpdateTemplateDto) {
    const def = DEFAULT_TEMPLATES.find((d) => d.type === type);
    if (!def) throw new BadRequestException(`Unknown notification type ${type}`);

    return this.prisma.notificationTemplate.upsert({
      where: { tenantId_type: { tenantId, type } },
      create: {
        tenantId,
        type,
        subjectTemplate: dto.subjectTemplate,
        bodyTemplate: dto.bodyTemplate,
        isCustomized: true,
      } as unknown as Prisma.NotificationTemplateUncheckedCreateInput,
      update: {
        subjectTemplate: dto.subjectTemplate,
        bodyTemplate: dto.bodyTemplate,
        isCustomized: true,
      },
    });
  }

  async resetToDefault(tenantId: string, type: NotificationType) {
    const def = DEFAULT_TEMPLATES.find((d) => d.type === type);
    if (!def) throw new BadRequestException(`Unknown notification type ${type}`);

    await this.prisma.notificationTemplate.deleteMany({ where: { tenantId, type } });
    return {
      type,
      subjectTemplate: def.subjectTemplate,
      bodyTemplate: def.bodyTemplate,
      isCustomized: false,
    };
  }

  async preview(tenantId: string, type: NotificationType, dto: PreviewTemplateDto) {
    const variables = dto.variables ?? DEMO_VARIABLES;

    if (dto.subjectTemplate || dto.bodyTemplate) {
      // Render the unsaved drafts so the editor can preview without persisting.
      const def = DEFAULT_TEMPLATES.find((d) => d.type === type);
      const subjectTemplate = dto.subjectTemplate ?? def?.subjectTemplate ?? '';
      const bodyTemplate = dto.bodyTemplate ?? def?.bodyTemplate ?? '';
      return renderInline({ subjectTemplate, bodyTemplate }, variables);
    }
    return this.engine.preview(tenantId, type, variables);
  }
}

const DEMO_VARIABLES: Record<string, string | number> = {
  staffName: 'Aisha Khan',
  passNumber: '123456',
  expiryDate: '2026-05-30',
  issueDate: '2025-11-30',
  daysRemaining: 30,
  fromStatus: 'WITH_COMPANY',
  toStatus: 'WITH_PERSON',
  actor: 'Maria Hernandez',
  reason: 'Document mismatch',
  lastWorkingDay: '2026-04-30',
  deletionDate: '2026-05-30',
  token: '00000000-0000-0000-0000-000000000000',
  expiresAt: '2026-05-03',
  actionUrl: 'https://docpilot.example.com/passes/sample',
};

function renderInline(
  t: { subjectTemplate: string; bodyTemplate: string },
  vars: Record<string, unknown>,
) {
  const sub = (s: string) =>
    s.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k: string) => {
      const v = vars[k];
      return v === undefined || v === null ? '' : String(v);
    });
  return { subject: sub(t.subjectTemplate), body: sub(t.bodyTemplate) };
}

// ----------------------- Controllers -----------------------

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(TenantGuard)
class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() list(@CurrentUser() user: AuthUser, @Query() q: ListNotificationsQuery) {
    return this.svc.list(user.id, q);
  }

  @Get('recent') recent(@CurrentUser() user: AuthUser) {
    return this.svc.recent(user.id);
  }

  @Patch('read-all') markAllRead(@CurrentUser() user: AuthUser) {
    return this.svc.markAllRead(user.id);
  }

  @Post('read-bulk')
  bulkMarkRead(@CurrentUser() user: AuthUser, @Body() dto: BulkMarkReadDto) {
    return this.svc.bulkMarkRead(user.id, dto.ids);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markRead(id, user.id);
  }
}

@ApiTags('notification-templates')
@ApiBearerAuth()
@Controller('notification-templates')
@UseGuards(TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
class NotificationTemplatesController {
  constructor(private readonly svc: NotificationTemplatesService) {}

  @Get() list(@CurrentUser() user: AuthUser) {
    if (!user.tenantId) throw new ForbiddenException();
    return this.svc.list(user.tenantId);
  }

  @Get('variables') variables() {
    return { variables: TEMPLATE_VARIABLES };
  }

  @Patch(':type')
  update(
    @CurrentUser() user: AuthUser,
    @Param('type') type: NotificationType,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.svc.update(user.tenantId, type, dto);
  }

  @Post(':type/reset')
  reset(@CurrentUser() user: AuthUser, @Param('type') type: NotificationType) {
    return this.svc.resetToDefault(user.tenantId, type);
  }

  @Post(':type/preview')
  preview(
    @CurrentUser() user: AuthUser,
    @Param('type') type: NotificationType,
    @Body() dto: PreviewTemplateDto,
  ) {
    return this.svc.preview(user.tenantId, type, dto);
  }
}

// ----------------------- Module -----------------------

@Module({
  imports: [
    BullModule.registerQueue({ name: 'email' }, { name: 'notifications' }),
  ],
  controllers: [NotificationsController, NotificationTemplatesController],
  providers: [
    NotificationsService,
    NotificationTemplatesService,
    NotificationEngine,
    EmailProcessor,
    NotificationCronProcessor,
  ],
  exports: [NotificationsService, NotificationEngine],
})
export class NotificationsModule {}
