import { Module } from '@nestjs/common';
import { GatePassesModule } from '@/modules/gate-passes/gate-passes.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [GatePassesModule, NotificationsModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
