import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Employee, EmployeeStatus, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppConfig } from '@/config/configuration';
import {
  computeExpiryBand,
  worstBand,
  type ExpiryBand,
} from '@/common/utils/expiry-band';
import { uploadAttachment, type AttachmentFile } from '@/common/utils/attachment-upload';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeFiltersDto } from './dto/employee-filters.dto';

export type EmployeeWithBands = Employee & {
  visaExpiryBand:         ExpiryBand | null;
  emiratesIdExpiryBand:   ExpiryBand | null;
  laborCardExpiryBand:    ExpiryBand | null;
  passportExpiryBand:     ExpiryBand | null;
  worstExpiryBand:        ExpiryBand;
};

const ATTACHMENT_FIELDS: Record<string, keyof Prisma.EmployeeUpdateInput> = {
  'emirates-id':  'emiratesIdAttachmentId',
  'visa':         'visaAttachmentId',
  'labor-card':   'laborCardAttachmentId',
  'passport':     'passportAttachmentId',
};

const TEMPLATE_HEADERS = [
  'Name', 'Designation', 'Emirates ID No.', 'Emirates ID Expiry (YYYY-MM-DD)',
  'Visa No.', 'Visa Expiry (YYYY-MM-DD)',
  'Labor Card No.', 'Labor Card Expiry (YYYY-MM-DD)',
  'Passport No.', 'Passport Expiry (YYYY-MM-DD)',
  'Phone', 'Email', 'Join Date (YYYY-MM-DD)',
  'Status (ACTIVE/ON_LEAVE/TERMINATED)', 'Remarks',
];

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private addBands(e: Employee, today = new Date()): EmployeeWithBands {
    const visaExpiryBand       = computeExpiryBand(e.visaExpiryDate, today);
    const emiratesIdExpiryBand = computeExpiryBand(e.emiratesIdExpiryDate, today);
    const laborCardExpiryBand  = computeExpiryBand(e.laborCardExpiryDate, today);
    const passportExpiryBand   = computeExpiryBand(e.passportExpiryDate, today);

    return {
      ...e,
      visaExpiryBand,
      emiratesIdExpiryBand,
      laborCardExpiryBand,
      passportExpiryBand,
      worstExpiryBand: worstBand([
        visaExpiryBand,
        emiratesIdExpiryBand,
        laborCardExpiryBand,
        passportExpiryBand,
      ]),
    };
  }

  async list(query: EmployeeFiltersDto) {
    const page     = query.page     ?? 1;
    const pageSize = query.pageSize ?? 25;
    const today    = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Prisma.EmployeeWhereInput = { isActive: true };

    if (query.companyId)   where.companyId   = query.companyId;
    if (query.status)      where.status      = query.status;
    if (query.designation) where.designation = { contains: query.designation, mode: 'insensitive' };
    if (query.isNewEmployee !== undefined) where.isNewEmployee = query.isNewEmployee;
    if (query.q) {
      where.OR = [
        { name:         { contains: query.q, mode: 'insensitive' } },
        { designation:  { contains: query.q, mode: 'insensitive' } },
        { emiratesIdNo: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const allItems = await this.prisma.employee.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: query.expiryBand ? undefined : (page - 1) * pageSize,
      take: query.expiryBand ? undefined : pageSize,
    });
    const total    = query.expiryBand ? 0 : await this.prisma.employee.count({ where });
    const withBands = allItems.map((e) => this.addBands(e, today));

    if (query.expiryBand) {
      const band = query.expiryBand;
      const filtered = withBands.filter(
        (e) =>
          e.visaExpiryBand         === band ||
          e.emiratesIdExpiryBand   === band ||
          e.laborCardExpiryBand    === band ||
          e.passportExpiryBand     === band,
      );
      const start = (page - 1) * pageSize;
      return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
    }

    return { items: withBands, total, page, pageSize };
  }

  async create(actor: AuthUser, dto: CreateEmployeeDto): Promise<EmployeeWithBands> {
    const emp = await this.prisma.employee.create({
      data: {
        tenantId:               actor.tenantId,
        name:                   dto.name,
        designation:            dto.designation,
        nationality:            dto.nationality            ?? null,
        emiratesIdNo:           dto.emiratesIdNo           ?? null,
        emiratesIdExpiryDate:   dto.emiratesIdExpiryDate   ? new Date(dto.emiratesIdExpiryDate)   : null,
        emiratesIdAttachmentId: dto.emiratesIdAttachmentId ?? null,
        visaNo:                 dto.visaNo                 ?? null,
        visaExpiryDate:         dto.visaExpiryDate         ? new Date(dto.visaExpiryDate)         : null,
        visaAttachmentId:       dto.visaAttachmentId       ?? null,
        laborCardNo:            dto.laborCardNo            ?? null,
        laborCardExpiryDate:    dto.laborCardExpiryDate    ? new Date(dto.laborCardExpiryDate)     : null,
        laborCardAttachmentId:  dto.laborCardAttachmentId  ?? null,
        passportNo:             dto.passportNo             ?? null,
        passportExpiryDate:     dto.passportExpiryDate     ? new Date(dto.passportExpiryDate)      : null,
        passportAttachmentId:   dto.passportAttachmentId   ?? null,
        phone:                  dto.phone                  ?? null,
        email:                  dto.email                  ?? null,
        joinDate:               dto.joinDate               ? new Date(dto.joinDate)                : null,
        status:                 dto.status                 ?? EmployeeStatus.ACTIVE,
        remarks:                dto.remarks                ?? null,
        isNewEmployee:          dto.isNewEmployee          ?? false,
        onboardingState:        dto.onboardingState        ?? null,
        createdBy:              actor.id,
      } as Prisma.EmployeeUncheckedCreateInput,
    });
    return this.addBands(emp);
  }

  async findOne(id: string): Promise<EmployeeWithBands> {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Employee not found');
    return this.addBands(e);
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeWithBands> {
    const existing = await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Employee not found');

    const data: Prisma.EmployeeUpdateInput = {
      name:                   dto.name,
      designation:            dto.designation,
      emiratesIdNo:           dto.emiratesIdNo,
      emiratesIdExpiryDate:   dto.emiratesIdExpiryDate   ? new Date(dto.emiratesIdExpiryDate)   : undefined,
      emiratesIdAttachmentId: dto.emiratesIdAttachmentId,
      visaNo:                 dto.visaNo,
      visaExpiryDate:         dto.visaExpiryDate         ? new Date(dto.visaExpiryDate)          : undefined,
      visaAttachmentId:       dto.visaAttachmentId,
      laborCardNo:            dto.laborCardNo,
      laborCardExpiryDate:    dto.laborCardExpiryDate    ? new Date(dto.laborCardExpiryDate)     : undefined,
      laborCardAttachmentId:  dto.laborCardAttachmentId,
      passportNo:             dto.passportNo,
      passportExpiryDate:     dto.passportExpiryDate     ? new Date(dto.passportExpiryDate)      : undefined,
      passportAttachmentId:   dto.passportAttachmentId,
      phone:                  dto.phone,
      email:                  dto.email,
      joinDate:               dto.joinDate               ? new Date(dto.joinDate)                : undefined,
      status:                 dto.status,
      isActive:               dto.isActive,
      remarks:                dto.remarks,
    };

    const updated = await this.prisma.employee.update({ where: { id }, data });
    return this.addBands(updated);
  }

  async softDelete(id: string) {
    const existing = await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Employee not found');
    return this.prisma.employee.update({
      where: { id },
      data: { isActive: false, status: EmployeeStatus.TERMINATED },
      select: { id: true, isActive: true, status: true },
    });
  }

  async uploadAttachmentForEmployee(id: string, kind: string, file: AttachmentFile) {
    const existing = await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Employee not found');

    const field = ATTACHMENT_FIELDS[kind];
    if (!field) throw new BadRequestException(`Unknown attachment kind: ${kind}`);

    const uploadRoot = this.config.get('uploadDir', { infer: true }) ?? './uploads';
    const result     = await uploadAttachment(file, uploadRoot, 'employee', id, kind);

    await this.prisma.employee.update({
      where: { id },
      data: { [field]: result.attachmentId },
    });
    return result;
  }

  // ─── Bulk import ──────────────────────────────────────────────────────────

  async buildTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DocPilot';
    const ws = wb.addWorksheet('Employees');
    ws.addRow(TEMPLATE_HEADERS).font = { bold: true };
    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
  }

  async parseAndValidate(_actor: AuthUser, buffer: Buffer) {
    if (!buffer?.length) throw new BadRequestException('Empty file');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (e) {
      throw new BadRequestException(`Invalid .xlsx: ${(e as Error).message}`);
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Workbook has no sheets');

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? '').trim().toLowerCase();
    });

    const eidsSeen = new Set<string>();
    const rows: Array<{
      rowNumber: number;
      name?: string;
      designation?: string;
      emiratesIdNo?: string;
      emiratesIdExpiryDate?: string;
      visaNo?: string;
      visaExpiryDate?: string;
      laborCardNo?: string;
      laborCardExpiryDate?: string;
      passportNo?: string;
      passportExpiryDate?: string;
      phone?: string;
      email?: string;
      joinDate?: string;
      status?: string;
      remarks?: string;
      errors: string[];
      ok: boolean;
    }> = [];

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row.hasValues) continue;

      const get = (label: string): string | undefined => {
        const idx = headers.findIndex((h) => h.includes(label.toLowerCase()));
        if (idx === -1) return undefined;
        const v = row.getCell(idx + 1).value;
        return v !== null && v !== undefined ? String(v).trim() : undefined;
      };

      const parsed = {
        rowNumber:           r,
        name:                get('name'),
        designation:         get('designation'),
        emiratesIdNo:        get('emirates id no'),
        emiratesIdExpiryDate:get('emirates id expiry'),
        visaNo:              get('visa no'),
        visaExpiryDate:      get('visa expiry'),
        laborCardNo:         get('labor card no'),
        laborCardExpiryDate: get('labor card expiry'),
        passportNo:          get('passport no'),
        passportExpiryDate:  get('passport expiry'),
        phone:               get('phone'),
        email:               get('email'),
        joinDate:            get('join date'),
        status:              get('status'),
        remarks:             get('remarks'),
        errors:              [] as string[],
        ok:                  true,
      };

      if (!parsed.name)        parsed.errors.push('name required');
      if (!parsed.designation) parsed.errors.push('designation required');
      if (!parsed.emiratesIdNo)  parsed.errors.push('emiratesIdNo required');
      if (!parsed.visaExpiryDate) parsed.errors.push('visaExpiryDate required');

      if (parsed.status && !Object.values(EmployeeStatus).includes(parsed.status as EmployeeStatus)) {
        parsed.errors.push(`status must be ACTIVE, ON_LEAVE, or TERMINATED`);
      }

      if (parsed.emiratesIdNo) {
        if (eidsSeen.has(parsed.emiratesIdNo)) {
          parsed.errors.push(`Duplicate Emirates ID ${parsed.emiratesIdNo} in this file`);
        } else {
          eidsSeen.add(parsed.emiratesIdNo);
        }
      }

      parsed.ok = parsed.errors.length === 0;
      rows.push(parsed);
    }

    const validRows = rows.filter((r) => r.ok).length;
    return { headers, totalRows: rows.length, validRows, invalidRows: rows.length - validRows, rows };
  }

  async commit(actor: AuthUser, rows: Array<{ ok: boolean; [k: string]: unknown }>) {
    const valid = rows.filter((r) => r.ok);
    let imported = 0;
    const failures: { rowNumber: number; reason: string }[] = [];

    for (const row of valid) {
      try {
        await this.prisma.employee.create({
          data: {
            tenantId:            actor.tenantId,
            name:                row.name as string,
            designation:         row.designation as string,
            emiratesIdNo:        row.emiratesIdNo as string,
            emiratesIdExpiryDate:row.emiratesIdExpiryDate ? new Date(row.emiratesIdExpiryDate as string) : null,
            visaNo:              (row.visaNo as string | undefined) ?? null,
            visaExpiryDate:      new Date(row.visaExpiryDate as string),
            laborCardNo:         (row.laborCardNo as string | undefined) ?? null,
            laborCardExpiryDate: row.laborCardExpiryDate ? new Date(row.laborCardExpiryDate as string) : null,
            passportNo:          (row.passportNo as string | undefined) ?? null,
            passportExpiryDate:  row.passportExpiryDate ? new Date(row.passportExpiryDate as string) : null,
            phone:               (row.phone as string | undefined) ?? null,
            email:               (row.email as string | undefined) ?? null,
            joinDate:            row.joinDate ? new Date(row.joinDate as string) : null,
            status:              (row.status as EmployeeStatus | undefined) ?? EmployeeStatus.ACTIVE,
            remarks:             (row.remarks as string | undefined) ?? null,
            createdBy:           actor.id,
          } as Prisma.EmployeeUncheckedCreateInput,
        });
        imported++;
      } catch (e) {
        failures.push({ rowNumber: row.rowNumber as number, reason: (e as Error).message });
      }
    }

    return { imported, skipped: rows.length - valid.length, failures };
  }
}
