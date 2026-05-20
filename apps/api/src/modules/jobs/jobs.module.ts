import { BullModule, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Process, Processor } from '@nestjs/bull';
import { Queue } from 'bull';
import IORedis, { Redis, RedisOptions } from 'ioredis';
import {
  CustodyStatus,
  GatePassStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { AppConfig } from '@/config/configuration';
import { PrismaService } from '@/common/prisma/prisma.service';
import { GatePassesModule } from '@/modules/gate-passes/gate-passes.module';
import { RetentionService } from '@/modules/gate-passes/retention.service';
import { ExpiryModule } from '@/modules/expiry/expiry.module';
import { ExpiryService } from '@/modules/expiry/expiry.service';

const QUEUE_NAME = 'gpms-scheduler';

/**
 * Status transition rules driven by expiry distance. Order matters — each step
 * is applied via a single batched UPDATE that ignores rows already at or beyond
 * the target status.
 */
type ExpiryRule = {
  /** transition all passes whose expiry is within `daysAhead` days of today */
  daysAhead: number;
  from: GatePassStatus[];
  to: GatePassStatus;
  notif: NotificationType;
};

const EXPIRY_RULES: readonly ExpiryRule[] = [
  { daysAhead: 30, from: [GatePassStatus.VALID], to: GatePassStatus.EXPIRY_30, notif: NotificationType.EXPIRY_30 },
  { daysAhead: 15, from: [GatePassStatus.VALID, GatePassStatus.EXPIRY_30], to: GatePassStatus.EXPIRY_15, notif: NotificationType.EXPIRY_15 },
  { daysAhead: 7,  from: [GatePassStatus.VALID, GatePassStatus.EXPIRY_30, GatePassStatus.EXPIRY_15], to: GatePassStatus.EXPIRY_7, notif: NotificationType.EXPIRY_7 },
];

/**
 * Statuses that EXCLUDE a pass from auto-EXPIRED bumping. If a renewal or
 * cancellation flow is in progress, the engine leaves it alone.
 */
const EXPIRY_EXEMPT: readonly GatePassStatus[] = [
  GatePassStatus.CANCELLED,
  GatePassStatus.RENEWED,
  GatePassStatus.SUSPENDED,
  GatePassStatus.CANCELLATION_REQUESTED,
  GatePassStatus.RENEWAL_SUBMITTED,
  GatePassStatus.RENEWAL_APPROVED,
];

const BATCH_SIZE = 500;

@Processor(QUEUE_NAME)
@Injectable()
export class SchedulerProcessor {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: RetentionService,
    private readonly expirySvc: ExpiryService,
  ) {}

  /**
   * Daily status engine — runs at 01:00 Asia/Dubai (UTC+4 = 21:00 UTC the
   * previous day). Works tenant-agnostically via runUnscoped, batches all
   * updates so 100k+ passes process well under 15min.
   */
  @Process('expiry-sweep')
  async expirySweep() {
    return this.prisma.runUnscoped(async (_tx) => {
      const startedAt = Date.now();
      const today = startOfDay(new Date());
      let totalTransitions = 0;

      for (const rule of EXPIRY_RULES) {
        const cutoff = addDays(today, rule.daysAhead);
        totalTransitions += await this.applyTransition({
          where: {
            expiryDate: { lte: cutoff, gt: today },
            status: { in: rule.from },
          },
          to: rule.to,
          notif: rule.notif,
          reason: `expiry_within_${rule.daysAhead}_days`,
        });
      }

      // EXPIRED — anything past expiry that isn't already in a terminal/in-flight state.
      totalTransitions += await this.applyTransition({
        where: {
          expiryDate: { lt: today },
          status: { notIn: [GatePassStatus.EXPIRED, ...EXPIRY_EXEMPT] },
        },
        to: GatePassStatus.EXPIRED,
        notif: NotificationType.EXPIRY_0,
        reason: 'past_expiry_date',
      });

      // Auto-CANCELLATION_REQUESTED: fresh EXPIRED passes that have no in-flight
      // renewal get queued for cancellation immediately.
      totalTransitions += await this.applyTransition({
        where: {
          status: GatePassStatus.EXPIRED,
          cancellationRequestedAt: null,
        },
        to: GatePassStatus.CANCELLATION_REQUESTED,
        notif: NotificationType.OVERDUE_CANCELLATION,
        reason: 'auto_cancellation_on_expiry',
        extraUpdate: { cancellationRequestedAt: new Date(), cancellationReason: 'Pass expired without renewal' },
      });

      // Step 2: Multi-module document expiry notifications (deduped per-day)
      const sweepResult = await this.expirySvc.runDocumentExpirySweep(_tx);

      const duration = Date.now() - startedAt;
      this.logger.log(
        `Status engine complete: ${totalTransitions} transitions, ` +
        `${sweepResult.processed} doc-expiry alerts sent in ${duration}ms`,
      );
      return { totalTransitions, durationMs: duration, ...sweepResult };
    });
  }

  /**
   * Apply a status transition in batches. Runs in chunks of 500 IDs so each
   * UPDATE statement stays predictable and the audit insert doesn't bloat WAL.
   */
  private async applyTransition(params: {
    where: Prisma.GatePassWhereInput;
    to: GatePassStatus;
    notif: NotificationType;
    reason: string;
    extraUpdate?: Prisma.GatePassUncheckedUpdateManyInput;
  }): Promise<number> {
    let transitioned = 0;

    while (true) {
      const candidates = await this.prisma.gatePass.findMany({
        where: params.where,
        select: {
          id: true,
          tenantId: true,
          passNumber: true,
          status: true,
          expiryDate: true,
        },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
      });
      if (candidates.length === 0) break;

      const ids = candidates.map((c) => c.id);

      await this.prisma.gatePass.updateMany({
        where: { id: { in: ids } },
        data: { status: params.to, ...(params.extraUpdate ?? {}) },
      });

      // Audit log per-row — required by spec.
      await this.prisma.auditLog.createMany({
        data: candidates.map((c) => ({
          tenantId: c.tenantId,
          action: 'STATUS_AUTO_TRANSITION',
          entityType: 'GatePass',
          entityId: c.id,
          details: {
            from: c.status,
            to: params.to,
            reason: params.reason,
            passNumber: c.passNumber,
            expiryDate: c.expiryDate.toISOString().slice(0, 10),
          } as Prisma.InputJsonValue,
        })),
      });

      // Notify tenant admins (one notification per pass per tenant). Grouped
      // per tenantId so we issue one createMany per tenant batch.
      const byTenant = new Map<string, typeof candidates>();
      for (const c of candidates) {
        const arr = byTenant.get(c.tenantId) ?? [];
        arr.push(c);
        byTenant.set(c.tenantId, arr);
      }
      for (const [tenantId, group] of byTenant) {
        await this.dispatchTenantAdmins(tenantId, params.notif, group);
      }

      transitioned += candidates.length;
      if (candidates.length < BATCH_SIZE) break;
    }

    return transitioned;
  }

  /**
   * Daily 03:00 Asia/Dubai retention purge:
   *   1. Delete passes whose data_deletion_scheduled_at <= today.
   *   2. Send 7-day pre-deletion warnings to Admins.
   * Backfills `dataDeletionScheduledAt` on stale EXPIRED passes that were
   * never put through the cancellation flow, using each tenant's retention.
   */
  @Process('retention-purge')
  async retentionPurge() {
    // First backfill stale-expired passes so they enter the queue.
    await this.prisma.runUnscoped(async (tx) => {
      const tenants = await tx.tenant.findMany({
        where: { isActive: true },
        select: { id: true, settings: true },
      });
      for (const t of tenants) {
        const retention = (t.settings as Record<string, unknown>).retention_period_days;
        if (retention === 'permanent') continue;
        const days = typeof retention === 'number' ? retention : 30;
        const cutoff = addDays(new Date(), -days);
        await tx.gatePass.updateMany({
          where: {
            tenantId: t.id,
            status: { in: [GatePassStatus.EXPIRED, GatePassStatus.CANCELLED] },
            updatedAt: { lt: cutoff },
            dataDeletionScheduledAt: null,
          },
          data: { dataDeletionScheduledAt: new Date() },
        });
      }
    });

    // Then run the actual purge + warning dispatch.
    return this.retention.runDailyPurge();
  }

  /** Flag cancellations pending custody handover for >7 days. */
  @Process('overdue-sweep')
  async overdueSweep() {
    return this.prisma.runUnscoped(async (tx) => {
      const cutoff = addDays(new Date(), -7);
      const overdue = await tx.gatePass.findMany({
        where: {
          cancellationRequestedAt: { lt: cutoff },
          status: GatePassStatus.CANCELLATION_REQUESTED,
          custodyStatus: { not: CustodyStatus.SURRENDERED_TO_AUTHORITY },
        },
        select: { id: true, tenantId: true, passNumber: true, cancellationRequestedAt: true },
      });
      if (overdue.length === 0) {
        this.logger.log('Overdue sweep: no overdue cancellations');
        return;
      }

      // One audit row per overdue pass for traceability.
      await tx.auditLog.createMany({
        data: overdue.map((p) => ({
          tenantId: p.tenantId,
          action: 'CANCELLATION_OVERDUE_FLAG',
          entityType: 'GatePass',
          entityId: p.id,
          details: {
            passNumber: p.passNumber,
            cancellationRequestedAt: p.cancellationRequestedAt?.toISOString(),
          } as Prisma.InputJsonValue,
        })),
      });

      const byTenant = new Map<string, typeof overdue>();
      for (const p of overdue) {
        const arr = byTenant.get(p.tenantId) ?? [];
        arr.push(p);
        byTenant.set(p.tenantId, arr);
      }
      for (const [tenantId, group] of byTenant) {
        await this.dispatchTenantAdmins(tenantId, NotificationType.OVERDUE_HANDOVER, group);
      }
      this.logger.log(`Overdue sweep: flagged ${overdue.length} cancellations`);
    });
  }

  private async dispatchTenantAdmins(
    tenantId: string,
    type: NotificationType,
    passes: Array<{ id: string; passNumber: string }>,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, role: { in: ['ADMIN', 'PM', 'HR', 'SECRETARY'] } },
      select: { id: true },
    });
    if (admins.length === 0) return;

    const rows: Prisma.NotificationCreateManyInput[] = [];
    for (const p of passes) {
      for (const a of admins) {
        rows.push({
          tenantId,
          userId: a.id,
          type,
          title: titleFor(type, p.passNumber),
          message: messageFor(type, p.passNumber),
          entityType: 'GatePass',
          entityId: p.id,
        });
      }
    }
    if (rows.length > 0) await this.prisma.notification.createMany({ data: rows });
  }
}

