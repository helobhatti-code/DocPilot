import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AirportCode, ZoneCode } from '@prisma/client';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('reference')
@Controller('reference')
class ReferenceController {
  @Public()
  @Get('airports')
  airports() {
    return Object.values(AirportCode).map((code) => ({ code }));
  }

  @Public()
  @Get('zones')
  zones() {
    return Object.values(ZoneCode).map((code) => ({ code }));
  }
}

@Module({ controllers: [ReferenceController] })
export class ReferenceModule {}
