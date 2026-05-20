import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma, PrismaClient, UserRole } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

type SweepTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'> & {
  $queryRawUnsafe: PrismaClient['$queryRawUnsafe'];
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpiryViewRow {
  source:            string;
  source_id:         string;
  tenant_id:         string;
  company_id:        string | null;
  doc_kind:          string;
  display_name:      string;
  expiry_date:       Date;
  days_until_expiry: number;
  band?:             string;
  // threshold columns from LEFT JOIN with alarm_threshold_configs
  band1_days?: number;
  band2_days?: number;
  band3_days?: number;
}

export interface ExpiryFiltersDto {
  band?:      string;
  source?:    string;
  companyId?: string;
  docKind?:   string;
  from?:      string;
  to?:        string;
  q?:         string;
  page?:      number;
  pageSize?:  number;
}

// ─── Band computation (API-layer, uses per-docKind thresholds) ────────────────

/**
 * Compute the expiry band label from days-until-expiry and the threshold config
 * for the specific docKind. Falls back to defaults (30/14/7) when columns are absent.
 */
export function computeBandFromDays(
  days:      number,
  band1Days: number = 30,
  band2Days: number = 14,
  band3Days: number = 7,
): string {
  if (days < 0)          return 'expired';
  if (days <= band3Days) return '7d';
  if (days <= band2Days) return '14d';
  if (days <= band1Days) return '30d';
  return 'valid';
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ExpiryService {
  private readonly logger = new Logger(ExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ExpiryFiltersDto, tenantId: string) {
    const page     = query.page     ?? 1;
    const pageSize = query.pageSize ?? 50;

    const conditions: string[] = ['v.tenant_id = $1'];
    const params: unknown[]    = [tenantId];
    let idx = 2;

    if (query.band) {
      const bands = query.band.split(',').map((b) => b.trim()).filter(Boolean);
      if (bands.length > 0) {
        // Translate each band to a days_until_expiry range using the COALESCE'd threshold
        // columns from the LEFT JOIN — so custom thresholds filter correctly.
        const bandClauses = bands
          .map((b) => {
            switch (b) {
              case 'expired': return 'v.days_until_expiry < 0';
              case '7d':      return '(v.days_until_expiry >= 0 AND v.days_until_expiry <= COALESCE(t.band3_days, 7))';
              case '14d':     return '(v.days_until_expiry > COALESCE(t.band3_days, 7) AND v.days_until_expiry <= COALESCE(t.band2_days, 14))';
              case '30d':     return '(v.days_until_expiry > COALESCE(t.band2_days, 14) AND v.days_until_expiry <= COALESCE(t.band1_days, 30))';
              case 'valid':   return 'v.days_until_expiry > COALESCE(t.band1_days, 30)';
              default:        return null;
            }
          })
          .filter(Boolean);
        if (bandClauses.length > 0) conditions.push(`(${bandClauses.join(' OR ')})`);
      }
    }

    if (query.source) {
      conditions.push(`v.source = $${idx}`);
      params.push(query.source);
      idx++;
    }

    if (query.companyId) {
      conditions.push(`v.company_id = $${idx}`);
      params.push(query.companyId);
      idx++;
    }

    if (query.docKind) {
      conditions.push(`v.doc_kind = $${idx}`);
      params.push(query.docKind);
      idx++;
    }

    if (query.from) {
      conditions.push(`v.expiry_date >= $${idx}::date`);
      params.push(query.from);
      idx++;
    }

    if (query.to) {
      conditions.push(`v.expiry_date <= $${idx}::date`);
      params.push(query.to);
      idx++;
    }

    if (query.q) {
      conditions.push(`v.display_name ILIKE $${idx}`);
      params.push(`%${query.q.trim()}%`);
      idx++;
    }

    const where  = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const joinClause = `
      LEFT JOIN alarm_threshold_configs t
        ON t.tenant_id = v.tenant_id AND t.doc_kind = v.doc_kind AND t.is_active = TRUE
    `;

    const selectSql = `
      SELECT v.source, v.source_id, v.tenant_id, v.company_id, v.doc_kind, v.display_name,
             v.expiry_date, v.days_until_expiry,
             COALESCE(t.band1_days, 30) AS band1_days,
             COALESCE(t.band2_days, 14) AS band2_days,
             COALESCE(t.band3_days, 7)  AS band3_days
      FROM   expiry_items_v v
      ${joinClause}
      WHERE  ${where}
      ORDER  BY v.days_until_expiry ASC
      LIMIT  ${pageSize} OFFSET ${offset}
    `;

    const countSql = `
      SELECT COUNT(*)::integer AS total
      FROM   expiry_items_v v
      ${joinClause}
      WHERE  ${where}
    `;

    const [rawItems, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<ExpiryViewRow[]>(selectSql, ...params),
      this.prisma.$queryRawUnsafe<[{ total: number }]>(countSql, ...params),
    ]);

    // Compute band in API layer using per-docKind thresholds
    const items = rawItems.map((row) => ({
      ...row,
      band: computeBandFromDays(
        row.days_until_expiry,
        row.band1_days,
        row.band2_days,
        row.band3_days,
      ),
    }));

    return { items, total: Number(countRows[0]?.total ?? 0), page, pageSize };
  }

  async summary(tenantId: string) {
    // Fetch (source, doc_kind, days_until_expiry, threshold_cols, count) then compute
    // band in the API layer so custom thresholds per docKind are honoured.
    const rows = await this.prisma.$queryRaw<Array<{
      source:     string;
      doc_kind:   string;
      days:       number;
      cnt:        bigint;
      band1_days: number;
      band2_days: number;
      band3_days: number;
    }>>`
      SELECT v.source, v.doc_kind, v.days_until_expiry AS days, COUNT(*) AS cnt,
             COALESCE(t.band1_days, 30) AS band1_days,
             COALESCE(t.band2_days, 14) AS band2_days,
             COALESCE(t.band3_days, 7)  AS band3_days
      FROM   expiry_items_v v
      LEFT   JOIN alarm_threshold_configs t
        ON   t.tenant_id = v.tenant_id AND t.doc_kind = v.doc_kind AND t.is_active = TRUE
      WHERE  v.tenant_id = ${tenantId}
      GROUP  BY v.source, v.doc_kind, v.days_until_expiry, t.band1_days, t.band2_days, t.band3_days
    `;

    const byBand:   Record<string, number> = { expired: 0, '7d': 0, '14d': 0, '30d': 0, valid: 0 };
    const bySource: Record<string, number> = {
      gate_pass: 0, vehicle: 0, machinery: 0, employee: 0, company_document: 0,
    };

    for (const row of rows) {
      const cnt  = Number(row.cnt);
      const band = computeBandFromDays(row.days, row.band1_days, row.band2_days, row.band3_days);
      if (band   in byBand)   byBand[band]         = (byBand[band]           ?? 0) + cnt;
      if (row.source in bySource) bySource[row.source] = (bySource[row.source] ?? 0) + cnt;
    }

    return { byBand, bySource };
  }

  /**
   * Called by the expiry-sweep cron job (inside runUnscoped tx).
   * Queries expiry_items_v + threshold config, deduplicates via ExpiryNotificationLog,
   * creates Notification rows, and inserts log entries.
   */
  async runDocumentExpirySweep(tx: SweepTx): Promise<{ processed: number; skipped: number }> {
    const today    = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    // Join threshold config so band computation is tenant/docKind-aware.
    // Items with days > band1Days are "valid" — no notification needed.
    const items = await tx.$queryRawUnsafe<(ExpiryViewRow & { band1_days: number; band2_days: number; band3_days: number })[]>(
      `SELECT v.source, v.source_id, v.tenant_id, v.company_id, v.doc_kind, v.display_name,
              v.expiry_date, v.days_until_expiry,
              COALESCE(t.band1_days, 30) AS band1_days,
              COALESCE(t.band2_days, 14) AS band2_days,
              COALESCE(t.band3_days, 7)  AS band3_days
       FROM   expiry_items_v v
       LEFT   JOIN alarm_threshold_configs t
         ON   t.tenant_id = v.tenant_id AND t.doc_kind = v.doc_kind AND t.is_active = TRUE
       WHERE  v.days_until_expiry <= COALESCE(t.band1_days, 30)`,
    );

    let processed = 0;
    let skipped   = 0;

    for (const item of items) {
      try {
        const band = computeBandFromDays(
          item.days_until_expiry,
          item.band1_days,
          item.band2_days,
          item.band3_days,
        );

        // Dedup: skip if already notified today for this (source, item, docKind, band)
        const existing = await (tx as unknown as typeof this.prisma).expiryNotificationLog.findFirst({
          where: {
            tenantId: item.tenant_id,
            source:   item.source,
            sourceId: item.source_id,
            docKind:  item.doc_kind,
            band,
            notifiedOn: {
              gte: new Date(`${todayStr}T00:00:00.000Z`),
              lt:  tomorrow,
            },
          },
          select: { id: true },
        });

        if (existing) { skipped++; continue; }

        const admins = await (tx as unknown as typeof this.prisma).user.findMany({
          where: {
            tenantId: item.tenant_id,
            isActive: true,
            role: { in: [UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY] },
          },
          select: { id: true },
        });

        if (admins.length > 0) {
          const statusLine = item.days_until_expiry < 0
            ? 'has expired'
            : `is expiring in ${item.days_until_expiry} days`;

          await (tx as unknown as typeof this.prisma).notification.createMany({
            data: admins.map((a) => ({
              tenantId:   item.tenant_id,
              userId:     a.id,
              type:       NotificationType.DOCUMENT_EXPIRY_ALERT,
              title:      `Document expiry alert: ${item.doc_kind}`,
              message:    `${item.display_name} ${statusLine}. Action required.`,
              entityType: item.source,
              entityId:   item.source_id,
            })) as Prisma.NotificationCreateManyInput[],
          });
        }

        await (tx as unknown as typeof this.prisma).expiryNotificationLog.create({
          data: {
            tenantId: item.tenant_id,
            source:   item.source,
            sourceId: item.source_id,
            docKind:  item.doc_kind,
            band,
          } as Prisma.ExpiryNotificationLogUncheckedCreateInput,
        });

        processed++;
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'P2002') {
          skipped++;
        } else {
          this.logger.warn(
            `Document expiry sweep error for ${item.source}/${item.source_id}: ${(err as Error).message}`,
          );
        }
      }
    }

    this.logger.log(`Document expiry sweep: ${processed} notified, ${skipped} skipped (deduped)`);
    return { processed, skipped };
  }
}
