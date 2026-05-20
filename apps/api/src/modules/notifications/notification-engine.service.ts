import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { Queue } from 'bull';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppConfig } from '@/config/configuration';
import { DEFAULT_TEMPLATES } from './default-templates';

/**
 * Standard recipient role buckets for each notification type. Resolved per
 * tenant against the active users table.
 */
const RECIPIENT_ROLES: Record<NotificationType, UserRole[]> = {
  EXPIRY_30: [UserRole.SECRETARY, UserRole.PM, UserRole.HR],
  EXPIRY_15: [UserRole.SECRETARY, UserRole.PM, UserRole.HR],
  EXPIRY_7:  [UserRole.SECRETARY, UserRole.PM, UserRole.HR, UserRole.ADMIN],
  EXPIRY_0:  [UserRole.SECRETARY, UserRole.PM, UserRole.HR, UserRole.ADMIN, UserRole.SUBCONTRACTOR],
  OVERDUE_CANCELLATION: [UserRole.ADMIN, UserRole.PM],
  OVERDUE_HANDOVER:     [UserRole.ADMIN, UserRole.PM],
  STAFF_OFFBOARDING:    [UserRole.SECRETARY, UserRole.PM],
  CUSTODY_CHANGE:       [UserRole.SECRETARY],
  RENEWAL_APPROVED:     [UserRole.SECRETARY, UserRole.PM],
  RENEWAL_REJECTED:     [UserRole.SECRETARY, UserRole.PM],
  CANCELLATION_CONFIRMED: [UserRole.ADMIN, UserRole.PM, UserRole.SECRETARY, UserRole.HR],
  PERMISSION_CHANGE:    [], // direct-targeted; no role bucket
  DATA_DELETION_WARNING: [UserRole.ADMIN],
  INVITATION:           [], // direct-targeted to the invitee only
  DOCUMENT_EXPIRY_ALERT: [UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY],
};

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface DispatchOptions {
  tenantId: string;
  type: NotificationType;
  /** Specific user ids to dispatch to in addition to (or instead of) role buckets. */
  userIds?: string[];
  /** Limit recipients to this set of roles (overrides default bucket). */
  roleOverride?: UserRole[];
  /** Pass id for entity links and dedup keying. */
  entityId?: string;
  entityType?: string;
  /** Variables used to render the template. */
  variables: Record<string, string | number | null | undefined>;
  /**
   * If true (default) skips users who already received the same type for the
   * same entity within the last 24h.
   */
  dedupe?: boolean;
}

export interface RenderedNotification {
  subject: string;
  body: string;
}

@Injectable()
export class NotificationEngine {
  private readonly logger = new Logger(NotificationEngine.name);
  private readonly emailEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {
    const smtpHost = this.config.get('smtp', { infer: true }).host;
    this.emailEnabled = !!smtpHost && smtpHost !== 'localhost';
  }

  /**
   * Resolve recipients, dedupe, render templates, persist notifications, and
   * push email jobs into the queue.
   */
  async dispatch(opts: DispatchOptions): Promise<{ sent: number; deduped: number }> {
    const { tenantId, type, entityId, entityType, variables } = opts;
    const dedupe = opts.dedupe ?? true;

    const recipients = await this.resolveRecipients(tenantId, type, opts.userIds, opts.roleOverride);
    if (recipients.length === 0) {
      this.logger.debug(`No recipients for ${type} in tenant ${tenantId}`);
      return { sent: 0, deduped: 0 };
    }

    const recipientIds = dedupe
      ? await this.filterDeduped(tenantId, type, entityId, recipients.map((r) => r.id))
      : recipients.map((r) => r.id);

    const deduped = recipients.length - recipientIds.length;
    if (recipientIds.length === 0) return { sent: 0, deduped };

    const template = await this.loadTemplate(tenantId, type);
    const rendered = renderTemplate(template, variables);

    const targets = recipients.filter((r) => recipientIds.includes(r.id));

    await this.prisma.notification.createMany({
      data: targets.map((r) => ({
        tenantId,
        userId: r.id,
        type,
        title: rendered.subject,
        message: rendered.body,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
      })),
    });

    if (this.emailEnabled) {
      for (const r of targets) {
        if (!r.email) continue;
        // Email enqueue is best-effort: the in-app notification was already
        // persisted above. If Redis is unavailable we log and move on rather
        // than failing the caller (request handler or cron job).
        try {
          await this.emailQueue.add(
            'send',
            {
              to: r.email,
              subject: rendered.subject,
              body: rendered.body,
              tenantId,
              userId: r.id,
              type,
              entityId,
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 30_000 },
              removeOnComplete: 100,
              removeOnFail: 100,
            },
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(
            `Email enqueue failed for ${r.email} (${type}) — in-app notification still delivered: ${msg}`,
          );
        }
      }
    }

    return { sent: targets.length, deduped };
  }

