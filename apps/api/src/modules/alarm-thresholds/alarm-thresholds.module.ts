import { Module } from '@nestjs/common';
import { AlarmThresholdsController } from './alarm-thresholds.controller';
import { AlarmThresholdsService } from './alarm-thresholds.service';

@Module({
  controllers: [AlarmThresholdsController],
  providers:   [AlarmThresholdsService],
  exports:     [AlarmThresholdsService],
})
export class AlarmThresholdsModule {}