function titleFor(type: NotificationType, passNumber: string): string {
  switch (type) {
    case NotificationType.EXPIRY_30: return `Pass ${passNumber} expires in 30 days`;
    case NotificationType.EXPIRY_15: return `Pass ${passNumber} expires in 15 days`;
    case NotificationType.EXPIRY_7:  return `Pass ${passNumber} expires in 7 days`;
    case NotificationType.EXPIRY_0:  return `Pass ${passNumber} has expired`;
    case NotificationType.OVERDUE_CANCELLATION: return `Pass ${passNumber} auto-queued for cancellation`;
    case NotificationType.OVERDUE_HANDOVER:     return `Pass ${passNumber} overdue for authority handover`;
    default: return `Pass ${passNumber} status changed`;
  }
}
function messageFor(type: NotificationType, passNumber: string): string {
  switch (type) {
    case NotificationType.OVERDUE_CANCELLATION:
      return `Pass ${passNumber} expired without a renewal and has been queued for cancellation. Surrender to authority within 7 days.`;
    case NotificationType.OVERDUE_HANDOVER:
      return `Pass ${passNumber} has been pending authority handover for over 7 days.`;
    default:
      return `Status update for pass ${passNumber}.`;
  }
}

@Injectable()
export class JobScheduler implements OnModuleInit {
  private readonly logger = new Logger(JobScheduler.name);

