import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GatePassStatus, NotificationType, UserRole } from '@prisma/client';
import { Queue } from 'bull';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEngine } from './notification-engine.service';

const QUEUE_NAME = 'notifications';

interface ExpiryBucket {
  type: NotificationType;
  daysAhead: number | null; // null = day-of-expiry
  status?: GatePassStatus;
  /** Override default role bucket for this scheduled run. */
  roles: UserRole[];
}

/**
 * Spec mapping (3A) — runs at 02:00 Asia/Dubai, after the 01:00 status engine.
 */
const SCHEDULED_BUCKETS: ExpiryBucket[] = [
  { type: 'EXPIRY_30', daysAhead: 30, roles: [UserRole.SECRETARY, UserRole.PM, UserRole.HR] },
  { type: 'EXPIRY_15', daysAhead: 15, roles: [UserRole.SECRETARY, UserRole.PM, UserRole.HR] },
  { type: 'EXPIRY_7',  daysAhead: 7,  roles: [UserRole.SECRETARY, UserRole.PM, UserRole.HR, UserRole.ADMIN] },
  { type: 'EXPIRY_0',  daysAhead: 0,  roles: [UserRole.SECRETARY, UserRole.PM, UserRole.HR, UserRole.ADMIN, UserRole.SUBCONTRACTOR] },
];

@Processor(QUEUE_NAME)
@Injectable()
export class NotificationCronProcessor implements OnModuleInit {
  private readonly logger = new Logger(NotificationCronProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAME) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly engine: NotificationEngine,
  ) {}

  async onModuleInit() {
    // Best-effort cron registration. If Redis is down at boot, log and let the
    // app start; in-app notifications still write to the DB synchronously, only
    // the scheduled batches and email delivery are degraded.
    try {
      // 02:00 Asia/Dubai (UTC+4) — runs after the status engine at 01:00.
      await this.queue.add('expiry-notifications', {}, {
        repeat: { cron: '0 2 * * *', tz: 'Asia/Dubai' },
        jobId: 'expiry-notifications',
        removeOnComplete: 50,
        removeOnFail: 50,
      });
      // 04:00 — overdue cancellation reminder, separate from the 03:00 overdue-sweep.
      await this.queue.add('overdue-cancellation', {}, {
        repeat: { cron: '0 4 * * *', tz: 'Asia/Dubai' },
        jobId: 'overdue-cancellation',
        removeOnComplete: 50,
        removeOnFail: 50,
      });
      this.logger.log('Notification cron jobs registered');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `Could not register notification cron (Redis unavailable?) — scheduled notifications disabled: ${msg}`,
      );
    }
  }

  /**
   * Daily expiry-notification batch. For each tenant + bucket, find passes
   * whose expiry is exactly N days in the future and dispatch via the engine,
   * which handles dedup, template rendering, and email enqueue.
   */
  @Process('expiry-notifications')
  async expiryNotifications(): Promise<{ totalDispatched: number; durationMs: number }> {
    const startedAt = Date.now();
    let totalDispatched = 0;

    return this.prisma.runUnscoped(async (tx) => {
      const today = startOfDay(new Date());
      const tenants = await tx.tenant.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const t of tenants) {
        for (const bucket of SCHEDULED_BUCKETS) {
          const targetDate = bucket.daysAhead === null ? today : addDays(today, bucket.daysAhead);
          const passes = await tx.gatePass.findMany({
            where: {
              tenantId: t.id,
              expiryDate: targetDate,
              status: {
                notIn: [
                  GatePassStatus.CANCELLED,
                  GatePassStatus.RENEWED,
                  GatePassStatus.SUSPENDED,
                  // For day-of, EXPIRED is the expected status; for ahead-of, exclude already-expired.
                  ...(bucket.daysAhead && bucket.daysAhead > 0 ? [GatePassStatus.EXPIRED] : []),
                ],
              },
            },
            select: {
              id: true,
              passNumber: true,
              expiryDate: true,
              issueDate: true,
              staff: { select: { name: true } },
            },
          });

          for (const p of passes) {
            const result = await this.engine.dispatch({
              tenantId: t.id,
              type: bucket.type,
              entityId: p.id,
              entityType: 'GatePass',
              roleOverride: bucket.roles,
              variables: {
                passNumber: p.passNumber,
                staffName: p.staff?.name ?? '—',
                expiryDate: p.expiryDate.toISOString().slice(0, 10),
                issueDate: p.issueDate.toISOString().slice(0, 10),
                daysRemaining: bucket.daysAhead ?? 0,
                actionUrl: `/passes/${p.id}`,
              },
            });
            totalDispatched += result.sent;
          }
        }
      }

      const durationMs = Date.now() - startedAt;
      this.logger.log(`Expiry notifications dispatched: ${totalDispatched} in ${durationMs}ms`);
      return { totalDispatched, durationMs };
    });
  }

  /**
   * Daily 7-day-after-expiry overdue-cancellation reminder to Admin/PM.
   */
  @Process('overdue-cancellation')
  async overdueCancellation() {
    return this.prisma.runUnscoped(async (tx) => {
      const sevenDaysAgo = addDays(startOfDay(new Date()), -7);
      const tenants = await tx.tenant.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      let totalDispatched = 0;
      for (const t of tenants) {
        const passes = await tx.gatePass.findMany({
          where: {
            tenantId: t.id,
            status: GatePassStatus.EXPIRED,
            expiryDate: { lte: sevenDaysAgo },
            cancellationRequestedAt: null,
          },
          select: { id: true, passNumber: true, expiryDate: true, staff: { select: { name: true } } },
        });
        for (const p of passes) {
          const result = await this.engine.dispatch({
            tenantId: t.id,
            type: NotificationType.OVERDUE_CANCELLATION,
            entityId: p.id,
            entityType: 'GatePass',
            roleOverride: [UserRole.ADMIN, UserRole.PM],
            variables: {
              passNumber: p.passNumber,
              staffName: p.staff?.name ?? '—',
              expiryDate: p.expiryDate.toISOString().slice(0, 10),
              actionUrl: `/passes/${p.id}`,
            },
          });
          totalDispatched += result.sent;
        }
      }
      this.logger.log(`Overdue cancellation reminders: ${totalDispatched}`);
    });
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
