import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CreateTenantDto, ProvisionTenantDto, UpdateTenantDto } from './dto/tenants.dto';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'List all tenants' })
  list() {
    return this.tenants.list();
  }

  @Get('platform-stats')
  @ApiOperation({ summary: 'Platform-wide stats for SUPER_ADMIN dashboard' })
  platformStats() {
    return this.tenants.platformStats();
  }

  @Post()
  @ApiOperation({ summary: 'Create bare tenant (no admin user)' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Post('provision')
  @ApiOperation({ summary: 'Create tenant + admin user in one step' })
  provision(@Body() dto: ProvisionTenantDto) {
    return this.tenants.provision(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant details' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenants.update(id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Toggle tenant active/inactive' })
  toggle(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenants.toggleStatus(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Per-tenant stats' })
  stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenants.stats(id);
  }

  @Post(':id/impersonate')
  @ApiOperation({ summary: 'Issue a session token for a tenant admin — SUPER_ADMIN only' })
  impersonate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.tenants.impersonate(id, actor.id);
  }
}
