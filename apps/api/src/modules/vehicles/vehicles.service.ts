import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsuranceType, Prisma, Vehicle, VehicleType } from '@prisma/client';
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
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleFiltersDto } from './dto/vehicle-filters.dto';

export type VehicleWithBands = Vehicle & {
  carLicenseExpiryBand:         ExpiryBand;
  insuranceExpiryBand:          ExpiryBand;
  residentialMawaqifExpiryBand: ExpiryBand | null;
  normalMawaqifExpiryBand:      ExpiryBand | null;
  worstExpiryBand:              ExpiryBand;
};

const TEMPLATE_HEADERS = [
  'Owner Name', 'Driver Name', 'Car Make', 'Car Model',
  'Plate Emirate', 'Plate Category', 'Plate Number',
  'Car License No', 'Car License Expiry Date (YYYY-MM-DD)',
  'Vehicle Type (PRIVATE/COMPANY)', 'Insurance Type (COMPREHENSIVE/THIRD_PARTY)',
  'Insurance Policy No', 'Insurance Expiry Date (YYYY-MM-DD)',
  'Has Residential Mawaqif (YES/NO)', 'Residential Mawaqif Expiry Date (YYYY-MM-DD)',
  'Has Normal Mawaqif (YES/NO)', 'Normal Mawaqif Expiry Date (YYYY-MM-DD)',
  'Remarks',
];

interface ParsedVehicleRow {
  rowNumber: number;
  ownerName?: string;
  driverName?: string;
  carMake?: string;
  carModel?: string;
  plateEmirate?: string;
  plateCategory?: string;
  plateNumber?: string;
  carLicenseNo?: string;
  carLicenseExpiryDate?: string;
  vehicleType?: string;
  insuranceType?: string;
  insurancePolicyNo?: string;
  insuranceExpiryDate?: string;
  hasResidentialMawaqif?: boolean;
  residentialMawaqifExpiryDate?: string;
  hasNormalMawaqif?: boolean;
  normalMawaqifExpiryDate?: string;
  remarks?: string;
  errors: string[];
  ok: boolean;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private addBands(v: Vehicle, today = new Date()): VehicleWithBands {
    const carLicenseExpiryBand   = computeExpiryBand(v.carLicenseExpiryDate, today)!;
    const insuranceExpiryBand    = computeExpiryBand(v.insuranceExpiryDate, today)!;
    const residentialMawaqifExpiryBand =
      v.hasResidentialMawaqif ? computeExpiryBand(v.residentialMawaqifExpiryDate, today) : null;
    const normalMawaqifExpiryBand =
      v.hasNormalMawaqif ? computeExpiryBand(v.normalMawaqifExpiryDate, today) : null;

    return {
      ...v,
      carLicenseExpiryBand,
      insuranceExpiryBand,
      residentialMawaqifExpiryBand,
      normalMawaqifExpiryBand,
      worstExpiryBand: worstBand([
        carLicenseExpiryBand,
        insuranceExpiryBand,
        residentialMawaqifExpiryBand,
        normalMawaqifExpiryBand,
      ]),
    };
  }

