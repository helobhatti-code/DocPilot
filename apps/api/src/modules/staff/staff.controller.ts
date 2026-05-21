import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PersonType, UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './dto/staff.dto';
import { StaffService } from './staff.service';

const ATTACHMENT_KINDS = ['emirates-id', 'visa', 'labor-card', 'passport'] as const;

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

  @Get('stats')
  @ApiOperation({ summary: 'Aggregate counts/bands for dashboard tabs' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  stats(@Query('personType') personType?: PersonType) {
    return this.staff.stats(personType);
  }

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

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload emirates-id / visa / labor-card / passport attachment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file:           { type: 'string', format: 'binary' },
        attachmentKind: { type: 'string', enum: [...ATTACHMENT_KINDS] },
      },
      required: ['file', 'attachmentKind'],
    },
  })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('attachmentKind') kind: string,
  ) {
    return this.staff.uploadAttachment(id, kind, file);
  }
}
