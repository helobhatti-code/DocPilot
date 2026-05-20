import * as bcrypt from 'bcrypt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { TENANT_ID, USER_ID, makeMockPrisma } from '../../../test/helpers';

function build() {
  const prisma = makeMockPrisma();
  const jwt = {
    signAsync: jest.fn(async (_p: unknown, opts: { secret: string }) =>
      `signed:${opts.secret}`,
    ),
    verifyAsync: jest.fn(),
  };
  const config = {
    get: jest.fn(() => ({
      accessSecret: 'access-key',
      refreshSecret: 'refresh-key',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    })),
  };
  const svc = new AuthService(
    prisma as unknown as never,
    jwt as unknown as never,
    config as unknown as never,
  );
  return { prisma, svc, jwt, config };
}

describe('AuthService', () => {
  describe('login', () => {
    it('issues tokens for valid credentials and writes a LOGIN audit row', async () => {
      const { prisma, svc, jwt } = build();
      const passwordHash = await bcrypt.hash('correct-horse', 4);
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        tenantId: TENANT_ID,
        email: 'user@gpms.test',
        role: UserRole.ADMIN,
        name: 'User',
        themePreference: 'DARK',
        subcontractorOrgId: null,
        passwordHash,
        isActive: true,
      });
      prisma.user.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const out = await svc.login('user@gpms.test', 'correct-horse', '127.0.0.1');
      expect(out.accessToken).toBe('signed:access-key');
      expect(out.refreshToken).toBe('signed:refresh-key');
      expect(out.user.email).toBe('user@gpms.test');
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOGIN',
            ipAddress: '127.0.0.1',
          }),
        }),
      );
    });

    it('rejects unknown email with Unauthorized', async () => {
      const { prisma, svc } = build();
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(svc.login('ghost@gpms.test', 'whatever')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects wrong password', async () => {
      const { prisma, svc } = build();
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        tenantId: TENANT_ID,
        email: 'u@x.com',
        role: UserRole.ADMIN,
        name: 'U',
        themePreference: 'DARK',
        subcontractorOrgId: null,
        passwordHash: await bcrypt.hash('right-one', 4),
        isActive: true,
      });
      await expect(svc.login('u@x.com', 'wrong-one')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects inactive accounts', async () => {
      const { prisma, svc } = build();
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        tenantId: TENANT_ID,
        email: 'u@x.com',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('right', 4),
        isActive: false,
      });
      await expect(svc.login('u@x.com', 'right')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('returns new tokens when refresh token is valid', async () => {
      const { prisma, svc, jwt } = build();
      jwt.verifyAsync.mockResolvedValue({
        sub: USER_ID, tenantId: TENANT_ID, role: 'ADMIN', email: 'u@x.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID, tenantId: TENANT_ID, role: UserRole.ADMIN, email: 'u@x.com', isActive: true,
      });
      const out = await svc.refresh('valid.refresh.jwt');
      expect(out.accessToken).toBe('signed:access-key');
      expect(out.refreshToken).toBe('signed:refresh-key');
    });

    it('throws Unauthorized when JWT verification fails', async () => {
      const { svc, jwt } = build();
      jwt.verifyAsync.mockRejectedValue(new Error('jwt malformed'));
      await expect(svc.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws Unauthorized for inactive users even with valid token', async () => {
      const { prisma, svc, jwt } = build();
      jwt.verifyAsync.mockResolvedValue({
        sub: USER_ID, tenantId: TENANT_ID, role: 'ADMIN', email: 'u@x.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID, tenantId: TENANT_ID, role: UserRole.ADMIN, email: 'u@x.com', isActive: false,
      });
      await expect(svc.refresh('ok')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('returns ok=true even when user does not exist (no enumeration)', async () => {
      const { prisma, svc } = build();
      prisma.user.findFirst.mockResolvedValue(null);
      const out = await svc.forgotPassword('nobody@x.com');
      expect(out).toEqual({ ok: true });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('writes a reset token + 1h expiry for known users', async () => {
      const { prisma, svc } = build();
      prisma.user.findFirst.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID });
      prisma.user.update.mockResolvedValue({});
      const before = Date.now();
      await svc.forgotPassword('user@x.com');
      const update = prisma.user.update.mock.calls[0][0] as {
        data: { invitationToken: string; invitationExpiresAt: Date };
      };
      expect(typeof update.data.invitationToken).toBe('string');
      const ttl = update.data.invitationExpiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(50 * 60 * 1000); // ~1h
      expect(ttl).toBeLessThan(70 * 60 * 1000);
    });
  });

  describe('resetPassword', () => {
    it('rejects expired tokens', async () => {
      const { prisma, svc } = build();
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        invitationExpiresAt: new Date(Date.now() - 60_000),
      });
      await expect(svc.resetPassword('old', 'newpass')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hashes and persists the new password for valid tokens', async () => {
      const { prisma, svc } = build();
      prisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        invitationExpiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue({});
      await svc.resetPassword('valid', 'newPassword!');
      const data = prisma.user.update.mock.calls[0][0].data as {
        passwordHash: string; invitationToken: null; invitationExpiresAt: null;
      };
      expect(data.passwordHash).not.toBe('newPassword!'); // hashed
      expect(await bcrypt.compare('newPassword!', data.passwordHash)).toBe(true);
      expect(data.invitationToken).toBeNull();
    });
  });
});
