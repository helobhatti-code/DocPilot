import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeavyMachinery, MachineryStatus, Prisma } from '@prisma/client';
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
import { CreateMachineryDto } from './dto/create-machinery.dto';
import { UpdateMachineryDto } from './dto/update-machinery.dto';
import { MachineryFiltersDto } from './dto/machinery-filters.dto';

const ATTACHMENT_FIELDS: Record<string, keyof Prisma.HeavyMachineryUpdateInput> = {
  'operator-license':   'operatorLicenseAttachmentId',
  'inspection':         'inspectionAttachmentId',
  'rta-registration':   'rtaRegistrationAttachmentId',
  'lifting-test':       'liftingTestAttachmentId',
  'insurance':          'insuranceAttachmentId',
  'civil-defense':      'civilDefenseAttachmentId',
  'photo':              'photoAttachmentId',
};
export type MachineryAttachmentKind = keyof typeof ATTACHMENT_FIELDS;

export type MachineryWithBands = HeavyMachinery & {
  operatorLicenseExpiryBand:   ExpiryBand | null;
  inspectionExpiryBand:        ExpiryBand | null;
  rtaRegistrationExpiryBand:   ExpiryBand | null;
  liftingTestExpiryBand:       ExpiryBand | null;
  insuranceExpiryBand:         ExpiryBand | null;
  civilDefenseExpiryBand:      ExpiryBand | null;
  worstExpiryBand:             ExpiryBand;
};

