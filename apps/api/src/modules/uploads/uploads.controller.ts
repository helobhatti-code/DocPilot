import {
  Body,
  Controller,
  Post,
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
import { DocumentType, UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import {
  FileValidationPipe,
  UploadedFile,
} from '@/common/pipes/file-validation.pipe';
import { UploadsService } from './uploads.service';

class UploadDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type!: DocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  gatePassId?: string;
}

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(TenantGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.SUBCONTRACTOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload JPEG/PDF (max 2MB), compress, return URL' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string', enum: Object.keys(DocumentType) },
        gatePassId: { type: 'string', format: 'uuid' },
      },
      required: ['file', 'type'],
    },
  })
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFileParam(new FileValidationPipe()) file: UploadedFile,
    @Body() body: UploadDto,
  ) {
    return this.uploads.upload(user, file, body.type, body.gatePassId);
  }
}
