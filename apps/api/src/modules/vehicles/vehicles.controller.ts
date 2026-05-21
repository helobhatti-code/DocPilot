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
import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleFiltersDto } from './dto/vehicle-filters.dto';
import { VehiclesService } from './vehicles.service';

const ATTACHMENT_KINDS = ['car-license', 'insurance', 'form'] as const;
type AttachmentKind = typeof ATTACHMENT_KINDS[number];

class UploadAttachmentBodyDto {
  @ApiProperty({ enum: ATTACHMENT_KINDS })
  @IsEnum(ATTACHMENT_KINDS)
  attachmentKind!: AttachmentKind;
}

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
@UseGuards(TenantGuard, RolesGuard)
export class VehiclesController {
  constructor(private readonly svc: VehiclesService) {}

  @Get('import/template')
  @ApiOperation({ summary: 'Download empty vehicles .xlsx template' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="docpilot-vehicles-template.xlsx"')
  async template() {
    const buffer = await this.svc.buildTemplate();
    return new StreamableFile(buffer);
  }

  @Post('import/preview')
  @ApiOperation({ summary: 'Validate vehicles xlsx without writing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  preview(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.svc.parseAndValidate(user, file?.buffer);
  }

  @Post('import')
  @ApiOperation({ summary: 'Commit validated vehicle rows' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  commitImport(@CurrentUser() user: AuthUser, @Body() body: { rows: any[] }) {
    return this.svc.commit(user, body.rows);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  list(@Query() q: VehicleFiltersDto) {
    return this.svc.list(q);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Aggregate counts for dashboard Vehicles tab' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  stats() {
    return this.svc.stats();
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.svc.create(user, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PM)
  softDelete(@Param('id') id: string) {
    return this.svc.softDelete(id);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload a car-license, insurance, or form attachment' })
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
    @Body() body: UploadAttachmentBodyDto,
  ) {
    return this.svc.uploadAttachmentForVehicle(id, body.attachmentKind, file);
  }
}
