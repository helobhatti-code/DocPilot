import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { TenantProfileController } from './tenant-profile.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule],
  controllers: [TenantsController, TenantProfileController],
  providers: [TenantsService],
})
export class TenantsModule {}
