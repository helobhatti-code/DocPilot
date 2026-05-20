import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import {
  CreateCompanyDto,
  GrantCompanyAccessDto,
  ListCompaniesQueryDto,
  UpdateCompanyDto,
} from './dto/companies.dto';
import { CompaniesService } from './companies.service';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(TenantGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly svc: CompaniesService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PM,
    UserRole.HR,
    UserRole.SECRETARY,
    UserRole.VIEWER,
  )
  list(@CurrentUser() user: AuthUser, @Query() q: ListCompaniesQueryDto) {
    return this.svc.list(user, q);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.svc.create(user, dto);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PM,
    UserRole.HR,
    UserRole.SECRETARY,
    UserRole.VIEWER,
  )
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  softDelete(@Param('id') id: string) {
    return this.svc.softDelete(id);
  }

  // ─── User access sub-resource ─────────────────────────────────────────────

  @Get(':id/users')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listUsers(@Param('id') id: string) {
    return this.svc.listUsers(id);
  }

  @Post(':id/users')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  grantAccess(@Param('id') id: string, @Body() dto: GrantCompanyAccessDto) {
    return this.svc.grantAccess(id, dto);
  }

  @Delete(':id/users/:userId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  revokeAccess(@Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.revokeAccess(id, userId);
  }
}
