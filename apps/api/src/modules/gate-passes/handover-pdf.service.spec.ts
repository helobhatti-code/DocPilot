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
import { HandoverPdfService } from './handover-pdf.service';
import {
  TENANT_ID,
  makeMockPrisma,
  makeUser,
} from '../../../test/helpers';

function build() {
  const prisma = makeMockPrisma();
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'uploadDir') return '/tmp/uploads';
      if (key === 'publicBaseUrl') return 'http://x';
      return null;
    }),
  };
  const svc = new HandoverPdfService(
    config as unknown as never,
    prisma as unknown as never,
    { buildToken: () => 'test', generateQrPng: async () => Buffer.alloc(0) } as unknown as never,
  );
  return { prisma, svc };
}

const samplePass = () => ({
  id: 'p1',
  passNumber: '100001',
  airport: 'AUH',
  issueDate: new Date('2026-01-01'),
  expiryDate: new Date('2026-07-01'),
  organization: 'Org',
  department: 'Ops',
  staff: {
    id: 's1',
    name: 'Alice Doe',
    nationality: 'AE',
    designation: 'Engineer',
  },
  zones: [
    { zoneCode: 'AP' },
    { zoneCode: 'AR' },
  ],
});

describe('HandoverPdfService — smoke test', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders a non-empty PDF and persists it under tenant/handovers/', async () => {
    const { prisma, svc } = build();
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'Acme Corp',
      logoUrl: null,
    });

    const out = await svc.generate(makeUser(), samplePass());
    expect(out.fileUrl).toMatch(/\/uploads\/.+\/handovers\/handover-100001-/);
    expect(out.fileName).toMatch(/^handover-100001-.+\.pdf$/);
    expect(out.fileSizeBytes).toBeGreaterThan(0);

    expect(fsp.mkdir).toHaveBeenCalledWith(
      expect.stringContaining(`${TENANT_ID}`),
      { recursive: true },
    );
    expect(fsp.writeFile).toHaveBeenCalled();
    const writeArgs = (fsp.writeFile as jest.Mock).mock.calls[0];
    const pdfBytes = writeArgs[1] as Buffer;
    expect(pdfBytes.length).toBeGreaterThan(0);
    // PDFs always start with the %PDF magic
    expect(pdfBytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('throws if the tenant lookup returns nothing', async () => {
    const { prisma, svc } = build();
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(svc.generate(makeUser(), samplePass())).rejects.toThrow(/Tenant not found/);
  });

  it('produces a PDF even with no zones recorded', async () => {
    const { prisma, svc } = build();
    prisma.tenant.findUnique.mockResolvedValue({ name: 'Acme', logoUrl: null });
    const pass = samplePass();
    pass.zones = [];
    const out = await svc.generate(makeUser(), pass);
    expect(out.fileSizeBytes).toBeGreaterThan(0);
  });
});
