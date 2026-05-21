import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { CreateMachineryDto } from './dto/create-machinery.dto';
import { UpdateMachineryDto } from './dto/update-machinery.dto';
import { MachineryFiltersDto } from './dto/machinery-filters.dto';
import { HeavyMachineryService } from './heavy-machinery.service';

const ATTACHMENT_KINDS = [
  'operator-license', 'inspection', 'rta-registration',
  'lifting-test', 'insurance', 'civil-defense', 'photo',
] as const;

@ApiTags('heavy-machinery')
@ApiBearerAuth()
@Controller('heavy-machinery')
@UseGuards(TenantGuard, RolesGuard)
export class HeavyMachineryController {
  constructor(private readonly svc: HeavyMachineryService) {}

  @Get('import/template')
  @ApiOperation({ summary: 'Download empty machinery .xlsx template' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="docpilot-machinery-template.xlsx"')
  async template() {
    const buffer = await this.svc.buildTemplate();
    return new StreamableFile(buffer);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  list(@Query() q: MachineryFiltersDto) {
    return this.svc.list(q);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMachineryDto) {
    return this.svc.create(user, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  update(@Param('id') id: string, @Body() dto: UpdateMachineryDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PM)
  softDelete(@Param('id') id: string) {
    return this.svc.softDelete(id);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload machinery attachment' })
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
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('attachmentKind') kind: string,
  ) {
    return this.svc.uploadAttachmentForMachinery(id, kind, file);
  }
}
