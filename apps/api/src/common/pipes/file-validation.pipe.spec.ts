import { BadRequestException } from '@nestjs/common';
import { FileValidationPipe, UploadedFile } from './file-validation.pipe';

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const make = (over: Partial<UploadedFile>): UploadedFile => ({
  originalname: 'file.jpg',
  mimetype: 'image/jpeg',
  size: 1024,
  buffer: Buffer.concat([JPEG_MAGIC, Buffer.alloc(8)]),
  ...over,
});

describe('FileValidationPipe', () => {
  const pipe = new FileValidationPipe();

  it('accepts a well-formed JPEG', () => {
    expect(() => pipe.transform(make({}))).not.toThrow();
  });

  it('accepts a well-formed PDF', () => {
    expect(() =>
      pipe.transform(make({
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.concat([PDF_MAGIC, Buffer.alloc(8)]),
      })),
    ).not.toThrow();
  });

  it('rejects when no file is provided', () => {
    expect(() => pipe.transform(undefined as unknown as UploadedFile)).toThrow(
      BadRequestException,
    );
  });

  it('rejects files larger than 2MB', () => {
    expect(() =>
      pipe.transform(
        make({ size: 3 * 1024 * 1024, buffer: Buffer.concat([JPEG_MAGIC, Buffer.alloc(16)]) }),
      ),
    ).toThrow(/2MB/);
  });

  it('rejects disallowed extensions (e.g. .png)', () => {
    expect(() =>
      pipe.transform(make({ originalname: 'photo.png', mimetype: 'image/png' })),
    ).toThrow(/Extension/);
  });

  it('rejects mismatched MIME type', () => {
    expect(() =>
      pipe.transform(
        make({
          originalname: 'doc.pdf',
          mimetype: 'application/octet-stream',
          buffer: Buffer.concat([PDF_MAGIC, Buffer.alloc(4)]),
        }),
      ),
    ).toThrow(/MIME/);
  });

  it('rejects spoofed extension when magic bytes do not match', () => {
    // Looks like a JPEG by name and MIME, but contents are not.
    expect(() =>
      pipe.transform(
        make({
          originalname: 'spoof.jpg',
          mimetype: 'image/jpeg',
          buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]),
        }),
      ),
    ).toThrow(/contents do not match/i);
  });

  it('rejects PDFs whose contents are not a real PDF', () => {
    expect(() =>
      pipe.transform(
        make({
          originalname: 'fake.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]),
        }),
      ),
    ).toThrow(/contents do not match/i);
  });

  it('rejects zero-byte / truncated files', () => {
    expect(() =>
      pipe.transform(
        make({
          buffer: Buffer.from([0xff, 0xd8]), // only 2 bytes, less than 4
          size: 2,
        }),
      ),
    ).toThrow(/contents do not match/i);
  });
});
