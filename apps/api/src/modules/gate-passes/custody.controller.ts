import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
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
import { DocumentType, Prisma, UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import {
  FileValidationPipe,
  UploadedFile,
} from '@/common/pipes/file-validation.pipe';
import { PrismaService } from '@/common/prisma/prisma.service';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { CustodyService } from './custody.service';
import {
  DeliverToStaffDto,
  MarkReturnedDto,
  SurrenderToAuthorityDto,
} from './dto/custody.dto';
import { HandoverPdfService } from './handover-pdf.service';
import { HandoverQrService } from './handover-qr.service';

@ApiTags('gate-passes-custody')
@ApiBearerAuth()
@Controller('gate-passes')
@UseGuards(TenantGuard, RolesGuard)
export class CustodyController {
  private readonly logger = new Logger(CustodyController.name);

  constructor(
    private readonly custody: CustodyService,
    private readonly handoverPdf: HandoverPdfService,
    private readonly handoverQr: HandoverQrService,
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- Pending handover queue (must precede /:id paths) -------------------

  @Get('queues/pending-handover')
  @ApiOperation({ summary: 'Passes RETURNED_TO_COMPANY but not yet surrendered' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY, UserRole.VIEWER)
  pendingHandover(@Query('overdueOnly') overdueOnly?: string) {
    return this.custody.pendingHandover({ overdueOnly: overdueOnly === 'true' });
  }

  // ---- Strict transitions -------------------------------------------------

  @Post(':id/custody/deliver')
  @ApiOperation({ summary: 'WITH_COMPANY -> WITH_PERSON (auto-generates handover PDF)' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  deliver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliverToStaffDto,
  ) {
    return this.custody.deliverToStaff(user, id, dto);
  }

  @Post(':id/custody/return')
  @ApiOperation({ summary: 'WITH_PERSON -> RETURNED_TO_COMPANY' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  markReturned(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkReturnedDto,
  ) {
    return this.custody.markReturned(user, id, dto);
  }

  @Post(':id/custody/surrender')
  @ApiOperation({
    summary:
      'RETURNED_TO_COMPANY -> SURRENDERED_TO_AUTHORITY (requires handover date, officer, reference)',
  })
  @Roles(UserRole.ADMIN, UserRole.PM)
  surrender(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SurrenderToAuthorityDto,
  ) {
    return this.custody.surrenderToAuthority(user, id, dto);
  }

  // ---- Handover PDF -------------------------------------------------------

  @Post(':id/handover/regenerate')
  @ApiOperation({ summary: 'Regenerate the unsigned handover PDF for a pass' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.SECRETARY)
  async regenerate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const pass = await this.prisma.gatePass.findUnique({
      where: { id },
      include: { staff: true, zones: { select: { zoneCode: true } } },
    });
    if (!pass) throw new (await import('@nestjs/common')).NotFoundException('Gate pass not found');
    const generated = await this.handoverPdf.generate(user, pass);
    await this.prisma.$transaction(async (tx) => {
      await tx.gatePass.update({
        where: { id },
        data: { handoverUnsignedUrl: generated.fileUrl },
      });
      await tx.document.create({
        data: {
          tenantId: user.tenantId,
          gatePassId: id,
          type: DocumentType.HANDOVER_UNSIGNED,
          fileUrl: generated.fileUrl,
          fileName: generated.fileName,
          fileSizeBytes: generated.fileSizeBytes,
          mimeType: 'application/pdf',
          uploadedById: user.id,
        } as unknown as Prisma.DocumentUncheckedCreateInput,
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'HANDOVER_REGENERATED',
          entityType: 'GatePass',
          entityId: id,
          details: {
            passNumber: pass.passNumber,
            handoverUnsignedUrl: generated.fileUrl,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
    });
    return { fileUrl: generated.fileUrl };
  }

  @Post(':id/handover/signed')
  @ApiOperation({ summary: 'Upload signed handover (JPEG/PDF, max 2MB, compressed)' })
  @Roles(UserRole.ADMIN, UserRole.PM, UserRole.HR, UserRole.SECRETARY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async uploadSigned(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFileParam(new FileValidationPipe()) file: UploadedFile,
  ) {
    const { NotFoundException, BadRequestException } = await import('@nestjs/common');
    const { CustodyStatus } = await import('@prisma/client');

    const pass = await this.prisma.gatePass.findUnique({
      where: { id },
      select: { id: true, passNumber: true, custodyStatus: true, handoverUnsignedUrl: true },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');

    if (!pass.handoverUnsignedUrl) {
      throw new BadRequestException(
        'Generate the handover document first (Step 1) before uploading the signed copy.',
      );
    }

    // ── QR verification ──────────────────────────────────────────────────
    // Try to read the QR code embedded in the generated handover document.
    // Three outcomes:
    //  ✅ QR read + matches this pass → proceed normally
    //  ❌ QR read + belongs to a DIFFERENT pass → reject (clear wrong-doc)
    //  ⚠️ QR unreadable (low scan quality, old doc) → allow with audit note
    let qrVerified = false;
    try {
      const token = await this.handoverQr.readQrFromFile(file.buffer, file.mimetype);
      const parsed = this.handoverQr.parseToken(token);
      if (parsed && parsed.passId !== pass.id) {
        // Definitely the wrong document — block it
        throw new BadRequestException(
          `Wrong document — this handover belongs to pass ${parsed.passNumber}, ` +
          `not pass ${pass.passNumber}. Please upload the correct signed handover document.`,
        );
      }
      qrVerified = !!parsed;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err; // re-throw wrong-doc rejection
      // QR unreadable: log but allow — poor scan quality or old pre-QR document
      this.logger.warn(
        `Handover QR unreadable for pass ${pass.passNumber} (allowing upload): ${err.message}`,
      );
    }

    const result = await this.uploads.upload(user, file, DocumentType.HANDOVER_SIGNED, id);

    // Auto-deliver: if still WITH_COMPANY, transition to WITH_PERSON on signed upload
    const autoDeliver = pass.custodyStatus === CustodyStatus.WITH_COMPANY;

    await this.prisma.$transaction(async (tx) => {
      await tx.gatePass.update({
        where: { id },
        data: {
          handoverSignedUrl: result.fileUrl,
          ...(autoDeliver && { custodyStatus: CustodyStatus.WITH_PERSON }),
        },
      });

      if (autoDeliver) {
        await tx.custodyHistory.create({
          data: {
            tenantId: user.tenantId,
            gatePassId: id,
            fromStatus: CustodyStatus.WITH_COMPANY,
            toStatus: CustodyStatus.WITH_PERSON,
            changedById: user.id,
            notes: 'Auto-delivered: signed handover document uploaded',
          } as unknown as Prisma.CustodyHistoryUncheckedCreateInput,
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: autoDeliver ? 'HANDOVER_SIGNED_AND_DELIVERED' : 'HANDOVER_SIGNED_UPLOADED',
          entityType: 'GatePass',
          entityId: id,
          details: {
            passNumber: pass.passNumber,
            handoverSignedUrl: result.fileUrl,
            fileName: result.fileName,
            autoDelivered: autoDeliver,
            qrVerified,
          } as Prisma.InputJsonValue,
        } as unknown as Prisma.AuditLogUncheckedCreateInput,
      });
    });

    return { ...result, autoDelivered: autoDeliver, qrVerified };
  }
}