@Injectable()
export class HeavyMachineryService {
  private readonly logger = new Logger(HeavyMachineryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private addBands(m: HeavyMachinery, today = new Date()): MachineryWithBands {
    const operatorLicenseExpiryBand  = computeExpiryBand(m.operatorLicenseExpiryDate, today);
    const inspectionExpiryBand       = computeExpiryBand(m.inspectionExpiryDate, today);
    const rtaRegistrationExpiryBand  = computeExpiryBand(m.rtaRegistrationExpiryDate, today);
    const liftingTestExpiryBand      = computeExpiryBand(m.liftingTestExpiryDate, today);
    const insuranceExpiryBand        = computeExpiryBand(m.insuranceExpiryDate, today);
    const civilDefenseExpiryBand     = computeExpiryBand(m.civilDefenseExpiryDate, today);

    return {
      ...m,
      operatorLicenseExpiryBand,
      inspectionExpiryBand,
      rtaRegistrationExpiryBand,
      liftingTestExpiryBand,
      insuranceExpiryBand,
      civilDefenseExpiryBand,
      worstExpiryBand: worstBand([
        operatorLicenseExpiryBand,
        inspectionExpiryBand,
        rtaRegistrationExpiryBand,
        liftingTestExpiryBand,
        insuranceExpiryBand,
        civilDefenseExpiryBand,
      ]),
    };
  }

  async list(query: MachineryFiltersDto) {
    const page     = query.page     ?? 1;
    const pageSize = query.pageSize ?? 25;
    const today    = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Prisma.HeavyMachineryWhereInput = { isActive: true };
    if (query.status)    where.status    = query.status;
    if (query.companyId) where.companyId = query.companyId;
    if (query.q) {
      where.OR = [
        { machineType:     { contains: query.q, mode: 'insensitive' } },
        { make:            { contains: query.q, mode: 'insensitive' } },
        { serialNumber:    { contains: query.q, mode: 'insensitive' } },
        { assignedOperator:{ contains: query.q, mode: 'insensitive' } },
      ];
    }

    const allItems = await this.prisma.heavyMachinery.findMany({ where, orderBy: { createdAt: 'desc' } });
    const total    = allItems.length;
    const withBands = allItems.map((m) => this.addBands(m, today));

    if (query.expiryBand) {
      const filtered = withBands.filter((m) =>
        m.operatorLicenseExpiryBand  === query.expiryBand ||
        m.inspectionExpiryBand       === query.expiryBand ||
        m.rtaRegistrationExpiryBand  === query.expiryBand ||
        m.liftingTestExpiryBand      === query.expiryBand ||
        m.insuranceExpiryBand        === query.expiryBand ||
        m.civilDefenseExpiryBand     === query.expiryBand,
      );
      const start = (page - 1) * pageSize;
      return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
    }

    const start = (page - 1) * pageSize;
    return { items: withBands.slice(start, start + pageSize), total, page, pageSize };
  }

  async create(actor: AuthUser, dto: CreateMachineryDto): Promise<MachineryWithBands> {
    const m = await this.prisma.heavyMachinery.create({
      data: {
        tenantId:                    actor.tenantId,
        machineType:                 dto.machineType,
        make:                        dto.make,
        model:                       dto.model ?? null,
        manufactureYear:             dto.manufactureYear ?? null,
        serialNumber:                dto.serialNumber,
        plateNumber:                 dto.plateNumber ?? null,
        assignedOperator:            dto.assignedOperator ?? null,
        currentLocation:             dto.currentLocation ?? null,
        projectSite:                 dto.projectSite ?? null,
        status:                      dto.status ?? MachineryStatus.ACTIVE,
        operatorLicenseNo:           dto.operatorLicenseNo ?? null,
        operatorLicenseExpiryDate:   dto.operatorLicenseExpiryDate ? new Date(dto.operatorLicenseExpiryDate) : null,
        operatorLicenseAttachmentId: dto.operatorLicenseAttachmentId ?? null,
        inspectionCertificateNo:     dto.inspectionCertificateNo ?? null,
        inspectionExpiryDate:        dto.inspectionExpiryDate ? new Date(dto.inspectionExpiryDate) : null,
        inspectionAttachmentId:      dto.inspectionAttachmentId ?? null,
        rtaRegistrationNo:           dto.rtaRegistrationNo ?? null,
        rtaRegistrationExpiryDate:   dto.rtaRegistrationExpiryDate ? new Date(dto.rtaRegistrationExpiryDate) : null,
        rtaRegistrationAttachmentId: dto.rtaRegistrationAttachmentId ?? null,
        liftingTestCertificateNo:    dto.liftingTestCertificateNo ?? null,
        liftingTestExpiryDate:       dto.liftingTestExpiryDate ? new Date(dto.liftingTestExpiryDate) : null,
        liftingTestAttachmentId:     dto.liftingTestAttachmentId ?? null,
        insuranceType:               dto.insuranceType ?? null,
        insuranceExpiryDate:         dto.insuranceExpiryDate ? new Date(dto.insuranceExpiryDate) : null,
        insuranceAttachmentId:       dto.insuranceAttachmentId ?? null,
        civilDefenseExpiryDate:      dto.civilDefenseExpiryDate ? new Date(dto.civilDefenseExpiryDate) : null,
        civilDefenseAttachmentId:    dto.civilDefenseAttachmentId ?? null,
        photoAttachmentId:           dto.photoAttachmentId ?? null,
        remarks:                     dto.remarks ?? null,
        createdBy:                   actor.id,
      } as Prisma.HeavyMachineryUncheckedCreateInput,
    });
    return this.addBands(m);
  }

  async findOne(id: string): Promise<MachineryWithBands> {
    const m = await this.prisma.heavyMachinery.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Heavy machinery not found');
    return this.addBands(m);
  }

  async update(id: string, dto: UpdateMachineryDto): Promise<MachineryWithBands> {
    const existing = await this.prisma.heavyMachinery.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Heavy machinery not found');

    const data: Prisma.HeavyMachineryUpdateInput = {
      machineType:                 dto.machineType,
      make:                        dto.make,
      model:                       dto.model,
      manufactureYear:             dto.manufactureYear,
      serialNumber:                dto.serialNumber,
      plateNumber:                 dto.plateNumber,
      assignedOperator:            dto.assignedOperator,
      currentLocation:             dto.currentLocation,
      projectSite:                 dto.projectSite,
      status:                      dto.status,
      operatorLicenseNo:           dto.operatorLicenseNo,
      operatorLicenseExpiryDate:   dto.operatorLicenseExpiryDate ? new Date(dto.operatorLicenseExpiryDate) : undefined,
      operatorLicenseAttachmentId: dto.operatorLicenseAttachmentId,
      inspectionCertificateNo:     dto.inspectionCertificateNo,
      inspectionExpiryDate:        dto.inspectionExpiryDate ? new Date(dto.inspectionExpiryDate) : undefined,
      inspectionAttachmentId:      dto.inspectionAttachmentId,
      rtaRegistrationNo:           dto.rtaRegistrationNo,
      rtaRegistrationExpiryDate:   dto.rtaRegistrationExpiryDate ? new Date(dto.rtaRegistrationExpiryDate) : undefined,
      rtaRegistrationAttachmentId: dto.rtaRegistrationAttachmentId,
      liftingTestCertificateNo:    dto.liftingTestCertificateNo,
      liftingTestExpiryDate:       dto.liftingTestExpiryDate ? new Date(dto.liftingTestExpiryDate) : undefined,
      liftingTestAttachmentId:     dto.liftingTestAttachmentId,
      insuranceType:               dto.insuranceType,
      insuranceExpiryDate:         dto.insuranceExpiryDate ? new Date(dto.insuranceExpiryDate) : undefined,
      insuranceAttachmentId:       dto.insuranceAttachmentId,
      civilDefenseExpiryDate:      dto.civilDefenseExpiryDate ? new Date(dto.civilDefenseExpiryDate) : undefined,
      civilDefenseAttachmentId:    dto.civilDefenseAttachmentId,
      photoAttachmentId:           dto.photoAttachmentId,
      isActive:                    dto.isActive,
      remarks:                     dto.remarks,
    };

    const updated = await this.prisma.heavyMachinery.update({ where: { id }, data });
    return this.addBands(updated);
  }

  async stats() {
    const rows = await this.prisma.heavyMachinery.findMany({
      where: { isActive: true },
      select: {
        id: true,
        make: true,
        machineType: true,
        serialNumber: true,
        status: true,
        projectSite: true,
        operatorLicenseExpiryDate: true,
        inspectionExpiryDate: true,
        rtaRegistrationExpiryDate: true,
        liftingTestExpiryDate: true,
        insuranceExpiryDate: true,
        civilDefenseExpiryDate: true,
      },
    });

    const byStatus: Record<string, number> = { ACTIVE: 0, IDLE: 0, MAINTENANCE: 0, OUT_OF_SERVICE: 0 };
    const byBand: Record<string, number> = { expired: 0, '7d': 0, '14d': 0, '30d': 0, valid: 0 };
    const bySite: Record<string, number> = {};
    let expiringWithin30 = 0;

    const items = rows.map((r) => {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      const site = r.projectSite ?? 'Unassigned';
      bySite[site] = (bySite[site] ?? 0) + 1;

      const allDates = [
        r.operatorLicenseExpiryDate,
        r.inspectionExpiryDate,
        r.rtaRegistrationExpiryDate,
        r.liftingTestExpiryDate,
        r.insuranceExpiryDate,
        r.civilDefenseExpiryDate,
      ];
      const bands = allDates
        .map((d) => computeExpiryBand(d))
        .filter((b): b is ExpiryBand => b !== null);
      bands.forEach((b) => { byBand[b] = (byBand[b] ?? 0) + 1; });
      const worst = bands.length ? worstBand(bands) : null;
      if (worst && worst !== 'valid' && worst !== 'expired') expiringWithin30++;

      const days = allDates
        .filter((d): d is Date => !!d)
        .map((d) => Math.ceil((d.getTime() - Date.now()) / 86_400_000));
      const minDays = days.length ? Math.min(...days) : null;

      return {
        id: r.id,
        label: `${r.make} ${r.machineType} #${r.serialNumber}`,
        worst,
        daysUntilExpiry: minDays,
      };
    });

    const soonest = items
      .filter((i) => i.daysUntilExpiry !== null)
      .sort((a, b) => (a.daysUntilExpiry! - b.daysUntilExpiry!))
      .slice(0, 5);

    return {
      total: rows.length,
      active: byStatus.ACTIVE ?? 0,
      idleOrMaintenance: (byStatus.IDLE ?? 0) + (byStatus.MAINTENANCE ?? 0),
      byStatus,
      byBand,
      bySite,
      expiringWithin30,
      soonest,
    };
  }

  async softDelete(id: string) {
    const existing = await this.prisma.heavyMachinery.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Heavy machinery not found');
    return this.prisma.heavyMachinery.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }

  async uploadAttachmentForMachinery(id: string, kind: string, file: AttachmentFile) {
    const existing = await this.prisma.heavyMachinery.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Heavy machinery not found');

    const field = ATTACHMENT_FIELDS[kind];
    if (!field) throw new BadRequestException(`Unknown attachment kind: ${kind}`);

    const uploadRoot = this.config.get('uploadDir', { infer: true }) ?? './uploads';
    const result     = await uploadAttachment(file, uploadRoot, 'machinery', id, kind);

    await this.prisma.heavyMachinery.update({
      where: { id },
      data: { [field]: result.attachmentId },
    });
    return result;
  }

  async buildTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DocPilot';
    const ws = wb.addWorksheet('Heavy Machinery');
    ws.addRow([
      'Machine Type', 'Make', 'Model', 'Manufacture Year', 'Serial Number',
      'Plate Number', 'Assigned Operator', 'Current Location', 'Project Site',
      'Status (ACTIVE/IDLE/MAINTENANCE/OUT_OF_SERVICE)',
      'Operator License No', 'Operator License Expiry (YYYY-MM-DD)',
      'Inspection Certificate No', 'Inspection Expiry (YYYY-MM-DD)',
      'RTA Registration No', 'RTA Expiry (YYYY-MM-DD)',
      'Lifting Test Certificate No', 'Lifting Test Expiry (YYYY-MM-DD)',
      'Insurance Type (COMPREHENSIVE/THIRD_PARTY)', 'Insurance Expiry (YYYY-MM-DD)',
      'Civil Defense Expiry (YYYY-MM-DD)', 'Remarks',
    ]).font = { bold: true };
    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
  }
}
