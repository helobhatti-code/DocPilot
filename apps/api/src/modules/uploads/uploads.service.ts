import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentType } from '@prisma/client';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { UploadedFile } from '@/common/pipes/file-validation.pipe';
import { PrismaService } from '@/common/prisma/prisma.service';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'application/pdf']);
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'pdf']);
const MAX_BYTES = 2 * 1024 * 1024;

export interface UploadResult {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  compressionRatio: number;
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    user: AuthUser,
    file: UploadedFile,
    type: DocumentType,
    entityId?: string,
  ): Promise<UploadResult> {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `File exceeds 2MB limit (${file.size} bytes)`,
      );
    }
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(
        `Extension .${ext} not allowed (jpeg/pdf only)`,
      );
    }
    const mime = file.mimetype.toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(`MIME type ${file.mimetype} not allowed`);
    }

    const isPdf = mime === 'application/pdf';
    const originalSize = file.size;
    const compressed = isPdf
      ? await this.compressPdf(file.buffer)
      : await this.compressJpeg(file.buffer);

    const uploadRoot = this.config.get<string>('uploadDir') ?? './uploads';
    const targetDir = path.join(uploadRoot, user.tenantId);
    await fs.mkdir(targetDir, { recursive: true });

    const outExt = isPdf ? 'pdf' : 'jpg';
    const fileName = `${randomUUID()}.${outExt}`;
    const filePath = path.join(targetDir, fileName);
    await fs.writeFile(filePath, compressed);

    const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
    const fileUrl = path
      .join('/uploads', user.tenantId, fileName)
      .replace(/\\/g, '/');

    const compressionRatio =
      originalSize > 0
        ? Math.round((1 - compressed.length / originalSize) * 1000) / 1000
        : 0;

    await this.prisma.document.create({
      data: {
        tenantId: user.tenantId,
        gatePassId: entityId ?? null,
        type,
        fileUrl,
        fileName,
        fileSizeBytes: compressed.length,
        mimeType,
        uploadedById: user.id,
      },
    });

    return { fileUrl, fileName, mimeType, compressionRatio };
  }

  private async compressJpeg(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer).jpeg({ quality: 75 }).toBuffer();
  }

  private async compressPdf(buffer: Buffer): Promise<Buffer> {
    const doc = await PDFDocument.load(buffer);
    const out = await doc.save({ useObjectStreams: true });
    return Buffer.from(out);
  }
}
