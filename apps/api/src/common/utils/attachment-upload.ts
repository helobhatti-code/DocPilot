import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'application/pdf']);
const ALLOWED_EXT  = new Set(['jpg', 'jpeg', 'pdf']);
const MAX_BYTES    = 2 * 1024 * 1024;

export interface AttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentUploadResult {
  fileUrl:          string;
  attachmentId:     string; // same as fileUrl — stored in *AttachmentId fields
  mimeType:         string;
  compressionRatio: number;
}

/**
 * Validate, compress, and persist an attachment file for non-gate-pass entities
 * (vehicles, machinery).  Files are written to:
 *   {uploadRoot}/{entityType}/{entityId}/{attachmentKind}/{uuid}.{ext}
 *
 * Returns a fileUrl (the public path) that is stored directly in the
 * `*AttachmentId` field on the parent entity.
 */
export async function uploadAttachment(
  file: AttachmentFile,
  uploadRoot: string,
  entityType: string,
  entityId: string,
  attachmentKind: string,
): Promise<AttachmentUploadResult> {
  if (!file) throw new BadRequestException('No file provided');
  if (file.size > MAX_BYTES) {
    throw new BadRequestException(`File exceeds 2MB limit (${file.size} bytes)`);
  }

  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new BadRequestException(`Extension .${ext} not allowed (jpeg/pdf only)`);
  }
  const mime = file.mimetype.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new BadRequestException(`MIME type ${file.mimetype} not allowed`);
  }

  const originalSize = file.size;
  const isPdf = mime === 'application/pdf';
  const compressed = isPdf
    ? await compressPdf(file.buffer)
    : await compressJpeg(file.buffer);

  const targetDir = path.join(uploadRoot, entityType, entityId, attachmentKind);
  await fs.mkdir(targetDir, { recursive: true });

  const outExt = isPdf ? 'pdf' : 'jpg';
  const fileName = `${randomUUID()}.${outExt}`;
  const filePath = path.join(targetDir, fileName);
  await fs.writeFile(filePath, compressed);

  const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
  const fileUrl  = path
    .join('/uploads', entityType, entityId, attachmentKind, fileName)
    .replace(/\\/g, '/');

  const compressionRatio =
    originalSize > 0
      ? Math.round((1 - compressed.length / originalSize) * 1000) / 1000
      : 0;

  return { fileUrl, attachmentId: fileUrl, mimeType, compressionRatio };
}

async function compressJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).jpeg({ quality: 75 }).toBuffer();
}

async function compressPdf(buffer: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(buffer);
  const out  = await doc.save({ useObjectStreams: true });
  return Buffer.from(out);
}