  async list(query: VehicleFiltersDto) {
    const page     = query.page     ?? 1;
    const pageSize = query.pageSize ?? 25;
    const today    = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Prisma.VehicleWhereInput = { isActive: true };

    if (query.vehicleType) where.vehicleType = query.vehicleType;
    if (query.companyId)   where.companyId   = query.companyId;
    if (query.plateNumber) where.plateNumber  = { contains: query.plateNumber, mode: 'insensitive' };
    if (query.q) {
      where.OR = [
        { plateNumber: { contains: query.q, mode: 'insensitive' } },
        { carMake:     { contains: query.q, mode: 'insensitive' } },
        { ownerName:   { contains: query.q, mode: 'insensitive' } },
        { driverName:  { contains: query.q, mode: 'insensitive' } },
      ];
    }

    // Expiry band filter — computed in application layer
    const [allItems, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { carLicenseExpiryDate: 'asc' },
        skip: (page - 1) * pageSize,
        take: query.expiryBand ? undefined : pageSize,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    const withBands = allItems.map((v) => this.addBands(v, today));

    if (query.expiryBand) {
      const filtered = withBands.filter(
        (v) =>
          v.carLicenseExpiryBand   === query.expiryBand ||
          v.insuranceExpiryBand    === query.expiryBand ||
          v.residentialMawaqifExpiryBand === query.expiryBand ||
          v.normalMawaqifExpiryBand === query.expiryBand,
      );
      const start = (page - 1) * pageSize;
      return {
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        pageSize,
      };
    }

    return { items: withBands, total, page, pageSize };
  }

  async create(actor: AuthUser, dto: CreateVehicleDto): Promise<VehicleWithBands> {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        tenantId:                    actor.tenantId,
        vehicleType:                 dto.vehicleType,
        ownerName:                   dto.ownerName,
        driverName:                  dto.driverName ?? null,
        carMake:                     dto.carMake,
        carModel:                    dto.carModel ?? null,
        plateEmirate:                dto.plateEmirate,
        plateCategory:               dto.plateCategory ?? null,
        plateNumber:                 dto.plateNumber,
        carLicenseNo:                dto.carLicenseNo,
        carLicenseExpiryDate:        new Date(dto.carLicenseExpiryDate),
        carLicenseAttachmentId:      dto.carLicenseAttachmentId ?? null,
        insuranceType:               dto.insuranceType,
        insurancePolicyNo:           dto.insurancePolicyNo ?? null,
        insuranceExpiryDate:         new Date(dto.insuranceExpiryDate),
        insuranceAttachmentId:       dto.insuranceAttachmentId ?? null,
        hasResidentialMawaqif:       dto.hasResidentialMawaqif ?? false,
        residentialMawaqifExpiryDate: dto.residentialMawaqifExpiryDate
          ? new Date(dto.residentialMawaqifExpiryDate)
          : null,
        hasNormalMawaqif:            dto.hasNormalMawaqif ?? false,
        normalMawaqifExpiryDate:     dto.normalMawaqifExpiryDate
          ? new Date(dto.normalMawaqifExpiryDate)
          : null,
        formAttachmentId:            dto.formAttachmentId ?? null,
        remarks:                     dto.remarks ?? null,
        createdBy:                   actor.id,
      } as Prisma.VehicleUncheckedCreateInput,
    });
    return this.addBands(vehicle);
  }

  async findOne(id: string): Promise<VehicleWithBands> {
    const v = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return this.addBands(v);
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleWithBands> {
    const existing = await this.prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Vehicle not found');

    const data: Prisma.VehicleUpdateInput = {
      vehicleType:                 dto.vehicleType,
      ownerName:                   dto.ownerName,
      driverName:                  dto.driverName,
      carMake:                     dto.carMake,
      carModel:                    dto.carModel,
      plateEmirate:                dto.plateEmirate,
      plateCategory:               dto.plateCategory,
      plateNumber:                 dto.plateNumber,
      carLicenseNo:                dto.carLicenseNo,
      carLicenseExpiryDate:        dto.carLicenseExpiryDate ? new Date(dto.carLicenseExpiryDate) : undefined,
      carLicenseAttachmentId:      dto.carLicenseAttachmentId,
      insuranceType:               dto.insuranceType,
      insurancePolicyNo:           dto.insurancePolicyNo,
      insuranceExpiryDate:         dto.insuranceExpiryDate ? new Date(dto.insuranceExpiryDate) : undefined,
      insuranceAttachmentId:       dto.insuranceAttachmentId,
      hasResidentialMawaqif:       dto.hasResidentialMawaqif,
      residentialMawaqifExpiryDate: dto.residentialMawaqifExpiryDate ? new Date(dto.residentialMawaqifExpiryDate) : undefined,
      hasNormalMawaqif:            dto.hasNormalMawaqif,
      normalMawaqifExpiryDate:     dto.normalMawaqifExpiryDate ? new Date(dto.normalMawaqifExpiryDate) : undefined,
      formAttachmentId:            dto.formAttachmentId,
      isActive:                    dto.isActive,
      remarks:                     dto.remarks,
    };

    const updated = await this.prisma.vehicle.update({ where: { id }, data });
    return this.addBands(updated);
  }

  async stats() {
    const rows = await this.prisma.vehicle.findMany({
      where: { isActive: true },
      select: {
        id: true,
        vehicleType: true,
        plateEmirate: true,
        carMake: true,
        plateNumber: true,
        carLicenseExpiryDate: true,
        insuranceExpiryDate: true,
        residentialMawaqifExpiryDate: true,
        normalMawaqifExpiryDate: true,
        hasResidentialMawaqif: true,
        hasNormalMawaqif: true,
        updatedAt: true,
      },
    });

    const byBand: Record<string, number> = { expired: 0, '7d': 0, '14d': 0, '30d': 0, valid: 0 };
    const byEmirate: Record<string, number> = {};
    const byType: Record<string, number> = { PRIVATE: 0, COMPANY: 0 };
    let expiringWithin30 = 0;

    const items = rows.map((r) => {
      const carLic   = computeExpiryBand(r.carLicenseExpiryDate);
      const ins      = computeExpiryBand(r.insuranceExpiryDate);
      const resMaw   = r.hasResidentialMawaqif ? computeExpiryBand(r.residentialMawaqifExpiryDate) : null;
      const norMaw   = r.hasNormalMawaqif      ? computeExpiryBand(r.normalMawaqifExpiryDate)      : null;
      const bands    = [carLic, ins, resMaw, norMaw].filter((b): b is ExpiryBand => b !== null);
      const worst    = bands.length ? worstBand(bands) : null;
      bands.forEach((b) => { byBand[b] = (byBand[b] ?? 0) + 1; });
      byEmirate[r.plateEmirate] = (byEmirate[r.plateEmirate] ?? 0) + 1;
      byType[r.vehicleType]      = (byType[r.vehicleType] ?? 0) + 1;
      if (worst && worst !== 'valid' && worst !== 'expired') expiringWithin30++;

      const minDays = Math.min(
        ...[r.carLicenseExpiryDate, r.insuranceExpiryDate]
          .filter((d): d is Date => !!d)
          .map((d) => Math.ceil((d.getTime() - Date.now()) / 86_400_000)),
      );
      return {
        id: r.id,
        label: `${r.carMake} – ${r.plateNumber}`,
        worst,
        daysUntilExpiry: Number.isFinite(minDays) ? minDays : null,
        updatedAt: r.updatedAt,
      };
    });

    const soonest = items
      .filter((i) => i.daysUntilExpiry !== null)
      .sort((a, b) => (a.daysUntilExpiry! - b.daysUntilExpiry!))
      .slice(0, 5);

    const recentlyUpdated = [...items]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5)
      .map((i) => ({ id: i.id, label: i.label, updatedAt: i.updatedAt }));

    return {
      total: rows.length,
      byType,
      byEmirate,
      byBand,
      expiringWithin30,
      soonest,
      recentlyUpdated,
    };
  }

  async softDelete(id: string) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Vehicle not found');
    return this.prisma.vehicle.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }

  async uploadAttachmentForVehicle(
    id: string,
    kind: 'car-license' | 'insurance' | 'form',
    file: AttachmentFile,
  ) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Vehicle not found');

    const uploadRoot = this.config.get('uploadDir', { infer: true }) ?? './uploads';
    const result = await uploadAttachment(file, uploadRoot, 'vehicle', id, kind);

    const fieldMap: Record<string, Prisma.VehicleUpdateInput> = {
      'car-license': { carLicenseAttachmentId: result.attachmentId },
      'insurance':   { insuranceAttachmentId:  result.attachmentId },
      'form':        { formAttachmentId:        result.attachmentId },
    };
    if (!fieldMap[kind]) throw new BadRequestException(`Unknown attachment kind: ${kind}`);

    await this.prisma.vehicle.update({ where: { id }, data: fieldMap[kind] });
    return result;
  }

  // ─── Bulk import ─────────────────────────────────────────────────────────

  async buildTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DocPilot';
    const ws = wb.addWorksheet('Vehicles');
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

    const platesSeen = new Set<string>();
    const rows: ParsedVehicleRow[] = [];

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row.hasValues) continue;

      const get = (label: string): string | undefined => {
        const idx = headers.findIndex((h) => h.includes(label.toLowerCase()));
        if (idx === -1) return undefined;
        const v = row.getCell(idx + 1).value;
        return v !== null && v !== undefined ? String(v).trim() : undefined;
      };

      const parsed: ParsedVehicleRow = {
        rowNumber: r,
        ownerName:    get('owner name'),
        driverName:   get('driver name'),
        carMake:      get('car make'),
        carModel:     get('car model'),
        plateEmirate: get('plate emirate'),
        plateCategory:get('plate category'),
        plateNumber:  get('plate number'),
        carLicenseNo: get('car license no'),
        carLicenseExpiryDate: get('car license expiry'),
        vehicleType:  get('vehicle type'),
        insuranceType:get('insurance type'),
        insurancePolicyNo: get('insurance policy'),
        insuranceExpiryDate: get('insurance expiry'),
        hasResidentialMawaqif: (get('has residential') ?? '').toUpperCase() === 'YES',
        residentialMawaqifExpiryDate: get('residential mawaqif expiry'),
        hasNormalMawaqif: (get('has normal') ?? '').toUpperCase() === 'YES',
        normalMawaqifExpiryDate: get('normal mawaqif expiry'),
        remarks: get('remarks'),
        errors: [],
        ok: true,
      };

      // Validation
      if (!parsed.ownerName) parsed.errors.push('ownerName required');
      if (!parsed.carMake)   parsed.errors.push('carMake required');
      if (!parsed.plateEmirate) parsed.errors.push('plateEmirate required');
      if (!parsed.plateNumber)  parsed.errors.push('plateNumber required');
      if (!parsed.carLicenseNo) parsed.errors.push('carLicenseNo required');
      if (!parsed.carLicenseExpiryDate) parsed.errors.push('carLicenseExpiryDate required');
      if (!parsed.insuranceExpiryDate)  parsed.errors.push('insuranceExpiryDate required');

      if (parsed.vehicleType && !Object.values(VehicleType).includes(parsed.vehicleType as VehicleType)) {
        parsed.errors.push(`vehicleType must be PRIVATE or COMPANY`);
      }
      if (parsed.insuranceType && !Object.values(InsuranceType).includes(parsed.insuranceType as InsuranceType)) {
        parsed.errors.push(`insuranceType must be COMPREHENSIVE or THIRD_PARTY`);
      }

      if (parsed.plateNumber) {
        if (platesSeen.has(parsed.plateNumber)) {
          parsed.errors.push(`Duplicate plate number ${parsed.plateNumber} in this file`);
        } else {
          platesSeen.add(parsed.plateNumber);
        }
      }

      parsed.ok = parsed.errors.length === 0;
      rows.push(parsed);
    }

    const validRows = rows.filter((r) => r.ok).length;
    return { headers, totalRows: rows.length, validRows, invalidRows: rows.length - validRows, rows };
  }

  async commit(actor: AuthUser, rows: ParsedVehicleRow[]) {
    const valid = rows.filter((r) => r.ok);
    let imported = 0;
    const failures: { rowNumber: number; reason: string }[] = [];

    for (const row of valid) {
      try {
        await this.prisma.vehicle.create({
          data: {
            tenantId:             actor.tenantId,
            vehicleType:          (row.vehicleType as VehicleType) ?? VehicleType.COMPANY,
            ownerName:            row.ownerName!,
            driverName:           row.driverName ?? null,
            carMake:              row.carMake!,
            carModel:             row.carModel ?? null,
            plateEmirate:         row.plateEmirate!,
            plateCategory:        row.plateCategory ?? null,
            plateNumber:          row.plateNumber!,
            carLicenseNo:         row.carLicenseNo!,
            carLicenseExpiryDate: new Date(row.carLicenseExpiryDate!),
            insuranceType:        (row.insuranceType as InsuranceType) ?? InsuranceType.COMPREHENSIVE,
            insurancePolicyNo:    row.insurancePolicyNo ?? null,
            insuranceExpiryDate:  new Date(row.insuranceExpiryDate!),
            hasResidentialMawaqif: row.hasResidentialMawaqif ?? false,
            residentialMawaqifExpiryDate: row.residentialMawaqifExpiryDate
              ? new Date(row.residentialMawaqifExpiryDate)
              : null,
            hasNormalMawaqif:     row.hasNormalMawaqif ?? false,
            normalMawaqifExpiryDate: row.normalMawaqifExpiryDate
              ? new Date(row.normalMawaqifExpiryDate)
              : null,
            remarks:              row.remarks ?? null,
            createdBy:            actor.id,
          } as Prisma.VehicleUncheckedCreateInput,
        });
        imported++;
      } catch (e) {
        failures.push({ rowNumber: row.rowNumber, reason: (e as Error).message });
      }
    }

    return { imported, skipped: rows.length - valid.length, failures };
  }
}
