import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Tenant, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
// SystemPrismaService use is BY DESIGN here: signup/login/refresh run
// before a tenant context exists (docs/02 §5).
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import { TokenPair, TokenService } from './token.service';

export interface AuthResult {
  user: { id: string; email: string };
  tenant: { id: string; name: string; slug: string };
  role: UserRole;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly system: SystemPrismaService,
    private readonly tokens: TokenService,
  ) {}

  async signup(email: string, password: string, tenantName: string): Promise<AuthResult> {
    const existing = await this.system.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'This email already has an account — log in, then create a workspace from there.',
      });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const slug = await this.uniqueSlug(tenantName);

    const { user, tenant } = await this.system.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash } });
      const tenant = await tx.tenant.create({ data: { name: tenantName, slug } });
      await tx.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: UserRole.OWNER },
      });
      return { user, tenant };
    });

    const pair = await this.issueSession(user.id, tenant.id, UserRole.OWNER);
    return this.result(user, tenant, UserRole.OWNER, pair);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.system.user.findUnique({
      where: { email },
      include: {
        memberships: { orderBy: { createdAt: 'asc' }, include: { tenant: true } },
      },
    });
    const invalid = new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
    if (!user) throw invalid;
    if (!(await argon2.verify(user.passwordHash, password))) throw invalid;

    // Suspended/deleted workspaces are not a valid landing spot (FR-10.3).
    const membership = user.memberships.find((m) => m.tenant.status === 'ACTIVE');
    if (!membership) {
      throw new ForbiddenException({ code: 'NO_WORKSPACE', message: 'No active workspace membership' });
    }

    const pair = await this.issueSession(user.id, membership.tenantId, membership.role);
    return this.result(user, membership.tenant, membership.role, pair);
  }

  async refresh(refreshToken: string): Promise<Pick<AuthResult, 'accessToken' | 'refreshToken'>> {
    const payload = await this.tokens.verifyRefresh(refreshToken);
    const stored = await this.system.refreshToken.findUnique({
      where: { tokenHash: this.tokens.sha256(refreshToken) },
    });
    if (!stored) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Unknown refresh token' });
    }
    if (stored.revokedAt) {
      // Reuse of a rotated token — treat as theft, kill every session.
      await this.revokeAllSessions(stored.userId);
      throw new UnauthorizedException({ code: 'REFRESH_REUSED', message: 'Refresh token reuse detected' });
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'REFRESH_EXPIRED', message: 'Refresh token expired' });
    }

    const membership = await this.system.membership.findUnique({
      where: { userId_tenantId: { userId: payload.sub, tenantId: payload.tenantId } },
      include: { tenant: true },
    });
    if (!membership || membership.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException({ code: 'MEMBERSHIP_GONE', message: 'No longer a member of this workspace' });
    }

    const pair = await this.tokens.issuePair(payload.sub, payload.tenantId, membership.role);
    await this.system.$transaction([
      this.system.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.system.refreshToken.create({
        data: {
          userId: payload.sub,
          tenantId: payload.tenantId,
          tokenHash: pair.refreshTokenHash,
          expiresAt: pair.refreshExpiresAt,
        },
      }),
    ]);
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  }

  /** FR-1.6 — verifies membership, then issues a pair for that workspace. */
  async switchTenant(userId: string, tenantId: string): Promise<AuthResult> {
    const membership = await this.system.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { tenant: true, user: true },
    });
    if (!membership || membership.tenant.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'NOT_A_MEMBER',
        message: 'You are not a member of this workspace',
      });
    }
    const pair = await this.issueSession(userId, tenantId, membership.role);
    return this.result(membership.user, membership.tenant, membership.role, pair);
  }

  /** All sessions die on password change (FR-1.2). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.system.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async issueSession(userId: string, tenantId: string, role: UserRole): Promise<TokenPair> {
    const pair = await this.tokens.issuePair(userId, tenantId, role);
    await this.system.refreshToken.create({
      data: {
        userId,
        tenantId,
        tokenHash: pair.refreshTokenHash,
        expiresAt: pair.refreshExpiresAt,
      },
    });
    return pair;
  }

  private result(
    user: { id: string; email: string },
    tenant: Tenant,
    role: UserRole,
    pair: TokenPair,
  ): AuthResult {
    return {
      user: { id: user.id, email: user.email },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      role,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
    };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'workspace';
    const taken = await this.system.tenant.findUnique({ where: { slug: base } });
    return taken ? `${base}-${randomBytes(3).toString('hex')}` : base;
  }
}
