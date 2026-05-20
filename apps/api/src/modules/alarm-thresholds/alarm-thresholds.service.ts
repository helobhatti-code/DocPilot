import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { UpsertAlarmThresholdDto } from './dto/upsert-alarm-threshold.dto';

// All doc kinds produced by expiry_items_v
export const ALL_DOC_KINDS: readonly string[] = [
  'GATE_PASS',
  'CAR_LICENSE', 'VEHICLE_INSURANCE', 'RESIDENTIAL_MAWAQIF', 'NORMAL_MAWAQIF',
  'OPERATOR_LICENSE', 'INSPECTION_CERT', 'RTA_REGISTRATION', 'LIFTING_TEST',
  'MACHINERY_INSURANCE', 'CIVIL_DEFENSE',
  'VISA', 'EMIRATES_ID', 'LABOR_CARD', 'PASSPORT',
  'TRADE_LICENSE', 'ESTABLISHMENT_CARD', 'CLASSIFICATION',
  'POWER_OF_ATTORNEY', 'OFFICE_TENANCY',
  'HASSANTUK',
] as const;

export const DEFAULT_THRESHOLDS = { band1Days: 30, band2Days: 14, band3Days: 7 } as const;

export interface ThresholdRow {
  docKind:      string;
  band1Days:    number;
  band2Days:    number;
  band3Days:    number;
  isOverridden: boolean;
  updatedAt:    Date | null;
}

@Injectable()
export class AlarmThresholdsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<ThresholdRow[]> {
    const configs = await this.prisma.alarmThresholdConfig.findMany({
      where: { tenantId, isActive: true },
      select: { docKind: true, band1Days: true, band2Days: true, band3Days: true, updatedAt: true },
    });
    const map = new Map(configs.map((c) => [c.docKind, c]));

    return ALL_DOC_KINDS.map((docKind) => {
      const ov = map.get(docKind);
      return {
        docKind,
        band1Days:    ov?.band1Days    ?? DEFAULT_THRESHOLDS.band1Days,
        band2Days:    ov?.band2Days    ?? DEFAULT_THRESHOLDS.band2Days,
        band3Days:    ov?.band3Days    ?? DEFAULT_THRESHOLDS.band3Days,
        isOverridden: !!ov,
        updatedAt:    ov?.updatedAt    ?? null,
      };
    });
  }

  async upsert(
    tenantId: string,
    docKind:  string,
    dto:      UpsertAlarmThresholdDto,
    actorId:  string,
  ) {
    if (!ALL_DOC_KINDS.includes(docKind)) {
      throw new NotFoundException(`Unknown docKind: ${docKind}`);
    }
    if (dto.band1Days <= dto.band2Days || dto.band2Days <= dto.band3Days || dto.band3Days <= 0) {
      throw new BadRequestException('band1Days > band2Days > band3Days > 0 required');
    }

    const result = await this.prisma.alarmThresholdConfig.upsert({
      where:  { tenantId_docKind: { tenantId, docKind } },
      create: { tenantId, docKind, band1Days: dto.band1Days, band2Days: dto.band2Days, band3Days: dto.band3Days, updatedBy: actorId },
      update: { band1Days: dto.band1Days, band2Days: dto.band2Days, band3Days: dto.band3Days, updatedBy: actorId },
      select: { id: true, docKind: true, band1Days: true, band2Days: true, band3Days: true, updatedAt: true },
    });
    return { ...result, isOverridden: true };
  }

  async remove(tenantId: string, docKind: string) {
    if (!ALL_DOC_KINDS.includes(docKind)) {
      throw new NotFoundException(`Unknown docKind: ${docKind}`);
    }
    await this.prisma.alarmThresholdConfig.deleteMany({
      where: { tenantId, docKind },
    });
    return { docKind, ...DEFAULT_THRESHOLDS, isOverridden: false };
  }
}
