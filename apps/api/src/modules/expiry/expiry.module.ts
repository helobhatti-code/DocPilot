import { Module } from '@nestjs/common';
import { ExpiryController } from './expiry.controller';
import { ExpiryService } from './expiry.service';

@Module({
  controllers: [ExpiryController],
  providers:   [ExpiryService],
  exports:     [ExpiryService],
})
export class ExpiryModule {}
