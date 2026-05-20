// Service uses `import { promises as fs } from 'fs'`. Preserve the rest of the
// `fs` module (Prisma needs fs.existsSync etc.) and only override the promises
// methods we care about.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(Buffer.from('')),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

import { promises as fsp } from 'fs';
import { DocumentType } from '@prisma/client';
import { UploadsService } from './uploads.service';
import {
  TENANT_ID,
  makeMockPrisma,
  makeUser,
} from '../../../test/helpers';

// Sharp is heavyweight (native binding) — stub it.
jest.mock('sharp', () => {
  const make = () => ({
    rotate: () => make(),
    jpeg: () => make(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('compressed-jpeg')),
  });
  return {
    __esModule: true,
    default: jest.fn(() => make()),
  };
});

// pdf-lib is real but not strictly needed for behaviour we exercise.
jest.mock('pdf-lib', () => ({
  PDFDocument: {
    load: jest.fn().mockResolvedValue({
      save: jest.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00])),
    }),
  },
}));

function build() {
  const prisma = makeMockPrisma();
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'uploadDir') return '/tmp/uploads';
      if (key === 'publicBaseUrl') return 'http://x';
      return null;
    }),
  };
  const svc = new UploadsService(
    config as unknown as never,
    prisma as unknown as never,
  );
  return { prisma, svc };
}

describe('UploadsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('compresses JPEG, writes to tenant dir and inserts a Document row', async () => {
    const { prisma, svc } = build();
    prisma.document.create.mockResolvedValue({ id: 'd1' });

    const out = await svc.upload(
      makeUser(),
      {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 100_000,
        buffer: Buffer.from('raw-jpeg'),
      },
      DocumentType.PASS_SCAN_FRONT,
      'gp-1',
    );

    expect(fsp.mkdir).toHaveBeenCalledWith(
      expect.stringContaining(TENANT_ID),
      { recursive: true },
    );
    expect(fsp.writeFile).toHaveBeenCalled();
    expect(out.fileUrl).toMatch(new RegExp(`/uploads/${TENANT_ID}/.+\\.jpg$`));
    expect(out.mimeType).toBe('image/jpeg');
    // Sharp is stubbed → compressed size is tiny vs original, so the ratio
    // rounded to 3 decimals can be 0. Just assert it's a finite number.
    expect(Number.isFinite(out.compressionRatio)).toBe(true);
    expect(out.compressionRatio).toBeGreaterThanOrEqual(0);
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gatePassId: 'gp-1',
          type: DocumentType.PASS_SCAN_FRONT,
          mimeType: 'image/jpeg',
        }),
      }),
    );
  });

  it('passes PDFs through pdf-lib and stores them with .pdf extension', async () => {
    const { prisma, svc } = build();
    prisma.document.create.mockResolvedValue({ id: 'd2' });

    const out = await svc.upload(
      makeUser(),
      {
        originalname: 'scan.pdf',
        mimetype: 'application/pdf',
        size: 5_000,
        buffer: Buffer.from('%PDF-fake'),
      },
      DocumentType.RECEIPT,
    );
    expect(out.mimeType).toBe('application/pdf');
    expect(out.fileUrl).toMatch(/\.pdf$/);
  });

  it('omits gatePassId when not provided', async () => {
    const { prisma, svc } = build();
    prisma.document.create.mockResolvedValue({ id: 'd3' });
    await svc.upload(
      makeUser(),
      {
        originalname: 'p.jpg',
        mimetype: 'image/jpeg',
        size: 100,
        buffer: Buffer.from('raw'),
      },
      DocumentType.STAFF_PHOTO,
    );
    expect(prisma.document.create.mock.calls[0][0].data.gatePassId).toBeNull();
  });
});
