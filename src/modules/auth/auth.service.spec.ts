import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  let system: any;
  let service: AuthService;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  beforeEach(() => {
    system = {
      user: { findUnique: jest.fn() },
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
      membership: { findUnique: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    service = new AuthService(system, new TokenService(new JwtService({})));
  });

  it('signup rejects an existing email with EMAIL_EXISTS', async () => {
    system.user.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(service.signup('a@x.com', 'password123', 'Acme')).rejects.toThrow(
      ConflictException,
    );
  });

  it('switchTenant refuses a non-member', async () => {
    system.membership.findUnique.mockResolvedValue(null);
    await expect(service.switchTenant('u1', 't2')).rejects.toThrow(ForbiddenException);
  });

  it('switchTenant refuses a suspended workspace', async () => {
    system.membership.findUnique.mockResolvedValue({
      role: 'MEMBER',
      tenant: { id: 't2', status: 'SUSPENDED' },
      user: { id: 'u1', email: 'a@x.com' },
    });
    await expect(service.switchTenant('u1', 't2')).rejects.toThrow(ForbiddenException);
  });

  it('refresh treats a revoked token as reuse and revokes all sessions', async () => {
    const tokens = new TokenService(new JwtService({}));
    const pair = await tokens.issuePair('u1', 't1', 'OWNER');
    system.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });
    await expect(service.refresh(pair.refreshToken)).rejects.toThrow(UnauthorizedException);
    expect(system.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
  });

  it('refresh rejects an unknown token', async () => {
    const tokens = new TokenService(new JwtService({}));
    const pair = await tokens.issuePair('u1', 't1', 'OWNER');
    system.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.refresh(pair.refreshToken)).rejects.toThrow(UnauthorizedException);
  });
});
