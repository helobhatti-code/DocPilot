import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyDocType, DocStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { UploadedFile } from '@/common/pipes/file-validation.pipe';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CreateCompanyDocumentDto } from './dto/create-company-document.dto';
import { UpdateCompanyDocumentDto } from './dto/update-company-document.dto';
import { CompanyDocumentFiltersDto } from './dto/company-document-filters.dto';

export type ExpiryBand = 'valid' | '30d' | '14d' | '7d' | 'expired';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function computeExpiryBand(expiry: Date, today = new Date()): ExpiryBand {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const e = new Date(expiry); e.setHours(0, 0, 0, 0);
  const diffDays = Math.round((e.getTime() - t.getTime()) / (24 * 3600 * 1000));
  if (diffDays < 0)  return 'expired';
  if (diffDays <= 7)  return '7d';
  if (diffDays <= 14) return '14d';
  if (diffDays <= 30) return '30d';
  return 'valid';
}

export function deriveDocStatus(expiry: Date, today = new Date()): DocStatus {
  const band = computeExpiryBand(expiry, today);
  if (band === 'expired') return DocStatus.EXPIRED;
  if (band === '7d' || band === '14d' || band === '30d') return DocStatus.EXPIRING_SOON;
  return DocStatus.VALID;
}

function attachExpiryBands(doc: Record<string, unknown>): Record<string, unknown> {
  const expiry = doc.expiryDate instanceof Date ? doc.expiryDate : new Date(doc.expiryDate as string);
  const mainBand = computeExpiryBand(expiry);

  const result: Record<string, unknown> = { ...doc, expiryBand: mainBand };

  if (doc.docType === CompanyDocType.CIVIL_DEFENSE && doc.metadata) {
    const meta = doc.metadata as Record<string, unknown>;
    result['mainExpiryBand'] = mainBand;
    if (meta.hassantukExpiryDate) {
      const hDate = new Date(meta.hassantukExpiryDate as string);
      result['hassantukExpiryBand'] = Number.isNaN(hDate.getTime())
        ? null
        : computeExpiryBand(hDate);
    }
  }

  return result;
}

