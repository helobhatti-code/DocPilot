import { Module } from '@nestjs/common';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { OnboardingService } from './onboarding.service';

@Module({
  imports:     [NotificationsModule],
  controllers: [EmployeesController],
  providers:   [EmployeesService, OnboardingService],
  exports:     [EmployeesService, OnboardingService],
})
export class EmployeesModule {}
