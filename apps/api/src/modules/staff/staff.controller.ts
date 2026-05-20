import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './dto/staff.dto';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(TenantGuard, RolesGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staff.create(actor, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER, UserRole.SUBCONTRACTOR)
  list(@Query() q: ListStaffQueryDto) { return this.staff.list(q); }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.remove(id);
  }
}