  constructor(@InjectQueue(QUEUE_NAME) private readonly queue: Queue) {}

  async onModuleInit() {
    // Cron registration is best-effort: if Redis is unreachable at boot, log
    // and continue so HTTP routes still come up. The cron jobs will need to be
    // re-registered after Redis recovers (restart pod, or wire a health-check
    // re-arm — out of scope here).
    try {
      // 01:00 Asia/Dubai (UTC+4) — expressed in IANA TZ so Bull/cron-parser handles DST.
      await this.queue.add('expiry-sweep', {}, {
        repeat: { cron: '0 1 * * *', tz: 'Asia/Dubai' },
        removeOnComplete: 50,
        removeOnFail: 50,
        jobId: 'expiry-sweep',
      });
      await this.queue.add('retention-purge', {}, {
        repeat: { cron: '0 3 * * *', tz: 'Asia/Dubai' },
        removeOnComplete: 50,
        removeOnFail: 50,
        jobId: 'retention-purge',
      });
      await this.queue.add('overdue-sweep', {}, {
        repeat: { cron: '30 3 * * *', tz: 'Asia/Dubai' },
        removeOnComplete: 50,
        removeOnFail: 50,
        jobId: 'overdue-sweep',
      });
      this.logger.log('Status engine cron jobs registered (Asia/Dubai)');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `Could not register cron jobs (Redis unavailable?) — background scheduling disabled: ${msg}`,
      );
    }
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

/**
 * Build a Bull `createClient` factory that returns ioredis instances configured
 * to be tolerant of an unavailable Redis:
 *   - `lazyConnect: true` — defers the TCP connection until first command, so
 *     boot doesn't crash if Redis is down at startup.
 *   - `maxRetriesPerRequest: null` + `enableReadyCheck: false` for the
 *     subscriber/bclient (Bull's blocking clients) — required by Bull, also
 *     prevents the "MaxRetriesPerRequestError" crash on transient outages.
 *   - `maxRetriesPerRequest: 3` for the regular client so request-path job
 *     enqueues fail fast (callers wrap in try/catch) instead of hanging.
 *   - `retryStrategy` capped so reconnect attempts back off, capped at 5s.
 *   - `error` event handler that logs and swallows — without it ioredis emits
 *     "Unhandled 'error' event" and the process exits.
 */
const redisLogger = new Logger('BullRedis');

function buildRedisOptions(config: ConfigService<AppConfig, true>): {
  url?: string;
  options: RedisOptions;
} {
  const cfg = config.get('redis', { infer: true });
  const base: RedisOptions = {
    lazyConnect: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
    reconnectOnError: () => 1,
  };
  if (cfg.url) return { url: cfg.url, options: base };
  return {
    options: {
      ...base,
      host: cfg.host,
      port: cfg.port,
      password: cfg.password,
    },
  };
}

function createBullClient(
  type: 'client' | 'subscriber' | 'bclient',
  config: ConfigService<AppConfig, true>,
): Redis {
  const { url, options } = buildRedisOptions(config);
  // Bull requires unbounded retries on the subscriber/bclient so blocking
  // commands aren't aborted; the regular client uses a finite cap.
  const opts: RedisOptions = {
    ...options,
    maxRetriesPerRequest: type === 'client' ? 3 : null,
    enableReadyCheck: type === 'client',
  };
  const client = url ? new IORedis(url, opts) : new IORedis(opts);
  client.on('error', (err) => {
    redisLogger.warn(
      `Redis ${type} error (background-jobs degraded): ${err.message}`,
    );
  });
  return client;
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        // `createClient` overrides the default redis options entirely, giving us
        // full control over per-client behaviour (lazyConnect, retry strategy,
        // error swallowing).
        createClient: (type: 'client' | 'subscriber' | 'bclient') =>
          createBullClient(type, config),
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAME }),
    GatePassesModule,
    ExpiryModule,
  ],
  providers: [SchedulerProcessor, JobScheduler],
})
export class JobsModule {}
