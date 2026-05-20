import { promises as fs } from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatePassStatus, NotificationType, Prisma } from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppConfig } from '@/config/configuration';
import { NotificationEngine } from '@/modules/notifications/notification-engine.service';
import { readRetentionDays } from './cancellation.service';

/**
 * Data Retention Engine.
 *
 * Lifecycle of a pass once CANCELLED:
 *   - cancellation.complete() sets `dataDeletionScheduledAt` based on the
 *     tenant retention setting (or null if "permanent").
 *   - 7 days before that date this service emits DATA_DELETION_WARNING
 *     notifications to Admins so they can extend or delete immediately.
 *   - Once `dataDeletionScheduledAt <= today` a purge wipes:
 *       * staff PII for passes belonging to staff with no remaining active passes
 *       * photo / scan / receipt URLs on the pass row itself
 *       * associated Document rows + the underlying files on disk
 *     and writes an audit record retaining only pass_number, company,
 *     surrender_date, deletion_date.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly uploadDir: string;
  private readonly publicBaseUrl: string;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationEngine,
  ) {
    this.uploadDir = path.resolve(config.get('uploadDir', { infer: true }));
    this.publicBaseUrl = config.get('publicBaseUrl', { infer: true });
  }

  // -------------------------------------------------------------------------
  // Daily purge (called from cron at 03:00 Asia/Dubai).
  // -------------------------------------------------------------------------

  async runDailyPurge(): Promise<{ purged: number; warned: number; durationMs: number }> {
    const startedAt = Date.now();
    return this.prisma.runUnscoped(async (_tx) => {
      const now = new Date();
      const purged = await this.purgeDue(now);
      const warned = await this.dispatchPredeletionWarnings(now);
      const durationMs = Date.now() - startedAt;
      this.logger.log(`Retention sweep: purged=${purged} warned=${warned} (${durationMs}ms)`);
      return { purged, warned, durationMs };
    });
  }

  /**
   * Purge passes whose dataDeletionScheduledAt <= today. Each purge runs in
   * its own transaction so a single failure doesn't poison the whole batch.
   */
  private async purgeDue(now: Date): Promise<number> {
    const due = await this.prisma.gatePass.findMany({
      where: {
        status: GatePassStatus.CANCELLED,
        dataDeletionScheduledAt: { not: null, lte: now },
      },
      select: {
        id: true,
        tenantId: true,
        passNumber: true,
        organization: true,
        staffId: true,
        authorityHandoverDate: true,
      },
      take: 500,
    });

    let purgedCount = 0;
    for (const p of due) {
      try {
        await this.purgeOne(p.tenantId, p.id, now, /*actorId*/ null);
        purgedCount += 1;
      } catch (e) {
        this.logger.error(
          `Retention purge failed for pass ${p.passNumber} (${p.id}): ${(e as Error).message}`,
        );
      }
    }
    return purgedCount;
  }

  /**
   * 7-day pre-deletion warning. Dispatched per pass with dedupe; recipients
   * are tenant Admins so they can extend or purge immediately.
   */
  private async dispatchPredeletionWarnings(now: Date): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() + 7);

    const upcoming = await this.prisma.gatePass.findMany({
      where: {
        status: GatePassStatus.CANCELLED,
        dataDeletionScheduledAt: { not: null, lte: cutoff, gt: now },
      },
      select: {
        id: true,
        tenantId: true,
        passNumber: true,
        dataDeletionScheduledAt: true,
        staff: { select: { name: true } },
      },
    });

    let dispatched = 0;
    for (const p of upcoming) {
      const result = await this.notifications.dispatch({
        tenantId: p.tenantId,
        type: NotificationType.DATA_DELETION_WARNING,
        entityId: p.id,
        entityType: 'GatePass',
        variables: {
          passNumber: p.passNumber,
          staffName: p.staff?.name ?? '—',
          deletionDate: p.dataDeletionScheduledAt!.toISOString().slice(0, 10),
          actionUrl: `/passes/${p.id}`,
        },
      });
      dispatched += result.sent;
    }
    return dispatched;
  }

  // -------------------------------------------------------------------------
  // Admin operations on a single pass.
  // -------------------------------------------------------------------------

  /** Extend retention by N days; rejects if pass isn't CANCELLED. */
  async extend(actor: AuthUser, passId: string, days: number) {
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new BadRequestException('days must be an integer between 1 and 3650');
    }
    const pass = await this.prisma.gatePass.findUnique({
      where: { id: passId },
      select: { id: true, status: true, passNumber: true, dataDeletionScheduledAt: true },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== GatePassStatus.CANCELLED) {
      throw new BadRequestException('Retention can only be extended for CANCELLED passes');
    }
    const base = pass.dataDeletionScheduledAt ?? new Date();
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + days);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.gatePass.update({
        where: { id: passId },
        data: { dataDeletionScheduledAt: next },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'RETENTION_EXTENDED',
          entityType: 'GatePass',
          entityId: passId,
          details: {
            passNumber: pass.passNumber,
            previousDate: pass.dataDeletionScheduledAt?.toISOString() ?? null,
            newDate: next.toISOString(),
            extensionDays: days,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return u;
    });

    return updated;
  }

  /** Mark as permanent (no scheduled deletion). */
  async makePermanent(actor: AuthUser, passId: string) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id: passId },
      select: { id: true, status: true, passNumber: true, dataDeletionScheduledAt: true },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== GatePassStatus.CANCELLED) {
      throw new BadRequestException('Only CANCELLED passes can be marked permanent');
    }
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.gatePass.update({
        where: { id: passId },
        data: { dataDeletionScheduledAt: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          action: 'RETENTION_MADE_PERMANENT',
          entityType: 'GatePass',
          entityId: passId,
          details: {
            passNumber: pass.passNumber,
            previousDate: pass.dataDeletionScheduledAt?.toISOString() ?? null,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
      return u;
    });
  }

  /**
   * Manual immediate purge. Use case: admin chooses "Delete now" from the
   * pass detail page after data subject access request or end-of-contract.
   */
  async purgeNow(actor: AuthUser, passId: string) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id: passId },
      select: { id: true, tenantId: true, status: true, passNumber: true },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== GatePassStatus.CANCELLED) {
      throw new BadRequestException('Only CANCELLED passes can be purged');
    }
    await this.purgeOne(pass.tenantId, pass.id, new Date(), actor.id);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Settings preview (admin UI).
  // -------------------------------------------------------------------------

  /**
   * For the Settings UI: how many records would be affected if the tenant
   * adopted a new retention period of `days` (or "permanent")?
   *   - alreadyDue: passes whose data_deletion_scheduled_at <= today
   *   - dueWithinNewWindow: passes that would become due within `days` days
   *   - cancelledTotal: total CANCELLED passes in the tenant
   */
  async previewRetentionChange(tenantId: string, days: number | 'permanent') {
    const now = new Date();
    const [cancelledTotal, alreadyDue] = await Promise.all([
      this.prisma.gatePass.count({
        where: { tenantId, status: GatePassStatus.CANCELLED },
      }),
      this.prisma.gatePass.count({
        where: {
          tenantId,
          status: GatePassStatus.CANCELLED,
          dataDeletionScheduledAt: { not: null, lte: now },
        },
      }),
    ]);

    if (days === 'permanent') {
      return {
        cancelledTotal,
        alreadyDue,
        dueWithinNewWindow: 0,
        note: 'No automatic deletion will occur; existing scheduled deletions remain unless cleared.',
      };
    }

    const ceiling = new Date(now);
    ceiling.setUTCDate(ceiling.getUTCDate() + days);

    // For passes with no scheduled deletion yet (e.g. CANCELLED before this
    // setting existed), retention would be: cancellationCompletedAt + days.
    const dueWithinNewWindow = await this.prisma.gatePass.count({
      where: {
        tenantId,
        status: GatePassStatus.CANCELLED,
        OR: [
          {
            dataDeletionScheduledAt: { not: null, lte: ceiling },
          },
          {
            dataDeletionScheduledAt: null,
            cancellationCompletedAt: { lte: addDays(now, -1 * (days - 1)) },
          },
        ],
      },
    });

    return { cancelledTotal, alreadyDue, dueWithinNewWindow };
  }

  // -------------------------------------------------------------------------
  // Internal: purge a single pass + side effects.
  // -------------------------------------------------------------------------

  private async purgeOne(
    tenantId: string,
    passId: string,
    now: Date,
    actorId: string | null,
  ): Promise<void> {
    // Fetch full snapshot before deletion so the audit log retains the minimal
    // identifiers required by the spec.
    const pass = await this.prisma.gatePass.findUnique({
      where: { id: passId },
      include: {
        documents: true,
        staff: { select: { id: true, companyName: true, name: true } },
      },
    });
    if (!pass) return;

    const filesToDelete = pass.documents
      .map((d) => this.localPathFromUrl(d.fileUrl))
      .filter((p): p is string => Boolean(p));

    // Remove disk artefacts first; if any fail we still want the DB cleanup
    // to proceed because PII removal is the primary objective.
    for (const p of filesToDelete) {
      try {
        await fs.unlink(p);
      } catch (e) {
        this.logger.warn(`Could not unlink ${p}: ${(e as Error).message}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Wipe documents
      await tx.document.deleteMany({ where: { gatePassId: passId } });

      // Strip PII / file URLs from the pass row but keep the row itself for audit.
      await tx.gatePass.update({
        where: { id: passId },
        data: {
          passScanFrontUrl: null,
          passScanBackUrl: null,
          receiptScanUrl: null,
          handoverUnsignedUrl: null,
          handoverSignedUrl: null,
          dataDeletionScheduledAt: null,
        },
      });

      // If the staff member has no other passes, scrub their personal data
      // (photo + nationality + designation). Name is kept so the pass remains
      // identifiable in audit logs.
      if (pass.staffId) {
        const remaining = await tx.gatePass.count({
          where: {
            staffId: pass.staffId,
            id: { not: passId },
            status: { notIn: [GatePassStatus.CANCELLED, GatePassStatus.RENEWED] },
          },
        });
        if (remaining === 0) {
          await tx.staff.update({
            where: { id: pass.staffId },
            data: {
              photoUrl: null,
              nationality: null,
              designation: null,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorId,
          action: actorId ? 'RETENTION_PURGE_MANUAL' : 'RETENTION_PURGE_AUTO',
          entityType: 'GatePass',
          entityId: passId,
          details: {
            passNumber: pass.passNumber,
            company: pass.organization ?? pass.staff?.companyName ?? null,
            surrenderDate: pass.authorityHandoverDate?.toISOString().slice(0, 10) ?? null,
            deletionDate: now.toISOString().slice(0, 10),
            documentsDeleted: filesToDelete.length,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
    });
  }

  /**
   * Map a stored fileUrl back to a local on-disk path. Only files that live
   * under our configured publicBaseUrl/uploads/ prefix are eligible — any
   * external URL is left untouched.
   */
  private localPathFromUrl(fileUrl: string): string | null {
    const prefix = `${this.publicBaseUrl}/uploads/`;
    if (!fileUrl.startsWith(prefix)) return null;
    const relative = fileUrl.slice(prefix.length);
    return path.join(this.uploadDir, relative);
  }

  // ---- helpers exposed for the settings controller ----

  static readonly RETENTION_OPTIONS = [7, 14, 30, 60, 90, 180, 365] as const;

  static parseRetentionSetting(settings: Prisma.JsonValue | null | undefined) {
    return readRetentionDays(settings);
  }
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
