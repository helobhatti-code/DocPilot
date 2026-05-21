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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeFiltersDto } from './dto/employee-filters.dto';
import { EmployeesService } from './employees.service';

const ATTACHMENT_KINDS = ['emirates-id', 'visa', 'labor-card', 'passport'] as const;

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(TenantGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly svc: EmployeesService) {}

  @Get('import/template')
  @ApiOperation({ summary: 'Download empty employees .xlsx template' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="docpilot-employees-template.xlsx"')
  async template() {
    const buffer = await this.svc.buildTemplate();
    return new StreamableFile(buffer);
  }

  @Post('import/preview')
  @ApiOperation({ summary: 'Validate employees xlsx without writing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  preview(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.svc.parseAndValidate(user, file?.buffer);
  }

  @Post('import')
  @ApiOperation({ summary: 'Commit validated employee rows' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  commitImport(@CurrentUser() user: AuthUser, @Body() body: { rows: any[] }) {
    return this.svc.commit(user, body.rows);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  list(@Query() q: EmployeeFiltersDto) {
    return this.svc.list(q);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.svc.create(user, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR)
  softDelete(@Param('id') id: string) {
    return this.svc.softDelete(id);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload emirates-id, visa, labor-card, or passport attachment' })
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
    return this.svc.uploadAttachmentForEmployee(id, kind, file);
  }
}
