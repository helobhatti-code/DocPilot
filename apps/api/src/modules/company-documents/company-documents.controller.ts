import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile as UploadedFileParam,
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
import {
  FileValidationPipe,
  UploadedFile,
} from '@/common/pipes/file-validation.pipe';
import { CreateCompanyDocumentDto } from './dto/create-company-document.dto';
import { UpdateCompanyDocumentDto } from './dto/update-company-document.dto';
import { CompanyDocumentFiltersDto } from './dto/company-document-filters.dto';
import { CompanyDocumentsService } from './company-documents.service';

@ApiTags('company-documents')
@ApiBearerAuth()
@Controller('company-documents')
@UseGuards(TenantGuard, RolesGuard)
export class CompanyDocumentsController {
  constructor(private readonly svc: CompanyDocumentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDocumentDto) {
    return this.svc.create(user, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  list(@Query() query: CompanyDocumentFiltersDto) {
    return this.svc.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Aggregate counts for dashboard Company Docs tab' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  stats() {
    return this.svc.stats();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDocumentDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/renew')
  @ApiOperation({ summary: 'Create a renewal: old doc → UNDER_RENEWAL, new doc linked via previousDocId' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  renew(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateCompanyDocumentDto,
  ) {
    return this.svc.renew(user, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PM)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/attachment')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload single attachment for a company document (JPEG/PDF, max 2MB)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  uploadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFileParam(new FileValidationPipe()) file: UploadedFile,
  ) {
    return this.svc.uploadAttachment(user, id, file);
  }
}
