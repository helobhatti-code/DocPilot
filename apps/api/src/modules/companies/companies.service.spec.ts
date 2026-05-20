import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import {
  TENANT_ID,
  USER_ID,
  makeMockPrisma,
  makeUser,
} from '../../../test/helpers';

const COMPANY_ID = 'aabbccdd-eeee-ffff-0000-111122223333';

function build() {
  const prisma = makeMockPrisma();
  const svc = new CompaniesService(prisma as unknown as never);
  return { prisma, svc };
}

describe('CompaniesService', () => {
  describe('list', () => {
    it('queries all companies when user canAccessAllCompanies', async () => {
      const { prisma, svc } = build();
      prisma.company.findMany.mockResolvedValue([]);
      prisma.company.count.mockResolvedValue(0);
      const user = makeUser({ canAccessAllCompanies: true });
      await svc.list(user, { page: 1, pageSize: 25 });
      const where = prisma.company.findMany.mock.calls[0][0].where;
      // No userAccess filter — full tenant scope
      expect(where).toEqual({});
    });

    it('filters by userAccess when user does not have canAccessAllCompanies', async () => {
      const { prisma, svc } = build();
      prisma.company.findMany.mockResolvedValue([]);
      prisma.company.count.mockResolvedValue(0);
      const user = makeUser({ canAccessAllCompanies: false });
      await svc.list(user, { page: 1, pageSize: 25 });
      const where = prisma.company.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ userAccess: { some: { userId: USER_ID } } });
    });
  });

  describe('create', () => {
    it('creates a company with normalised code', async () => {
      const { prisma, svc } = build();
      prisma.company.findFirst.mockResolvedValue(null);
      prisma.company.create.mockResolvedValue({ id: COMPANY_ID, code: 'MAIN' });
      const user = makeUser();
      await svc.create(user, { name: 'Main Corp', code: 'main' });
      expect(prisma.company.create.mock.calls[0][0].data.code).toBe('MAIN');
      expect(prisma.company.create.mock.calls[0][0].data.tenantId).toBe(TENANT_ID);
    });

    it('throws ConflictException when code already exists', async () => {
      const { prisma, svc } = build();
      prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID });
      await expect(svc.create(makeUser(), { name: 'Dup', code: 'MAIN' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for missing company', async () => {
      const { prisma, svc } = build();
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(svc.findOne('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('sets isActive to false', async () => {
      const { prisma, svc } = build();
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID });
      prisma.company.update.mockResolvedValue({ id: COMPANY_ID, isActive: false });
      await svc.softDelete(COMPANY_ID);
      expect(prisma.company.update.mock.calls[0][0].data).toEqual({ isActive: false });
    });
  });

  describe('grantAccess', () => {
    it('throws when user is from a different tenant', async () => {
      const { prisma, svc } = build();
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, tenantId: TENANT_ID });
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, tenantId: 'other-tenant' });
      await expect(
        svc.grantAccess(COMPANY_ID, { userId: USER_ID }),
      ).rejects.toBeInstanceOf(Error); // BadRequestException
    });

    it('upserts access record when tenant matches', async () => {
      const { prisma, svc } = build();
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, tenantId: TENANT_ID });
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID });
      prisma.userCompanyAccess.upsert.mockResolvedValue({ id: 'acc1' });
      await svc.grantAccess(COMPANY_ID, { userId: USER_ID, accessLevel: 'ADMIN' });
      const args = prisma.userCompanyAccess.upsert.mock.calls[0][0];
      expect(args.create.accessLevel).toBe('ADMIN');
      expect(args.create.companyId).toBe(COMPANY_ID);
      expect(args.create.userId).toBe(USER_ID);
    });
  });

  describe('revokeAccess', () => {
    it('throws NotFoundException when access record missing', async () => {
      const { prisma, svc } = build();
      prisma.userCompanyAccess.findUnique.mockResolvedValue(null);
      await expect(svc.revokeAccess(COMPANY_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes the access record', async () => {
      const { prisma, svc } = build();
      prisma.userCompanyAccess.findUnique.mockResolvedValue({ id: 'acc1' });
      prisma.userCompanyAccess.delete.mockResolvedValue({ id: 'acc1' });
      const result = await svc.revokeAccess(COMPANY_ID, USER_ID);
      expect(result).toEqual({ ok: true });
      expect(prisma.userCompanyAccess.delete).toHaveBeenCalledWith({
        where: { userId_companyId: { userId: USER_ID, companyId: COMPANY_ID } },
      });
    });
  });
});
