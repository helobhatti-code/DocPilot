import {
  BadRequestException,
  Body, Controller, Delete, Get, HttpCode, Module,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiPropertyOptional, ApiProperty, ApiTags,
} from '@nestjs/swagger';
import { Prisma, UserRole } from '@prisma/client';
import {
  IsBoolean, IsEmail, IsOptional, IsString, MinLength,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';

class CreateSubcontractorOrgDto {
  @ApiProperty()        @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  contactPerson?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail()   contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  contactPhone?: string;
}

class UpdateSubcontractorOrgDto {
  @ApiPropertyOptional() @IsOptional() @IsString()  name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  contactPerson?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail()   contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
class SubcontractorOrgsService {
  constructor(private readonly prisma: PrismaService) {}

  // Explicitly pass tenantId — do NOT rely on $use middleware (loses AsyncLocalStorage context)
  create(tenantId: string, dto: CreateSubcontractorOrgDto) {
    return this.prisma.subcontractorOrg.create({
      data: {
        tenantId,
        ...dto,
      } as Prisma.SubcontractorOrgUncheckedCreateInput,
    });
  }

  list() {
    return this.prisma.subcontractorOrg.findMany({ orderBy: { name: 'asc' } });
  }

  update(id: string, dto: UpdateSubcontractorOrgDto) {
    return this.prisma.subcontractorOrg.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const org = await this.prisma.subcontractorOrg.findUnique({
      where: { id }, select: { id: true, name: true },
    });
    if (!org) throw new NotFoundException('Organisation not found');

    const linkedStaff = await this.prisma.staff.count({ where: { subcontractorOrgId: id } });
    if (linkedStaff > 0) {
      throw new BadRequestException(
        `Cannot delete "${org.name}" — ${linkedStaff} staff member(s) are linked to this organisation. Reassign or remove them first.`,
      );
    }

    await this.prisma.subcontractorOrg.delete({ where: { id } });
    return { ok: true };
  }
}

@ApiTags('subcontractor-orgs')
@ApiBearerAuth()
@Controller('subcontractor-orgs')
@UseGuards(TenantGuard, RolesGuard)
class SubcontractorOrgsController {
  constructor(private readonly svc: SubcontractorOrgsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SUPER_ADMIN)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubcontractorOrgDto,
  ) {
    return this.svc.create(user.tenantId, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER, UserRole.SUPER_ADMIN)
  list() {
    return this.svc.list();
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SUPER_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubcontractorOrgDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }
}

@Module({
  controllers: [SubcontractorOrgsController],
  providers: [SubcontractorOrgsService],
})
export class SubcontractorOrgsModule {}
