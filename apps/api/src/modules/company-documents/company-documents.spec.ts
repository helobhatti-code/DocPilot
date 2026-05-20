import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompanyDocType, DocStatus } from '@prisma/client';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';
import { CompanyDocumentsService, computeExpiryBand } from './company-documents.service';
import { CreateCompanyDocumentDto } from './dto/create-company-document.dto';

const COMPANY_ID = 'company-cuid-001';
const DOC_ID     = 'doc-cuid-001';

const futureDate = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function buildSvc() {
  const prisma  = makeMockPrisma();
  const config  = { get: jest.fn().mockReturnValue('./uploads') } as unknown as never;
  const svc     = new CompanyDocumentsService(prisma as unknown as never, config);
  return { prisma, svc };
}

// ─── 1. POA without parties is rejected ───────────────────────────────────────

describe('CompanyDocumentsService metadata validation', () => {
  it('POA without parties array is rejected with BadRequestException via service', async () => {
    const { prisma, svc } = buildSvc();
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID });

    // We test the service — class-validator runs in the controller pipeline,
    // so here we directly invoke the MetadataShapeConstraint logic by passing
    // invalid metadata and checking the validator
    const { MetadataShapeConstraint } = await import('./dto/create-company-document.dto');
    const constraint = new MetadataShapeConstraint();

    const dto = {
      docType: CompanyDocType.POWER_OF_ATTORNEY,
    } as CreateCompanyDocumentDto;

    const result = constraint.validate(
      { attorneyType: 'LIMITED' }, // missing parties
      { object: dto } as never,
    );

    expect(result).toBe(false);
  });

  it('POA with empty parties array is rejected', async () => {
    const { MetadataShapeConstraint } = await import('./dto/create-company-document.dto');
    const constraint = new MetadataShapeConstraint();

    const dto = { docType: CompanyDocType.POWER_OF_ATTORNEY } as CreateCompanyDocumentDto;

    const result = constraint.validate(
      { attorneyType: 'UNLIMITED', parties: [] },
      { object: dto } as never,
    );

    expect(result).toBe(false);
  });
});

// ─── 2. CIVIL_DEFENSE returns both expiry bands ───────────────────────────────

describe('CompanyDocumentsService', () => {
  describe('detail — CIVIL_DEFENSE expiry bands', () => {
    it('returns mainExpiryBand and hassantukExpiryBand separately', async () => {
      const { prisma, svc } = buildSvc();

      const hassantukExpiry = futureDate(10); // 14d band
      const docExpiry       = new Date(futureDate(60));

      prisma.companyDocument.findFirst.mockResolvedValue({
        id:        DOC_ID,
        tenantId:  TENANT_ID,
        companyId: COMPANY_ID,
        docType:   CompanyDocType.CIVIL_DEFENSE,
        docName:   'Civil Defense Certificate',
        expiryDate: docExpiry,
        status:    DocStatus.VALID,
        isActive:  true,
        metadata:  {
          hassantukCertificateNo: 'CERT-001',
          hassantukExpiryDate: hassantukExpiry,
        },
        company: { id: COMPANY_ID, name: 'ACME', code: 'ACM' },
      });

      const result = await svc.detail(DOC_ID) as Record<string, unknown>;

      expect(result.mainExpiryBand).toBe('valid');    // 60 days out
      expect(result.hassantukExpiryBand).toBe('14d'); // 10 days out → 14d band
      expect(result.expiryBand).toBe('valid');
    });
  });

  // ─── 3. Renewal creates linked doc, old → UNDER_RENEWAL ──────────────────

  describe('renew', () => {
    it('creates a new document with previousDocId set and sets old doc to UNDER_RENEWAL', async () => {
      const { prisma, svc } = buildSvc();
      const actor = makeUser();

      prisma.companyDocument.findFirst.mockResolvedValue({
        id:        DOC_ID,
        docType:   CompanyDocType.TRADE_LICENSE,
        companyId: COMPANY_ID,
        tenantId:  TENANT_ID,
        isActive:  true,
      });

      const newDocId = 'doc-cuid-002';
      const newExpiry = new Date(futureDate(365));

      prisma.companyDocument.update.mockResolvedValue({ id: DOC_ID, status: DocStatus.UNDER_RENEWAL });
      prisma.companyDocument.create.mockResolvedValue({
        id:           newDocId,
        tenantId:     TENANT_ID,
        companyId:    COMPANY_ID,
        docType:      CompanyDocType.TRADE_LICENSE,
        docName:      'Trade License 2025',
        expiryDate:   newExpiry,
        status:       DocStatus.VALID,
        previousDocId: DOC_ID,
        isActive:     true,
        metadata:     null,
      });

      const dto: CreateCompanyDocumentDto = {
        docType:   CompanyDocType.TRADE_LICENSE,
        companyId: COMPANY_ID,
        docName:   'Trade License 2025',
        expiryDate: futureDate(365),
      };

      const result = await svc.renew(actor, DOC_ID, dto) as Record<string, unknown>;

      // Old doc must have been updated to UNDER_RENEWAL
      expect(prisma.companyDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: DOC_ID },
          data: { status: DocStatus.UNDER_RENEWAL },
        }),
      );

      // New doc must reference old doc
      const createCall = prisma.companyDocument.create.mock.calls[0][0];
      expect(createCall.data.previousDocId).toBe(DOC_ID);

      expect(result.id).toBe(newDocId);
    });

    it('throws NotFoundException when old document does not exist', async () => {
      const { prisma, svc } = buildSvc();
      prisma.companyDocument.findFirst.mockResolvedValue(null);

      await expect(
        svc.renew(makeUser(), 'nonexistent', {
          docType:   CompanyDocType.TRADE_LICENSE,
          companyId: COMPANY_ID,
          docName:   'X',
          expiryDate: futureDate(365),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── 4. CRUD scoped to company ────────────────────────────────────────────

  describe('list', () => {
    it('applies companyId filter to scope results to a company', async () => {
      const { prisma, svc } = buildSvc();

      prisma.companyDocument.findMany.mockResolvedValue([]);
      prisma.companyDocument.count.mockResolvedValue(0);

      await svc.list({ companyId: COMPANY_ID, page: 1, pageSize: 10 });

      const where = prisma.companyDocument.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(COMPANY_ID);
    });
  });

  // ─── 5. expiryBand helper ─────────────────────────────────────────────────

  describe('computeExpiryBand', () => {
    it('returns expired for past dates', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      expect(computeExpiryBand(past)).toBe('expired');
    });

    it('returns 7d for dates within 7 days', () => {
      const d = new Date();
      d.setDate(d.getDate() + 5);
      expect(computeExpiryBand(d)).toBe('7d');
    });

    it('returns valid for dates beyond 30 days', () => {
      const d = new Date();
      d.setDate(d.getDate() + 60);
      expect(computeExpiryBand(d)).toBe('valid');
    });
  });
});
