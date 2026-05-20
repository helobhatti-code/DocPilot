import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, ThemePreference, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { InviteUserDto, UpdateUserDto } from './dto/users.dto';

const INVITE_TTL_HOURS = 72;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async invite(actor: AuthUser, dto: InviteUserDto) {
    if (dto.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can invite SUPER_ADMIN');
    }

    const email = dto.email.toLowerCase().trim();

    // Check email not already taken (unscoped — email must be globally unique)
    const exists = await this.prisma.runUnscoped((tx) =>
      tx.user.findFirst({ where: { email }, select: { id: true } }),
    );
    if (exists) throw new BadRequestException('Email already registered');

    const token    = randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    // Explicitly pass tenantId — do NOT rely on PrismaService middleware here
    // because $use middleware loses AsyncLocalStorage context in Prisma 5+
    const user = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        email,
        name: dto.name,
        phone: dto.phone ?? null,
        role: dto.role,
        subcontractorOrgId: dto.subcontractorOrgId ?? null,
        invitationToken: token,
        invitationExpiresAt: expiresAt,
        isActive: false,
      } as Prisma.UserUncheckedCreateInput,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        invitationToken: true,
        invitationExpiresAt: true,
      },
    });

    // Notification — also explicit tenantId
    await this.prisma.notification.create({
      data: {
        tenantId: actor.tenantId,
        userId: user.id,
        type: NotificationType.INVITATION,
        title: 'You have been invited to DocPilot',
        message: `Your invitation token (valid ${INVITE_TTL_HOURS}h): ${token}`,
        entityType: 'User',
        entityId: user.id,
      } as Prisma.NotificationUncheckedCreateInput,
    });

    this.logger.log(`User invited: ${user.email} (${user.role}) to tenant ${actor.tenantId}`);
    return user;
  }

  async list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        subcontractorOrgId: true,
        lastLoginAt: true,
        invitationExpiresAt: true,
        createdAt: true,
      },
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot modify a SUPER_ADMIN');
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, role: true, isActive: true, name: true, phone: true },
    });
  }

  async updatePreferences(userId: string, theme: ThemePreference) {
    return this.prisma.runUnscoped((tx) =>
      tx.user.update({
        where: { id: userId },
        data: { themePreference: theme },
        select: { id: true, themePreference: true },
      }),
    );
  }

  async revokeInvitation(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { invitationToken: true, isActive: true },
    });
    if (!u || !u.invitationToken) throw new NotFoundException('Pending invitation not found');
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  async resendInvitation(actor: AuthUser, id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, invitationToken: true },
    });
    if (!u?.invitationToken) throw new NotFoundException('Pending invitation not found');
    const token   = randomUUID();
    const expires = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id },
      data: { invitationToken: token, invitationExpiresAt: expires },
    });
    return { id, email: u.email, invitationToken: token, invitationExpiresAt: expires };
  }
}
