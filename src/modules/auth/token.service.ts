import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

export interface AccessPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
}

export interface RefreshPayload {
  sub: string;
  tenantId: string;
  jti: string;
  typ: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** For persisting the rotating refresh token (hashed). */
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}

const TTL_UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseTtlMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid TTL "${ttl}" — expected e.g. 15m, 12h, 30d`);
  return Number(match[1]) * TTL_UNITS[match[2]];
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async issuePair(userId: string, tenantId: string, role: UserRole): Promise<TokenPair> {
    const accessTtl = process.env.JWT_ACCESS_TTL ?? '15m';
    const refreshTtl = process.env.JWT_REFRESH_TTL ?? '30d';

    const accessToken = await this.jwt.signAsync(
      { sub: userId, tenantId, role } satisfies AccessPayload,
      { secret: env('JWT_ACCESS_SECRET'), expiresIn: parseTtlMs(accessTtl) / 1000 },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tenantId, jti: randomUUID(), typ: 'refresh' } satisfies RefreshPayload,
      { secret: env('JWT_REFRESH_SECRET'), expiresIn: parseTtlMs(refreshTtl) / 1000 },
    );

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: this.sha256(refreshToken),
      refreshExpiresAt: new Date(Date.now() + parseTtlMs(refreshTtl)),
    };
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    return this.jwt.verifyAsync<AccessPayload>(token, { secret: env('JWT_ACCESS_SECRET') });
  }

  async verifyRefresh(token: string): Promise<RefreshPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: env('JWT_REFRESH_SECRET'),
      });
      if (payload.typ !== 'refresh') throw new Error('not a refresh token');
      return payload;
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Invalid refresh token' });
    }
  }
}
