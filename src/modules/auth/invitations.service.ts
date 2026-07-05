import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { AuthUser } from '../../common/guards/current-user.decorator';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
// SystemPrismaService use is BY DESIGN: accept-invite runs before auth,
// and the invitee's User record is global (docs/02 §5).
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import { AuthResult, AuthService } from './auth.service';
import { TokenService } from './token.service';

const INVITE_TTL_MS = 7 * 24 * 3_600_000;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

  /** FR-1.3 — Owner/Admin invites an email with a role. */
  async invite(inviter: AuthUser, email: string, role: UserRole) {
    const invitee = await this.system.user.findUnique({
      where: { email },
      include: { memberships: { where: { tenantId: inviter.tenantId } } },
    });
    if (invitee && invitee.memberships.length > 0) {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: 'That user is already a member of this workspace',
      });
    }

    // Re-inviting replaces any pending invitation for this email.
    await this.prisma.client.invitation.deleteMany({ where: { email, acceptedAt: null } });

    const token = randomBytes(32).toString('hex');
    const invitation = await this.prisma.client.invitation.create({
      data: {
        email,
        role,
        tokenHash: this.tokens.sha256(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedById: inviter.userId,
      } satisfies TenantCreateData<Prisma.InvitationUncheckedCreateInput> as Prisma.InvitationUncheckedCreateInput,
    });

    const tenant = await this.prisma.client.tenant.findFirst({});
    const link = `${process.env.WEB_APP_URL ?? 'http://localhost:3000'}/accept-invite?token=${token}`;
    await this.mail.sendInvite(email, tenant?.name ?? 'a workspace', role, link);

    // The raw token leaves the system only inside the email.
    return { id: invitation.id, email, role, expiresAt: invitation.expiresAt };
  }

  /**
   * FR-1.3 — existing users just gain a Membership (no password step);
   * new users set a password. Either way the invitation's role becomes
   * the membership role and a session for that workspace is returned.
   */
  async accept(token: string, password?: string): Promise<AuthResult> {
    const invitation = await this.system.invitation.findUnique({
      where: { tokenHash: this.tokens.sha256(token) },
      include: { tenant: true },
    });
    if (!invitation) {
      throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: 'Invalid invitation' });
    }
    if (invitation.acceptedAt) {
      throw new ConflictException({ code: 'INVITE_USED', message: 'Invitation already used' });
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'INVITE_EXPIRED', message: 'Invitation expired' });
    }

    let user = await this.system.user.findUnique({ where: { email: invitation.email } });
    if (!user && !password) {
      throw new BadRequestException({
        code: 'PASSWORD_REQUIRED',
        message: 'Set a password to create your account',
      });
    }

    user = await this.system.$transaction(async (tx) => {
      const u =
        user ??
        (await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash: await argon2.hash(password as string, { type: argon2.argon2id }),
          },
        }));
      const existing = await tx.membership.findUnique({
        where: { userId_tenantId: { userId: u.id, tenantId: invitation.tenantId } },
      });
      if (!existing) {
        await tx.membership.create({
          data: { userId: u.id, tenantId: invitation.tenantId, role: invitation.role },
        });
      }
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return u;
    });

    const pair = await this.auth.issueSession(user.id, invitation.tenantId, invitation.role);
    return {
      user: { id: user.id, email: user.email },
      tenant: {
        id: invitation.tenant.id,
        name: invitation.tenant.name,
        slug: invitation.tenant.slug,
      },
      role: invitation.role,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
    };
  }
}
