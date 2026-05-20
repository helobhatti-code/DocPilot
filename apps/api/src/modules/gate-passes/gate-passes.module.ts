import { Module } from '@nestjs/common';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { BulkImportController } from './bulk-import.controller';
import { BulkImportService } from './bulk-import.service';
import { BulkOperationsService } from './bulk.service';
import { CancellationService } from './cancellation.service';
import { CustodyController } from './custody.controller';
import { CustodyService } from './custody.service';
import { GatePassesController } from './gate-passes.controller';
import { GatePassesService } from './gate-passes.service';
import { HandoverPdfService } from './handover-pdf.service';
import { HandoverQrService } from './handover-qr.service';
import { LifecycleController } from './lifecycle.controller';
import { RenewalService } from './renewal.service';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

@Module({
  imports: [NotificationsModule, UploadsModule],
  controllers: [
    GatePassesController,
    LifecycleController,
    CustodyController,
    RetentionController,
    BulkImportController,
  ],
  providers: [
    GatePassesService,
    RenewalService,
    CancellationService,
    BulkOperationsService,
    BulkImportService,
    CustodyService,
    HandoverPdfService,
    HandoverQrService,
    RetentionService,
  ],
  exports: [
    GatePassesService,
    RenewalService,
    CancellationService,
    BulkOperationsService,
    BulkImportService,
    CustodyService,
    HandoverPdfService,
    HandoverQrService,
    RetentionService,
  ],
})
export class GatePassesModule {}
