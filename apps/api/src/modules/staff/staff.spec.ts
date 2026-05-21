import { BadRequestException } from '@nestjs/common';
import { PersonType } from '@prisma/client';
import { makeMockPrisma, makeUser, TENANT_ID } from '../../../test/helpers';
import { StaffService } from './staff.service';

function buildSvc() {
  const prisma = makeMockPrisma();
  const cancellations = { autoCancelForStaffOffboarding: jest.fn() } as any;
  const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) } as any;
  const config = { get: jest.fn().mockReturnValue('./uploads') } as any;
  const svc = new StaffService(prisma as unknown as never, cancellations, notifications, config);
  return { prisma, svc };
}

const dateInDays = (days: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

describe('StaffService — personType extension', () => {
  it('default personType is SUBCONTRACTOR (existing tests still apply)', async () => {
    const { prisma, svc } = buildSvc();
    prisma.staff.create.mockImplementation(async ({ data }) => ({ id: 'new-1', ...data }));

    const result = await svc.create(makeUser(), { name: 'Bob' });

    expect(prisma.staff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: TENANT_ID, name: 'Bob' }),
    });
    expect(result.id).toBe('new-1');
  });

  it('update throws when DIRECT_EMPLOYEE has no visaExpiryDate', async () => {
    const { prisma, svc } = buildSvc();
    prisma.staff.findUnique.mockResolvedValueOnce({
      id: 's-1',
      lastWorkingDay: null,
      personType: PersonType.SUBCONTRACTOR,
      visaExpiryDate: null,
    });

    await expect(
      svc.update(makeUser(), 's-1', { personType: PersonType.DIRECT_EMPLOYEE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('list with expiryBand=30d returns only DIRECT_EMPLOYEE rows whose worst band matches', async () => {
    const { prisma, svc } = buildSvc();

    prisma.staff.findMany.mockResolvedValueOnce([
      {
        id: 'e-1',
        personType: PersonType.DIRECT_EMPLOYEE,
        name: 'Visa-Soon',
        visaExpiryDate: dateInDays(25),         // 30d band
        emiratesIdExpiryDate: null,
        laborCardExpiryDate: null,
        passportExpiryDate: null,
        subcontractorOrg: null,
      },
      {
        id: 'e-2',
        personType: PersonType.DIRECT_EMPLOYEE,
        name: 'Far-Out',
        visaExpiryDate: dateInDays(200),        // valid band
        emiratesIdExpiryDate: null,
        laborCardExpiryDate: null,
        passportExpiryDate: null,
        subcontractorOrg: null,
      },
    ]);

    const result = await svc.list({ expiryBand: '30d' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e-1');
    expect(result[0].visaExpiryBand).toBe('30d');
    expect(result[0].worstExpiryBand).toBe('30d');
  });

  it('SUBCONTRACTOR rows always return null bands (no employee fields)', async () => {
    const { prisma, svc } = buildSvc();
    prisma.staff.findMany.mockResolvedValueOnce([
      {
        id: 's-1',
        personType: PersonType.SUBCONTRACTOR,
        name: 'Sub-Joe',
        visaExpiryDate: dateInDays(5),
        emiratesIdExpiryDate: dateInDays(5),
        subcontractorOrg: null,
      },
    ]);

    const result = await svc.list({ personType: PersonType.SUBCONTRACTOR });
    expect(result).toHaveLength(1);
    expect(result[0].worstExpiryBand).toBeNull();
    expect(result[0].visaExpiryBand).toBeNull();
  });

  it('stats returns soonest-expiring direct employees', async () => {
    const { prisma, svc } = buildSvc();
    prisma.staff.findMany.mockResolvedValueOnce([
      {
        id: 'e-1', personType: PersonType.DIRECT_EMPLOYEE, name: 'Soonest',
        designation: 'Eng', visaExpiryDate: dateInDays(5),
        emiratesIdExpiryDate: null, laborCardExpiryDate: null, passportExpiryDate: null,
      },
      {
        id: 'e-2', personType: PersonType.DIRECT_EMPLOYEE, name: 'Later',
        designation: 'Eng', visaExpiryDate: dateInDays(100),
        emiratesIdExpiryDate: null, laborCardExpiryDate: null, passportExpiryDate: null,
      },
    ]);

    const stats = await svc.stats(PersonType.DIRECT_EMPLOYEE);
    expect(stats.headcount).toBe(2);
    expect(stats.soonest[0].id).toBe('e-1');
  });
});
