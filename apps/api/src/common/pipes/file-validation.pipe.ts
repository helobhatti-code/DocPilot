import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'application/pdf']);
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'pdf']);
const MAX_BYTES = 2 * 1024 * 1024;

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class FileValidationPipe implements PipeTransform<UploadedFile, UploadedFile> {
  transform(file: UploadedFile): UploadedFile {
    if (!file) throw new BadRequestException('No file provided');

    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `File exceeds 2MB limit (${file.size} bytes)`,
      );
    }

    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(`Extension .${ext} not allowed (jpeg/pdf only)`);
    }
    if (!ALLOWED_MIME.has(file.mimetype.toLowerCase())) {
      throw new BadRequestException(`MIME type ${file.mimetype} not allowed`);
    }

    // Magic-byte sniff: defends against extension/MIME spoofing.
    if (!this.matchesMagicBytes(file)) {
      throw new BadRequestException('File contents do not match declared type');
    }

    return file;
  }

  private matchesMagicBytes(file: UploadedFile): boolean {
    const b = file.buffer;
    if (!b || b.length < 4) return false;
    if (file.mimetype.toLowerCase() === 'application/pdf') {
      return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
    }
    return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff; // JPEG SOI
  }
}
