import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  CreateCompanyDto,
  GrantCompanyAccessDto,
  ListCompaniesQueryDto,
  UpdateCompanyDto,
} from './dto/companies.dto';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, query: ListCompaniesQueryDto) {
    const page     = query.page     ?? 1;
    const pageSize = query.pageSize ?? 25;

    // ADMIN / canAccessAllCompanies users see all tenant companies.
    // All others see only companies they have been explicitly granted access to.
    const where: Prisma.CompanyWhereInput = actor.canAccessAllCompanies
      ? {}
      : { userAccess: { some: { userId: actor.id } } };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
        select: {
          id: true, tenantId: true, name: true, code: true,
          tradeLicenseNo: true, address: true, phone: true,
          email: true, logoUrl: true, isActive: true,
          createdAt: true, updatedAt: true,
          _count: { select: { gatePasses: true, staff: true } },
        },
      }),
      this.prisma.company.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async create(actor: AuthUser, dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findFirst({
      where: { tenantId: actor.tenantId, code: dto.code },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`Company code "${dto.code}" already exists in this tenant`);

    return this.prisma.company.create({
      data: {
        tenantId: actor.tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        tradeLicenseNo: dto.tradeLicenseNo,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        logoUrl: dto.logoUrl,
      } as Prisma.CompanyUncheckedCreateInput,
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: { select: { gatePasses: true, staff: true, userAccess: true } },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    const existing = await this.prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Company not found');

    return this.prisma.company.update({
      where: { id },
      data: {
        name:           dto.name,
        tradeLicenseNo: dto.tradeLicenseNo,
        address:        dto.address,
        phone:          dto.phone,
        email:          dto.email,
        logoUrl:        dto.logoUrl,
        isActive:       dto.isActive,
      },
    });
  }

  async softDelete(id: string) {
    const existing = await this.prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Company not found');
    return this.prisma.company.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }

  // ─── User access management ────────────────────────────────────────────────

  async listUsers(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    return this.prisma.userCompanyAccess.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, role: true,
            isActive: true, createdAt: true,
          },
        },
      },
    });
  }

  async grantAccess(companyId: string, dto: GrantCompanyAccessDto) {
    const [company, user] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, tenantId: true } }),
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true, tenantId: true } }),
    ]);
    if (!company) throw new NotFoundException('Company not found');
    if (!user)    throw new NotFoundException('User not found');
    if (user.tenantId !== company.tenantId) {
      throw new BadRequestException('User does not belong to the same tenant as the company');
    }

    return this.prisma.userCompanyAccess.upsert({
      where: { userId_companyId: { userId: dto.userId, companyId } },
      create: {
        userId: dto.userId,
        companyId,
        accessLevel: dto.accessLevel ?? 'MEMBER',
      },
      update: { accessLevel: dto.accessLevel ?? 'MEMBER' },
    });
  }

  async revokeAccess(companyId: string, userId: string) {
    const access = await this.prisma.userCompanyAccess.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { id: true },
    });
    if (!access) throw new NotFoundException('Access record not found');
    await this.prisma.userCompanyAccess.delete({
      where: { userId_companyId: { userId, companyId } },
    });
    return { ok: true };
  }
}