  /**
   * Render a template without dispatching — used by the template-editor preview.
   */
  async preview(tenantId: string, type: NotificationType, variables: Record<string, unknown>) {
    const template = await this.loadTemplate(tenantId, type);
    return renderTemplate(template, variables as Record<string, string | number>);
  }

  // -------- internal helpers --------

  private async resolveRecipients(
    tenantId: string,
    type: NotificationType,
    explicitIds: string[] | undefined,
    roleOverride: UserRole[] | undefined,
  ): Promise<Array<{ id: string; email: string | null; role: UserRole }>> {
    const set = new Map<string, { id: string; email: string | null; role: UserRole }>();

    if (explicitIds && explicitIds.length > 0) {
      const direct = await this.prisma.user.findMany({
        where: { tenantId, id: { in: explicitIds }, isActive: true },
        select: { id: true, email: true, role: true },
      });
      for (const u of direct) set.set(u.id, u);
    }

    const roles = roleOverride ?? RECIPIENT_ROLES[type] ?? [];
    if (roles.length > 0) {
      const byRole = await this.prisma.user.findMany({
        where: { tenantId, isActive: true, role: { in: roles } },
        select: { id: true, email: true, role: true },
      });
      for (const u of byRole) if (!set.has(u.id)) set.set(u.id, u);
    }

    return Array.from(set.values());
  }

  private async filterDeduped(
    tenantId: string,
    type: NotificationType,
    entityId: string | undefined,
    userIds: string[],
  ): Promise<string[]> {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const recent = await this.prisma.notification.findMany({
      where: {
        tenantId,
        type,
        entityId: entityId ?? null,
        userId: { in: userIds },
        createdAt: { gte: since },
      },
      select: { userId: true },
    });
    const seen = new Set(recent.map((r) => r.userId));
    return userIds.filter((id) => !seen.has(id));
  }

  private async loadTemplate(tenantId: string, type: NotificationType) {
    const row = await this.prisma.notificationTemplate.findUnique({
      where: { tenantId_type: { tenantId, type } },
      select: { subjectTemplate: true, bodyTemplate: true },
    });
    if (row) return row;
    const fallback = DEFAULT_TEMPLATES.find((t) => t.type === type);
    if (fallback) return { subjectTemplate: fallback.subjectTemplate, bodyTemplate: fallback.bodyTemplate };
    return {
      subjectTemplate: 'DocPilot notification',
      bodyTemplate: 'You have a new DocPilot notification.',
    };
  }
}

// ---------- pure helpers ----------

/**
 * Replace {{var}} placeholders. Missing keys render as empty string. Supports
 * both subject + body in one call.
 */
export function renderTemplate(
  template: { subjectTemplate: string; bodyTemplate: string },
  variables: Record<string, unknown>,
): RenderedNotification {
  return {
    subject: substitute(template.subjectTemplate, variables),
    body: substitute(template.bodyTemplate, variables),
  };
}

function substitute(s: string, vars: Record<string, unknown>): string {
  return s.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** All variable names a template author can use. Surfaced in the editor. */
export const TEMPLATE_VARIABLES = [
  'staffName',
  'passNumber',
  'expiryDate',
  'issueDate',
  'daysRemaining',
  'fromStatus',
  'toStatus',
  'actor',
  'reason',
  'lastWorkingDay',
  'deletionDate',
  'token',
  'expiresAt',
  'actionUrl',
] as const;

// Re-export for convenience.
export const NOTIF_RECIPIENT_ROLES = RECIPIENT_ROLES;

/** Convenience accessor used by Prisma JSON casts. */
export type NotificationVariables = Record<string, string | number | null | undefined>;

// Prisma name re-export — saves callers from importing the namespace just for InputJsonValue.
export type NotificationDetailsJson = Prisma.InputJsonValue;
