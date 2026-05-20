import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration from './config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SubcontractorOrgsModule } from './modules/subcontractor-orgs/subcontractor-orgs.module';
import { StaffModule } from './modules/staff/staff.module';
import { GatePassesModule } from './modules/gate-passes/gate-passes.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { RolePermissionsModule } from './modules/role-permissions/role-permissions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { HeavyMachineryModule } from './modules/heavy-machinery/heavy-machinery.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { CompanyDocumentsModule } from './modules/company-documents/company-documents.module';
import { ExpiryModule } from './modules/expiry/expiry.module';
import { AlarmThresholdsModule } from './modules/alarm-thresholds/alarm-thresholds.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 600 },  // 10 req/s per IP — plenty for normal use
      { name: 'auth', ttl: 60_000, limit: 10 },       // 10 auth attempts per minute
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    SubcontractorOrgsModule,
    StaffModule,
    GatePassesModule,
    UploadsModule,
    RolePermissionsModule,
    NotificationsModule,
    JobsModule,
    ReferenceModule,
    ReportsModule,
    AuditLogsModule,
    CompaniesModule,
    VehiclesModule,
    HeavyMachineryModule,
    EmployeesModule,
    CompanyDocumentsModule,
    ExpiryModule,
    AlarmThresholdsModule,
  ],
  providers: [
    { provide: APP_GUARD,       useClass: JwtAuthGuard },
    { provide: APP_GUARD,       useClass: ThrottlerGuard },
    // TenantContextInterceptor MUST be first — wraps each request in
    // tenantStorage.run() so all child async ops (including Prisma $use
    // middleware) inherit the correct tenant context.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER,      useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
