import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Res,
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
import { Response } from 'express';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { UserRole, ZoneCode } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { BulkImportService } from './bulk-import.service';

class CommitRowDto {
  @IsInt() rowNumber!: number;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() staffName?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() passNumber?: string;
  @IsOptional() @IsString() organization?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() airport?: string;
  @IsArray() @IsEnum(ZoneCode, { each: true }) zoneCodes!: ZoneCode[];
  @IsOptional() @IsString() issueDate?: string;
  @IsOptional() @IsString() expiryDate?: string;
  @IsOptional() @IsString() passStatus?: string;
  @IsOptional() @IsString() passIsWith?: string;
  @IsArray() @IsString({ each: true }) errors!: string[];
  @IsBoolean() ok!: boolean;
}

class CommitDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CommitRowDto)
  rows!: CommitRowDto[];
}

@ApiTags('gate-passes-import')
@ApiBearerAuth()
@Controller('gate-passes')
@UseGuards(TenantGuard, RolesGuard)
export class BulkImportController {
  constructor(private readonly svc: BulkImportService) {}

  @Get('import/template')
  @ApiOperation({ summary: 'Download an empty .xlsx template' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="docpilot-import-template.xlsx"')
  async template(@Res({ passthrough: true }) _res: Response) {
    const buffer = await this.svc.buildTemplate();
    return new StreamableFile(buffer);
  }

  @Post('import/preview')
  @ApiOperation({ summary: 'Upload .xlsx, return validated rows (no DB writes)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  preview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.parseAndValidate(user, file?.buffer);
  }

  @Post('import')
  @ApiOperation({ summary: 'Commit pre-validated rows' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  commit(@CurrentUser() user: AuthUser, @Body() dto: CommitDto) {
    return this.svc.commit(user, dto.rows);
  }
}
