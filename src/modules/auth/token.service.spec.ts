import { JwtService } from '@nestjs/jwt';
import { parseTtlMs, TokenService } from './token.service';

describe('parseTtlMs', () => {
  it('parses s/m/h/d', () => {
    expect(parseTtlMs('30s')).toBe(30_000);
    expect(parseTtlMs('15m')).toBe(900_000);
    expect(parseTtlMs('12h')).toBe(43_200_000);
    expect(parseTtlMs('30d')).toBe(2_592_000_000);
  });

  it('rejects garbage', () => {
    expect(() => parseTtlMs('soon')).toThrow();
    expect(() => parseTtlMs('15')).toThrow();
  });
});

describe('TokenService', () => {
  const service = new TokenService(new JwtService({}));

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.JWT_REFRESH_TTL = '30d';
  });

  it('issues a pair whose access token verifies with the right claims', async () => {
    const pair = await service.issuePair('u1', 't1', 'ADMIN');
    const payload = await service.verifyAccess(pair.accessToken);
    expect(payload).toMatchObject({ sub: 'u1', tenantId: 't1', role: 'ADMIN' });
  });

  it('refresh token verifies as refresh and never as access', async () => {
    const pair = await service.issuePair('u1', 't1', 'OWNER');
    const payload = await service.verifyRefresh(pair.refreshToken);
    expect(payload).toMatchObject({ sub: 'u1', tenantId: 't1', typ: 'refresh' });
    await expect(service.verifyAccess(pair.refreshToken)).rejects.toBeDefined();
  });

  it('access token never verifies as refresh', async () => {
    const pair = await service.issuePair('u1', 't1', 'OWNER');
    await expect(service.verifyRefresh(pair.accessToken)).rejects.toBeDefined();
  });

  it('hashes refresh tokens for storage', async () => {
    const pair = await service.issuePair('u1', 't1', 'MEMBER');
    expect(pair.refreshTokenHash).toBe(service.sha256(pair.refreshToken));
    expect(pair.refreshTokenHash).not.toContain(pair.refreshToken);
  });
});
