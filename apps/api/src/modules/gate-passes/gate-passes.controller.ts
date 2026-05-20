import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateGatePassDto,
  ListGatePassesQueryDto,
  UpdateGatePassDto,
} from './dto/gate-passes.dto';
import { GatePassesService } from './gate-passes.service';

@ApiTags('gate-passes')
@ApiBearerAuth()
@Controller('gate-passes')
@UseGuards(TenantGuard, RolesGuard)
export class GatePassesController {
  constructor(private readonly svc: GatePassesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGatePassDto) {
    return this.svc.create(user, dto);
  }

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.PM,
    UserRole.HR,
    UserRole.SECRETARY,
    UserRole.VIEWER,
    UserRole.SUBCONTRACTOR,
  )
  list(@Query() q: ListGatePassesQueryDto) {
    return this.svc.list(q);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  stats() {
    return this.svc.stats();
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.PM,
    UserRole.HR,
    UserRole.SECRETARY,
    UserRole.VIEWER,
    UserRole.SUBCONTRACTOR,
  )
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.detail(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGatePassDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PM)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }
}
