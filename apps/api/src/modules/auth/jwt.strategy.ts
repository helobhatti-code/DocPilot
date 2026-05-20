import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { AppConfig } from '@/config/configuration';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthUser } from '@/common/decorators/current-user.decorator';

interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt', { infer: true }).accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Lookup bypasses tenant middleware (no context yet).
    const user = await this.prisma.runUnscoped((tx) =>
      tx.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          tenantId: true,
          role: true,
          email: true,
          subcontractorOrgId: true,
          canAccessAllCompanies: true,
          isActive: true,
        },
      }),
    );
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive or not found');
    return {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      subcontractorOrgId: user.subcontractorOrgId,
      canAccessAllCompanies: user.canAccessAllCompanies,
    };
  }
}
