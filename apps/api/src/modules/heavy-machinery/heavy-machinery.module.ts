import { Module } from '@nestjs/common';
import { HeavyMachineryController } from './heavy-machinery.controller';
import { HeavyMachineryService } from './heavy-machinery.service';

@Module({
  controllers: [HeavyMachineryController],
  providers:   [HeavyMachineryService],
  exports:     [HeavyMachineryService],
})
export class HeavyMachineryModule {}
