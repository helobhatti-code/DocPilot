import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExcelExporter } from './exports/excel.exporter';
import { PdfExporter } from './exports/pdf.exporter';

@Module({
  controllers: [ReportsController, DashboardController, AuditLogsController],
  providers: [ReportsService, DashboardService, ExcelExporter, PdfExporter],
  exports: [ReportsService, DashboardService],
})
export class ReportsModule {}