function expiryBandDateRange(band: string, today = new Date()): { gte?: Date; lt?: Date } | null {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const add = (days: number) => { const d = new Date(t); d.setDate(d.getDate() + days); return d; };
  switch (band) {
    case 'expired': return { lt: t };
    case '7d':      return { gte: t,       lt: add(8)  };
    case '14d':     return { gte: add(8),  lt: add(15) };
    case '30d':     return { gte: add(15), lt: add(31) };
    case 'valid':   return { gte: add(31) };
    default:        return null;
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CompanyDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(actor: AuthUser, dto: CreateCompanyDocumentDto) {
    const expiry = new Date(dto.expiryDate);
    if (Number.isNaN(expiry.getTime())) throw new BadRequestException('Invalid expiryDate');

    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    const doc = await this.prisma.companyDocument.create({
      data: {
        tenantId:  actor.tenantId,
        companyId: dto.companyId,
        docType:   dto.docType,
        docName:   dto.docName,
        docNumber: dto.docNumber,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expiryDate: expiry,
        status:    deriveDocStatus(expiry),
        attachmentId: dto.attachmentId,
        metadata:  dto.metadata as Prisma.InputJsonValue ?? Prisma.JsonNull,
        remarks:   dto.remarks,
        createdBy: actor.id,
      } as Prisma.CompanyDocumentUncheckedCreateInput,
    });

    return attachExpiryBands(doc as unknown as Record<string, unknown>);
  }

  async stats() {
    const rows = await this.prisma.companyDocument.findMany({
      where: { isActive: true },
      select: { id: true, docType: true, docName: true, expiryDate: true, status: true },
    });

    const byType: Record<string, number> = {};
    const byBand: Record<string, number> = { expired: 0, '7d': 0, '14d': 0, '30d': 0, valid: 0 };
    let valid = 0, expiringSoon = 0, expired = 0;

    const items = rows.map((r) => {
      byType[r.docType] = (byType[r.docType] ?? 0) + 1;
      const days = Math.ceil((r.expiryDate.getTime() - Date.now()) / 86_400_000);
      let band: 'expired' | '7d' | '14d' | '30d' | 'valid' = 'valid';
      if (days < 0) { band = 'expired'; expired++; }
      else if (days <= 7) { band = '7d'; expiringSoon++; }
      else if (days <= 14) { band = '14d'; expiringSoon++; }
      else if (days <= 30) { band = '30d'; expiringSoon++; }
      else { valid++; }
      byBand[band] = (byBand[band] ?? 0) + 1;
      return { id: r.id, label: r.docName, daysUntilExpiry: days };
    });

    const soonest = [...items]
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
      .slice(0, 5);

    return {
      total: rows.length,
      valid,
      expiringSoon,
      expired,
      byType,
      byBand,
      soonest,
    };
  }

  async list(query: CompanyDocumentFiltersDto) {
    const page     = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.CompanyDocumentWhereInput = { isActive: true };

    if (query.docType)   where.docType = query.docType;
    if (query.companyId) where.companyId = query.companyId;
    if (query.status?.length) where.status = { in: query.status };
    if (query.expiryBand) {
      const range = expiryBandDateRange(query.expiryBand);
      if (range) where.expiryDate = range;
    }
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { docName:   { contains: q, mode: 'insensitive' } },
        { docNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [raw, total] = await this.prisma.$transaction([
      this.prisma.companyDocument.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { expiryDate: 'asc' },
        include: { company: { select: { id: true, name: true, code: true } } },
      }),
      this.prisma.companyDocument.count({ where }),
    ]);

    const items = raw.map((d) => attachExpiryBands(d as unknown as Record<string, unknown>));
    return { items, total, page, pageSize };
  }

  async detail(id: string) {
    const doc = await this.prisma.companyDocument.findFirst({
      where: { id, isActive: true },
      include: { company: { select: { id: true, name: true, code: true } } },
    });
    if (!doc) throw new NotFoundException('Company document not found');
    return attachExpiryBands(doc as unknown as Record<string, unknown>);
  }

  async update(id: string, dto: UpdateCompanyDocumentDto) {
    const existing = await this.prisma.companyDocument.findFirst({
      where: { id, isActive: true },
      select: { id: true, docType: true },
    });
    if (!existing) throw new NotFoundException('Company document not found');

    // Inject docType into dto so MetadataShapeConstraint has access if needed
    if (!dto.docType) dto.docType = existing.docType;

    const expiry = dto.expiryDate ? new Date(dto.expiryDate) : undefined;
    const updated = await this.prisma.companyDocument.update({
      where: { id },
      data: {
        docName:     dto.docName,
        docNumber:   dto.docNumber,
        issueDate:   dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate:  expiry,
        status:      expiry ? deriveDocStatus(expiry) : dto.status,
        attachmentId: dto.attachmentId,
        metadata:    dto.metadata !== undefined
          ? (dto.metadata as Prisma.InputJsonValue)
          : undefined,
        remarks:     dto.remarks,
        isActive:    dto.isActive,
      } as Prisma.CompanyDocumentUpdateInput,
    });

    return attachExpiryBands(updated as unknown as Record<string, unknown>);
  }

  async remove(id: string) {
    const existing = await this.prisma.companyDocument.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Company document not found');

    return this.prisma.companyDocument.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async renew(actor: AuthUser, id: string, dto: CreateCompanyDocumentDto) {
    const existing = await this.prisma.companyDocument.findFirst({
      where: { id, isActive: true },
      select: { id: true, docType: true, companyId: true, tenantId: true },
    });
    if (!existing) throw new NotFoundException('Company document not found');

    const expiry = new Date(dto.expiryDate);
    if (Number.isNaN(expiry.getTime())) throw new BadRequestException('Invalid expiryDate');

    return this.prisma.$transaction(async (tx) => {
      // Mark old doc as UNDER_RENEWAL
      await tx.companyDocument.update({
        where: { id },
        data: { status: DocStatus.UNDER_RENEWAL },
      });

      // Create new doc linked to old
      const newDoc = await tx.companyDocument.create({
        data: {
          tenantId:     existing.tenantId,
          companyId:    dto.companyId ?? existing.companyId,
          docType:      existing.docType,
          docName:      dto.docName,
          docNumber:    dto.docNumber,
          issueDate:    dto.issueDate ? new Date(dto.issueDate) : null,
          expiryDate:   expiry,
          status:       deriveDocStatus(expiry),
          attachmentId: dto.attachmentId,
          metadata:     dto.metadata as Prisma.InputJsonValue ?? Prisma.JsonNull,
          remarks:      dto.remarks,
          createdBy:    actor.id,
          previousDocId: id,
        } as Prisma.CompanyDocumentUncheckedCreateInput,
      });

      return attachExpiryBands(newDoc as unknown as Record<string, unknown>);
    });
  }

  async uploadAttachment(actor: AuthUser, id: string, file: UploadedFile) {
    const existing = await this.prisma.companyDocument.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Company document not found');

    if (!file) throw new BadRequestException('No file provided');

    const MAX_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`File exceeds 2MB limit (${file.size} bytes)`);
    }

    const ext  = (file.originalname.split('.').pop() ?? '').toLowerCase();
    const mime = file.mimetype.toLowerCase();
    const ALLOWED_EXT  = new Set(['jpg', 'jpeg', 'pdf']);
    const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'application/pdf']);

    if (!ALLOWED_EXT.has(ext))  throw new BadRequestException(`Extension .${ext} not allowed`);
    if (!ALLOWED_MIME.has(mime)) throw new BadRequestException(`MIME type ${mime} not allowed`);

    const isPdf = mime === 'application/pdf';
    const compressed = isPdf
      ? await this.compressPdf(file.buffer)
      : await this.compressJpeg(file.buffer);

    const uploadRoot = this.config.get<string>('uploadDir') ?? './uploads';
    const targetDir  = path.join(uploadRoot, 'company-doc', id);
    await fs.mkdir(targetDir, { recursive: true });

    const outExt   = isPdf ? 'pdf' : 'jpg';
    const fileName = `${randomUUID()}.${outExt}`;
    const filePath = path.join(targetDir, fileName);
    await fs.writeFile(filePath, compressed);

    const fileUrl = path.join('/uploads', 'company-doc', id, fileName).replace(/\\/g, '/');

    const updated = await this.prisma.companyDocument.update({
      where: { id },
      data: { attachmentId: fileUrl },
    });

    return {
      fileUrl,
      fileName,
      mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
      ...attachExpiryBands(updated as unknown as Record<string, unknown>),
    };
  }

  private async compressJpeg(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer).jpeg({ quality: 75 }).toBuffer();
  }

  private async compressPdf(buffer: Buffer): Promise<Buffer> {
    const doc = await PDFDocument.load(buffer);
    const out  = await doc.save({ useObjectStreams: true });
    return Buffer.from(out);
  }
}
