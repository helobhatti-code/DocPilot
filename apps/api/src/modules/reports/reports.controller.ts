import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import {
  ExportFormat,
  ReportFilterDto,
  ReportType,
} from './dto/reports.dto';
import { ExcelExporter } from './exports/excel.exporter';
import { PdfExporter } from './exports/pdf.exporter';
import { ReportsService } from './reports.service';

const ALLOWED_TYPES: ReportType[] = [
  'pass-register',
  'expiry',
  'compliance',
  'custody',
  'pending-handover',
  'retention',
  'zone-access',
  'staff-history',
  'subcontractor',
  'audit-trail',
  'vehicles-expiry',
  'machinery-compliance',
  'employees-visa-status',
  'company-docs-compliance',
  'master-expiry',
];

const VIEWER_ROLES = [
  UserRole.ADMIN,
  UserRole.PM,
  UserRole.HR,
  UserRole.SECRETARY,
  UserRole.VIEWER,
  UserRole.SUBCONTRACTOR,
];

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(TenantGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly svc: ReportsService,
    private readonly excel: ExcelExporter,
    private readonly pdf: PdfExporter,
  ) {}

  @Get(':type')
  @Roles(...VIEWER_ROLES)
  async run(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Query() filter: ReportFilterDto,
  ) {
    const t = this.assertType(type);
    return this.svc.run(user, t, filter);
  }

  @Get(':type/export')
  @Roles(...VIEWER_ROLES)
  async export(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Query('format') format: ExportFormat = 'xlsx',
    @Query() filter: ReportFilterDto,
    @Res() res: Response,
  ) {
    const t = this.assertType(type);
    if (format !== 'xlsx' && format !== 'pdf') {
      throw new BadRequestException('format must be xlsx or pdf');
    }
    const report = await this.svc.run(user, t, { ...filter, pageSize: 5000 });
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = `${t}-${stamp}`;

    if (format === 'xlsx') {
      const buf = await this.excel.export(report);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeName}.xlsx"`,
        'Content-Length': buf.length.toString(),
      });
      res.send(buf);
      return;
    }

    const buf = await this.pdf.export(report);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      'Content-Length': buf.length.toString(),
    });
    res.send(buf);
  }

  private assertType(type: string): ReportType {
    if (!ALLOWED_TYPES.includes(type as ReportType)) {
      throw new BadRequestException(
        `Unknown report type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      );
    }
    return type as ReportType;
  }
}
