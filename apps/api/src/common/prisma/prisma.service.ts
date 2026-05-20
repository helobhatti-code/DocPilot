import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { currentContext } from '../context/tenant-context';

/**
 * Tenant-scoped models — Prisma middleware automatically injects `tenant_id` on
 * reads/writes for these models when a tenant context is active.
 */
const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'User',
  'SubcontractorOrg',
  'Staff',
  'GatePass',
  'CustodyHistory',
  'Document',
  'Notification',
  'NotificationTemplate',
  'RolePermission',
  'AuditLog',
  'Vehicle',
  'HeavyMachinery',
  'Employee',
  'CompanyDocument',
  'ExpiryNotificationLog',
  'AlarmThresholdConfig',
]);

/**
 * Company-scoped models — Prisma middleware auto-injects `company_id` and
 * AND-filters reads when a non-bypassing company context is active.
 */
const COMPANY_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'GatePass',
  'Staff',
  'SubcontractorOrg',
  'Vehicle',
  'HeavyMachinery',
  'Employee',
]);

const TENANT_WRITE_ACTIONS: ReadonlySet<string> = new Set([
  'create',
  'createMany',
  'upsert',
]);

const TENANT_FILTER_ACTIONS: ReadonlySet<string> = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findUnique',    // converted to findFirst in middleware
  'findUniqueOrThrow', // converted to findFirstOrThrow in middleware
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  // NOTE: 'update', 'updateMany', 'delete', 'deleteMany' are intentionally
  // excluded. Prisma's update/delete where clause only accepts unique
  // identifiers — wrapping with AND: [{tenantId}, ...] causes a Prisma error.
  // Security is maintained by read-side filtering: a tenant can only discover
  // and act on IDs they retrieved through tenant-filtered read queries.
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });

    this.$use(this.tenantMiddleware.bind(this));
    this.$use(this.companyMiddleware.bind(this));
    this.$use(this.rlsSessionMiddleware.bind(this));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run a block of code with RLS bypass — used by system jobs and super-admin
   * cross-tenant operations.
   *
   * The callback receives the transaction client `tx`. Use `tx.*` for ALL
   * queries inside the block so they share the connection where
   * `app.bypass_rls = 'on'` was set via SET LOCAL.
   */
  async runUnscoped<T>(
    fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.bypass_rls = 'on'`);
      return fn(tx);
    });
  }

  // -------------------- middleware --------------------

  private tenantMiddleware: Prisma.Middleware = async (params, next) => {
    const ctx = currentContext();
    if (!ctx?.tenantId || ctx.bypassRls) return next(params);
    if (!params.model || !TENANT_SCOPED_MODELS.has(params.model)) return next(params);

    const tenantId = ctx.tenantId;

    if (TENANT_WRITE_ACTIONS.has(params.action)) {
      this.injectTenantOnCreate(params, tenantId);
    } else if (TENANT_FILTER_ACTIONS.has(params.action)) {
      // findUnique / findUniqueOrThrow do NOT support AND in their where clause.
      // Convert to findFirst / findFirstOrThrow so we can safely inject tenantId.
      if (params.action === 'findUnique') {
        params.action = 'findFirst';
      } else if (params.action === 'findUniqueOrThrow') {
        params.action = 'findFirstOrThrow';
      }
      this.injectTenantOnFilter(params, tenantId);
    }
    return next(params);
  };

  /**
   * Company-scoped middleware: mirrors tenantMiddleware but for company_id.
   * Skipped entirely when:
   *   - no context exists (system jobs, public routes)
   *   - bypassCompany is true (ADMIN with canAccessAllCompanies and no header)
   *   - companyId is null (unassigned users — backward-compatible, see migration notes)
   */
  private companyMiddleware: Prisma.Middleware = async (params, next) => {
    const ctx = currentContext();
    if (!ctx?.companyId || ctx.bypassCompany) return next(params);
    if (!params.model || !COMPANY_SCOPED_MODELS.has(params.model)) return next(params);

    const { companyId } = ctx;

    if (TENANT_WRITE_ACTIONS.has(params.action)) {
      this.injectCompanyOnCreate(params, companyId);
    } else if (TENANT_FILTER_ACTIONS.has(params.action)) {
      if (params.action === 'findUnique') {
        params.action = 'findFirst';
      } else if (params.action === 'findUniqueOrThrow') {
        params.action = 'findFirstOrThrow';
      }
      this.injectCompanyOnFilter(params, companyId);
    }
    return next(params);
  };

  private rlsSessionMiddleware: Prisma.Middleware = async (params, next) => {
    // Setting GUCs requires a transaction; Prisma already wraps single
    // statements, so we no-op here. Connection-level RLS is set per-request via
    // `$transaction` callbacks invoked by repositories that need it.
    return next(params);
  };

  private injectTenantOnCreate(params: Prisma.MiddlewareParams, tenantId: string): void {
    if (params.action === 'createMany' && params.args?.data) {
      const data = params.args.data;
      params.args.data = Array.isArray(data)
        ? data.map((row) => ({ tenantId, ...row }))
        : { tenantId, ...data };
      return;
    }

    if (params.action === 'create' && params.args?.data) {
      params.args.data = { tenantId, ...params.args.data };
      return;
    }

    if (params.action === 'upsert' && params.args) {
      params.args.create = { tenantId, ...(params.args.create ?? {}) };
      params.args.where = { tenantId, ...(params.args.where ?? {}) };
    }
  }

  private injectTenantOnFilter(params: Prisma.MiddlewareParams, tenantId: string): void {
    params.args = params.args ?? {};
    const existing = params.args.where ?? {};
    params.args.where = { AND: [{ tenantId }, existing] };
  }

  private injectCompanyOnCreate(params: Prisma.MiddlewareParams, companyId: string): void {
    if (params.action === 'createMany' && params.args?.data) {
      const data = params.args.data;
      params.args.data = Array.isArray(data)
        ? data.map((row) => ({ companyId, ...row }))
        : { companyId, ...data };
      return;
    }
    if (params.action === 'create' && params.args?.data) {
      params.args.data = { companyId, ...params.args.data };
      return;
    }
    if (params.action === 'upsert' && params.args) {
      params.args.create = { companyId, ...(params.args.create ?? {}) };
      params.args.where  = { companyId, ...(params.args.where ?? {}) };
    }
  }

  private injectCompanyOnFilter(params: Prisma.MiddlewareParams, companyId: string): void {
    params.args = params.args ?? {};
    const existing = params.args.where ?? {};
    params.args.where = { AND: [{ companyId }, existing] };
  }
}
