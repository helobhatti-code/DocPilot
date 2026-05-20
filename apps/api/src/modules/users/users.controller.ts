import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { InviteUserDto, UpdatePreferencesDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(TenantGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('invite')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Invite a user (72h token)' })
  invite(@CurrentUser() actor: AuthUser, @Body() dto: InviteUserDto) {
    return this.users.invite(actor, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PM, UserRole.HR)
  list() {
    return this.users.list();
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Update current user theme preference' })
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.users.updatePreferences(user.id, dto.themePreference);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  @Delete('invitations/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.revokeInvitation(id);
  }

  @Post('invitations/:id/resend')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  resend(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.resendInvitation(actor, id);
  }
}
