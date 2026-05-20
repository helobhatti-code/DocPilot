import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AppConfig } from '@/config/configuration';
import { PrismaService } from '@/common/prisma/prisma.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async login(email: string, password: string, ip?: string) {
    const user = await this.prisma.runUnscoped((tx) =>
      tx.user.findFirst({
        where: { email: email.toLowerCase().trim() },
        select: {
          id: true,
          tenantId: true,
          email: true,
          role: true,
          name: true,
          themePreference: true,
          subcontractorOrgId: true,
          passwordHash: true,
          isActive: true,
        },
      }),
    );

    if (!user || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.runUnscoped((tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    );
    await this.prisma.runUnscoped((tx) =>
      tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          ipAddress: ip,
        },
      }),
    );

    const tokens = await this.issueTokens(user.id, user.tenantId, user.role, user.email);
    return {
      ...tokens,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        themePreference: user.themePreference,
        subcontractorOrgId: user.subcontractorOrgId,
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; tenantId: string; role: string; email: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('jwt', { infer: true }).refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.runUnscoped((tx) =>
      tx.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, tenantId: true, role: true, email: true, isActive: true },
      }),
    );
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');
    return this.issueTokens(user.id, user.tenantId, user.role, user.email);
  }

  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.runUnscoped((tx) =>
      tx.user.findFirst({
        where: { email: email.toLowerCase().trim() },
        select: { id: true, tenantId: true },
      }),
    );
    if (user) {
      const token = randomUUID();
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await this.prisma.runUnscoped((tx) =>
        tx.user.update({
          where: { id: user.id },
          data: { invitationToken: token, invitationExpiresAt: expires },
        }),
      );
      this.logger.log(`Password reset link issued for user ${user.id}`);
      // In production, dispatch email via mailer.
    }
    return { ok: true };
  }

  async resetPassword(token: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.runUnscoped((tx) =>
      tx.user.findFirst({
        where: { invitationToken: token },
        select: { id: true, invitationExpiresAt: true },
      }),
    );
    if (!user || !user.invitationExpiresAt || user.invitationExpiresAt < new Date()) {
      throw new BadRequestException('Token invalid or expired');
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.runUnscoped((tx) =>
      tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hash,
          invitationToken: null,
          invitationExpiresAt: null,
        },
      }),
    );
    return { ok: true };
  }

  async setupAccount(invitationToken: string, password: string) {
    const user = await this.prisma.runUnscoped((tx) =>
      tx.user.findFirst({
        where: { invitationToken },
        select: {
          id: true,
          tenantId: true,
          role: true,
          email: true,
          isActive: true,
          invitationExpiresAt: true,
        },
      }),
    );
    if (!user || !user.invitationExpiresAt || user.invitationExpiresAt < new Date()) {
      throw new BadRequestException('Invitation invalid or expired');
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.runUnscoped((tx) =>
      tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hash,
          isActive: true,
          invitationToken: null,
          invitationExpiresAt: null,
        },
      }),
    );
    return this.issueTokens(user.id, user.tenantId, user.role, user.email);
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async issueTokens(userId: string, tenantId: string, role: string, email: string) {
    const jwtCfg = this.config.get('jwt', { infer: true });
    const payload = { sub: userId, tenantId, role, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: jwtCfg.accessSecret,
        expiresIn: jwtCfg.accessExpiresIn,
      }),
      this.jwt.signAsync(payload, {
        secret: jwtCfg.refreshSecret,
        expiresIn: jwtCfg.refreshExpiresIn,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
